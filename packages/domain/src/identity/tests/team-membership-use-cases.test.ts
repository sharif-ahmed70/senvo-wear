import { describe, expect, it, vi } from "vitest";
import type { RecordAuditEntryInput } from "../../audit/domain/models.js";
import { AuthorizationError } from "../../errors.js";
import {
  LAST_OWNER_MESSAGE,
  OWNER_ONLY_MEMBERSHIP_MESSAGE,
  OWN_MEMBERSHIP_MESSAGE,
  TeamMembershipRuleError,
  assertTeamMembershipChangeAllowed,
  assignableRoles,
  changeTeamMemberRole,
  changeTeamMemberStatus,
  type TeamMembershipTransactionManager,
} from "../application/team-membership-use-cases.js";
import type { OrganizationMembership, Role } from "../domain/models.js";

const ORG = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-10-02T06:00:00.000Z");
let sequence = 0;

function member(role: Role, status: "ACTIVE" | "INACTIVE" = "ACTIVE") {
  sequence += 1;
  const n = String(sequence).padStart(12, "0");
  return {
    createdAt: now,
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${n}`,
    organizationId: ORG,
    role,
    status,
    updatedAt: now,
    userId: `bbbbbbbb-bbbb-4bbb-8bbb-${n}`,
    version: 1,
  } satisfies OrganizationMembership;
}

function harness(members: OrganizationMembership[]) {
  const state = members.map((item) => ({ ...item }));
  const audits: RecordAuditEntryInput[] = [];
  const revokeAllForUser = vi.fn(async () => 2);
  const lock = vi.fn(async () => state.map((item) => ({ ...item })));
  const update = (
    record: { expectedVersion: number; id: string },
    patch: Partial<OrganizationMembership>,
  ) => {
    const found = state.find((item) => item.id === record.id);
    if (!found || found.version !== record.expectedVersion) return null;
    Object.assign(found, patch, { version: found.version + 1 });
    return { ...found };
  };
  const manager: TeamMembershipTransactionManager = {
    execute: (operation) =>
      operation({
        auditWriter: {
          recordWithinTransaction: async (input) => {
            audits.push(input);
            return {} as never;
          },
        },
        lockOrganizationMemberships: lock,
        memberships: {
          assignRole: async (record) => update(record, { role: record.role }),
          changeStatus: async (record) =>
            update(record, { status: record.status }),
        },
        workforceSessions: { revokeAllForUser },
      }),
  };
  return { audits, lock, manager, revokeAllForUser, state };
}

const base = (
  actor: OrganizationMembership,
  target: OrganizationMembership,
) => ({
  actorUserId: actor.userId,
  expectedVersion: target.version,
  membershipId: target.id,
  now,
  organizationId: ORG,
});

describe("team membership guards", () => {
  it("guard 1: nobody changes their own role or deactivates themselves", async () => {
    const owner = member("OWNER");
    const other = member("OWNER");
    const { manager } = harness([owner, other]);
    await expect(
      changeTeamMemberRole(manager, { ...base(owner, owner), role: "ADMIN" }),
    ).rejects.toThrow(OWN_MEMBERSHIP_MESSAGE);
    await expect(
      changeTeamMemberStatus(manager, {
        ...base(owner, owner),
        status: "INACTIVE",
      }),
    ).rejects.toBeInstanceOf(TeamMembershipRuleError);

    const admin = member("ADMIN");
    const h = harness([owner, admin]);
    await expect(
      changeTeamMemberRole(h.manager, { ...base(admin, admin), role: "OWNER" }),
    ).rejects.toThrow(OWN_MEMBERSHIP_MESSAGE);
  });

  it("guard 2: the last active owner is never demoted or deactivated", async () => {
    const owner = member("OWNER");
    const formerOwner = member("OWNER", "INACTIVE");
    const admin = member("ADMIN");
    // A second owner can demote this one only while two owners are active.
    const secondOwner = member("OWNER");
    const { manager } = harness([owner, formerOwner, admin, secondOwner]);
    await changeTeamMemberRole(manager, {
      ...base(owner, secondOwner),
      role: "ADMIN",
    });
    await expect(
      changeTeamMemberRole(manager, {
        ...base(secondOwner, owner),
        role: "ADMIN",
      }),
    ).rejects.toThrow(AuthorizationError);

    // Direct rule check: one active owner left, inactive owners don't count.
    const members = [owner, formerOwner, admin];
    for (const change of [
      { kind: "role", role: "MANAGER" },
      { kind: "status", status: "INACTIVE" },
    ] as const) {
      expect(() =>
        assertTeamMembershipChangeAllowed({
          actor: { role: "OWNER", userId: "someone-else" },
          change,
          members,
          target: owner,
        }),
      ).toThrow(LAST_OWNER_MESSAGE);
    }
  });

  it("guard 3: only an owner manages owners and admins", async () => {
    const owner = member("OWNER");
    const admin = member("ADMIN");
    const otherAdmin = member("ADMIN");
    const manager = member("MANAGER");
    const staff = member("STAFF");
    const h = harness([owner, admin, otherAdmin, manager, staff]);

    for (const [target, role] of [
      [owner, "ADMIN"],
      [otherAdmin, "STAFF"],
      [staff, "ADMIN"],
      [staff, "OWNER"],
    ] as const) {
      await expect(
        changeTeamMemberRole(h.manager, { ...base(admin, target), role }),
      ).rejects.toThrow(OWNER_ONLY_MEMBERSHIP_MESSAGE);
    }
    await expect(
      changeTeamMemberStatus(h.manager, {
        ...base(admin, otherAdmin),
        status: "INACTIVE",
      }),
    ).rejects.toThrow(OWNER_ONLY_MEMBERSHIP_MESSAGE);

    // ADMIN manages MANAGER and STAFF.
    await changeTeamMemberRole(h.manager, {
      ...base(admin, staff),
      role: "MANAGER",
    });
    expect(h.state.find((item) => item.id === staff.id)?.role).toBe("MANAGER");
    // OWNER manages everyone.
    await changeTeamMemberRole(h.manager, {
      ...base(owner, otherAdmin),
      role: "OWNER",
    });
    // MANAGER manages nobody.
    await expect(
      changeTeamMemberStatus(h.manager, {
        ...base(manager, { ...staff, version: 2 }),
        status: "INACTIVE",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(assignableRoles("OWNER")).toEqual([
      "OWNER",
      "ADMIN",
      "MANAGER",
      "STAFF",
    ]);
    expect(assignableRoles("ADMIN")).toEqual(["MANAGER", "STAFF"]);
    expect(assignableRoles("MANAGER")).toEqual([]);
    expect(() =>
      assertTeamMembershipChangeAllowed({
        actor: admin,
        change: { kind: "create", role: "ADMIN" },
        members: [],
        target: null,
      }),
    ).toThrow(OWNER_ONLY_MEMBERSHIP_MESSAGE);
    expect(() =>
      assertTeamMembershipChangeAllowed({
        actor: admin,
        change: { kind: "create", role: "STAFF" },
        members: [],
        target: null,
      }),
    ).not.toThrow();
  });

  it("guard 4: a role change revokes sessions and is audited without PII", async () => {
    const owner = member("OWNER");
    const staff = member("STAFF");
    const h = harness([owner, staff]);
    const result = await changeTeamMemberRole(h.manager, {
      ...base(owner, staff),
      role: "MANAGER",
    });
    expect(h.lock).toHaveBeenCalledWith(ORG);
    expect(h.revokeAllForUser).toHaveBeenCalledWith({
      organizationId: ORG,
      revokedAt: now,
      userId: staff.userId,
    });
    expect(result.revokedSessionCount).toBe(2);
    expect(h.audits).toEqual([
      {
        action: "TEAM_MEMBER_ROLE_CHANGED",
        actor: { userId: owner.userId },
        metadata: {
          actorRole: "OWNER",
          fromRole: "STAFF",
          membershipId: staff.id,
          resultingVersion: 2,
          revokedSessionCount: 2,
          targetUserId: staff.userId,
          toRole: "MANAGER",
        },
        organizationId: ORG,
        resource: "ORGANIZATION_MEMBERSHIP",
        resourceId: staff.id,
      },
    ]);
    expect(JSON.stringify(h.audits)).not.toMatch(/@|name|email/iu);
  });

  it("revokes sessions on deactivation but not on reactivation or same role", async () => {
    const owner = member("OWNER");
    const staff = member("STAFF");
    const h = harness([owner, staff]);
    await changeTeamMemberStatus(h.manager, {
      ...base(owner, staff),
      status: "INACTIVE",
    });
    expect(h.revokeAllForUser).toHaveBeenCalledTimes(1);
    await changeTeamMemberStatus(h.manager, {
      ...base(owner, { ...staff, version: 2 }),
      status: "ACTIVE",
    });
    await changeTeamMemberRole(h.manager, {
      ...base(owner, { ...staff, version: 3 }),
      role: "STAFF",
    });
    expect(h.revokeAllForUser).toHaveBeenCalledTimes(1);
    expect(h.audits.map((entry) => entry.action)).toEqual([
      "TEAM_MEMBER_STATUS_CHANGED",
      "TEAM_MEMBER_STATUS_CHANGED",
      "TEAM_MEMBER_ROLE_CHANGED",
    ]);
  });

  it("rejects inactive actors and stale versions", async () => {
    const owner = member("OWNER");
    const inactiveOwner = member("OWNER", "INACTIVE");
    const staff = member("STAFF");
    const h = harness([owner, inactiveOwner, staff]);
    await expect(
      changeTeamMemberRole(h.manager, {
        ...base(inactiveOwner, staff),
        role: "MANAGER",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      changeTeamMemberRole(h.manager, {
        ...base(owner, { ...staff, version: 9 }),
        role: "MANAGER",
      }),
    ).rejects.toThrow("Expected membership version did not match.");
    expect(h.revokeAllForUser).not.toHaveBeenCalled();
  });
});
