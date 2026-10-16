/* eslint-disable @typescript-eslint/require-await -- in-memory fakes implement async repository interfaces */
import { describe, expect, it, vi } from "vitest";
import type { UserCredential } from "../../authentication/domain/models.js";
import type { RecordAuditEntryInput } from "../../audit/domain/models.js";
import { AuthorizationError, ConflictError } from "../../errors.js";
import {
  CUSTOMER_ACCOUNT_MESSAGE,
  EXISTING_LOGIN_MESSAGE,
  createTeamMemberWithPassword,
  resetTeamMemberPassword,
} from "../application/team-credential-use-cases.js";
import {
  OWN_PASSWORD_MESSAGE,
  OWNER_ONLY_PASSWORD_MESSAGE,
  type TeamMembershipTransactionManager,
} from "../application/team-membership-use-cases.js";
import type { OrganizationMembership, Role, User } from "../domain/models.js";

const ORG = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-10-02T06:00:00.000Z");
let sequence = 0;
const nextId = (prefix: string) => {
  sequence += 1;
  return `${prefix}-${String(sequence).padStart(4, "0")}-4aaa-8aaa-${String(sequence).padStart(12, "0")}`;
};

function store() {
  const users: User[] = [];
  const members: OrganizationMembership[] = [];
  const credentials: UserCredential[] = [];
  const customers = new Set<string>();
  const audits: RecordAuditEntryInput[] = [];
  const revoked: string[] = [];

  function addMember(
    role: Role,
    email = `${role.toLowerCase()}${sequence}@shop.test`,
  ) {
    const user: User = {
      createdAt: now,
      email,
      id: nextId("bbbbbbbb"),
      name: role,
      status: "ACTIVE",
      updatedAt: now,
      version: 1,
    };
    users.push(user);
    const membership: OrganizationMembership = {
      createdAt: now,
      id: nextId("aaaaaaaa"),
      organizationId: ORG,
      role,
      status: "ACTIVE",
      updatedAt: now,
      userId: user.id,
      version: 1,
    };
    members.push(membership);
    return { membership, user };
  }

  function addCredential(user: Pick<User, "email" | "id">, hash = "old-hash") {
    const credential: UserCredential = {
      createdAt: now,
      id: nextId("cccccccc"),
      identifier: user.email,
      passwordHash: hash,
      provider: "PASSWORD",
      status: "ACTIVE",
      updatedAt: now,
      userId: user.id,
      version: 1,
    };
    credentials.push(credential);
    return credential;
  }

  const unusedMethod = () => {
    throw new Error("not used");
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
        credentials: {
          create: async (record) => {
            const created: UserCredential = {
              ...record,
              createdAt: now,
              id: nextId("cccccccc"),
              updatedAt: now,
              version: 1,
            };
            credentials.push(created);
            return created;
          },
          findByProviderIdentifier: async (provider, identifier) =>
            credentials.find(
              (item) =>
                item.provider === provider && item.identifier === identifier,
            ) ?? null,
          replacePassword: async (record) => {
            const found = credentials.find(
              (item) =>
                item.id === record.id &&
                item.version === record.expectedVersion,
            );
            if (!found) return null;
            found.passwordHash = record.passwordHash;
            found.version += 1;
            return { ...found };
          },
        },
        lockOrganizationMemberships: async () => members.map((m) => ({ ...m })),
        memberships: {
          assignRole: unusedMethod,
          changeStatus: unusedMethod,
          create: async (record) => {
            const created: OrganizationMembership = {
              ...record,
              createdAt: now,
              id: nextId("aaaaaaaa"),
              updatedAt: now,
              version: 1,
            };
            members.push(created);
            return created;
          },
          findByUserAndOrganization: async (userId, organizationId) =>
            members.find(
              (m) => m.userId === userId && m.organizationId === organizationId,
            ) ?? null,
        },
        userHasCustomerAccount: async (userId) => customers.has(userId),
        users: {
          create: async (record) => {
            const created: User = {
              ...record,
              createdAt: now,
              id: nextId("bbbbbbbb"),
              updatedAt: now,
              version: 1,
            };
            users.push(created);
            return created;
          },
          findByEmail: async (email) =>
            users.find((u) => u.email === email) ?? null,
          findById: async (id) => users.find((u) => u.id === id) ?? null,
        },
        workforceSessions: {
          revokeAllForUser: unusedMethod,
          revokeAllWorkforceSessionsForUser: vi.fn(
            async ({ userId }: { revokedAt: Date; userId: string }) => {
              revoked.push(userId);
              return 3;
            },
          ),
        },
      }),
  };
  return {
    addCredential,
    addMember,
    audits,
    credentials,
    customers,
    manager,
    members,
    revoked,
    users,
  };
}

describe("create team member with a password", () => {
  it("creates user, membership and PASSWORD credential together", async () => {
    const s = store();
    const owner = s.addMember("OWNER");
    const result = await createTeamMemberWithPassword(s.manager, {
      actorUserId: owner.user.id,
      email: "  New.Staff@Shop.test ",
      name: "New Staff",
      organizationId: ORG,
      passwordHash: "hashed-temp",
      role: "STAFF",
    });
    expect(result.user.email).toBe("new.staff@shop.test");
    expect(result.membership).toMatchObject({
      role: "STAFF",
      status: "ACTIVE",
    });
    expect(s.credentials.at(-1)).toMatchObject({
      identifier: "new.staff@shop.test",
      passwordHash: "hashed-temp",
      provider: "PASSWORD",
      status: "ACTIVE",
      userId: result.user.id,
    });
    expect(s.audits).toHaveLength(1);
    expect(s.audits[0]).toMatchObject({
      action: "TEAM_MEMBER_PASSWORD_SET",
      actor: { userId: owner.user.id },
      resource: "ORGANIZATION_MEMBERSHIP",
    });
    expect(JSON.stringify(s.audits)).not.toMatch(/hashed-temp|@/u);
  });

  it("refuses an email that already has a password login", async () => {
    const s = store();
    const owner = s.addMember("OWNER");
    s.addCredential({ email: "taken@shop.test", id: "customer-user" });
    await expect(
      createTeamMemberWithPassword(s.manager, {
        actorUserId: owner.user.id,
        email: "taken@shop.test",
        name: "Taken",
        organizationId: ORG,
        passwordHash: "hashed",
        role: "STAFF",
      }),
    ).rejects.toThrow(new ConflictError(EXISTING_LOGIN_MESSAGE));
    expect(
      s.credentials.find((c) => c.identifier === "taken@shop.test")
        ?.passwordHash,
    ).toBe("old-hash");
    expect(s.members).toHaveLength(1);
  });

  it("refuses a storefront customer's email and an admin adding an owner", async () => {
    const s = store();
    const owner = s.addMember("OWNER");
    const admin = s.addMember("ADMIN");
    const customer = s.addMember("STAFF", "shopper@shop.test");
    s.members.pop();
    s.customers.add(customer.user.id);
    await expect(
      createTeamMemberWithPassword(s.manager, {
        actorUserId: owner.user.id,
        email: "shopper@shop.test",
        name: "Shopper",
        organizationId: ORG,
        passwordHash: "hashed",
        role: "STAFF",
      }),
    ).rejects.toThrow(CUSTOMER_ACCOUNT_MESSAGE);
    await expect(
      createTeamMemberWithPassword(s.manager, {
        actorUserId: admin.user.id,
        email: "boss@shop.test",
        name: "Boss",
        organizationId: ORG,
        passwordHash: "hashed",
        role: "OWNER",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("reset team member password", () => {
  it("replaces the password, bumps the version and revokes sessions", async () => {
    const s = store();
    const owner = s.addMember("OWNER");
    const staff = s.addMember("STAFF");
    const credential = s.addCredential(staff.user);
    const result = await resetTeamMemberPassword(s.manager, {
      actorUserId: owner.user.id,
      expectedVersion: 1,
      membershipId: staff.membership.id,
      now,
      organizationId: ORG,
      passwordHash: "new-hash",
    });
    expect(result.revokedSessionCount).toBe(3);
    expect(s.revoked).toEqual([staff.user.id]);
    expect(credential).toMatchObject({ passwordHash: "new-hash", version: 2 });
    expect(s.audits[0]).toMatchObject({
      action: "TEAM_MEMBER_PASSWORD_RESET",
      actor: { userId: owner.user.id },
    });
    expect(s.audits[0]?.metadata).toMatchObject({
      resultingVersion: 2,
      revokedSessionCount: 3,
      targetUserId: staff.user.id,
    });
    expect(JSON.stringify(s.audits)).not.toMatch(/new-hash|old-hash/u);
  });

  it("gives an existing member without a login a password", async () => {
    const s = store();
    const owner = s.addMember("OWNER");
    const manager = s.addMember("MANAGER");
    await resetTeamMemberPassword(s.manager, {
      actorUserId: owner.user.id,
      expectedVersion: 1,
      membershipId: manager.membership.id,
      organizationId: ORG,
      passwordHash: "first-hash",
    });
    expect(s.credentials).toEqual([
      expect.objectContaining({
        identifier: manager.user.email,
        passwordHash: "first-hash",
        userId: manager.user.id,
      }),
    ]);
  });

  it("forbids an admin resetting an owner and anyone resetting themselves", async () => {
    const s = store();
    const owner = s.addMember("OWNER");
    const admin = s.addMember("ADMIN");
    s.addCredential(owner.user);
    await expect(
      resetTeamMemberPassword(s.manager, {
        actorUserId: admin.user.id,
        expectedVersion: 1,
        membershipId: owner.membership.id,
        organizationId: ORG,
        passwordHash: "x",
      }),
    ).rejects.toThrow(OWNER_ONLY_PASSWORD_MESSAGE);
    await expect(
      resetTeamMemberPassword(s.manager, {
        actorUserId: owner.user.id,
        expectedVersion: 1,
        membershipId: owner.membership.id,
        organizationId: ORG,
        passwordHash: "x",
      }),
    ).rejects.toThrow(OWN_PASSWORD_MESSAGE);
    expect(s.revoked).toEqual([]);
    expect(s.audits).toEqual([]);
  });

  it("refuses a stale screen (membership version)", async () => {
    const s = store();
    const owner = s.addMember("OWNER");
    const staff = s.addMember("STAFF");
    await expect(
      resetTeamMemberPassword(s.manager, {
        actorUserId: owner.user.id,
        expectedVersion: 7,
        membershipId: staff.membership.id,
        organizationId: ORG,
        passwordHash: "x",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
