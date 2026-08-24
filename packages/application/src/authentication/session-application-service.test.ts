import type {
  AuthenticationSession,
  AuthenticationSessionRepository,
  OrganizationMembershipRepository,
  OrganizationRepository,
  RolePermissionRepository,
  UserCredentialRepository,
  UserRepository,
} from "@senvo/domain";
import { AuthenticationError } from "@senvo/domain";
import { describe, expect, it } from "vitest";
import { AuthenticationSessionApplicationService } from "./session-application-service.js";

const userId = "10000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000002";
const membershipId = "10000000-0000-4000-8000-000000000003";
const credentialId = "10000000-0000-4000-8000-000000000004";
const now = new Date("2026-08-21T06:00:00.000Z");

describe("AuthenticationSessionApplicationService", () => {
  it("creates and resolves an organization-scoped session", async () => {
    const fixture = createFixture();
    const login = await fixture.service.login({
      identifier: "OWNER@SENVO.TEST",
      organizationCode: "senvo",
      password: "correct-password",
    });
    expect(login).toMatchObject({
      organizationId,
      role: "OWNER",
      sessionToken: "a".repeat(43),
      userId,
    });
    expect(login.permissions).toContainEqual({
      action: "READ",
      resource: "REPORT",
    });
    await expect(
      fixture.service.resolve(login.sessionToken),
    ).resolves.toMatchObject({
      sessionId: login.sessionId,
      userId,
    });
  });

  it("rejects invalid passwords and inactive memberships without a session", async () => {
    const invalidPassword = createFixture();
    await expect(
      invalidPassword.service.login({
        identifier: "owner@senvo.test",
        organizationCode: "SENVO",
        password: "wrong-password",
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(invalidPassword.sessions.count()).toBe(0);

    const inactive = createFixture("INACTIVE");
    await expect(
      inactive.service.login({
        identifier: "owner@senvo.test",
        organizationCode: "SENVO",
        password: "correct-password",
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(inactive.sessions.count()).toBe(0);
  });

  it("rejects expired sessions and revokes logout immediately", async () => {
    let clock = now;
    const fixture = createFixture("ACTIVE", () => clock);
    const login = await fixture.service.login({
      identifier: "owner@senvo.test",
      organizationCode: "SENVO",
      password: "correct-password",
    });
    await fixture.service.logout(login.sessionToken);
    await expect(
      fixture.service.resolve(login.sessionToken),
    ).rejects.toBeInstanceOf(AuthenticationError);

    const expiring = createFixture("ACTIVE", () => clock);
    const expiringLogin = await expiring.service.login({
      identifier: "owner@senvo.test",
      organizationCode: "SENVO",
      password: "correct-password",
    });
    clock = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    await expect(
      expiring.service.resolve(expiringLogin.sessionToken),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});

function createFixture(
  membershipStatus: "ACTIVE" | "INACTIVE" = "ACTIVE",
  clock: () => Date = () => now,
) {
  const sessions = new MemorySessions();
  const credentials: UserCredentialRepository = {
    changeStatus: () => Promise.resolve(null),
    create: () => Promise.reject(new Error("unreachable")),
    findById: () => Promise.resolve(null),
    findByProviderIdentifier: (_provider, identifier) =>
      Promise.resolve(
        identifier === "owner@senvo.test"
          ? {
              createdAt: now,
              id: credentialId,
              identifier,
              passwordHash: "stored-hash",
              provider: "PASSWORD",
              status: "ACTIVE",
              updatedAt: now,
              userId,
              version: 1,
            }
          : null,
      ),
  };
  const users: UserRepository = {
    create: () => Promise.reject(new Error("unreachable")),
    findByEmail: () => Promise.resolve(null),
    findById: (id) =>
      Promise.resolve(
        id === userId
          ? {
              createdAt: now,
              email: "owner@senvo.test",
              id: userId,
              name: "Shop Owner",
              status: "ACTIVE",
              updatedAt: now,
              version: 1,
            }
          : null,
      ),
  };
  const memberships: OrganizationMembershipRepository = {
    assignRole: () => Promise.resolve(null),
    changeStatus: () => Promise.resolve(null),
    create: () => Promise.reject(new Error("unreachable")),
    findById: () => Promise.resolve(null),
    findByUserAndOrganization: (candidateUserId, candidateOrganizationId) =>
      Promise.resolve(
        candidateUserId === userId && candidateOrganizationId === organizationId
          ? {
              createdAt: now,
              id: membershipId,
              organizationId,
              role: "OWNER",
              status: membershipStatus,
              updatedAt: now,
              userId,
              version: 1,
            }
          : null,
      ),
  };
  const organizations: OrganizationRepository = {
    create: () => Promise.reject(new Error("unreachable")),
    findByCode: (code) =>
      Promise.resolve(code === "SENVO" ? organization : null),
    findById: (id) =>
      Promise.resolve(id === organizationId ? organization : null),
  };
  const rolePermissions: RolePermissionRepository = {
    create: () => Promise.reject(new Error("unreachable")),
    findByRoleAndPermission: () => Promise.resolve(null),
    listActivePermissionsByRole: () => Promise.resolve([]),
  };
  return {
    service: new AuthenticationSessionApplicationService({
      clock,
      credentials,
      memberships,
      organizations,
      passwordHasher: {
        hash: () => Promise.reject(new Error("unreachable")),
        verify: (password) => Promise.resolve(password === "correct-password"),
      },
      rolePermissions,
      sessions,
      tokenFactory: () => "a".repeat(43),
      users,
    }),
    sessions,
  };
}

const organization = {
  addressLine1: null,
  addressLine2: null,
  city: null,
  code: "SENVO",
  countryCode: "BD",
  createdAt: now,
  district: null,
  email: null,
  id: organizationId,
  name: "SENVO Wear",
  phone: null,
  postalCode: null,
  status: "ACTIVE" as const,
  timezone: "Asia/Dhaka",
  updatedAt: now,
  version: 1,
};

class MemorySessions implements AuthenticationSessionRepository {
  private readonly records: AuthenticationSession[] = [];

  create(record: Omit<AuthenticationSession, "sessionId">) {
    const session = { ...record, sessionId: record.id };
    this.records.push(session);
    return Promise.resolve(session);
  }

  findActiveByTokenHash(tokenHash: string, at: Date) {
    return Promise.resolve(
      this.records.find(
        (record) =>
          record.tokenHash === tokenHash &&
          !record.revokedAt &&
          record.expiresAt > at,
      ) ?? null,
    );
  }

  revoke(id: string, revokedAt: Date) {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record || record.revokedAt) return Promise.resolve(false);
    record.revokedAt = revokedAt;
    return Promise.resolve(true);
  }

  count() {
    return this.records.length;
  }
}
