import type {
  AuthenticationSecretService,
  OrganizationMembership,
  OrganizationMembershipRepository,
  PasswordHasher,
  RolePermissionRepository,
  UserCredentialRepository,
  UserRepository,
  WorkforceAuthenticationRepository,
  WorkforceAuthenticationSession,
  WorkforceSessionWithPrincipal,
} from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import {
  WorkforceAuthenticationService,
  type WorkforceAuthenticationRateLimiter,
} from "./workforce-authentication-service.js";

type User = WorkforceSessionWithPrincipal["user"];
type UserCredential = NonNullable<
  Awaited<ReturnType<UserCredentialRepository["findByProviderIdentifier"]>>
>;

const now = new Date("2026-09-01T12:00:00.000Z");

const validCredential: UserCredential = {
  createdAt: now,
  id: "cred-1",
  identifier: "admin@senvo.test",
  passwordHash: "hashed-correct-password",
  provider: "PASSWORD",
  status: "ACTIVE",
  updatedAt: now,
  userId: "user-1",
  version: 1,
};

const validUser: User = {
  createdAt: now,
  email: "admin@senvo.test",
  id: "user-1",
  name: "SENVO Admin",
  status: "ACTIVE",
  updatedAt: now,
  version: 1,
};

const validMembership: OrganizationMembership = {
  createdAt: now,
  id: "membership-1",
  organizationId: "org-1",
  role: "ADMIN",
  status: "ACTIVE",
  updatedAt: now,
  userId: "user-1",
  version: 1,
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
        listActivePermissionsByRole: vi.fn(() =>
          Promise.resolve([
            { action: "READ", resource: "ORGANIZATION" },
            { action: "WRITE", resource: "CATALOG" },
          ]),
        ),
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
    expect(harness.createSession).toHaveBeenCalled();
  });

  it("resolves zero permissions when DB role has zero active grants", async () => {
    const harness = createHarness({
      rolePermissions: {
        listActivePermissionsByRole: vi.fn(() => Promise.resolve([])),
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
        findOrganizationById: vi.fn(() =>
          Promise.resolve({
            id: "org-1",
            name: "SENVO Wear",
            status: "INACTIVE" as const,
          }),
        ),
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
    const consumeRateLimit = vi.fn(() =>
      Promise.resolve({
        allowed: true,
        retryAfterSeconds: 0,
      }),
    );
    const harness = createHarness({
      credentials: {
        findByProviderIdentifier: vi.fn(() => Promise.resolve(null)), // user not found
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
        consumeRateLimit: vi.fn(() =>
          Promise.resolve({
            allowed: false,
            retryAfterSeconds: 900,
          }),
        ),
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
        createSession: vi.fn((input: WorkforceAuthenticationSession) =>
          Promise.resolve(input),
        ),
        findSessionByTokenHash: vi.fn(() =>
          Promise.resolve({
            ...validSessionRecord,
            organization: {
              ...validSessionRecord.organization,
              status: "INACTIVE" as const,
            },
          }),
        ),
        revokeAllForUser: vi.fn(() => Promise.resolve(0)),
        revokeSession: vi.fn(() => Promise.resolve(true)),
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
        createSession: vi.fn((input: WorkforceAuthenticationSession) =>
          Promise.resolve(input),
        ),
        findSessionByTokenHash: vi.fn(() =>
          Promise.resolve({
            ...validSessionRecord,
            session: {
              ...validSessionRecord.session,
              expiresAt: new Date(now.getTime() - 10000), // expired
            },
          }),
        ),
        revokeAllForUser: vi.fn(() => Promise.resolve(0)),
        revokeSession: vi.fn(() => Promise.resolve(true)),
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
    rateLimiter?: WorkforceAuthenticationRateLimiter;
    rolePermissions?: RolePermissionRepository;
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
    hash: vi.fn((p: string) => Promise.resolve(`hash:${p}`)),
    verify: vi.fn((p: string, h: string) =>
      Promise.resolve(
        h === "hashed-correct-password" && p === "CorrectPassword123!",
      ),
    ),
    ...overrides.hasher,
  };

  const credentials: UserCredentialRepository = {
    changeStatus: vi.fn(() => Promise.resolve(validCredential)),
    create: vi.fn(() => Promise.resolve(validCredential)),
    findById: vi.fn(() => Promise.resolve(validCredential)),
    findByProviderIdentifier: vi.fn(() => Promise.resolve(validCredential)),
    ...overrides.credentials,
  };

  const users: UserRepository = {
    create: vi.fn(() => Promise.resolve(validUser)),
    findByEmail: vi.fn(() => Promise.resolve(validUser)),
    findById: vi.fn(() => Promise.resolve(validUser)),
    ...overrides.users,
  };

  const memberships: OrganizationMembershipRepository = {
    assignRole: vi.fn(() => Promise.resolve(validMembership)),
    changeStatus: vi.fn(() => Promise.resolve(validMembership)),
    create: vi.fn(() => Promise.resolve(validMembership)),
    findByOrganizationIdAndRole: vi.fn(() => Promise.resolve(validMembership)),
    findByUserAndOrganization: vi.fn(() => Promise.resolve(validMembership)),
    findFirstActiveByUser: vi.fn(() => Promise.resolve(validMembership)),
    findById: vi.fn(() => Promise.resolve(validMembership)),
    listByUser: vi.fn(() => Promise.resolve([validMembership])),
    ...overrides.memberships,
  };

  const organizationResolver = overrides.organizationResolver ?? {
    findOrganizationById: vi.fn(() =>
      Promise.resolve({
        id: "org-1",
        name: "SENVO Wear",
        status: "ACTIVE" as const,
      }),
    ),
  };

  const createSession = vi.fn((input: WorkforceAuthenticationSession) =>
    Promise.resolve(input),
  );

  const workforceSessions: WorkforceAuthenticationRepository = {
    createSession,
    findSessionByTokenHash: vi.fn(() => Promise.resolve(validSessionRecord)),
    revokeAllForUser: vi.fn(() => Promise.resolve(0)),
    revokeSession: vi.fn(() => Promise.resolve(true)),
    ...overrides.workforceSessions,
  };

  const service = new WorkforceAuthenticationService({
    clock: () => now,
    credentials,
    fallbackPasswordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyfallbackhash",
    memberships,
    organizationResolver,
    passwords,
    rateLimiter: overrides.rateLimiter,
    rolePermissions: overrides.rolePermissions,
    secrets,
    users,
    workforceSessions,
  });

  return {
    createSession,
    credentials,
    memberships,
    passwords,
    secrets,
    service,
    users,
    workforceSessions,
  };
}
