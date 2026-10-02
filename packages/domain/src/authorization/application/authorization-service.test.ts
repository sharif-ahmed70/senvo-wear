import { describe, expect, it } from "vitest";
import type {
  OrganizationMembership,
  Role,
  User,
} from "../../identity/domain/models.js";
import type {
  OrganizationMembershipRepository,
  UserRepository,
} from "../../identity/repositories/identity-repositories.js";
import { authorize } from "./authorization-service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const otherOrganizationId = "33333333-3333-4333-8333-333333333333";
const membershipId = "44444444-4444-4444-8444-444444444444";
const salesCreate = { action: "CREATE", resource: "SALES_ORDER" } as const;
const inventoryFulfill = { action: "FULFILL", resource: "INVENTORY" } as const;

describe("authorization service", () => {
  it("allows owners to perform any modeled permission", async () => {
    const repositories = repositoriesFor({ role: "OWNER" });

    await expect(
      authorize(repositories, {
        context: { organizationId, userId },
        permission: { action: "DELETE", resource: "REPORT" },
      }),
    ).resolves.toMatchObject({ allowed: true, role: "OWNER" });
  });

  it("allows admins to manage catalog, inventory, sales, users, and organization", async () => {
    const repositories = repositoriesFor({ role: "ADMIN" });

    await expect(
      authorize(repositories, {
        context: { organizationId, role: "ADMIN", userId },
        permission: salesCreate,
      }),
    ).resolves.toMatchObject({ allowed: true, role: "ADMIN" });
  });

  it("denies staff permissions outside limited operational access", async () => {
    const repositories = repositoriesFor({ role: "STAFF" });

    await expect(
      authorize(repositories, {
        context: { organizationId, role: "STAFF", userId },
        permission: inventoryFulfill,
      }),
    ).rejects.toThrow("Permission is required");
  });

  it("allows managers but not staff to approve outstanding payments", async () => {
    await expect(
      authorize(repositoriesFor({ role: "MANAGER" }), {
        context: { organizationId, role: "MANAGER", userId },
        permission: { action: "APPROVE", resource: "PAYMENT" },
      }),
    ).resolves.toMatchObject({ allowed: true, role: "MANAGER" });
    await expect(
      authorize(repositoriesFor({ role: "STAFF" }), {
        context: { organizationId, role: "STAFF", userId },
        permission: { action: "APPROVE", resource: "PAYMENT" },
      }),
    ).rejects.toThrow("Permission is required");
  });

  it("rejects inactive users", async () => {
    const repositories = repositoriesFor({
      role: "OWNER",
      userStatus: "LOCKED",
    });

    await expect(
      authorize(repositories, {
        context: { organizationId, userId },
        permission: salesCreate,
      }),
    ).rejects.toThrow("Inactive users cannot access organization");
  });

  it("rejects inactive memberships", async () => {
    const repositories = repositoriesFor({
      membershipStatus: "INACTIVE",
      role: "OWNER",
    });

    await expect(
      authorize(repositories, {
        context: { organizationId, userId },
        permission: salesCreate,
      }),
    ).rejects.toThrow("Inactive membership cannot access organization");
  });

  it("rejects wrong organization access", async () => {
    const repositories = repositoriesFor({ role: "OWNER" });

    await expect(
      authorize(repositories, {
        context: { organizationId: otherOrganizationId, userId },
        permission: salesCreate,
      }),
    ).rejects.toThrow("User is not a member of this organization");
  });

  it("rejects missing explicit context permission", async () => {
    const repositories = repositoriesFor({ role: "OWNER" });

    await expect(
      authorize(repositories, {
        context: { organizationId, permissions: [], userId },
        permission: salesCreate,
      }),
    ).rejects.toThrow("Permission is required");
  });

  it("allows owners to perform procurement operations (READ, CREATE, UPDATE) by default", async () => {
    const repositories = repositoriesFor({ role: "OWNER" });

    await expect(
      authorize(repositories, {
        context: { organizationId, userId },
        permission: { action: "READ", resource: "PROCUREMENT" },
      }),
    ).resolves.toMatchObject({ allowed: true, role: "OWNER" });

    await expect(
      authorize(repositories, {
        context: { organizationId, userId },
        permission: { action: "CREATE", resource: "PROCUREMENT" },
      }),
    ).resolves.toMatchObject({ allowed: true, role: "OWNER" });

    await expect(
      authorize(repositories, {
        context: { organizationId, userId },
        permission: { action: "UPDATE", resource: "PROCUREMENT" },
      }),
    ).resolves.toMatchObject({ allowed: true, role: "OWNER" });
  });

  it("denies staff procurement access and manager supplier updates by default", async () => {
    await expect(
      authorize(repositoriesFor({ role: "STAFF" }), {
        context: { organizationId, role: "STAFF", userId },
        permission: { action: "READ", resource: "PROCUREMENT" },
      }),
    ).rejects.toThrow("Permission is required");

    await expect(
      authorize(repositoriesFor({ role: "MANAGER" }), {
        context: { organizationId, role: "MANAGER", userId },
        permission: { action: "UPDATE", resource: "PROCUREMENT" },
      }),
    ).rejects.toThrow("Permission is required");
  });

  it("rejects when explicit context permissions lack required procurement permission", async () => {
    const repositories = repositoriesFor({ role: "OWNER" });

    await expect(
      authorize(repositories, {
        context: {
          organizationId,
          permissions: [{ action: "READ", resource: "CATALOG" }],
          userId,
        },
        permission: { action: "READ", resource: "PROCUREMENT" },
      }),
    ).rejects.toThrow("Permission is required");
  });

  it("preserves persisted grants precedence over fallback defaults", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const base = repositoriesFor({ role: "OWNER" });
    const repositories = {
      ...base,
      rolePermissions: {
        create: () => Promise.reject(new Error("not implemented")),
        findByRoleAndPermission: () => Promise.resolve(null),
        listActivePermissionsByRole: () =>
          Promise.resolve([
            {
              action: "READ" as const,
              createdAt: now,
              description: null,
              id: "perm-cat",
              resource: "CATALOG" as const,
              status: "ACTIVE" as const,
              updatedAt: now,
            },
          ]),
      },
    };

    // When rolePermissions returns only CATALOG:READ, OWNER is denied PROCUREMENT:READ
    await expect(
      authorize(repositories, {
        context: { organizationId, userId },
        permission: { action: "READ", resource: "PROCUREMENT" },
      }),
    ).rejects.toThrow("Permission is required");
  });
});

function repositoriesFor(input: {
  membershipStatus?: OrganizationMembership["status"];
  role: Role;
  userStatus?: User["status"];
}): {
  memberships: OrganizationMembershipRepository;
  users: UserRepository;
} {
  const user = userRecord(input.userStatus ?? "ACTIVE");
  const membership = membershipRecord(
    input.role,
    input.membershipStatus ?? "ACTIVE",
  );
  return {
    memberships: {
      assignRole: () => Promise.resolve(null),
      changeStatus: () => Promise.resolve(null),
      create: () => Promise.resolve(membership),
      findById: () => Promise.resolve(membership),
      findByUserAndOrganization: (id, orgId) =>
        Promise.resolve(
          id === userId && orgId === organizationId ? membership : null,
        ),
    },
    users: {
      create: () => Promise.resolve(user),
      findByEmail: () => Promise.resolve(user),
      findById: (id) => Promise.resolve(id === userId ? user : null),
    },
  };
}

function userRecord(status: User["status"]): User {
  const now = new Date("2026-07-13T00:00:00.000Z");
  return {
    createdAt: now,
    email: "owner@senvo.test",
    id: userId,
    name: "Owner",
    status,
    updatedAt: now,
    version: 1,
  };
}

function membershipRecord(
  role: Role,
  status: OrganizationMembership["status"],
): OrganizationMembership {
  const now = new Date("2026-07-13T00:00:00.000Z");
  return {
    createdAt: now,
    id: membershipId,
    organizationId,
    role,
    status,
    updatedAt: now,
    userId,
    version: 1,
  };
}
