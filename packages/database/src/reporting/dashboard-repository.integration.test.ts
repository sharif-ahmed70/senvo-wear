import { randomUUID } from "node:crypto";
import { getDashboardSummary } from "@senvo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import { PrismaDashboardReadRepository } from "./dashboard-repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

// 2026-10-02 12:00 in Dhaka.
const now = new Date("2026-10-02T06:00:00.000Z");
const todayDhaka = new Date("2026-10-02T04:00:00.000Z");
const yesterdayDhaka = new Date("2026-10-01T04:00:00.000Z");

describeWithDatabase("dashboard read model (database)", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let repository: PrismaDashboardReadRepository;
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  let shopId = "";
  let otherShopId = "";
  let emptyShopId = "";
  let productId = "";

  const locations = new Map<string, string>();
  const branches = new Map<string, string>();

  async function createShop(label: string) {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const organization = await prisma.organization.create({
      data: { code: `DASH-${label}-${suffix}`, name: `Dashboard ${label}` },
    });
    organizationIds.push(organization.id);
    const branch = await prisma.branch.create({
      data: {
        code: `BR-${suffix}`,
        name: "Main",
        organizationId: organization.id,
      },
    });
    const location = await prisma.stockLocation.create({
      data: {
        branchId: branch.id,
        code: `LOC-${suffix}`,
        isSellable: true,
        name: "Shop floor",
        organizationId: organization.id,
      },
    });
    locations.set(organization.id, location.id);
    branches.set(organization.id, branch.id);
    return { organizationId: organization.id, suffix };
  }

  async function createVariant(organizationId: string, suffix: string) {
    const category = await prisma.category.create({
      data: { name: "Shirts", organizationId, slug: `shirts-${suffix}` },
    });
    const color = await prisma.color.create({
      data: {
        code: `BLK${suffix}`,
        name: "Black",
        normalizedName: "black",
        organizationId,
      },
    });
    const size = await prisma.size.create({
      data: { code: `M${suffix}`, name: "M", organizationId },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Polo ${suffix}`,
        organizationId,
        productCode: `PO-${suffix}`,
        slug: `polo-${suffix.toLowerCase()}`,
        status: "ACTIVE",
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        colorId: color.id,
        organizationId,
        productId: product.id,
        sellingPriceMinor: 100000,
        sizeId: size.id,
        sku: `PO-${suffix}-BLK-M`,
        status: "ACTIVE",
      },
    });
    return { productId: product.id, variantId: variant.id };
  }

  async function createOrder(input: {
    channel: "ONLINE" | "POS";
    confirmedAt: Date | null;
    organizationId: string;
    quantity: number;
    status: "CANCELLED" | "CONFIRMED" | "FULFILLED" | "RESERVED";
    totalMinor: number;
    variantId: string;
  }) {
    const key = randomUUID();
    const locationId = locations.get(input.organizationId) ?? "";
    // Satisfy sales_orders_status_shape_check without touching stock: the
    // reservation has no lines and the fulfilment movement stays DRAFT.
    const reservation = await prisma.inventoryReservation.create({
      data: {
        confirmedAt:
          input.status === "CONFIRMED" || input.status === "FULFILLED"
            ? input.confirmedAt
            : null,
        idempotencyKey: `res-${key}`,
        organizationId: input.organizationId,
        payloadSignature: "test",
        releasedAt: input.status === "CANCELLED" ? now : null,
        reservationNumber: `RES-${key.slice(0, 8)}`,
        status:
          input.status === "RESERVED"
            ? "ACTIVE"
            : input.status === "CANCELLED"
              ? "RELEASED"
              : "CONFIRMED",
        stockLocationId: locationId,
      },
    });
    const movement =
      input.status === "FULFILLED"
        ? await prisma.inventoryMovement.create({
            data: {
              idempotencyKey: `mov-${key}`,
              movementNumber: `MOV-${key.slice(0, 8)}`,
              occurredAt: input.confirmedAt ?? now,
              organizationId: input.organizationId,
              payloadSignature: "test",
              sourceLocationId: locationId,
              status: "DRAFT",
              type: "ISSUE",
            },
          })
        : null;
    const order = await prisma.salesOrder.create({
      data: {
        cancelledAt: input.status === "CANCELLED" ? now : null,
        channel: input.channel,
        confirmedAt: input.confirmedAt,
        fulfilledAt: input.status === "FULFILLED" ? input.confirmedAt : null,
        fulfillmentMovementId: movement?.id ?? null,
        inventoryReservationId: reservation.id,
        reservedAt: input.confirmedAt ?? now,
        currencyCode: "BDT",
        idempotencyKey: key,
        orderNumber: `SO-${key.slice(0, 8)}`,
        organizationId: input.organizationId,
        payloadSignature: "test",
        status: input.status,
        subtotalMinor: input.totalMinor,
        totalMinor: input.totalMinor,
      },
    });
    await prisma.salesOrderLine.create({
      data: {
        lineNumber: 1,
        lineTotalMinor: input.totalMinor,
        organizationId: input.organizationId,
        productNameSnapshot: "Polo",
        productVariantId: input.variantId,
        quantity: input.quantity,
        salesOrderId: order.id,
        skuSnapshot: "SKU",
        unitPriceMinor: Math.round(input.totalMinor / input.quantity),
      },
    });
    return order;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    repository = new PrismaDashboardReadRepository(prisma);

    const shop = await createShop("A");
    shopId = shop.organizationId;
    const { productId: id, variantId } = await createVariant(
      shopId,
      shop.suffix,
    );
    productId = id;

    // Online sale today, an online sale yesterday, a cancelled order and a
    // reserved (pending) order.
    await createOrder({
      channel: "ONLINE",
      confirmedAt: todayDhaka,
      organizationId: shopId,
      quantity: 1,
      status: "CONFIRMED",
      totalMinor: 30000,
      variantId,
    });
    await createOrder({
      channel: "ONLINE",
      confirmedAt: yesterdayDhaka,
      organizationId: shopId,
      quantity: 1,
      status: "FULFILLED",
      totalMinor: 20000,
      variantId,
    });
    await createOrder({
      channel: "ONLINE",
      confirmedAt: todayDhaka,
      organizationId: shopId,
      quantity: 5,
      status: "CANCELLED",
      totalMinor: 999900,
      variantId,
    });
    await createOrder({
      channel: "ONLINE",
      confirmedAt: null,
      organizationId: shopId,
      quantity: 1,
      status: "RESERVED",
      totalMinor: 7000,
      variantId,
    });

    // A POS sale: its sales order plus the checkout record that points at it.
    const user = await prisma.user.create({
      data: {
        email: `cashier.${shop.suffix.toLowerCase()}@dash.test`,
        name: "Cashier",
      },
    });
    userIds.push(user.id);
    await prisma.organizationMembership.create({
      data: {
        organizationId: shopId,
        role: "STAFF",
        status: "ACTIVE",
        userId: user.id,
      },
    });
    const counter = await prisma.salesCounter.create({
      data: {
        branchId: branches.get(shopId) ?? null,
        code: `C-${shop.suffix}`,
        name: "Main counter",
        organizationId: shopId,
        type: "STORE",
      },
    });
    const session = await prisma.salesSession.create({
      data: {
        counterId: counter.id,
        openedByUserId: user.id,
        openingFloatMinor: 50000,
        organizationId: shopId,
        status: "OPEN",
      },
    });
    const cart = await prisma.posCart.create({
      data: { organizationId: shopId, salesSessionId: session.id },
    });
    const posOrder = await createOrder({
      channel: "POS",
      confirmedAt: todayDhaka,
      organizationId: shopId,
      quantity: 2,
      status: "FULFILLED",
      totalMinor: 50000,
      variantId,
    });
    await prisma.posCheckoutRecord.create({
      data: {
        cartId: cart.id,
        completedAt: todayDhaka,
        counterId: counter.id,
        idempotencyKey: randomUUID().slice(0, 32),
        organizationId: shopId,
        salesOrderId: posOrder.id,
        salesSessionId: session.id,
        staffId: user.id,
        subtotalMinor: 50000,
        totalMinor: 50000,
      },
    });

    // Another shop with a big sale today that must never leak.
    const other = await createShop("B");
    otherShopId = other.organizationId;
    const otherVariant = await createVariant(otherShopId, other.suffix);
    await createOrder({
      channel: "ONLINE",
      confirmedAt: todayDhaka,
      organizationId: otherShopId,
      quantity: 9,
      status: "CONFIRMED",
      totalMinor: 7777800,
      variantId: otherVariant.variantId,
    });

    emptyShopId = (await createShop("C")).organizationId;
  });

  afterAll(async () => {
    const where = { organizationId: { in: organizationIds } };
    await prisma.posCheckoutRecord.deleteMany({ where });
    await prisma.posCart.deleteMany({ where });
    await prisma.salesSession.deleteMany({ where });
    await prisma.salesCounter.deleteMany({ where });
    await prisma.salesOrderLine.deleteMany({ where });
    await prisma.salesOrder.deleteMany({ where });
    await prisma.inventoryMovement.deleteMany({ where });
    await prisma.inventoryReservation.deleteMany({ where });
    await prisma.stockLocation.deleteMany({ where });
    await prisma.branch.deleteMany({ where });
    await prisma.productVariant.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.color.deleteMany({ where });
    await prisma.size.deleteMany({ where });
    await prisma.category.deleteMany({ where });
    await prisma.organizationMembership.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("counts confirmed and fulfilled sales once, without cancelled or other shops", async () => {
    const summary = await getDashboardSummary(repository, {
      includeFinancials: true,
      now,
      organizationId: shopId,
    });
    // Today: online 30 000 + POS 50 000 (the POS checkout is not added again).
    expect(summary.financials).toMatchObject({
      refundsTodayMinor: 0,
      todaySaleCount: 2,
      todaySalesMinor: 80000,
      yesterdaySalesMinor: 20000,
    });
    expect(summary.financials?.last7Days.slice(-2)).toEqual([
      { date: "2026-10-01", salesMinor: 20000 },
      { date: "2026-10-02", salesMinor: 80000 },
    ]);
    expect(summary.financials?.channels).toEqual([
      { channel: "POS", previousPeriodMinor: 0, salesMinor: 50000 },
      { channel: "OFFLINE_STORE", previousPeriodMinor: 0, salesMinor: 0 },
      { channel: "ONLINE", previousPeriodMinor: 0, salesMinor: 50000 },
      { channel: "EVENT_BOOTH", previousPeriodMinor: 0, salesMinor: 0 },
      { channel: "MANUAL", previousPeriodMinor: 0, salesMinor: 0 },
    ]);
    expect(summary.financials?.topProducts).toEqual([
      {
        name: expect.stringMatching(/^Polo /u) as unknown,
        productId,
        quantity: 4,
        revenueMinor: 100000,
      },
    ]);
    expect(summary.attention.pendingOrders).toBe(2);
    expect(summary.attention.openSessions).toEqual([
      expect.objectContaining({
        counterName: "Main counter",
        openedByName: "Cashier",
        openingFloatMinor: 50000,
      }) as unknown,
    ]);
    // One active variant with no posted stock: out of stock.
    expect(summary.inventory).toEqual({
      inStock: 0,
      inactive: 0,
      lowStock: 0,
      outOfStock: 1,
      total: 1,
    });
    expect(summary.recentOrders).toHaveLength(5);
    expect(JSON.stringify(summary)).not.toContain("7777800");
  });

  it("zero-fills seven days for a shop with no data", async () => {
    const summary = await getDashboardSummary(repository, {
      includeFinancials: true,
      now,
      organizationId: emptyShopId,
    });
    expect(summary.financials?.last7Days).toEqual(
      [
        "2026-09-26",
        "2026-09-27",
        "2026-09-28",
        "2026-09-29",
        "2026-09-30",
        "2026-10-01",
        "2026-10-02",
      ].map((date) => ({ date, salesMinor: 0 })),
    );
    expect(summary.financials?.topProducts).toEqual([]);
    expect(summary.recentOrders).toEqual([]);
    expect(summary.attention.pendingOrders).toBe(0);
    expect(summary.inventory.total).toBe(0);
  });

  it("does not read financials when they are not allowed", async () => {
    const summary = await getDashboardSummary(repository, {
      includeFinancials: false,
      now,
      organizationId: otherShopId,
    });
    expect(summary.financials).toBeUndefined();
    expect(summary.recentOrders).toHaveLength(1);
  });
});
