import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  AuthenticationError,
  defaultRolePermissions,
  type AuthenticationSession,
  type AuthenticationSessionRepository,
  type OrganizationMembershipRepository,
  type OrganizationRepository,
  type PasswordHasher,
  type PermissionKey,
  type Role,
  type RolePermissionRepository,
  type UserCredentialRepository,
  type UserRepository,
} from "@senvo/domain";

const sessionDurationMs = 8 * 60 * 60 * 1000;

export type ProductionSessionPrincipal = {
  displayName: string;
  expiresAt: Date;
  organizationId: string;
  organizationName: string;
  permissions: readonly PermissionKey[];
  role: Role;
  sessionId: string;
  userId: string;
};

export type LoginSessionResult = ProductionSessionPrincipal & {
  sessionToken: string;
};

export type AuthenticationSessionApplicationServiceDependencies = {
  credentials: UserCredentialRepository;
  memberships: OrganizationMembershipRepository;
  organizations: OrganizationRepository;
  passwordHasher: PasswordHasher;
  rolePermissions: RolePermissionRepository;
  sessions: AuthenticationSessionRepository;
  users: UserRepository;
  clock?: () => Date;
  tokenFactory?: () => string;
};

export class AuthenticationSessionApplicationService {
  private readonly clock: () => Date;
  private readonly tokenFactory: () => string;

  constructor(
    private readonly dependencies: AuthenticationSessionApplicationServiceDependencies,
  ) {
    this.clock = dependencies.clock ?? (() => new Date());
    this.tokenFactory =
      dependencies.tokenFactory ??
      (() => randomBytes(32).toString("base64url"));
  }

  async login(input: {
    identifier: string;
    organizationCode: string;
    password: string;
  }): Promise<LoginSessionResult> {
    const identifier = input.identifier.trim().toLowerCase();
    const organizationCode = input.organizationCode.trim().toUpperCase();
    if (
      identifier.length < 3 ||
      identifier.length > 320 ||
      organizationCode.length < 2 ||
      organizationCode.length > 64 ||
      input.password.length < 8 ||
      input.password.length > 256
    ) {
      throw invalidCredentials();
    }
    const credential =
      await this.dependencies.credentials.findByProviderIdentifier(
        "PASSWORD",
        identifier,
      );
    if (
      !credential ||
      credential.status !== "ACTIVE" ||
      !credential.passwordHash ||
      !(await this.dependencies.passwordHasher.verify(
        input.password,
        credential.passwordHash,
      ))
    ) {
      throw invalidCredentials();
    }
    const [user, organization] = await Promise.all([
      this.dependencies.users.findById(credential.userId),
      this.dependencies.organizations.findByCode(organizationCode),
    ]);
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !organization ||
      organization.status !== "ACTIVE"
    ) {
      throw invalidCredentials();
    }
    const membership =
      await this.dependencies.memberships.findByUserAndOrganization(
        user.id,
        organization.id,
      );
    if (!membership || membership.status !== "ACTIVE") {
      throw invalidCredentials();
    }
    const now = this.clock();
    const token = this.tokenFactory();
    const session = await this.dependencies.sessions.create({
      expiresAt: new Date(now.getTime() + sessionDurationMs),
      id: randomUUID(),
      issuedAt: now,
      organizationId: organization.id,
      provider: "PASSWORD",
      revokedAt: null,
      tokenHash: hashToken(token),
      userId: user.id,
    });
    return {
      ...(await this.principal(session)),
      sessionToken: token,
    };
  }

  async resolve(sessionToken: string): Promise<ProductionSessionPrincipal> {
    if (!/^[A-Za-z0-9_-]{32,128}$/u.test(sessionToken)) {
      throw new AuthenticationError("Authentication session is invalid.");
    }
    const session = await this.dependencies.sessions.findActiveByTokenHash(
      hashToken(sessionToken),
      this.clock(),
    );
    if (!session) {
      throw new AuthenticationError("Authentication session has expired.");
    }
    return this.principal(session);
  }

  async logout(sessionToken: string): Promise<void> {
    const session = await this.dependencies.sessions.findActiveByTokenHash(
      hashToken(sessionToken),
      this.clock(),
    );
    if (session)
      await this.dependencies.sessions.revoke(session.id, this.clock());
  }

  private async principal(
    session: AuthenticationSession,
  ): Promise<ProductionSessionPrincipal> {
    const [user, organization, membership] = await Promise.all([
      this.dependencies.users.findById(session.userId),
      this.dependencies.organizations.findById(session.organizationId),
      this.dependencies.memberships.findByUserAndOrganization(
        session.userId,
        session.organizationId,
      ),
    ]);
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !organization ||
      organization.status !== "ACTIVE" ||
      !membership ||
      membership.status !== "ACTIVE"
    ) {
      throw new AuthenticationError(
        "Authentication session is no longer authorized.",
      );
    }
    const configured =
      await this.dependencies.rolePermissions.listActivePermissionsByRole(
        membership.role,
      );
    const permissions =
      configured.length > 0
        ? configured.map(({ action, resource }) => ({ action, resource }))
        : defaultRolePermissions
            .filter(({ role }) => role === membership.role)
            .map(({ action, resource }) => ({ action, resource }));
    return {
      displayName: user.name ?? user.email,
      expiresAt: session.expiresAt ?? new Date(0),
      organizationId: organization.id,
      organizationName: organization.name,
      permissions,
      role: membership.role,
      sessionId: session.id,
      userId: user.id,
    };
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function invalidCredentials(): AuthenticationError {
  return new AuthenticationError(
    "Email, password, or organization is invalid.",
  );
}
