import {
  OWN_MEMBERSHIP_MESSAGE,
  type OrganizationMembership,
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
  const recordWithinTransaction = vi.fn(async () => ({}) as never);
  const teamMembershipTransactions: TeamMembershipTransactionManager = {
    execute: (operation) =>
      operation({
        auditWriter: { recordWithinTransaction },
        lockOrganizationMemberships: async () => members,
        memberships: { assignRole, changeStatus: vi.fn() },
        workforceSessions: { revokeAllForUser },
      }),
  };
  const createUser = vi.fn();
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
    rolePermissions: {},
    teamMembershipTransactions,
    users: { create: createUser, findByEmail: vi.fn(async () => null) },
  } as unknown as OrganizationApplicationServiceDependencies;
  return {
    assignRole,
    createUser,
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
        { email: "new@example.test", name: "New", role },
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
