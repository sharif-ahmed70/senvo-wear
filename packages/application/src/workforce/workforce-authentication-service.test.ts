import type {
  AuthenticationSecretService,
  OrganizationMembership,
  OrganizationMembershipRepository,
  PasswordHasher,
  RolePermissionRepository,
  UserAccount,
  UserCredentialRecord,
  UserCredentialRepository,
  UserRepository,
  WorkforceAuthenticationRepository,
  WorkforceSessionWithPrincipal,
} from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import {
  WorkforceAuthenticationError,
  WorkforceAuthenticationService,
  type WorkforceAuthenticationRateLimiter,
} from "./workforce-authentication-service.js";

const now = new Date("2026-09-01T12:00:00.000Z");

const validCredential: UserCredentialRecord = {
  active: true,
  organization: {
    id: "org-1",
    name: "SENVO Wear",
    status: "ACTIVE",
  },
  passwordHash: "hashed-correct-password",
  role: "ADMIN",
  status: "ACTIVE",
  userId: "user-1",
  username: "admin@senvo.test",
};

const validUser: UserAccount = {
  createdAt: now,
  defaultOrganizationId: "org-1",
  displayName: "SENVO Admin",
  email: "admin@senvo.test",
  id: "user-1",
  locale: "en-US",
  name: "SENVO Admin",
  status: "ACTIVE",
  updatedAt: now,
};

const validMembership: OrganizationMembership = {
  createdAt: now,
  id: "membership-1",
  joinedAt: now,
  organizationId: "org-1",
  role: "ADMIN",
  status: "ACTIVE",
  updatedAt: now,
  userId: "user-1",
};

const validSessionRecord: WorkforceSessionWithPrincipal = {
  membership: validMembership,
  organization: {
    id: "org-1",
    name: "SENVO Wear",
    status: "ACTIVE",
  },
  session: {
    createdAt: now,
    csrfTokenHash: "hashed-csrf-token",
    expiresAt: new Date(now.getTime() + 3600000),
    id: "session-1",
    lastUsedAt: now,
    organizationId: "org-1",
    rememberMe: false,
    revokedAt: null,
    status: "ACTIVE",
    tokenHash: "hashed-token",
    updatedAt: now,
    userId: "user-1",
  },
  user: validUser,
};

describe("WorkforceAuthenticationService", () => {
  it("authenticates valid credentials and resolves DB role permissions", async () => {
    const harness = createHarness({
      rolePermissions: {
        listActivePermissionsByRole: vi.fn(async () => [
          { action: "READ", resource: "ORGANIZATION" },
          { action: "WRITE", resource: "CATALOG" },
        ]),
      },
    });

    const result = await harness.service.login({
      email: "admin@senvo.test",
      password: "CorrectPassword123!",
    });

    expect(result.sessionToken).toBeDefined();
    expect(result.csrfToken).toBeDefined();
    expect(result.principal.permissions).toEqual([
      { action: "READ", resource: "ORGANIZATION" },
      { action: "WRITE", resource: "CATALOG" },
    ]);
    expect(harness.workforceSessions.createSession).toHaveBeenCalled();
  });

  it("resolves zero permissions when DB role has zero active grants", async () => {
    const harness = createHarness({
      rolePermissions: {
        listActivePermissionsByRole: vi.fn(async () => []),
      },
    });

    const result = await harness.service.login({
      email: "admin@senvo.test",
      password: "CorrectPassword123!",
    });

    expect(result.principal.permissions).toEqual([]);
  });

  it("does not restore defaultRolePermissions when all grants are removed", async () => {
    const listActivePermissionsByRole = vi
      .fn()
      .mockResolvedValueOnce([{ action: "READ", resource: "ORGANIZATION" }])
      .mockResolvedValueOnce([]);

    const harness = createHarness({
      rolePermissions: {
        listActivePermissionsByRole,
      },
    });

    const initial = await harness.service.login({
      email: "admin@senvo.test",
      password: "CorrectPassword123!",
    });
    expect(initial.principal.permissions).toHaveLength(1);

    const afterRevocation = await harness.service.authenticateSession(
      "valid-session-token",
    );
    expect(afterRevocation.permissions).toEqual([]);
  });

  it("rejects login when organization is INACTIVE", async () => {
    const harness = createHarness({
      organizationResolver: {
        findOrganizationById: vi.fn(async () => ({
          id: "org-1",
          name: "SENVO Wear",
          status: "INACTIVE" as const,
        })),
      },
    });

    await expect(
      harness.service.login({
        email: "admin@senvo.test",
        password: "CorrectPassword123!",
      }),
    ).rejects.toMatchObject({
      code: "MEMBERSHIP_INACTIVE",
    });
  });

  it("enforces login rate limiting on failed attempts", async () => {
    const consumeRateLimit = vi.fn(async () => ({
      allowed: true,
      retryAfterSeconds: 0,
    }));
    const harness = createHarness({
      credentials: {
        findByProviderIdentifier: vi.fn(async () => null), // user not found
      },
      rateLimiter: {
        consumeRateLimit,
      },
    });

    await expect(
      harness.service.login({
        email: "unknown@senvo.test",
        password: "WrongPassword!",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    expect(consumeRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WORKFORCE_LOGIN",
      }),
    );
  });

  it("rejects login with RATE_LIMITED when rate limiter rejects", async () => {
    const harness = createHarness({
      rateLimiter: {
        consumeRateLimit: vi.fn(async () => ({
          allowed: false,
          retryAfterSeconds: 900,
        })),
      },
    });

    await expect(
      harness.service.login({
        email: "admin@senvo.test",
        password: "CorrectPassword123!",
      }),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("rejects session authentication when organization is INACTIVE", async () => {
    const harness = createHarness({
      workforceSessions: {
        createSession: vi.fn(),
        deleteSessionByTokenHash: vi.fn(),
        deleteSessionsForUser: vi.fn(),
        findSessionByTokenHash: vi.fn(async () => ({
          ...validSessionRecord,
          organization: {
            ...validSessionRecord.organization,
            status: "INACTIVE" as const,
          },
        })),
        touchSession: vi.fn(),
      },
    });

    await expect(
      harness.service.authenticateSession("valid-session-token"),
    ).rejects.toMatchObject({
      code: "MEMBERSHIP_INACTIVE",
    });
  });

  it("rejects session authentication when session is expired", async () => {
    const harness = createHarness({
      workforceSessions: {
        createSession: vi.fn(),
        deleteSessionByTokenHash: vi.fn(),
        deleteSessionsForUser: vi.fn(),
        findSessionByTokenHash: vi.fn(async () => ({
          ...validSessionRecord,
          session: {
            ...validSessionRecord.session,
            expiresAt: new Date(now.getTime() - 10000), // expired
          },
        })),
        touchSession: vi.fn(),
      },
    });

    await expect(
      harness.service.authenticateSession("expired-session-token"),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

function createHarness(
  overrides: {
    credentials?: Partial<UserCredentialRepository>;
    hasher?: Partial<PasswordHasher>;
    memberships?: Partial<OrganizationMembershipRepository>;
    organizationResolver?: {
      findOrganizationById: (id: string) => Promise<{
        id: string;
        name: string;
        status?: "ACTIVE" | "INACTIVE";
      } | null>;
    };
    rateLimiter?: Partial<WorkforceAuthenticationRateLimiter>;
    rolePermissions?: Partial<RolePermissionRepository>;
    secrets?: Partial<AuthenticationSecretService>;
    users?: Partial<UserRepository>;
    workforceSessions?: Partial<WorkforceAuthenticationRepository>;
  } = {},
) {
  const secrets: AuthenticationSecretService = {
    generateToken: vi.fn(() => "token-xyz"),
    hashSecret: vi.fn((t: string) => `hash:${t}`),
    timingSafeEqual: vi.fn((a: string, b: string) => a === b),
    ...overrides.secrets,
  };

  const passwords: PasswordHasher = {
    hash: vi.fn(async (p: string) => `hash:${p}`),
    verify: vi.fn(
      async (p: string, h: string) =>
        h === "hashed-correct-password" && p === "CorrectPassword123!",
    ),
    ...overrides.hasher,
  };

  const credentials: UserCredentialRepository = {
    create: vi.fn(),
    delete: vi.fn(),
    findByProviderIdentifier: vi.fn(async () => validCredential as never),
    findByUserId: vi.fn(),
    updatePasswordHash: vi.fn(),
    ...overrides.credentials,
  } as unknown as UserCredentialRepository;

  const users: UserRepository = {
    create: vi.fn(),
    findById: vi.fn(async () => validUser),
    findByUsername: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    ...overrides.users,
  } as unknown as UserRepository;

  const memberships: OrganizationMembershipRepository = {
    create: vi.fn(),
    delete: vi.fn(),
    findByOrganizationIdAndRole: vi.fn(),
    findByUserAndOrganization: vi.fn(async () => validMembership),
    findFirstActiveByUser: vi.fn(async () => validMembership),
    findById: vi.fn(),
    listByOrganizationId: vi.fn(),
    listByUser: vi.fn(async () => [validMembership]),
    listByUserId: vi.fn(async () => [validMembership]),
    update: vi.fn(),
    ...overrides.memberships,
  } as unknown as OrganizationMembershipRepository;

  const organizationResolver = overrides.organizationResolver ?? {
    findOrganizationById: vi.fn(async () => ({
      id: "org-1",
      name: "SENVO Wear",
      status: "ACTIVE" as const,
    })),
  };

  const workforceSessions: WorkforceAuthenticationRepository = {
    createSession: vi.fn(async () => {}),
    deleteSessionByTokenHash: vi.fn(async () => {}),
    deleteSessionsForUser: vi.fn(async () => {}),
    findSessionByTokenHash: vi.fn(async () => validSessionRecord),
    touchSession: vi.fn(async () => {}),
    ...overrides.workforceSessions,
  };

  const service = new WorkforceAuthenticationService({
    clock: () => now,
    credentials,
    fallbackPasswordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyfallbackhash",
    memberships,
    organizationResolver,
    passwords,
    rateLimiter: overrides.rateLimiter as WorkforceAuthenticationRateLimiter,
    rolePermissions: overrides.rolePermissions as RolePermissionRepository,
    secrets,
    users,
    workforceSessions,
  });

  return {
    credentials,
    memberships,
    passwords,
    secrets,
    service,
    users,
    workforceSessions,
  };
}
