/* eslint-disable @typescript-eslint/require-await -- in-memory fakes implement async repository interfaces */
import {
  EXISTING_LOGIN_MESSAGE,
  OWN_MEMBERSHIP_MESSAGE,
  OWNER_ONLY_PASSWORD_MESSAGE,
  type OrganizationMembership,
  type UserCredential,
  type TeamMembershipTransactionManager,
} from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import {
  OrganizationApplicationService,
  type OrganizationApplicationServiceDependencies,
} from "./organization-application-service.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const adminUserId = "33333333-3333-4333-8333-333333333333";
const staffUserId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-10-02T00:00:00.000Z");

function membership(
  id: string,
  userId: string,
  role: OrganizationMembership["role"],
): OrganizationMembership {
  return {
    createdAt: now,
    id,
    organizationId,
    role,
    status: "ACTIVE",
    updatedAt: now,
    userId,
    version: 1,
  };
}

const owner = membership(
  "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
  ownerUserId,
  "OWNER",
);
const admin = membership(
  "aaaaaaaa-aaaa-4aaa-8aaa-000000000002",
  adminUserId,
  "ADMIN",
);
const staff = membership(
  "aaaaaaaa-aaaa-4aaa-8aaa-000000000003",
  staffUserId,
  "STAFF",
);
const members = [owner, admin, staff];

function createService() {
  const assignRole = vi.fn(
    async (record: { id: string; role: OrganizationMembership["role"] }) => {
      const found = members.find((item) => item.id === record.id);
      return found ? { ...found, role: record.role, version: 2 } : null;
    },
  );
  const revokeAllForUser = vi.fn(async () => 1);
  const revokeAllWorkforceSessionsForUser = vi.fn(async () => 2);
  const recordWithinTransaction = vi.fn(async () => ({}) as never);
  const credentials: UserCredential[] = [];
  const created: OrganizationMembership[] = [];
  const createUser = vi.fn(
    async (record: { email: string; name: string | null }) => ({
      ...record,
      createdAt: now,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000099",
      status: "ACTIVE" as const,
      updatedAt: now,
      version: 1,
    }),
  );
  const users = [owner, admin, staff].map((item) => ({
    createdAt: now,
    email: `${item.role.toLowerCase()}@shop.test`,
    id: item.userId,
    name: item.role,
    status: "ACTIVE" as const,
    updatedAt: now,
    version: 1,
  }));
  const teamMembershipTransactions: TeamMembershipTransactionManager = {
    execute: (operation) =>
      operation({
        auditWriter: { recordWithinTransaction },
        credentials: {
          create: async (record) => {
            const credential = {
              ...record,
              createdAt: now,
              id: "cccccccc-cccc-4ccc-8ccc-000000000001",
              updatedAt: now,
              version: 1,
            };
            credentials.push(credential);
            return credential;
          },
          findByProviderIdentifier: async (_provider, identifier) =>
            credentials.find((item) => item.identifier === identifier) ?? null,
          replacePassword: async (record) => {
            const found = credentials.find((item) => item.id === record.id);
            if (!found) return null;
            found.passwordHash = record.passwordHash;
            found.version += 1;
            return found;
          },
        },
        lockOrganizationMemberships: async () => [...members, ...created],
        memberships: {
          assignRole,
          changeStatus: vi.fn(),
          create: async (record) => {
            const membership = {
              ...record,
              createdAt: now,
              id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000099",
              updatedAt: now,
              version: 1,
            };
            created.push(membership);
            return membership;
          },
          findByUserAndOrganization: async () => null,
        },
        userHasCustomerAccount: async () => false,
        users: {
          create: createUser,
          findByEmail: async (email) =>
            users.find((item) => item.email === email) ?? null,
          findById: async (id) => users.find((item) => item.id === id) ?? null,
        },
        workforceSessions: {
          revokeAllForUser,
          revokeAllWorkforceSessionsForUser,
        },
      }),
  };
  const dependencies = {
    branches: {},
    memberships: {
      findByUserAndOrganization: async (userId: string) =>
        members.find((item) => item.userId === userId) ?? null,
      listByOrganization: async () =>
        members.map((item) => ({
          ...item,
          email: "x@example.test",
          name: null,
          userStatus: "ACTIVE",
        })),
    },
    organizations: {},
    passwords: {
      hash: async (password: string) => `hashed:${password.length}`,
      verify: async () => false,
    },
    rolePermissions: {},
    teamMembershipTransactions,
    users: { create: vi.fn(), findByEmail: vi.fn(async () => null) },
  } as unknown as OrganizationApplicationServiceDependencies;
  return {
    assignRole,
    created,
    createUser,
    credentials,
    revokeAllWorkforceSessionsForUser,
    recordWithinTransaction,
    revokeAllForUser,
    service: new OrganizationApplicationService(dependencies),
  };
}

const contextFor = (userId: string | null) => ({
  organizationId,
  requestId: "req-team-1",
  userId,
});

describe("OrganizationApplicationService team guards", () => {
  it("lets an owner change a role, revoking the member's sessions", async () => {
    const harness = createService();
    const result = await harness.service.assignTeamMemberRole(
      contextFor(ownerUserId),
      { expectedVersion: 1, role: "MANAGER", teamMemberId: staff.id },
    );
    expect(result.ok).toBe(true);
    expect(harness.assignRole).toHaveBeenCalled();
    expect(harness.revokeAllForUser).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, userId: staffUserId }),
    );
    expect(harness.recordWithinTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TEAM_MEMBER_ROLE_CHANGED" }),
    );
  });

  it("rejects changing your own role", async () => {
    const harness = createService();
    const result = await harness.service.assignTeamMemberRole(
      contextFor(ownerUserId),
      { expectedVersion: 1, role: "ADMIN", teamMemberId: owner.id },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(result.error.message).toBe(OWN_MEMBERSHIP_MESSAGE);
    }
    expect(harness.assignRole).not.toHaveBeenCalled();
  });

  it("rejects an admin changing an owner", async () => {
    const harness = createService();
    const result = await harness.service.assignTeamMemberRole(
      contextFor(adminUserId),
      { expectedVersion: 1, role: "STAFF", teamMemberId: owner.id },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("rejects an admin adding an owner or admin before creating anything", async () => {
    const harness = createService();
    for (const role of ["OWNER", "ADMIN"] as const) {
      const result = await harness.service.createTeamMember(
        contextFor(adminUserId),
        {
          email: "new@example.test",
          name: "New",
          role,
          temporaryPassword: "Temp-pass-123",
        },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(harness.createUser).not.toHaveBeenCalled();
  });

  it("requires a signed-in actor for team changes", async () => {
    const harness = createService();
    const result = await harness.service.assignTeamMemberRole(
      contextFor(null),
      { expectedVersion: 1, role: "MANAGER", teamMemberId: staff.id },
    );
    expect(result.ok).toBe(false);
    expect(harness.assignRole).not.toHaveBeenCalled();
  });
});

describe("OrganizationApplicationService team passwords", () => {
  it("creates the member with a hashed password credential", async () => {
    const harness = createService();
    const result = await harness.service.createTeamMember(
      contextFor(ownerUserId),
      {
        email: "New.Staff@Shop.test",
        name: "New Staff",
        role: "STAFF",
        temporaryPassword: "Temp-pass-123",
      },
    );
    expect(result.ok).toBe(true);
    expect(harness.credentials).toEqual([
      expect.objectContaining({
        identifier: "new.staff@shop.test",
        passwordHash: "hashed:13",
        provider: "PASSWORD",
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("Temp-pass-123");
    expect(JSON.stringify(result)).not.toContain("hashed:");
  });

  it("refuses an email that already has a password login", async () => {
    const harness = createService();
    harness.credentials.push({
      createdAt: now,
      id: "cccccccc-cccc-4ccc-8ccc-000000000050",
      identifier: "shopper@shop.test",
      passwordHash: "customer-hash",
      provider: "PASSWORD",
      status: "ACTIVE",
      updatedAt: now,
      userId: "dddddddd-dddd-4ddd-8ddd-000000000001",
      version: 3,
    });
    const result = await harness.service.createTeamMember(
      contextFor(ownerUserId),
      {
        email: "shopper@shop.test",
        name: "Shopper",
        role: "STAFF",
        temporaryPassword: "Temp-pass-123",
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.message).toBe(EXISTING_LOGIN_MESSAGE);
    }
    expect(harness.credentials[0]?.passwordHash).toBe("customer-hash");
    expect(harness.created).toEqual([]);
  });

  it("forbids an admin resetting an owner's password", async () => {
    const harness = createService();
    const result = await harness.service.resetTeamMemberPassword(
      contextFor(adminUserId),
      {
        expectedVersion: 1,
        newPassword: "New-pass-456",
        teamMemberId: owner.id,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.message).toBe(OWNER_ONLY_PASSWORD_MESSAGE);
    }
    expect(harness.revokeAllWorkforceSessionsForUser).not.toHaveBeenCalled();
  });

  it("resets a staff password and revokes that user's sessions", async () => {
    const harness = createService();
    const result = await harness.service.resetTeamMemberPassword(
      contextFor(ownerUserId),
      {
        expectedVersion: 1,
        newPassword: "New-pass-456",
        teamMemberId: staff.id,
      },
    );
    expect(result.ok).toBe(true);
    expect(harness.revokeAllWorkforceSessionsForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: staffUserId }),
    );
    expect(harness.credentials[0]).toMatchObject({
      identifier: "staff@shop.test",
      passwordHash: "hashed:12",
    });
    expect(harness.recordWithinTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TEAM_MEMBER_PASSWORD_RESET" }),
    );
  });

  it("rejects passwords shorter than 8 characters before hashing", async () => {
    const harness = createService();
    const result = await harness.service.resetTeamMemberPassword(
      contextFor(ownerUserId),
      { expectedVersion: 1, newPassword: "short", teamMemberId: staff.id },
    );
    expect(result.ok).toBe(false);
    expect(harness.credentials).toEqual([]);
  });
});
