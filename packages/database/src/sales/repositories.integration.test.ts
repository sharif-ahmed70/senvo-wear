import {
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  NotFoundError,
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  fulfillSalesOrder,
  getAvailableToSell,
  getOnHandBalance,
  getSalesOrderById,
  reserveSalesOrder,
} from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import {
  PrismaInventoryAvailabilityQueryRepository,
  PrismaInventoryBalanceQueryRepository,
} from "../inventory/repositories.js";
import { PrismaSalesOrderRepository } from "./repositories.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
let prisma: ReturnType<typeof createPrismaClient>;
let salesOrders: PrismaSalesOrderRepository;
let balances: PrismaInventoryBalanceQueryRepository;
let availability: PrismaInventoryAvailabilityQueryRepository;

describeWithDatabase("Prisma sales order repositories", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    salesOrders = new PrismaSalesOrderRepository(prisma);
    balances = new PrismaInventoryBalanceQueryRepository(prisma);
    availability = new PrismaInventoryAvailabilityQueryRepository(prisma);
  });

  beforeEach(async () => {
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
    await prisma.stockLocation.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("creates a DRAFT order with immutable catalog snapshots and computed totals", async () => {
    const base = await createSalesBase("CREATE");

    const order = await createSalesOrder(salesOrders, {
      allocationPolicyId: base.policy.id,
      channel: "ONLINE",
      currencyCode: "BDT",
      deliveryMinor: 100,
      idempotencyKey: "order-create",
      lines: [
        {
          discountMinor: 100,
          productVariantId: base.variant.id,
          quantity: 2,
          unitPriceMinor: 1000,
        },
      ],
      orderDiscountMinor: 50,
      orderNumber: "SO-CREATE",
      organizationId: base.organization.id,
    });

    expect(order).toMatchObject({
      status: "DRAFT",
      subtotalMinor: 1900,
      totalMinor: 1950,
      version: 1,
    });
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]).toMatchObject({
      colorSnapshot: "Black",
      productNameSnapshot: "Oxford CREATE",
      skuSnapshot: "SKU-CREATE",
      sizeSnapshot: "L",
    });

    await prisma.product.update({
      data: { name: "Changed Name" },
      where: { id: base.product.id },
    });
    await expect(
      getSalesOrderById(salesOrders, {
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).resolves.toMatchObject({
      lines: [
        expect.objectContaining({ productNameSnapshot: "Oxford CREATE" }),
      ],
    });
  });

  it("enforces order number, idempotency, and organization-scoped variants", async () => {
    const base = await createSalesBase("IDENTITY");
    const other = await createSalesBase("OTHER");

    const input = {
      allocationPolicyId: base.policy.id,
      channel: "ONLINE" as const,
      currencyCode: "BDT",
      idempotencyKey: "order-identity",
      lines: [
        {
          productVariantId: base.variant.id,
          quantity: 1,
          unitPriceMinor: 1000,
        },
      ],
      orderNumber: "SO-IDENTITY",
      organizationId: base.organization.id,
    };
    const order = await createSalesOrder(salesOrders, input);
    await expect(createSalesOrder(salesOrders, input)).resolves.toEqual(order);
    await expect(
      createSalesOrder(salesOrders, {
        ...input,
        lines: [
          {
            productVariantId: base.variant.id,
            quantity: 2,
            unitPriceMinor: 1000,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createSalesOrder(salesOrders, {
        ...input,
        idempotencyKey: "order-identity-2",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createSalesOrder(salesOrders, {
        ...input,
        idempotencyKey: "order-cross-org",
        lines: [
          {
            productVariantId: other.variant.id,
            quantity: 1,
            unitPriceMinor: 1000,
          },
        ],
        orderNumber: "SO-CROSS-ORG",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reserves, confirms, and preserves active reservation quantities", async () => {
    const base = await createSalesBase("RESERVE");
    await seedOnHand(base, 10);
    const order = await createOrder(base, "SO-RESERVE", 3);

    const reserved = await reserveSalesOrder(salesOrders, {
      expectedVersion: order.version,
      organizationId: base.organization.id,
      reservationIdempotencyKey: "reserve-order",
      reservationNumber: "RSV-ORDER",
      salesOrderId: order.id,
    });

    expect(reserved.status).toBe("RESERVED");
    expect(reserved.inventoryReservationId).toEqual(expect.any(String));
    const reservation = await prisma.inventoryReservation.findUniqueOrThrow({
      include: { lines: true },
      where: { id: reserved.inventoryReservationId ?? "" },
    });
    expect(reservation.status).toBe("ACTIVE");
    expect(reservation.lines).toMatchObject([
      { productVariantId: base.variant.id, quantity: 3 },
    ]);

    const confirmed = await confirmSalesOrder(salesOrders, {
      expectedVersion: reserved.version,
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });
    expect(confirmed.status).toBe("CONFIRMED");
    await expect(
      prisma.inventoryReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("cancels draft, reserved, and confirmed orders without creating movements", async () => {
    const draftBase = await createSalesBase("CANCEL-DRAFT");
    const draft = await createOrder(draftBase, "SO-CANCEL-DRAFT", 1);
    await expect(
      cancelSalesOrder(salesOrders, {
        expectedVersion: draft.version,
        organizationId: draftBase.organization.id,
        salesOrderId: draft.id,
      }),
    ).resolves.toMatchObject({ status: "CANCELLED" });

    const reservedBase = await createSalesBase("CANCEL-RSV");
    await seedOnHand(reservedBase, 5);
    const reservedOrder = await createOrder(reservedBase, "SO-CANCEL-RSV", 2);
    const reserved = await reserveSalesOrder(salesOrders, {
      expectedVersion: reservedOrder.version,
      organizationId: reservedBase.organization.id,
      reservationIdempotencyKey: "reserve-cancel-rsv",
      reservationNumber: "RSV-CANCEL-RSV",
      salesOrderId: reservedOrder.id,
    });
    await expect(
      cancelSalesOrder(salesOrders, {
        expectedVersion: reserved.version,
        organizationId: reservedBase.organization.id,
        salesOrderId: reserved.id,
      }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    await expect(
      prisma.inventoryReservation.findUniqueOrThrow({
        where: { id: reserved.inventoryReservationId ?? "" },
      }),
    ).resolves.toMatchObject({ status: "RELEASED" });

    const confirmedBase = await createSalesBase("CANCEL-CONF");
    await seedOnHand(confirmedBase, 5);
    const confirmedOrder = await createOrder(
      confirmedBase,
      "SO-CANCEL-CONF",
      2,
    );
    const reservedConfirmed = await reserveSalesOrder(salesOrders, {
      expectedVersion: confirmedOrder.version,
      organizationId: confirmedBase.organization.id,
      reservationIdempotencyKey: "reserve-cancel-conf",
      reservationNumber: "RSV-CANCEL-CONF",
      salesOrderId: confirmedOrder.id,
    });
    const confirmed = await confirmSalesOrder(salesOrders, {
      expectedVersion: reservedConfirmed.version,
      organizationId: confirmedBase.organization.id,
      salesOrderId: confirmedOrder.id,
    });
    await expect(
      cancelSalesOrder(salesOrders, {
        expectedVersion: confirmed.version,
        organizationId: confirmedBase.organization.id,
        salesOrderId: confirmed.id,
      }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    await expect(prisma.inventoryMovement.count()).resolves.toBe(0);
  });

  it("fulfills confirmed orders through reservation consumption exactly once", async () => {
    const base = await createSalesBase("FULFILL");
    await seedOnHand(base, 10);
    const order = await createOrder(base, "SO-FULFILL", 4);
    const reserved = await reserveSalesOrder(salesOrders, {
      expectedVersion: order.version,
      organizationId: base.organization.id,
      reservationIdempotencyKey: "reserve-fulfill",
      reservationNumber: "RSV-FULFILL",
      salesOrderId: order.id,
    });
    const confirmed = await confirmSalesOrder(salesOrders, {
      expectedVersion: reserved.version,
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });

    const fulfilled = await fulfillSalesOrder(salesOrders, {
      consumptionIdempotencyKey: "consume-fulfill",
      expectedVersion: confirmed.version,
      movementNumber: "MOVE-FULFILL",
      occurredAt: "2026-07-03T01:00:00.000Z",
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });

    expect(fulfilled.status).toBe("FULFILLED");
    expect(fulfilled.fulfillmentMovementId).toEqual(expect.any(String));
    await expect(prisma.inventoryMovement.count()).resolves.toBe(2);
    await expect(
      prisma.inventoryMovement.findUniqueOrThrow({
        where: { id: fulfilled.fulfillmentMovementId ?? "" },
      }),
    ).resolves.toMatchObject({ status: "POSTED", type: "ISSUE" });
    await expect(
      getOnHandBalance(balances, {
        organizationId: base.organization.id,
        productVariantId: base.variant.id,
        stockLocationId: base.location.id,
      }),
    ).resolves.toMatchObject({ quantity: 6 });
    await expect(
      getAvailableToSell(availability, {
        organizationId: base.organization.id,
        productVariantId: base.variant.id,
        stockLocationId: base.location.id,
      }),
    ).resolves.toMatchObject({ availableQuantity: 6, reservedQuantity: 0 });

    await expect(
      fulfillSalesOrder(salesOrders, {
        consumptionIdempotencyKey: "consume-fulfill",
        expectedVersion: confirmed.version,
        movementNumber: "MOVE-FULFILL",
        occurredAt: "2026-07-03T01:00:00.000Z",
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).resolves.toMatchObject({
      fulfillmentMovementId: fulfilled.fulfillmentMovementId,
    });
    await expect(prisma.inventoryMovement.count()).resolves.toBe(2);
  });

  it("rejects stale versions, terminal transitions, and cross-org reads", async () => {
    const base = await createSalesBase("RULES");
    await seedOnHand(base, 3);
    const order = await createOrder(base, "SO-RULES", 1);
    await expect(
      reserveSalesOrder(salesOrders, {
        expectedVersion: 99,
        organizationId: base.organization.id,
        reservationIdempotencyKey: "reserve-stale",
        reservationNumber: "RSV-STALE",
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    const reserved = await reserveSalesOrder(salesOrders, {
      expectedVersion: order.version,
      organizationId: base.organization.id,
      reservationIdempotencyKey: "reserve-rules",
      reservationNumber: "RSV-RULES",
      salesOrderId: order.id,
    });
    await expect(
      fulfillSalesOrder(salesOrders, {
        consumptionIdempotencyKey: "consume-reserved",
        expectedVersion: reserved.version,
        movementNumber: "MOVE-RESERVED",
        occurredAt: "2026-07-03T01:00:00.000Z",
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    const cancelled = await cancelSalesOrder(salesOrders, {
      expectedVersion: reserved.version,
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });
    await expect(
      fulfillSalesOrder(salesOrders, {
        consumptionIdempotencyKey: "consume-cancelled",
        expectedVersion: cancelled.version,
        movementNumber: "MOVE-CANCELLED",
        occurredAt: "2026-07-03T01:00:00.000Z",
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      getSalesOrderById(salesOrders, {
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("enforces unique linkages and restrictive deletion", async () => {
    const base = await createSalesBase("CONSTRAINTS");
    await seedOnHand(base, 8);
    const order = await createOrder(base, "SO-CONSTRAINTS", 2);
    const reserved = await reserveSalesOrder(salesOrders, {
      expectedVersion: order.version,
      organizationId: base.organization.id,
      reservationIdempotencyKey: "reserve-constraints",
      reservationNumber: "RSV-CONSTRAINTS",
      salesOrderId: order.id,
    });

    await expect(
      prisma.salesOrder.create({
        data: {
          channel: "ONLINE",
          currencyCode: "BDT",
          idempotencyKey: "constraint-link",
          inventoryReservationId: reserved.inventoryReservationId,
          orderNumber: "SO-CONSTRAINTS-2",
          organizationId: base.organization.id,
          payloadSignature: "{}",
          reservedAt: new Date(),
          status: "RESERVED",
          subtotalMinor: 1,
          totalMinor: 1,
        },
      }),
    ).rejects.toThrow(/Unique constraint|unique constraint/i);
    await expect(
      prisma.productVariant.delete({ where: { id: base.variant.id } }),
    ).rejects.toThrow(
      /Foreign key constraint|violates foreign key constraint/i,
    );
    await expect(
      prisma.salesOrder.delete({ where: { id: order.id } }),
    ).rejects.toThrow(
      /Foreign key constraint|violates foreign key constraint/i,
    );
  });
});

type SalesBase = Awaited<ReturnType<typeof createSalesBase>>;

async function createSalesBase(label: string) {
  const organization = await prisma.organization.create({
    data: { code: `ORG-${label}`, name: `Org ${label}` },
  });
  const branch = await prisma.branch.create({
    data: {
      code: `BR-${label}`,
      name: `Branch ${label}`,
      organizationId: organization.id,
    },
  });
  const location = await prisma.stockLocation.create({
    data: {
      branchId: branch.id,
      code: `LOC-${label}`,
      isSellable: true,
      name: `Location ${label}`,
      organizationId: organization.id,
      status: "ACTIVE",
      type: "SHOWROOM",
    },
  });
  const category = await prisma.category.create({
    data: {
      name: `Category ${label}`,
      organizationId: organization.id,
      slug: `category-${label.toLowerCase()}`,
    },
  });
  const color = await prisma.color.create({
    data: {
      code: `BLACK-${label}`,
      name: "Black",
      normalizedName: `black-${label.toLowerCase()}`,
      organizationId: organization.id,
    },
  });
  const size = await prisma.size.create({
    data: {
      code: `L-${label}`,
      name: "L",
      organizationId: organization.id,
    },
  });
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: `Oxford ${label}`,
      organizationId: organization.id,
      productCode: `OX-${label}`,
      slug: `oxford-${label.toLowerCase()}`,
      status: "ACTIVE",
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      colorId: color.id,
      organizationId: organization.id,
      productId: product.id,
      sizeId: size.id,
      sku: `SKU-${label}`,
      status: "ACTIVE",
    },
  });
  const policy = await prisma.inventoryAllocationPolicy.create({
    data: {
      code: `POLICY-${label}`,
      name: `Policy ${label}`,
      organizationId: organization.id,
      status: "ACTIVE",
    },
  });
  await prisma.inventoryAllocationPolicyLocation.create({
    data: {
      organizationId: organization.id,
      policyId: policy.id,
      priority: 1,
      stockLocationId: location.id,
    },
  });
  return { branch, location, organization, policy, product, variant };
}

async function createOrder(
  base: SalesBase,
  orderNumber: string,
  quantity: number,
) {
  return createSalesOrder(salesOrders, {
    allocationPolicyId: base.policy.id,
    channel: "ONLINE",
    currencyCode: "BDT",
    idempotencyKey: `idem-${orderNumber.toLowerCase()}`,
    lines: [
      {
        productVariantId: base.variant.id,
        quantity,
        unitPriceMinor: 1000,
      },
    ],
    orderNumber,
    organizationId: base.organization.id,
  });
}

async function seedOnHand(base: SalesBase, quantity: number) {
  const movement = await prisma.inventoryMovement.create({
    data: {
      destinationLocationId: base.location.id,
      idempotencyKey: `seed-${base.organization.code}`,
      movementNumber: `SEED-${base.organization.code}`,
      occurredAt: new Date("2026-07-03T00:00:00.000Z"),
      organizationId: base.organization.id,
      payloadSignature: "{}",
      postedAt: new Date("2026-07-03T00:00:00.000Z"),
      status: "POSTED",
      type: "OPENING",
      version: 2,
    },
  });
  await prisma.inventoryMovementLine.create({
    data: {
      lineNumber: 1,
      movementId: movement.id,
      organizationId: base.organization.id,
      productVariantId: base.variant.id,
      quantity,
    },
  });
}
