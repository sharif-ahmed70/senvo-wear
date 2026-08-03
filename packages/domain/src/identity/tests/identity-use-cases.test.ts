import { beforeEach, describe, expect, it } from "vitest";
import type { Organization } from "../../catalog/domain/models.js";
import {
  createOrganizationMembership,
  createUser,
  validateOrganizationAccess,
} from "../application/identity-use-cases.js";
import type { OrganizationMembership, Role, User } from "../domain/models.js";
import type {
  CreateOrganizationMembershipRecord,
  CreateUserRecord,
  OrganizationMembershipRepository,
  UserRepository,
} from "../repositories/identity-repositories.js";

const userId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const otherOrganizationId = "33333333-3333-4333-8333-333333333333";
const membershipId = "44444444-4444-4444-8444-444444444444";

describe("identity use cases", () => {
  let organizations: InMemoryOrganizationRepository;
  let users: InMemoryUserRepository;
  let memberships: InMemoryMembershipRepository;

  beforeEach(() => {
    organizations = new InMemoryOrganizationRepository([
      organization(organizationId),
      organization(otherOrganizationId),
    ]);
    users = new InMemoryUserRepository();
    memberships = new InMemoryMembershipRepository();
  });

  it("creates users and valid organization memberships", async () => {
    const createdUser = await createUser(users, {
      email: " Owner@Senvo.Test ",
      name: " Owner   User ",
    });
    const membership = await createOrganizationMembership(
      { memberships, organizations, users },
      {
        organizationId,
        role: "OWNER",
        userId: createdUser.id,
      },
    );

    expect(createdUser).toMatchObject({
      email: "owner@senvo.test",
      name: "Owner User",
      status: "ACTIVE",
    });
    expect(membership).toMatchObject({
      organizationId,
      role: "OWNER",
      status: "ACTIVE",
      userId: createdUser.id,
    });
  });

  it("prevents duplicate users and memberships", async () => {
    const createdUser = await createUser(users, { email: "owner@senvo.test" });
    await expect(
      createUser(users, { email: " OWNER@senvo.test " }),
    ).rejects.toThrow("User email already exists");

    await createOrganizationMembership(
      { memberships, organizations, users },
      { organizationId, role: "ADMIN", userId: createdUser.id },
    );
    await expect(
      createOrganizationMembership(
        { memberships, organizations, users },
        { organizationId, role: "STAFF", userId: createdUser.id },
      ),
    ).rejects.toThrow("Organization membership already exists");
  });

  it("rejects inactive users and inactive memberships for organization access", async () => {
    const inactiveUser = await createUser(users, {
      email: "inactive@senvo.test",
      status: "INACTIVE",
    });
    await expect(
      validateOrganizationAccess(
        { memberships, users },
        { organizationId, userId: inactiveUser.id },
      ),
    ).rejects.toThrow("Inactive users cannot access organization");

    const activeUser = await createUser(users, { email: "staff@senvo.test" });
    const membership = await createOrganizationMembership(
      { memberships, organizations, users },
      {
        organizationId,
        role: "STAFF",
        status: "INACTIVE",
        userId: activeUser.id,
      },
    );
    await expect(
      validateOrganizationAccess(
        { memberships, users },
        { organizationId, userId: activeUser.id },
      ),
    ).rejects.toThrow("Inactive membership cannot access organization");
    expect(membership.status).toBe("INACTIVE");
  });

  it("validates roles and isolates memberships by organization", async () => {
    const createdUser = await createUser(users, {
      email: "manager@senvo.test",
    });
    await expect(
      createOrganizationMembership(
        { memberships, organizations, users },
        { organizationId, role: "ROOT" as Role, userId: createdUser.id },
      ),
    ).rejects.toThrow("role is invalid");

    await createOrganizationMembership(
      { memberships, organizations, users },
      { organizationId, role: "MANAGER", userId: createdUser.id },
    );
    await expect(
      validateOrganizationAccess(
        { memberships, users },
        { organizationId: otherOrganizationId, userId: createdUser.id },
      ),
    ).rejects.toThrow("Organization membership was not found");
    await expect(
      validateOrganizationAccess(
        { memberships, users },
        { organizationId, userId: createdUser.id },
      ),
    ).resolves.toMatchObject({ role: "MANAGER" });
  });
});

function organization(id: string): Organization {
  const now = new Date("2026-07-13T00:00:00.000Z");
  return {
    addressLine1: null,
    addressLine2: null,
    city: null,
    code: id.slice(0, 8),
    countryCode: "BD",
    createdAt: now,
    district: null,
    email: null,
    id,
    name: "Organization",
    phone: null,
    postalCode: null,
    status: "ACTIVE",
    timezone: "Asia/Dhaka",
    updatedAt: now,
    version: 1,
  };
}

function user(record: CreateUserRecord, id: string): User {
  const now = new Date("2026-07-13T00:00:00.000Z");
  return {
    createdAt: now,
    id,
    updatedAt: now,
    version: 1,
    ...record,
  };
}

function membership(
  record: CreateOrganizationMembershipRecord,
  id: string,
): OrganizationMembership {
  const now = new Date("2026-07-13T00:00:00.000Z");
  return {
    createdAt: now,
    id,
    updatedAt: now,
    version: 1,
    ...record,
  };
}

class InMemoryOrganizationRepository {
  constructor(private readonly organizations: Organization[]) {}

  findById(id: string): Promise<Organization | null> {
    return Promise.resolve(
      this.organizations.find((organization) => organization.id === id) ?? null,
    );
  }
}

class InMemoryUserRepository implements UserRepository {
  private readonly users: User[] = [];

  create(record: CreateUserRecord): Promise<User> {
    const created = user(
      record,
      this.users.length === 0 ? userId : crypto.randomUUID(),
    );
    this.users.push(created);
    return Promise.resolve(created);
  }

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(
      this.users.find((user) => user.email === email) ?? null,
    );
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }
}

class InMemoryMembershipRepository implements OrganizationMembershipRepository {
  private readonly memberships: OrganizationMembership[] = [];

  assignRole(): Promise<OrganizationMembership | null> {
    throw new Error("Not needed for this test.");
  }

  changeStatus(): Promise<OrganizationMembership | null> {
    throw new Error("Not needed for this test.");
  }

  create(
    record: CreateOrganizationMembershipRecord,
  ): Promise<OrganizationMembership> {
    const created = membership(
      record,
      this.memberships.length === 0 ? membershipId : crypto.randomUUID(),
    );
    this.memberships.push(created);
    return Promise.resolve(created);
  }

  findById(id: string, orgId?: string): Promise<OrganizationMembership | null> {
    return Promise.resolve(
      this.memberships.find(
        (membership) =>
          membership.id === id &&
          (orgId === undefined || membership.organizationId === orgId),
      ) ?? null,
    );
  }

  findByUserAndOrganization(
    id: string,
    orgId: string,
  ): Promise<OrganizationMembership | null> {
    return Promise.resolve(
      this.memberships.find(
        (membership) =>
          membership.userId === id && membership.organizationId === orgId,
      ) ?? null,
    );
  }
}
