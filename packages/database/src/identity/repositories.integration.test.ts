import {
  assignOrganizationMembershipRole,
  createOrganization,
  createOrganizationMembership,
  createUser,
  updateOrganizationMembershipStatus,
  validateOrganizationAccess,
  type Organization,
} from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaOrganizationRepository } from "../catalog/repositories.js";
import { createPrismaClient } from "../index.js";
import {
  PrismaOrganizationMembershipRepository,
  PrismaUserRepository,
} from "./repositories.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("Prisma identity repositories", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let repositories: IdentityRepositories;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    repositories = {
      memberships: new PrismaOrganizationMembershipRepository(prisma),
      organizations: new PrismaOrganizationRepository(prisma),
      users: new PrismaUserRepository(prisma),
    };
  });

  beforeEach(async () => {
    await prisma.posCheckoutRecord.deleteMany();
    await prisma.posCartLine.deleteMany();
    await prisma.posCart.deleteMany();
    await prisma.salesSession.deleteMany();
    await prisma.salesCounter.deleteMany();
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.inventoryReservationLine.deleteMany();
    await prisma.inventoryReservation.deleteMany();
    await prisma.inventoryMovementLine.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryAllocationPolicyLocation.deleteMany();
    await prisma.inventoryAllocationPolicy.deleteMany();
    await prisma.productCollection.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.collection.deleteMany();
    await prisma.category.deleteMany();
    await prisma.color.deleteMany();
    await prisma.size.deleteMany();
    await prisma.posCounter.deleteMany();
    await prisma.stockLocation.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.auditEntry.deleteMany();
    await prisma.userCredential.deleteMany();
    await prisma.organizationMembership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("persists users and organization memberships with access validation", async () => {
    const base = await createIdentityBase(repositories, "A");

    await expect(
      validateOrganizationAccess(repositories, {
        organizationId: base.organization.id,
        userId: base.user.id,
      }),
    ).resolves.toMatchObject({
      organizationId: base.organization.id,
      role: "OWNER",
      status: "ACTIVE",
      userId: base.user.id,
    });
  });

  it("enforces unique email and membership uniqueness", async () => {
    const base = await createIdentityBase(repositories, "A");

    await expect(
      createUser(repositories.users, { email: "OWNER-a@senvo.test" }),
    ).rejects.toThrow("User email already exists");
    await expect(
      createOrganizationMembership(repositories, {
        organizationId: base.organization.id,
        role: "ADMIN",
        userId: base.user.id,
      }),
    ).rejects.toThrow("Organization membership already exists");
  });

  it("allows the same user in different organizations while isolating access", async () => {
    const base = await createIdentityBase(repositories, "A");
    const secondOrganization = await createOrganization(
      repositories.organizations,
      { code: "ORG-B", name: "Org B" },
    );

    await createOrganizationMembership(repositories, {
      organizationId: secondOrganization.id,
      role: "STAFF",
      userId: base.user.id,
    });

    await expect(
      validateOrganizationAccess(repositories, {
        organizationId: secondOrganization.id,
        userId: base.user.id,
      }),
    ).resolves.toMatchObject({ role: "STAFF" });

    const firstTeam = await repositories.memberships.listByOrganization(
      base.organization.id,
    );
    const secondTeam = await repositories.memberships.listByOrganization(
      secondOrganization.id,
    );
    expect(firstTeam).toHaveLength(1);
    expect(secondTeam).toHaveLength(1);
    expect(firstTeam[0]).toMatchObject({
      email: base.user.email,
      organizationId: base.organization.id,
      role: "OWNER",
    });
    expect(secondTeam[0]).toMatchObject({
      organizationId: secondOrganization.id,
      role: "STAFF",
    });
  });

  it("updates membership role and status with optimistic concurrency", async () => {
    const base = await createIdentityBase(repositories, "A");

    const roleChanged = await assignOrganizationMembershipRole(
      repositories.memberships,
      {
        expectedVersion: base.membership.version,
        membershipId: base.membership.id,
        organizationId: base.organization.id,
        role: "MANAGER",
      },
    );

    expect(roleChanged).toMatchObject({ role: "MANAGER", version: 2 });
    await expect(
      assignOrganizationMembershipRole(repositories.memberships, {
        expectedVersion: base.membership.version,
        membershipId: base.membership.id,
        organizationId: base.organization.id,
        role: "STAFF",
      }),
    ).rejects.toThrow("Expected membership version");

    const inactive = await updateOrganizationMembershipStatus(
      repositories.memberships,
      {
        expectedVersion: roleChanged.version,
        membershipId: base.membership.id,
        organizationId: base.organization.id,
        status: "INACTIVE",
      },
    );

    expect(inactive).toMatchObject({ status: "INACTIVE", version: 3 });
    await expect(
      validateOrganizationAccess(repositories, {
        organizationId: base.organization.id,
        userId: base.user.id,
      }),
    ).rejects.toThrow("Inactive membership cannot access organization");
  });

  it("rejects inactive and locked users during access validation", async () => {
    const organization = await createOrganization(repositories.organizations, {
      code: "ORG-A",
      name: "Org A",
    });
    const inactiveUser = await createUser(repositories.users, {
      email: "inactive@senvo.test",
      status: "INACTIVE",
    });

    await expect(
      validateOrganizationAccess(repositories, {
        organizationId: organization.id,
        userId: inactiveUser.id,
      }),
    ).rejects.toThrow("Inactive users cannot access organization");

    const lockedUser = await prisma.user.create({
      data: { email: "locked@senvo.test", status: "LOCKED" },
    });

    await expect(
      validateOrganizationAccess(repositories, {
        organizationId: organization.id,
        userId: lockedUser.id,
      }),
    ).rejects.toThrow("Inactive users cannot access organization");
  });

  it("keeps restrictive deletes for users and organizations with memberships", async () => {
    const base = await createIdentityBase(repositories, "A");

    await expectDbReject(prisma.user.delete({ where: { id: base.user.id } }));
    await expectDbReject(
      prisma.organization.delete({ where: { id: base.organization.id } }),
    );

    await prisma.organizationMembership.delete({
      where: { id: base.membership.id },
    });
    await prisma.user.delete({ where: { id: base.user.id } });
    await prisma.organization.delete({ where: { id: base.organization.id } });
  });
});

type IdentityRepositories = {
  memberships: PrismaOrganizationMembershipRepository;
  organizations: PrismaOrganizationRepository;
  users: PrismaUserRepository;
};

async function createIdentityBase(
  repositories: IdentityRepositories,
  suffix: string,
): Promise<{
  membership: Awaited<ReturnType<typeof createOrganizationMembership>>;
  organization: Organization;
  user: Awaited<ReturnType<typeof createUser>>;
}> {
  const organization = await createOrganization(repositories.organizations, {
    code: `ORG-${suffix}`,
    name: `Org ${suffix}`,
  });
  const user = await createUser(repositories.users, {
    email: `owner-${suffix}@senvo.test`,
    name: `Owner ${suffix}`,
  });
  const membership = await createOrganizationMembership(repositories, {
    organizationId: organization.id,
    role: "OWNER",
    userId: user.id,
  });

  return { membership, organization, user };
}

async function expectDbReject(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toThrow();
}
