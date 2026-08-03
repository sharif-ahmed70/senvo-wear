import {
  createBranch,
  changeBranchStatus,
  changePosCounterStatus,
  changeStockLocationStatus,
  createOrganization,
  createPosCounter,
  createStockLocation,
  getBranchById,
  listBranches,
  listPosCounters,
  listStockLocations,
  updateBranchMetadata,
  updatePosCounterMetadata,
  updateStockLocationMetadata,
} from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import { PrismaOrganizationRepository } from "../catalog/repositories.js";
import {
  PrismaBranchRepository,
  PrismaPosCounterRepository,
  PrismaStockLocationRepository,
} from "./repositories.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("Prisma organization operation repositories", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let repositories: {
    branches: PrismaBranchRepository;
    organizations: PrismaOrganizationRepository;
    posCounters: PrismaPosCounterRepository;
    stockLocations: PrismaStockLocationRepository;
  };

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    repositories = {
      branches: new PrismaBranchRepository(prisma),
      organizations: new PrismaOrganizationRepository(prisma),
      posCounters: new PrismaPosCounterRepository(prisma),
      stockLocations: new PrismaStockLocationRepository(prisma),
    };
  });

  beforeEach(async () => {
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

  it("creates operational identities with normalized defaults", async () => {
    const organization = await createOrganization(repositories.organizations, {
      code: "SENVO",
      name: "SENVO Wear",
    });
    const branch = await createBranch(repositories, {
      code: " main ",
      name: " Main   Showroom ",
      organizationId: organization.id,
    });
    const location = await createStockLocation(repositories, {
      branchId: branch.id,
      code: " floor ",
      name: "Showroom Floor",
      organizationId: organization.id,
      type: "SHOWROOM",
    });
    const counter = await createPosCounter(repositories, {
      branchId: branch.id,
      code: " counter-1 ",
      name: "Counter 1",
      organizationId: organization.id,
    });

    expect(branch).toMatchObject({
      code: "MAIN",
      countryCode: "BD",
      name: "Main Showroom",
      status: "ACTIVE",
      timezone: "Asia/Dhaka",
      type: "SHOWROOM",
    });
    expect(location).toMatchObject({
      code: "FLOOR",
      isSellable: true,
      status: "ACTIVE",
      type: "SHOWROOM",
    });
    expect(counter).toMatchObject({
      code: "COUNTER-1",
      status: "ACTIVE",
    });
  });

  it("enforces organization-wide code uniqueness while allowing same codes in different organizations", async () => {
    const first = await createOperationalBase(repositories, "A");
    const secondOrganization = await createOrganization(
      repositories.organizations,
      {
        code: "ORG-B",
        name: "Org B",
      },
    );
    const secondBranch = await createBranch(repositories, {
      code: first.branch.code,
      name: "Second Main",
      organizationId: secondOrganization.id,
    });

    await expect(
      createBranch(repositories, {
        code: first.branch.code,
        name: "Duplicate Main",
        organizationId: first.organization.id,
      }),
    ).rejects.toThrow("Branch code already exists");

    await expect(
      createStockLocation(repositories, {
        branchId: first.branch.id,
        code: first.location.code,
        name: "Duplicate Floor",
        organizationId: first.organization.id,
      }),
    ).rejects.toThrow("Stock location code already exists");

    await expect(
      createPosCounter(repositories, {
        branchId: first.branch.id,
        code: first.counter.code,
        name: "Duplicate Counter",
        organizationId: first.organization.id,
      }),
    ).rejects.toThrow("POS counter code already exists");

    await expect(
      createStockLocation(repositories, {
        branchId: secondBranch.id,
        code: first.location.code,
        name: "Second Floor",
        organizationId: secondOrganization.id,
      }),
    ).resolves.toMatchObject({ code: first.location.code });
    await expect(
      createPosCounter(repositories, {
        branchId: secondBranch.id,
        code: first.counter.code,
        name: "Second Counter",
        organizationId: secondOrganization.id,
      }),
    ).resolves.toMatchObject({ code: first.counter.code });
  });

  it("enforces same-organization branch references in PostgreSQL", async () => {
    const first = await createOperationalBase(repositories, "A");
    const second = await createOperationalBase(repositories, "B");

    await expectDbReject(
      prisma.stockLocation.create({
        data: {
          branchId: first.branch.id,
          code: "WRONG-FLOOR",
          name: "Wrong Floor",
          organizationId: second.organization.id,
        },
      }),
    );
    await expectDbReject(
      prisma.posCounter.create({
        data: {
          branchId: first.branch.id,
          code: "WRONG-COUNTER",
          name: "Wrong Counter",
          organizationId: second.organization.id,
        },
      }),
    );
  });

  it("prevents destructive deletes for organizations and branches with operational records", async () => {
    const base = await createOperationalBase(repositories, "A");

    await expectDbReject(
      prisma.organization.delete({ where: { id: base.organization.id } }),
    );
    await expectDbReject(
      prisma.branch.delete({ where: { id: base.branch.id } }),
    );

    await prisma.posCounter.delete({ where: { id: base.counter.id } });
    await expectDbReject(
      prisma.branch.delete({ where: { id: base.branch.id } }),
    );

    await prisma.stockLocation.delete({ where: { id: base.location.id } });
    await prisma.branch.delete({ where: { id: base.branch.id } });
    await prisma.organization.delete({ where: { id: base.organization.id } });
  });

  it("persists explicit statuses, types, contact metadata, and non-sellable hold defaults", async () => {
    const organization = await createOrganization(repositories.organizations, {
      code: "SENVO",
      name: "SENVO Wear",
    });
    const branch = await createBranch(repositories, {
      addressLine1: "House 1",
      city: "Dhaka",
      code: "OPS",
      countryCode: "BD",
      district: "Dhaka",
      email: "ops@senvo.test",
      name: "Operations",
      organizationId: organization.id,
      phone: "+880 1700-000000",
      postalCode: "1205",
      status: "INACTIVE",
      timezone: "Asia/Dhaka",
      type: "WAREHOUSE",
    });
    const location = await createStockLocation(repositories, {
      branchId: branch.id,
      code: "QC-HOLD",
      name: "QC Hold",
      organizationId: organization.id,
      type: "QC_HOLD",
    });
    const counter = await createPosCounter(repositories, {
      branchId: branch.id,
      code: "MOBILE",
      name: "Mobile POS",
      organizationId: organization.id,
      status: "ARCHIVED",
    });

    expect(branch).toMatchObject({
      city: "Dhaka",
      countryCode: "BD",
      email: "ops@senvo.test",
      phone: "+880 1700-000000",
      status: "INACTIVE",
      type: "WAREHOUSE",
    });
    expect(location).toMatchObject({
      isSellable: false,
      status: "ACTIVE",
      type: "QC_HOLD",
    });
    expect(counter.status).toBe("ARCHIVED");
  });

  it("increments versions and rejects stale metadata updates", async () => {
    const base = await createOperationalBase(repositories, "A");

    const branch = await updateBranchMetadata(repositories.branches, {
      branchId: base.branch.id,
      email: null,
      expectedVersion: base.branch.version,
      name: " Main   Updated ",
      organizationId: base.organization.id,
    });
    expect(branch).toMatchObject({
      email: null,
      name: "Main Updated",
      version: base.branch.version + 1,
    });
    await expect(
      updateBranchMetadata(repositories.branches, {
        branchId: base.branch.id,
        expectedVersion: base.branch.version,
        name: "Stale",
        organizationId: base.organization.id,
      }),
    ).rejects.toThrow("Expected version");

    const location = await updateStockLocationMetadata(
      repositories.stockLocations,
      {
        expectedVersion: base.location.version,
        isSellable: false,
        name: "Floor Updated",
        organizationId: base.organization.id,
        stockLocationId: base.location.id,
      },
    );
    expect(location).toMatchObject({
      isSellable: false,
      name: "Floor Updated",
      version: base.location.version + 1,
    });
    await expect(
      updateStockLocationMetadata(repositories.stockLocations, {
        expectedVersion: base.location.version,
        name: "Stale Floor",
        organizationId: base.organization.id,
        stockLocationId: base.location.id,
      }),
    ).rejects.toThrow("Expected version");

    const counter = await updatePosCounterMetadata(repositories.posCounters, {
      expectedVersion: base.counter.version,
      name: "Counter Updated",
      organizationId: base.organization.id,
      posCounterId: base.counter.id,
    });
    expect(counter).toMatchObject({
      name: "Counter Updated",
      version: base.counter.version + 1,
    });
    await expect(
      updatePosCounterMetadata(repositories.posCounters, {
        expectedVersion: base.counter.version,
        name: "Stale Counter",
        organizationId: base.organization.id,
        posCounterId: base.counter.id,
      }),
    ).rejects.toThrow("Expected version");
  });

  it("enforces branch lifecycle blockers and allows archive only after children are archived", async () => {
    const base = await createOperationalBase(repositories, "A");

    await expect(
      changeBranchStatus(repositories.branches, {
        branchId: base.branch.id,
        expectedVersion: base.branch.version,
        organizationId: base.organization.id,
        status: "INACTIVE",
      }),
    ).rejects.toThrow("stock locations and POS counters");

    const archivedLocation = await changeStockLocationStatus(
      repositories.stockLocations,
      {
        expectedVersion: base.location.version,
        organizationId: base.organization.id,
        status: "ARCHIVED",
        stockLocationId: base.location.id,
      },
    );
    await expect(
      changeBranchStatus(repositories.branches, {
        branchId: base.branch.id,
        expectedVersion: base.branch.version,
        organizationId: base.organization.id,
        status: "INACTIVE",
      }),
    ).rejects.toThrow("POS counters");

    const inactiveCounter = await changePosCounterStatus(
      repositories.posCounters,
      {
        expectedVersion: base.counter.version,
        organizationId: base.organization.id,
        posCounterId: base.counter.id,
        status: "INACTIVE",
      },
    );
    await expect(
      changeBranchStatus(repositories.branches, {
        branchId: base.branch.id,
        expectedVersion: base.branch.version,
        organizationId: base.organization.id,
        status: "ARCHIVED",
      }),
    ).rejects.toThrow("POS counters");

    await changePosCounterStatus(repositories.posCounters, {
      expectedVersion: inactiveCounter.version,
      organizationId: base.organization.id,
      posCounterId: base.counter.id,
      status: "ARCHIVED",
    });
    const archivedBranch = await changeBranchStatus(repositories.branches, {
      branchId: base.branch.id,
      expectedVersion: base.branch.version,
      organizationId: base.organization.id,
      status: "ARCHIVED",
    });

    expect(archivedBranch).toMatchObject({
      status: "ARCHIVED",
      version: base.branch.version + 1,
    });
    expect(archivedLocation.isSellable).toBe(false);
  });

  it("forces inactive and archived locations non-sellable and blocks invalid sellable persistence", async () => {
    const base = await createOperationalBase(repositories, "A");

    const inactiveLocation = await changeStockLocationStatus(
      repositories.stockLocations,
      {
        expectedVersion: base.location.version,
        organizationId: base.organization.id,
        status: "INACTIVE",
        stockLocationId: base.location.id,
      },
    );
    expect(inactiveLocation).toMatchObject({
      isSellable: false,
      status: "INACTIVE",
    });

    const reactivated = await changeStockLocationStatus(
      repositories.stockLocations,
      {
        expectedVersion: inactiveLocation.version,
        organizationId: base.organization.id,
        status: "ACTIVE",
        stockLocationId: base.location.id,
      },
    );
    expect(reactivated.isSellable).toBe(false);

    await expect(
      updateStockLocationMetadata(repositories.stockLocations, {
        expectedVersion: reactivated.version,
        isSellable: true,
        organizationId: base.organization.id,
        stockLocationId: base.location.id,
        type: "QC_HOLD",
      }),
    ).rejects.toThrow("cannot be sellable");

    await expectDbReject(
      prisma.stockLocation.create({
        data: {
          branchId: base.branch.id,
          code: "BAD-QC",
          isSellable: true,
          name: "Bad QC",
          organizationId: base.organization.id,
          type: "QC_HOLD",
        },
      }),
    );
    await expectDbReject(
      prisma.stockLocation.create({
        data: {
          branchId: base.branch.id,
          code: "BAD-INACTIVE",
          isSellable: true,
          name: "Bad Inactive",
          organizationId: base.organization.id,
          status: "INACTIVE",
          type: "SHOWROOM",
        },
      }),
    );
  });

  it("rejects cross-organization lifecycle updates and keeps restrictive deletion intact", async () => {
    const first = await createOperationalBase(repositories, "A");
    const second = await createOperationalBase(repositories, "B");

    await expect(
      updateBranchMetadata(repositories.branches, {
        branchId: first.branch.id,
        expectedVersion: first.branch.version,
        name: "Wrong Org",
        organizationId: second.organization.id,
      }),
    ).rejects.toThrow("same organization");
    await expect(
      updateStockLocationMetadata(repositories.stockLocations, {
        expectedVersion: first.location.version,
        name: "Wrong Org",
        organizationId: second.organization.id,
        stockLocationId: first.location.id,
      }),
    ).rejects.toThrow("same organization");
    await expect(
      changePosCounterStatus(repositories.posCounters, {
        expectedVersion: first.counter.version,
        organizationId: second.organization.id,
        posCounterId: first.counter.id,
        status: "INACTIVE",
      }),
    ).rejects.toThrow("same organization");

    await expectDbReject(
      prisma.branch.delete({ where: { id: first.branch.id } }),
    );
  });

  it("reads branches by organization, filters, search, archived policy, and cursor pagination", async () => {
    const first = await createOperationalBase(repositories, "A");
    const second = await createOperationalBase(repositories, "B");
    const warehouse = await createBranch(repositories, {
      code: "WAREHOUSE",
      name: "Central Warehouse",
      organizationId: first.organization.id,
      status: "INACTIVE",
      type: "WAREHOUSE",
    });
    const archived = await createBranch(repositories, {
      code: "OLD-SHOP",
      name: "Old Shop",
      organizationId: first.organization.id,
      status: "ARCHIVED",
    });

    await expect(
      getBranchById(repositories.branches, {
        branchId: first.branch.id,
        organizationId: first.organization.id,
      }),
    ).resolves.toMatchObject({
      id: first.branch.id,
      organizationId: first.organization.id,
    });
    await expect(
      getBranchById(repositories.branches, {
        branchId: second.branch.id,
        organizationId: first.organization.id,
      }),
    ).rejects.toThrow("Branch was not found");

    await expect(
      listBranches(repositories.branches, {
        organizationId: first.organization.id,
        status: "INACTIVE",
      }),
    ).resolves.toMatchObject({ items: [{ id: warehouse.id }] });
    await expect(
      listBranches(repositories.branches, {
        organizationId: first.organization.id,
        type: "WAREHOUSE",
      }),
    ).resolves.toMatchObject({ items: [{ id: warehouse.id }] });
    await expect(
      listBranches(repositories.branches, {
        organizationId: first.organization.id,
        search: "central",
      }),
    ).resolves.toMatchObject({ items: [{ code: "WAREHOUSE" }] });
    await expect(
      listBranches(repositories.branches, {
        organizationId: first.organization.id,
        search: "main",
      }),
    ).resolves.toMatchObject({ items: [{ code: "MAIN" }] });

    const defaultBranches = await listBranches(repositories.branches, {
      organizationId: first.organization.id,
    });
    expect(defaultBranches.items.map((branch) => branch.id)).not.toContain(
      archived.id,
    );
    await expect(
      listBranches(repositories.branches, {
        organizationId: first.organization.id,
        status: "ARCHIVED",
      }),
    ).resolves.toMatchObject({ items: [{ id: archived.id }] });

    const firstPage = await listBranches(repositories.branches, {
      organizationId: first.organization.id,
      pageSize: 1,
    });
    expect(firstPage).toMatchObject({ hasMore: true });
    const secondPage = await listBranches(repositories.branches, {
      cursor: firstPage.nextCursor ?? undefined,
      organizationId: first.organization.id,
      pageSize: 10,
    });
    expect([
      ...firstPage.items.map((branch) => branch.id),
      ...secondPage.items.map((branch) => branch.id),
    ]).toEqual(defaultBranches.items.map((branch) => branch.id));
  });

  it("lists stock locations by branch, sellability, search, and organization", async () => {
    const first = await createOperationalBase(repositories, "A");
    const second = await createOperationalBase(repositories, "B");
    const hold = await createStockLocation(repositories, {
      branchId: first.branch.id,
      code: "QC-HOLD",
      name: "Quality Hold",
      organizationId: first.organization.id,
      type: "QC_HOLD",
    });

    const branchLocations = await listStockLocations(
      repositories.stockLocations,
      {
        branchId: first.branch.id,
        organizationId: first.organization.id,
      },
    );
    expect(branchLocations.items.map((location) => location.id)).toEqual(
      expect.arrayContaining([first.location.id, hold.id]),
    );
    await expect(
      listStockLocations(repositories.stockLocations, {
        isSellable: true,
        organizationId: first.organization.id,
      }),
    ).resolves.toMatchObject({ items: [{ id: first.location.id }] });
    await expect(
      listStockLocations(repositories.stockLocations, {
        organizationId: first.organization.id,
        search: "quality",
      }),
    ).resolves.toMatchObject({ items: [{ code: "QC-HOLD" }] });
    await expect(
      listStockLocations(repositories.stockLocations, {
        organizationId: first.organization.id,
        search: first.location.code.toLowerCase(),
      }),
    ).resolves.toMatchObject({ items: [{ id: first.location.id }] });
    const isolated = await listStockLocations(repositories.stockLocations, {
      organizationId: first.organization.id,
      search: second.location.name,
    });
    expect(isolated.items).toHaveLength(0);
  });

  it("lists POS counters by branch, status, search, and organization", async () => {
    const first = await createOperationalBase(repositories, "A");
    const second = await createOperationalBase(repositories, "B");
    const inactive = await createPosCounter(repositories, {
      branchId: first.branch.id,
      code: "BACK",
      name: "Back Counter",
      organizationId: first.organization.id,
      status: "INACTIVE",
    });

    const branchCounters = await listPosCounters(repositories.posCounters, {
      branchId: first.branch.id,
      organizationId: first.organization.id,
    });
    expect(branchCounters.items.map((counter) => counter.id)).toEqual(
      expect.arrayContaining([first.counter.id, inactive.id]),
    );
    await expect(
      listPosCounters(repositories.posCounters, {
        organizationId: first.organization.id,
        status: "INACTIVE",
      }),
    ).resolves.toMatchObject({ items: [{ id: inactive.id }] });
    await expect(
      listPosCounters(repositories.posCounters, {
        organizationId: first.organization.id,
        search: "back",
      }),
    ).resolves.toMatchObject({ items: [{ code: "BACK" }] });
    await expect(
      listPosCounters(repositories.posCounters, {
        organizationId: first.organization.id,
        search: first.counter.code.toLowerCase(),
      }),
    ).resolves.toMatchObject({ items: [{ id: first.counter.id }] });
    const isolated = await listPosCounters(repositories.posCounters, {
      organizationId: first.organization.id,
      search: second.counter.name,
    });
    expect(isolated.items).toHaveLength(0);
  });

  it("keeps deterministic branch ordering for equal timestamps", async () => {
    const organization = await createOrganization(repositories.organizations, {
      code: "ORDER",
      name: "Ordering",
    });
    const branches = await Promise.all(
      ["B-1", "B-2", "B-3"].map((code) =>
        createBranch(repositories, {
          code,
          name: code,
          organizationId: organization.id,
        }),
      ),
    );
    const sameCreatedAt = new Date("2026-07-02T00:00:00.000Z");
    await prisma.branch.updateMany({
      data: { createdAt: sameCreatedAt },
      where: { organizationId: organization.id },
    });

    const orderedIds = branches
      .map((branch) => branch.id)
      .sort((left, right) => left.localeCompare(right));
    const firstPage = await listBranches(repositories.branches, {
      organizationId: organization.id,
      pageSize: 2,
    });
    const secondPage = await listBranches(repositories.branches, {
      cursor: firstPage.nextCursor ?? undefined,
      organizationId: organization.id,
      pageSize: 2,
    });

    expect([
      ...firstPage.items.map((branch) => branch.id),
      ...secondPage.items.map((branch) => branch.id),
    ]).toEqual(orderedIds);
  });
});

async function createOperationalBase(
  repositories: {
    branches: PrismaBranchRepository;
    organizations: PrismaOrganizationRepository;
    posCounters: PrismaPosCounterRepository;
    stockLocations: PrismaStockLocationRepository;
  },
  suffix: string,
) {
  const organization = await createOrganization(repositories.organizations, {
    code: `ORG-${suffix}`,
    name: `Org ${suffix}`,
  });
  const branch = await createBranch(repositories, {
    code: "MAIN",
    name: `Main ${suffix}`,
    organizationId: organization.id,
  });
  const location = await createStockLocation(repositories, {
    branchId: branch.id,
    code: "FLOOR",
    name: `Floor ${suffix}`,
    organizationId: organization.id,
    type: "SHOWROOM",
  });
  const counter = await createPosCounter(repositories, {
    branchId: branch.id,
    code: "COUNTER-1",
    name: `Counter ${suffix}`,
    organizationId: organization.id,
  });

  return { branch, counter, location, organization };
}

async function expectDbReject(operation: Promise<unknown>) {
  await expect(operation).rejects.toThrow();
}
