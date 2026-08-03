import { ConflictError, addPosCartItem, openSalesSession } from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import {
  PrismaOrganizationMembershipRepository,
  PrismaUserRepository,
} from "../identity/repositories.js";
import { PrismaPosRepository } from "./repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
let prisma: ReturnType<typeof createPrismaClient>;
let repository: PrismaPosRepository;

describeWithDatabase("Prisma offline POS repository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    repository = new PrismaPosRepository(prisma);
  });
  beforeEach(cleanDatabase);
  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("preserves organization isolation and unique counter codes", async () => {
    const first = await seedOrganization("POS-A");
    const second = await seedOrganization("POS-B");
    const counter = await repository.createCounter({
      boothId: null,
      branchId: first.branch.id,
      code: "MAIN-01",
      name: "Main counter",
      organizationId: first.organization.id,
      status: "ACTIVE",
      type: "STORE",
    });
    await expect(
      repository.createCounter({
        boothId: null,
        branchId: first.branch.id,
        code: "MAIN-01",
        name: "Duplicate",
        organizationId: first.organization.id,
        status: "ACTIVE",
        type: "STORE",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      repository.findCounterById(counter.id, second.organization.id),
    ).resolves.toBeNull();
  });

  it("creates one cart with the session and enforces one open session per counter", async () => {
    const base = await seedOrganization("SESSION");
    const input = {
      counterId: base.counter.id,
      openedAt: new Date("2026-08-03T09:00:00.000Z"),
      organizationId: base.organization.id,
      userId: base.user.id,
    };
    const users = new PrismaUserRepository(prisma);
    const memberships = new PrismaOrganizationMembershipRepository(prisma);
    const opened = await openSalesSession(
      { memberships, pos: repository, users },
      input,
    );
    expect(opened.cartId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(opened.status).toBe("OPEN");
    await expect(
      repository.openSession({
        counterId: base.counter.id,
        openedAt: new Date(),
        openedByUserId: base.user.id,
        organizationId: base.organization.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      await prisma.posCart.count({ where: { salesSessionId: opened.id } }),
    ).toBe(1);
  });

  it("stores server-derived cart prices and keeps closed session history", async () => {
    const base = await seedOrganization("CART");
    const variant = await seedVariant(base.organization.id);
    const opened = await repository.openSession({
      counterId: base.counter.id,
      openedAt: new Date("2026-08-03T09:00:00.000Z"),
      openedByUserId: base.user.id,
      organizationId: base.organization.id,
    });
    const line = await addPosCartItem(
      {
        inventory: {
          getVariantAvailability: () =>
            Promise.resolve({ locations: [{ availableToSell: 2 }] }),
        } as never,
        pos: repository,
      },
      {
        cartId: opened.cartId,
        organizationId: base.organization.id,
        productVariantId: variant.id,
        quantity: 2,
      },
    );
    expect(line).toMatchObject({
      lineSubtotalMinor: 5000,
      unitPriceMinor: 2500,
    });
    const closed = await repository.closeSession({
      closedAt: new Date("2026-08-03T10:00:00.000Z"),
      expectedVersion: 1,
      id: opened.id,
      organizationId: base.organization.id,
    });
    expect(closed).toMatchObject({ status: "CLOSED" });
    expect(await repository.listSessions(base.organization.id)).toHaveLength(1);
    await expect(
      prisma.salesCounter.delete({ where: { id: base.counter.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});

async function seedOrganization(label: string) {
  const organization = await prisma.organization.create({
    data: { code: label, name: `Organization ${label}` },
  });
  const user = await prisma.user.create({
    data: { email: `${label.toLowerCase()}@test.dev`, name: `Staff ${label}` },
  });
  await prisma.organizationMembership.create({
    data: { organizationId: organization.id, role: "STAFF", userId: user.id },
  });
  const branch = await prisma.branch.create({
    data: { code: "MAIN", name: "Main Store", organizationId: organization.id },
  });
  const counter = await repository.createCounter({
    boothId: null,
    branchId: branch.id,
    code: "COUNTER-01",
    name: "Counter 1",
    organizationId: organization.id,
    status: "ACTIVE",
    type: "STORE",
  });
  return { branch, counter, organization, user };
}

async function seedVariant(organizationId: string) {
  const category = await prisma.category.create({
    data: { name: "Shirts", organizationId, slug: "shirts" },
  });
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: "Oxford Shirt",
      organizationId,
      productCode: "OXFORD",
      slug: "oxford",
      status: "ACTIVE",
    },
  });
  const color = await prisma.color.create({
    data: {
      code: "BLACK",
      name: "Black",
      normalizedName: "black",
      organizationId,
    },
  });
  const size = await prisma.size.create({
    data: { code: "L", name: "Large", organizationId },
  });
  return prisma.productVariant.create({
    data: {
      colorId: color.id,
      organizationId,
      productId: product.id,
      sellingPriceMinor: 2500,
      sizeId: size.id,
      sku: "OX-BLK-L",
    },
  });
}

async function cleanDatabase() {
  await prisma.posCartLine.deleteMany();
  await prisma.posCart.deleteMany();
  await prisma.salesSession.deleteMany();
  await prisma.salesCounter.deleteMany();
  await prisma.salesOrderLine.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.salesBooth.deleteMany();
  await prisma.variantBarcode.deleteMany();
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
  await prisma.stockLocation.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.auditEntry.deleteMany();
  await prisma.userCredential.deleteMany();
  await prisma.organizationMembership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.organization.deleteMany();
}
