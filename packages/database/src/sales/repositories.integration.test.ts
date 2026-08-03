import {
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  NotFoundError,
  amendDraftSalesOrder,
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  fulfillSalesOrder,
  getAvailableToSell,
  getOnHandBalance,
  getSalesOrderById,
  replaceDraftSalesOrderLines,
  reserveSalesOrder,
  updateDraftSalesOrderMetadata,
} from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import {
  PrismaInventoryAvailabilityQueryRepository,
  PrismaInventoryBalanceQueryRepository,
} from "../inventory/repositories.js";
import { PrismaSalesOrderRepository } from "./repositories.js";
import { PrismaSalesOrderReadRepository } from "./read-repository.js";
import { PrismaSalesSourceRepository } from "./source-repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
let prisma: ReturnType<typeof createPrismaClient>;
let salesOrders: PrismaSalesOrderRepository;
let salesOrderReads: PrismaSalesOrderReadRepository;
let salesSources: PrismaSalesSourceRepository;
let balances: PrismaInventoryBalanceQueryRepository;
let availability: PrismaInventoryAvailabilityQueryRepository;

describeWithDatabase("Prisma sales order repositories", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    salesOrders = new PrismaSalesOrderRepository(prisma);
    salesOrderReads = new PrismaSalesOrderReadRepository(prisma);
    salesSources = new PrismaSalesSourceRepository(prisma);
    balances = new PrismaInventoryBalanceQueryRepository(prisma);
    availability = new PrismaInventoryAvailabilityQueryRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.salesBooth.deleteMany();
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

  it("updates DRAFT customer metadata, clears nullable fields, and recomputes charges", async () => {
    const base = await createSalesBase("AMEND-META");
    const order = await createSalesOrder(salesOrders, {
      allocationPolicyId: base.policy.id,
      channel: "ONLINE",
      currencyCode: "BDT",
      customerEmail: "buyer@senvo.test",
      customerName: "Original Buyer",
      customerPhone: "+8801700000000",
      deliveryAddressLine1: "Old line 1",
      deliveryAddressLine2: "Old line 2",
      deliveryCity: "Dhaka",
      deliveryDistrict: "Dhaka",
      deliveryMinor: 100,
      deliveryPostalCode: "1207",
      idempotencyKey: "order-amend-meta",
      lines: [
        {
          productVariantId: base.variant.id,
          quantity: 2,
          unitPriceMinor: 1000,
        },
      ],
      note: "Original note",
      orderDiscountMinor: 50,
      orderNumber: "SO-AMEND-META",
      organizationId: base.organization.id,
    });

    const amended = await updateDraftSalesOrderMetadata(salesOrders, {
      allocationPolicyId: null,
      customerEmail: null,
      customerName: "Updated Buyer",
      customerPhone: null,
      deliveryAddressLine1: null,
      deliveryAddressLine2: null,
      deliveryCity: "Chattogram",
      deliveryDistrict: null,
      deliveryMinor: 250,
      deliveryPostalCode: null,
      expectedVersion: order.version,
      note: null,
      orderDiscountMinor: 150,
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });

    expect(amended).toMatchObject({
      allocationPolicyId: null,
      customerEmail: null,
      customerName: "Updated Buyer",
      customerPhone: null,
      deliveryAddressLine1: null,
      deliveryAddressLine2: null,
      deliveryCity: "Chattogram",
      deliveryDistrict: null,
      deliveryMinor: 250,
      deliveryPostalCode: null,
      discountMinor: 150,
      note: null,
      subtotalMinor: 2000,
      totalMinor: 2100,
      version: 2,
    });
    expect(amended).toMatchObject({
      channel: order.channel,
      createdAt: order.createdAt,
      currencyCode: order.currencyCode,
      id: order.id,
      idempotencyKey: order.idempotencyKey,
      orderNumber: order.orderNumber,
      organizationId: order.organizationId,
      payloadSignature: order.payloadSignature,
      status: "DRAFT",
    });
    await expect(
      getSalesOrderById(salesOrders, {
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).resolves.toMatchObject({
      totalMinor: 2100,
      version: 2,
    });
  });

  it("replaces draft lines, refreshes catalog snapshots, and removes old lines atomically", async () => {
    const base = await createSalesBase("AMEND-LINES");
    const secondVariant = await createAdditionalVariant(base, "AMEND-LINES-2");
    const order = await createOrder(base, "SO-AMEND-LINES", 1);
    const oldLineIds = order.lines.map((line) => line.id);

    await prisma.product.update({
      data: { name: "Refreshed Oxford" },
      where: { id: base.product.id },
    });
    await prisma.productVariant.update({
      data: { sku: "SKU-AMEND-LINES-REFRESH" },
      where: { id: base.variant.id },
    });

    const amended = await replaceDraftSalesOrderLines(salesOrders, {
      expectedVersion: order.version,
      lines: [
        {
          discountMinor: 100,
          productVariantId: base.variant.id,
          quantity: 2,
          unitPriceMinor: 900,
        },
        {
          productVariantId: secondVariant.id,
          quantity: 3,
          unitPriceMinor: 500,
        },
      ],
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });

    expect(amended).toMatchObject({
      subtotalMinor: 3200,
      totalMinor: 3200,
      version: 2,
    });
    expect(amended.lines).toHaveLength(2);
    expect(amended.lines).toMatchObject([
      {
        lineNumber: 1,
        lineTotalMinor: 1700,
        productNameSnapshot: "Refreshed Oxford",
        skuSnapshot: "SKU-AMEND-LINES-REFRESH",
      },
      {
        lineNumber: 2,
        lineTotalMinor: 1500,
        productNameSnapshot: "Refreshed Oxford",
        skuSnapshot: "SKU-AMEND-LINES-2",
      },
    ]);
    await expect(
      prisma.salesOrderLine.count({ where: { id: { in: oldLineIds } } }),
    ).resolves.toBe(0);
    await expect(
      prisma.salesOrderLine.count({ where: { salesOrderId: order.id } }),
    ).resolves.toBe(2);

    const oneLine = await replaceDraftSalesOrderLines(salesOrders, {
      expectedVersion: amended.version,
      lines: [
        {
          discountMinor: 50,
          productVariantId: secondVariant.id,
          quantity: 1,
          unitPriceMinor: 700,
        },
      ],
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });
    expect(oneLine.lines).toMatchObject([
      {
        lineNumber: 1,
        lineTotalMinor: 650,
        productVariantId: secondVariant.id,
      },
    ]);
    expect(oneLine).toMatchObject({ subtotalMinor: 650, totalMinor: 650 });
  });

  it("combines metadata and line replacement with one version increment", async () => {
    const base = await createSalesBase("AMEND-COMBO");
    const secondVariant = await createAdditionalVariant(base, "AMEND-COMBO-2");
    const order = await createOrder(base, "SO-AMEND-COMBO", 1);

    const amended = await amendDraftSalesOrder(salesOrders, {
      expectedVersion: order.version,
      lines: [
        {
          discountMinor: 25,
          productVariantId: secondVariant.id,
          quantity: 2,
          unitPriceMinor: 800,
        },
      ],
      metadata: {
        allocationPolicyId: base.policy.id,
        customerName: "Combined Buyer",
        deliveryMinor: 100,
        orderDiscountMinor: 50,
      },
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });

    expect(amended).toMatchObject({
      allocationPolicyId: base.policy.id,
      customerName: "Combined Buyer",
      deliveryMinor: 100,
      discountMinor: 50,
      subtotalMinor: 1575,
      totalMinor: 1625,
      version: order.version + 1,
    });
    expect(amended.lines).toHaveLength(1);
    expect(amended.lines[0]).toMatchObject({
      productVariantId: secondVariant.id,
      quantity: 2,
    });
  });

  it("rejects invalid draft amendments without changing persisted lines or totals", async () => {
    const base = await createSalesBase("AMEND-INVALID");
    const other = await createSalesBase("AMEND-OTHER");
    const archived = await createAdditionalVariant(base, "AMEND-ARCHIVED", {
      status: "ARCHIVED",
    });
    const inactivePolicy = await prisma.inventoryAllocationPolicy.create({
      data: {
        code: "POLICY-AMEND-INACTIVE",
        name: "Inactive amendment policy",
        organizationId: base.organization.id,
        status: "INACTIVE",
      },
    });
    const order = await createOrder(base, "SO-AMEND-INVALID", 1);
    const before = await getSalesOrderById(salesOrders, {
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });

    await expect(
      updateDraftSalesOrderMetadata(salesOrders, {
        allocationPolicyId: inactivePolicy.id,
        expectedVersion: order.version,
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      updateDraftSalesOrderMetadata(salesOrders, {
        allocationPolicyId: other.policy.id,
        expectedVersion: order.version,
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      replaceDraftSalesOrderLines(salesOrders, {
        expectedVersion: order.version,
        lines: [
          {
            productVariantId: other.variant.id,
            quantity: 1,
            unitPriceMinor: 1,
          },
        ],
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      replaceDraftSalesOrderLines(salesOrders, {
        expectedVersion: order.version,
        lines: [
          { productVariantId: base.variant.id, quantity: 1, unitPriceMinor: 1 },
          { productVariantId: base.variant.id, quantity: 1, unitPriceMinor: 1 },
        ],
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      replaceDraftSalesOrderLines(salesOrders, {
        expectedVersion: order.version,
        lines: [
          { productVariantId: archived.id, quantity: 1, unitPriceMinor: 1 },
        ],
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      updateDraftSalesOrderMetadata(salesOrders, {
        expectedVersion: order.version,
        orderDiscountMinor: 1001,
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    const after = await getSalesOrderById(salesOrders, {
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });
    expect(after).toEqual(before);
  });

  it("rejects stale and cross-organization draft amendments", async () => {
    const base = await createSalesBase("AMEND-SCOPE");
    const other = await createSalesBase("AMEND-SCOPE-OTHER");
    const order = await createOrder(base, "SO-AMEND-SCOPE", 1);
    const amended = await updateDraftSalesOrderMetadata(salesOrders, {
      expectedVersion: order.version,
      note: "First edit",
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });

    await expect(
      updateDraftSalesOrderMetadata(salesOrders, {
        expectedVersion: order.version,
        note: "Stale edit",
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(
      updateDraftSalesOrderMetadata(salesOrders, {
        expectedVersion: amended.version,
        note: "Wrong org",
        organizationId: other.organization.id,
        salesOrderId: order.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects amendments after DRAFT lifecycle", async () => {
    const reservedBase = await createSalesBase("AMEND-RSV");
    await seedOnHand(reservedBase, 5);
    const reservedOrder = await createOrder(reservedBase, "SO-AMEND-RSV", 1);
    const reserved = await reserveSalesOrder(salesOrders, {
      expectedVersion: reservedOrder.version,
      organizationId: reservedBase.organization.id,
      reservationIdempotencyKey: "reserve-amend-rsv",
      reservationNumber: "RSV-AMEND-RSV",
      salesOrderId: reservedOrder.id,
    });
    await expect(
      updateDraftSalesOrderMetadata(salesOrders, {
        expectedVersion: reserved.version,
        note: "Nope",
        organizationId: reservedBase.organization.id,
        salesOrderId: reserved.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    const confirmedBase = await createSalesBase("AMEND-CONF");
    await seedOnHand(confirmedBase, 5);
    const confirmedOrder = await createOrder(confirmedBase, "SO-AMEND-CONF", 1);
    const reservedConfirmed = await reserveSalesOrder(salesOrders, {
      expectedVersion: confirmedOrder.version,
      organizationId: confirmedBase.organization.id,
      reservationIdempotencyKey: "reserve-amend-conf",
      reservationNumber: "RSV-AMEND-CONF",
      salesOrderId: confirmedOrder.id,
    });
    const confirmed = await confirmSalesOrder(salesOrders, {
      expectedVersion: reservedConfirmed.version,
      organizationId: confirmedBase.organization.id,
      salesOrderId: confirmedOrder.id,
    });
    await expect(
      updateDraftSalesOrderMetadata(salesOrders, {
        expectedVersion: confirmed.version,
        note: "Nope",
        organizationId: confirmedBase.organization.id,
        salesOrderId: confirmed.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    const cancelledBase = await createSalesBase("AMEND-CANCEL");
    const cancelledOrder = await createOrder(
      cancelledBase,
      "SO-AMEND-CANCEL",
      1,
    );
    const cancelled = await cancelSalesOrder(salesOrders, {
      expectedVersion: cancelledOrder.version,
      organizationId: cancelledBase.organization.id,
      salesOrderId: cancelledOrder.id,
    });
    await expect(
      updateDraftSalesOrderMetadata(salesOrders, {
        expectedVersion: cancelled.version,
        note: "Nope",
        organizationId: cancelledBase.organization.id,
        salesOrderId: cancelled.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    const fulfilledBase = await createSalesBase("AMEND-FULFILLED");
    await seedOnHand(fulfilledBase, 5);
    const fulfilledOrder = await createOrder(
      fulfilledBase,
      "SO-AMEND-FULFILLED",
      1,
    );
    const reservedFulfilled = await reserveSalesOrder(salesOrders, {
      expectedVersion: fulfilledOrder.version,
      organizationId: fulfilledBase.organization.id,
      reservationIdempotencyKey: "reserve-amend-fulfilled",
      reservationNumber: "RSV-AMEND-FULFILLED",
      salesOrderId: fulfilledOrder.id,
    });
    const confirmedFulfilled = await confirmSalesOrder(salesOrders, {
      expectedVersion: reservedFulfilled.version,
      organizationId: fulfilledBase.organization.id,
      salesOrderId: fulfilledOrder.id,
    });
    const fulfilled = await fulfillSalesOrder(salesOrders, {
      consumptionIdempotencyKey: "consume-amend-fulfilled",
      expectedVersion: confirmedFulfilled.version,
      movementNumber: "MOVE-AMEND-FULFILLED",
      occurredAt: "2026-07-03T01:00:00.000Z",
      organizationId: fulfilledBase.organization.id,
      salesOrderId: fulfilledOrder.id,
    });
    await expect(
      updateDraftSalesOrderMetadata(salesOrders, {
        expectedVersion: fulfilled.version,
        note: "Nope",
        organizationId: fulfilledBase.organization.id,
        salesOrderId: fulfilled.id,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("allows only one concurrent amendment for the same expected version", async () => {
    const base = await createSalesBase("AMEND-CONCURRENT");
    const secondVariant = await createAdditionalVariant(
      base,
      "AMEND-CONCURRENT-2",
    );
    const order = await createOrder(base, "SO-AMEND-CONCURRENT", 1);

    const results = await Promise.allSettled([
      amendDraftSalesOrder(salesOrders, {
        expectedVersion: order.version,
        lines: [
          {
            productVariantId: base.variant.id,
            quantity: 2,
            unitPriceMinor: 600,
          },
        ],
        metadata: { note: "First concurrent amendment" },
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
      amendDraftSalesOrder(salesOrders, {
        expectedVersion: order.version,
        lines: [
          {
            productVariantId: secondVariant.id,
            quantity: 3,
            unitPriceMinor: 700,
          },
        ],
        metadata: { note: "Second concurrent amendment" },
        organizationId: base.organization.id,
        salesOrderId: order.id,
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected?.reason).toBeInstanceOf(ConcurrencyError);
    const final = await getSalesOrderById(salesOrders, {
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });
    expect(final.version).toBe(2);
    expect(final.lines).toHaveLength(1);
    expect([
      {
        note: "First concurrent amendment",
        productVariantId: base.variant.id,
        quantity: 2,
        totalMinor: 1200,
      },
      {
        note: "Second concurrent amendment",
        productVariantId: secondVariant.id,
        quantity: 3,
        totalMinor: 2100,
      },
    ]).toContainEqual({
      note: final.note,
      productVariantId: final.lines[0]?.productVariantId,
      quantity: final.lines[0]?.quantity,
      totalMinor: final.totalMinor,
    });
  });

  it("reserves, confirms, and fulfills an amended order with amended quantities", async () => {
    const base = await createSalesBase("AMEND-FLOW");
    const secondVariant = await createAdditionalVariant(base, "AMEND-FLOW-2");
    await seedOnHand(base, 5);
    await seedOnHand({ ...base, variant: secondVariant }, 7);
    const order = await createOrder(base, "SO-AMEND-FLOW", 1);
    const amended = await replaceDraftSalesOrderLines(salesOrders, {
      expectedVersion: order.version,
      lines: [
        {
          productVariantId: secondVariant.id,
          quantity: 4,
          unitPriceMinor: 500,
        },
      ],
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });

    const reserved = await reserveSalesOrder(salesOrders, {
      expectedVersion: amended.version,
      organizationId: base.organization.id,
      reservationIdempotencyKey: "reserve-amend-flow",
      reservationNumber: "RSV-AMEND-FLOW",
      salesOrderId: order.id,
    });
    expect(reserved.status).toBe("RESERVED");
    await expect(
      prisma.inventoryReservationLine.findFirstOrThrow({
        where: { reservationId: reserved.inventoryReservationId ?? "" },
      }),
    ).resolves.toMatchObject({
      productVariantId: secondVariant.id,
      quantity: 4,
    });

    const confirmed = await confirmSalesOrder(salesOrders, {
      expectedVersion: reserved.version,
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });
    const fulfilled = await fulfillSalesOrder(salesOrders, {
      consumptionIdempotencyKey: "consume-amend-flow",
      expectedVersion: confirmed.version,
      movementNumber: "MOVE-AMEND-FLOW",
      occurredAt: "2026-07-03T01:00:00.000Z",
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });
    expect(fulfilled.status).toBe("FULFILLED");
    await expect(
      prisma.inventoryMovementLine.findFirstOrThrow({
        where: { movementId: fulfilled.fulfillmentMovementId ?? "" },
      }),
    ).resolves.toMatchObject({
      productVariantId: secondVariant.id,
      quantity: 4,
    });
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
    await expect(
      prisma.inventoryMovement.count({ where: { type: "ISSUE" } }),
    ).resolves.toBe(0);
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

  it("projects organization-scoped order visibility and inventory linkage", async () => {
    const base = await createSalesBase("ADMIN-READ");
    const other = await createSalesBase("ADMIN-READ-OTHER");
    await seedOnHand(base, 5);
    const order = await createOrder(base, "SO-ADMIN-READ", 2);
    await createOrder(other, "SO-OTHER-READ", 1);

    const firstPage = await salesOrderReads.list({
      order: "NEWEST",
      organizationId: base.organization.id,
      pageSize: 1,
      search: "admin-read",
    });
    expect(firstPage).toMatchObject({
      hasMore: false,
      items: [
        {
          customer: { email: null, name: null, phone: null },
          id: order.id,
          orderNumber: "SO-ADMIN-READ",
          status: "DRAFT",
          totalMinor: 2000,
        },
      ],
      nextCursor: null,
    });
    await expect(
      salesOrderReads.getDetails({
        organizationId: other.organization.id,
        salesOrderId: order.id,
      }),
    ).resolves.toBeNull();

    const reserved = await reserveSalesOrder(salesOrders, {
      expectedVersion: order.version,
      organizationId: base.organization.id,
      reservationIdempotencyKey: "reserve-admin-read",
      reservationNumber: "RSV-ADMIN-READ",
      salesOrderId: order.id,
    });
    const reservedDetails = await salesOrderReads.getDetails({
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });
    expect(reservedDetails?.inventory.reservation).toMatchObject({
      reservationNumber: "RSV-ADMIN-READ",
      status: "ACTIVE",
      stockLocation: { id: base.location.id },
    });

    const confirmed = await confirmSalesOrder(salesOrders, {
      expectedVersion: reserved.version,
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });
    const fulfilled = await fulfillSalesOrder(salesOrders, {
      consumptionIdempotencyKey: "consume-admin-read",
      expectedVersion: confirmed.version,
      movementNumber: "MOVE-ADMIN-READ",
      occurredAt: "2026-07-03T01:00:00.000Z",
      organizationId: base.organization.id,
      salesOrderId: order.id,
    });
    const fulfilledDetails = await salesOrderReads.getDetails({
      organizationId: base.organization.id,
      salesOrderId: fulfilled.id,
    });
    expect(fulfilledDetails).toMatchObject({
      inventory: {
        fulfillment: {
          movement: {
            movementNumber: "MOVE-ADMIN-READ",
            status: "POSTED",
            type: "ISSUE",
          },
          status: "FULFILLED",
        },
        reservation: { status: "CONFIRMED" },
      },
      status: "FULFILLED",
    });
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
  it("preserves organization-scoped booth history and status changes", async () => {
    const first = await createSalesBase("BOOTH-A");
    const second = await createSalesBase("BOOTH-B");
    const firstUser = await createBoothStaff(
      first.organization.id,
      "staff-a@senvo.test",
    );
    const secondUser = await createBoothStaff(
      second.organization.id,
      "staff-b@senvo.test",
    );
    const booth = await salesSources.createBooth({
      endDate: new Date("2026-08-10"),
      location: "UIU",
      name: "UIU Spring Fest 2026",
      organizationId: first.organization.id,
      responsibleStaffId: firstUser.id,
      startDate: new Date("2026-08-08"),
    });
    await salesSources.createBooth({
      endDate: new Date("2026-09-03"),
      location: "Trade Fair",
      name: "Dhaka Trade Fair",
      organizationId: second.organization.id,
      responsibleStaffId: secondUser.id,
      startDate: new Date("2026-09-01"),
    });
    expect(await salesSources.listBooths(first.organization.id)).toHaveLength(
      1,
    );
    const inactive = await salesSources.updateBoothStatus({
      expectedVersion: booth.version,
      id: booth.id,
      organizationId: first.organization.id,
      status: "INACTIVE",
    });
    expect(inactive).toMatchObject({ status: "INACTIVE", version: 2 });
    expect(
      (await salesSources.listBooths(first.organization.id))[0],
    ).toMatchObject({ id: booth.id, status: "INACTIVE" });
  });

  it("tracks event booth orders and rejects cross-organization or mismatched sources", async () => {
    const first = await createSalesBase("SOURCE-A");
    const second = await createSalesBase("SOURCE-B");
    const staff = await createBoothStaff(
      first.organization.id,
      "source-a@senvo.test",
    );
    const booth = await salesSources.createBooth({
      endDate: new Date("2026-08-10"),
      location: "University",
      name: "University Booth",
      organizationId: first.organization.id,
      responsibleStaffId: staff.id,
      startDate: new Date("2026-08-08"),
    });
    const order = await createSalesOrder(salesOrders, {
      boothId: booth.id,
      channel: "EVENT_BOOTH",
      currencyCode: "BDT",
      idempotencyKey: "event-source",
      lines: [
        {
          productVariantId: first.variant.id,
          quantity: 1,
          unitPriceMinor: 1000,
        },
      ],
      orderNumber: "SO-EVENT",
      organizationId: first.organization.id,
    });
    expect(order).toMatchObject({ boothId: booth.id, channel: "EVENT_BOOTH" });
    const summary = await salesSources.getSummary(first.organization.id);
    expect(
      summary.channels.find((item) => item.salesChannel === "EVENT_BOOTH"),
    ).toMatchObject({ orderCount: 1, totalMinor: 1000 });
    expect(summary.booths[0]).toMatchObject({
      orderCount: 1,
      totalMinor: 1000,
    });
    await expect(
      prisma.salesOrder.create({
        data: {
          boothId: booth.id,
          channel: "EVENT_BOOTH",
          currencyCode: "BDT",
          idempotencyKey: "cross-org",
          orderNumber: "SO-CROSS",
          organizationId: second.organization.id,
          payloadSignature: "{}",
          subtotalMinor: 0,
          totalMinor: 0,
        },
      }),
    ).rejects.toThrow(
      /Foreign key constraint|violates foreign key constraint/i,
    );
    await expect(
      prisma.salesOrder.create({
        data: {
          boothId: booth.id,
          channel: "ONLINE",
          currencyCode: "BDT",
          idempotencyKey: "bad-source",
          orderNumber: "SO-BAD",
          organizationId: first.organization.id,
          payloadSignature: "{}",
          subtotalMinor: 0,
          totalMinor: 0,
        },
      }),
    ).rejects.toThrow(/constraint/i);
  });
});

type SalesBase = Awaited<ReturnType<typeof createSalesBase>>;

async function createBoothStaff(organizationId: string, email: string) {
  const user = await prisma.user.create({
    data: { email, name: "Booth Staff" },
  });
  await prisma.organizationMembership.create({
    data: { organizationId, role: "STAFF", userId: user.id },
  });
  return user;
}

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

async function createAdditionalVariant(
  base: SalesBase,
  label: string,
  options: { status?: "ACTIVE" | "INACTIVE" | "ARCHIVED" } = {},
) {
  const color = await prisma.color.create({
    data: {
      code: `COLOR-${label}`,
      name: `Color ${label}`,
      normalizedName: `color-${label.toLowerCase()}`,
      organizationId: base.organization.id,
    },
  });
  const size = await prisma.size.create({
    data: {
      code: `SIZE-${label}`,
      name: `Size ${label}`,
      organizationId: base.organization.id,
    },
  });
  return prisma.productVariant.create({
    data: {
      colorId: color.id,
      organizationId: base.organization.id,
      productId: base.product.id,
      sizeId: size.id,
      sku: `SKU-${label}`,
      status: options.status ?? "ACTIVE",
    },
  });
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
      idempotencyKey: `seed-${base.organization.code}-${base.variant.sku}`,
      movementNumber: `SEED-${base.organization.code}-${base.variant.sku}`,
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
