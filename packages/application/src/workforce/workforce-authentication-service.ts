import { randomUUID } from "node:crypto";
import type {
  AuthenticationSecretService,
  PasswordHasher,
} from "@senvo/domain";
import type { OrganizationMembership } from "@senvo/domain";
import type { WorkforceAuthenticationRepository } from "@senvo/domain";
import type {
  UserCredentialRepository,
  UserRepository,
  OrganizationMembershipRepository,
} from "@senvo/domain";
import { defaultRolePermissions } from "@senvo/domain";

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

export type WorkforceAuthenticationRateLimiter = {
  consumeRateLimit(input: {
    action: string;
    blockForMs: number;
    keyHash: string;
    maximumAttempts: number;
    now: Date;
    organizationId: string;
    windowMs: number;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  reset?(input: {
    action: string;
    keyHash: string;
    organizationId: string;
  }): Promise<void>;
};

export type WorkforceAuthenticationServiceDeps = {
  clock?: () => Date;
  credentials: UserCredentialRepository;
  fallbackPasswordHash?: string;
  idGenerator?: () => string;
  memberships: OrganizationMembershipRepository;
  organizationResolver: {
    findOrganizationById(id: string): Promise<{
      id: string;
      name: string;
      status?: "ACTIVE" | "INACTIVE";
    } | null>;
    findOrganizationIdByCode?(code: string): Promise<string | null>;
    listOrganizationIdsForUser?(userId: string): Promise<string[]>;
  };
  passwords: PasswordHasher;
  rateLimiter?: WorkforceAuthenticationRateLimiter;
  rolePermissions?: {
    listActivePermissionsByRole(
      role: string,
    ): Promise<{ action: string; resource: string }[]>;
  };
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
    const user = credential
      ? await this.deps.users.findById(credential.userId)
      : null;
    const membership = user
      ? await this.resolveActiveMembership(user.id)
      : null;

    const keyHash = this.deps.secrets.hashSecret(email);
    const rateLimitOrgId =
      membership?.organizationId ??
      (await this.deps.organizationResolver.findOrganizationIdByCode?.(
        "DEFAULT",
      )) ??
      "00000000-0000-0000-0000-000000000000";

    if (this.deps.rateLimiter && rateLimitOrgId) {
      const rate = await this.deps.rateLimiter.consumeRateLimit({
        action: "WORKFORCE_LOGIN",
        blockForMs: 15 * 60_000,
        keyHash,
        maximumAttempts: 5,
        now: this.clock(),
        organizationId: rateLimitOrgId,
        windowMs: 15 * 60_000,
      });
      if (!rate.allowed) {
        throw new WorkforceAuthenticationError(
          "RATE_LIMITED",
          "Too many login attempts. Please try again later.",
        );
      }
    }

    const passwordHash =
      credential?.passwordHash ?? this.deps.fallbackPasswordHash;
    const verified = passwordHash
      ? await this.deps.passwords.verify(input.password, passwordHash)
      : false;

    if (!credential || !verified)
      throw new WorkforceAuthenticationError(
        "INVALID_CREDENTIALS",
        "Invalid credentials.",
      );
    if (credential.status !== "ACTIVE")
      throw new WorkforceAuthenticationError(
        "ACCOUNT_DISABLED",
        "Account is disabled.",
      );
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
    if (!membership || membership.status !== "ACTIVE")
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
    if (organization.status && organization.status !== "ACTIVE")
      throw new WorkforceAuthenticationError(
        "MEMBERSHIP_INACTIVE",
        "Organization is inactive.",
      );

    if (this.deps.rateLimiter?.reset && rateLimitOrgId) {
      void this.deps.rateLimiter
        .reset({
          action: "WORKFORCE_LOGIN",
          keyHash,
          organizationId: rateLimitOrgId,
        })
        .catch(() => {});
    }

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
    });

    const permissions = await this.resolvePermissions(membership.role);

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
    if (found.organization.status && found.organization.status !== "ACTIVE")
      throw new WorkforceAuthenticationError(
        "MEMBERSHIP_INACTIVE",
        "Organization is inactive.",
      );
    const permissions = await this.resolvePermissions(found.membership.role);
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

  private async resolvePermissions(
    role: OrganizationMembership["role"],
  ): Promise<{ action: string; resource: string }[]> {
    if (this.deps.rolePermissions) {
      const active =
        await this.deps.rolePermissions.listActivePermissionsByRole(role);
      return (active ?? []).map((g) => ({
        resource: g.resource,
        action: g.action,
      }));
    }
    return defaultRolePermissions
      .filter((g) => g.role === role)
      .map((g) => ({ resource: g.resource, action: g.action }));
  }

  async authorizeMutation(
    sessionToken: string,
    csrfToken: string,
  ): Promise<void> {
    const principal = await this.authenticateSession(sessionToken);
    const expected = principal.csrfTokenHash;
    const secretsWithOptionalVerify = this.deps
      .secrets as AuthenticationSecretService & {
      verifySecret?: AuthenticationSecretService["verifySecret"];
    };
    const ok =
      typeof secretsWithOptionalVerify.verifySecret === "function"
        ? secretsWithOptionalVerify.verifySecret(csrfToken, expected)
        : this.deps.secrets.hashSecret(csrfToken) === expected;
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
    const memberships = this.deps
      .memberships as OrganizationMembershipRepository & {
      findFirstActiveByUser?: (
        userId: string,
      ) => Promise<OrganizationMembership | null>;
      listByUser?: (userId: string) => Promise<OrganizationMembership[]>;
    };
    if (typeof memberships.findFirstActiveByUser === "function") {
      const first = await memberships.findFirstActiveByUser(userId);
      if (first) return first;
    }
    if (typeof memberships.listByUser === "function") {
      const list = await memberships.listByUser(userId);
      return list.find((m) => m.status === "ACTIVE") ?? null;
    }
    const resolver = this.deps
      .organizationResolver as WorkforceAuthenticationServiceDeps["organizationResolver"] & {
      listOrganizationIdsForUser?: (userId: string) => Promise<string[]>;
    };
    if (typeof resolver.listOrganizationIdsForUser === "function") {
      const ids = await resolver.listOrganizationIdsForUser(userId);
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
