import { randomUUID } from "node:crypto";
import type {
  AuthenticationSecretService,
  PasswordHasher,
  UserCredential,
} from "@senvo/domain";
import type { OrganizationMembership, User } from "@senvo/domain";
import type { WorkforceAuthenticationRepository } from "@senvo/domain";
import type {
  UserCredentialRepository,
  UserRepository,
  OrganizationMembershipRepository,
} from "@senvo/domain";
import { defaultRolePermissions, roleAllowsPermission } from "@senvo/domain";

export type WorkforceLoginResult = {
  csrfToken: string;
  expiresAt: string;
  sessionToken: string;
  principal: {
    displayName: string;
    organizationName: string;
    organizationId: string;
    permissions: { resource: string; action: string }[];
    role: OrganizationMembership["role"];
    userId: string;
  };
};

export class WorkforceAuthenticationError extends Error {
  constructor(
    readonly code:
      | "INVALID_CREDENTIALS"
      | "ACCOUNT_DISABLED"
      | "MEMBERSHIP_INACTIVE"
      | "UNAUTHORIZED"
      | "RATE_LIMITED"
      | "VALIDATION",
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "WorkforceAuthenticationError";
  }
}

export type WorkforceAuthenticationServiceDeps = {
  clock?: () => Date;
  credentials: UserCredentialRepository;
  idGenerator?: () => string;
  memberships: OrganizationMembershipRepository;
  organizationResolver: {
    findOrganizationById(
      id: string,
    ): Promise<{ id: string; name: string } | null>;
    findOrganizationIdByCode?(code: string): Promise<string | null>;
  };
  passwords: PasswordHasher;
  secrets: AuthenticationSecretService;
  users: UserRepository;
  workforceSessions: WorkforceAuthenticationRepository;
};

export class WorkforceAuthenticationService {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;
  constructor(private readonly deps: WorkforceAuthenticationServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.idGenerator = deps.idGenerator ?? randomUUID;
  }

  async login(input: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }): Promise<WorkforceLoginResult> {
    const email = input.email.trim().toLowerCase();
    if (!email || input.password.length < 8)
      throw new WorkforceAuthenticationError(
        "INVALID_CREDENTIALS",
        "Invalid credentials.",
      );
    const credential = await this.deps.credentials.findByProviderIdentifier(
      "PASSWORD",
      email,
    );
    if (!credential)
      throw new WorkforceAuthenticationError(
        "INVALID_CREDENTIALS",
        "Invalid credentials.",
      );
    if (credential.status !== "ACTIVE")
      throw new WorkforceAuthenticationError(
        "ACCOUNT_DISABLED",
        "Account is disabled.",
      );
    const verified = await this.deps.passwords.verify(
      input.password,
      credential.passwordHash ?? "",
    );
    if (!verified)
      throw new WorkforceAuthenticationError(
        "INVALID_CREDENTIALS",
        "Invalid credentials.",
      );
    const user = await this.deps.users.findById(credential.userId);
    if (!user)
      throw new WorkforceAuthenticationError(
        "INVALID_CREDENTIALS",
        "Invalid credentials.",
      );
    if (user.status !== "ACTIVE")
      throw new WorkforceAuthenticationError(
        "ACCOUNT_DISABLED",
        "User account is inactive.",
      );
    // Resolve active membership — for now pick first active membership
    // In multi-org case we select the first; future enhancement can support explicit org selection
    const membership = await this.resolveActiveMembership(user.id);
    if (!membership)
      throw new WorkforceAuthenticationError(
        "MEMBERSHIP_INACTIVE",
        "No active organization membership.",
      );
    if (membership.status !== "ACTIVE")
      throw new WorkforceAuthenticationError(
        "MEMBERSHIP_INACTIVE",
        "Membership is inactive.",
      );

    const organization =
      await this.deps.organizationResolver.findOrganizationById(
        membership.organizationId,
      );
    if (!organization)
      throw new WorkforceAuthenticationError(
        "MEMBERSHIP_INACTIVE",
        "Organization not found.",
      );

    const now = this.clock();
    const sessionToken = this.deps.secrets.generateToken();
    const csrfToken = this.deps.secrets.generateToken();
    const expiresAt = new Date(
      now.getTime() +
        (input.rememberMe ? 30 * 24 * 60 * 60_000 : 12 * 60 * 60_000),
    );
    await this.deps.workforceSessions.createSession({
      createdAt: now,
      csrfTokenHash: this.deps.secrets.hashSecret(csrfToken),
      expiresAt,
      id: this.idGenerator(),
      lastUsedAt: now,
      organizationId: membership.organizationId,
      rememberMe: Boolean(input.rememberMe),
      revokedAt: null,
      status: "ACTIVE",
      tokenHash: this.deps.secrets.hashSecret(sessionToken),
      updatedAt: now,
      userId: user.id,
    } as any);

    const permissions = defaultRolePermissions
      .filter((g) => g.role === membership.role)
      .map((g) => ({ resource: g.resource, action: g.action }));

    return {
      csrfToken,
      expiresAt: expiresAt.toISOString(),
      sessionToken,
      principal: {
        displayName: user.name ?? user.email,
        organizationId: organization.id,
        organizationName: organization.name,
        permissions,
        role: membership.role,
        userId: user.id,
      },
    };
  }

  async authenticateSession(sessionToken: string): Promise<
    WorkforceLoginResult["principal"] & {
      csrfTokenHash: string;
      sessionId: string;
      expiresAt: string;
    }
  > {
    if (!sessionToken)
      throw new WorkforceAuthenticationError(
        "UNAUTHORIZED",
        "Authentication is required.",
      );
    const hash = this.deps.secrets.hashSecret(sessionToken);
    const found =
      await this.deps.workforceSessions.findSessionByTokenHash(hash);
    if (!found)
      throw new WorkforceAuthenticationError(
        "UNAUTHORIZED",
        "Session is invalid.",
      );
    const now = this.clock();
    if (
      found.session.status !== "ACTIVE" ||
      found.session.revokedAt ||
      found.session.expiresAt.getTime() <= now.getTime()
    ) {
      throw new WorkforceAuthenticationError(
        "UNAUTHORIZED",
        "Session is expired.",
      );
    }
    if (found.user.status !== "ACTIVE")
      throw new WorkforceAuthenticationError(
        "ACCOUNT_DISABLED",
        "User is inactive.",
      );
    if (found.membership.status !== "ACTIVE")
      throw new WorkforceAuthenticationError(
        "MEMBERSHIP_INACTIVE",
        "Membership is inactive.",
      );
    // organization isolation already via FK but verify match
    if (found.membership.organizationId !== found.session.organizationId)
      throw new WorkforceAuthenticationError(
        "UNAUTHORIZED",
        "Session is invalid.",
      );
    const permissions = defaultRolePermissions
      .filter((g) => g.role === found.membership.role)
      .map((g) => ({ resource: g.resource, action: g.action }));
    return {
      csrfTokenHash: found.session.csrfTokenHash,
      displayName: found.user.name ?? found.user.email,
      expiresAt: found.session.expiresAt.toISOString(),
      organizationId: found.organization.id,
      organizationName: found.organization.name,
      permissions,
      role: found.membership.role,
      sessionId: found.session.id,
      userId: found.user.id,
    };
  }

  async authorizeMutation(
    sessionToken: string,
    csrfToken: string,
  ): Promise<void> {
    const principal = await this.authenticateSession(sessionToken);
    const expected = principal.csrfTokenHash;
    const actualHash = this.deps.secrets.hashSecret(csrfToken);
    // Use secrets verify if available; fallback to hash compare
    const ok = (this.deps.secrets as any).verifySecret
      ? (this.deps.secrets as any).verifySecret(csrfToken, expected)
      : actualHash === expected;
    if (!ok)
      throw new WorkforceAuthenticationError(
        "UNAUTHORIZED",
        "CSRF token is invalid.",
      );
  }

  async logout(sessionToken: string): Promise<void> {
    if (!sessionToken) return;
    const hash = this.deps.secrets.hashSecret(sessionToken);
    await this.deps.workforceSessions.revokeSession({
      revokedAt: this.clock(),
      tokenHash: hash,
    });
  }

  private async resolveActiveMembership(
    userId: string,
  ): Promise<OrganizationMembership | null> {
    const repo: any = this.deps.memberships;
    if (typeof repo.findFirstActiveByUser === "function") {
      const first = await repo.findFirstActiveByUser(userId);
      if (first) return first;
    }
    if (typeof repo.listByUser === "function") {
      const list: OrganizationMembership[] = await repo.listByUser(userId);
      return list.find((m) => m.status === "ACTIVE") ?? null;
    }
    const resolver: any = this.deps.organizationResolver;
    if (typeof resolver.listOrganizationIdsForUser === "function") {
      const ids: string[] = await resolver.listOrganizationIdsForUser(userId);
      for (const orgId of ids) {
        const m = await this.deps.memberships.findByUserAndOrganization(
          userId,
          orgId,
        );
        if (m?.status === "ACTIVE") return m;
      }
    }
    return null;
  }
}
