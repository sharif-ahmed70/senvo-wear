import {
  createInventoryMovement,
  createSalesOrder,
  postInventoryMovement,
  reserveSalesOrder,
} from "@senvo/domain";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import { PrismaInventoryMovementRepository } from "../inventory/repositories.js";
import { PrismaStorefrontRepository } from "../storefront/repository.js";
import { PrismaTransactionManager } from "./prisma-transaction-manager.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

type TestApplicationContext = {
  organizationId: string;
  requestId: string;
  userId: string | null;
};

describeWithDatabase("Prisma transactional audit integration", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let transactionManager: PrismaTransactionManager<TestApplicationContext>;
  let movements: PrismaInventoryMovementRepository;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    transactionManager = new PrismaTransactionManager(prisma);
    movements = new PrismaInventoryMovementRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.salesReceiptPayment.deleteMany();
    await prisma.salesReceiptLine.deleteMany();
    await prisma.salesReceipt.deleteMany();
    await prisma.paymentLine.deleteMany();
    await prisma.paymentBatch.deleteMany();
    await prisma.posCheckoutRecord.deleteMany();
    await prisma.posCartLine.deleteMany();
    await prisma.posCart.deleteMany();
    await prisma.salesSession.deleteMany();
    await prisma.salesCounter.deleteMany();
    await prisma.auditEntry.deleteMany();
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrderCommerceProfile.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.inventoryReservationLine.deleteMany();
    await prisma.inventoryReservation.deleteMany();
    await prisma.inventoryMovementLine.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryAllocationPolicyLocation.deleteMany();
    await prisma.inventoryAllocationPolicy.deleteMany();
    await prisma.catalogMediaLink.deleteMany();
    await prisma.mediaAsset.deleteMany();
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
    await prisma.authenticationSession.deleteMany();
    await prisma.authenticationChallenge.deleteMany();
    await prisma.authenticationRateLimit.deleteMany();
    await prisma.customerAccount.deleteMany();
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

  it("commits a sales order and its actor-scoped audit entry together", async () => {
    const base = await createBase("SUCCESS");
    const user = await createUser("success");
    const context = createContext(base.organization.id, user.id, "success");

    const result = await createAuditedOrder(context, base, "SUCCESS");

    await expect(
      prisma.salesOrder.findUnique({ where: { id: result.orderId } }),
    ).resolves.toMatchObject({ organizationId: base.organization.id });
    await expect(
      prisma.auditEntry.findUnique({ where: { id: result.auditId } }),
    ).resolves.toMatchObject({
      organizationId: context.organizationId,
      resourceId: result.orderId,
      userId: context.userId,
    });
  });

  it("rolls back a sales order when its audit insert fails", async () => {
    const base = await createBase("AUDIT-FAIL");
    const context = createContext(
      base.organization.id,
      "99999999-9999-4999-8999-999999999999",
      "audit-fail",
    );

    await expect(
      createAuditedOrder(context, base, "AUDIT-FAIL"),
    ).rejects.toThrow();

    await expect(
      prisma.salesOrder.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditEntry.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
  });

  it("rejects audit identity that differs from transaction context", async () => {
    const base = await createBase("CONTEXT-MATCH");
    const otherOrganization = await prisma.organization.create({
      data: { code: "ORG-CONTEXT-OTHER", name: "Context Other" },
    });
    const user = await createUser("context-match");
    const context = createContext(
      base.organization.id,
      user.id,
      "context-match",
    );

    await expect(
      transactionManager.execute(context, async (transaction) => {
        const order = await createSalesOrder(
          transaction.salesOrderRepository,
          orderInput(base, "CONTEXT-MATCH", context.organizationId),
        );
        return transaction.auditWriter.recordWithinTransaction({
          action: "SALES_ORDER_CREATED",
          actor: { userId: context.userId },
          organizationId: otherOrganization.id,
          resource: "SALES_ORDER",
          resourceId: order.id,
        });
      }),
    ).rejects.toThrow(
      "Audit actor and organization must match the transaction context.",
    );
    await expect(
      prisma.salesOrder.count({
        where: { organizationId: context.organizationId },
      }),
    ).resolves.toBe(0);
  });

  it("rolls back inventory posting and audit when the operation fails", async () => {
    const base = await createBase("INVENTORY-ROLLBACK");
    const user = await createUser("inventory-rollback");
    const context = createContext(
      base.organization.id,
      user.id,
      "inventory-rollback",
    );
    const draft = await createInventoryMovement(movements, {
      destinationLocationId: base.location.id,
      idempotencyKey: "movement-inventory-rollback",
      lines: [{ productVariantId: base.variant.id, quantity: 5 }],
      movementNumber: "MOVE-INVENTORY-ROLLBACK",
      occurredAt: "2026-07-15T00:00:00.000Z",
      organizationId: base.organization.id,
      type: "OPENING",
    });

    await expect(
      transactionManager.execute(context, async (transaction) => {
        const movement = await postInventoryMovement(
          transaction.inventoryMovementRepository,
          {
            movementId: draft.id,
            organizationId: context.organizationId,
          },
        );
        await transaction.auditWriter.recordWithinTransaction({
          action: "INVENTORY_MOVEMENT_POSTED",
          actor: { userId: context.userId },
          metadata: { requestId: context.requestId },
          organizationId: context.organizationId,
          resource: "INVENTORY_MOVEMENT",
          resourceId: movement.id,
        });
        throw new Error("Force transactional rollback.");
      }),
    ).rejects.toThrow("Force transactional rollback.");

    await expect(
      prisma.inventoryMovement.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({ status: "DRAFT" });
    await expect(
      prisma.auditEntry.count({ where: { resourceId: draft.id } }),
    ).resolves.toBe(0);
  });

  it("keeps concurrent audit history isolated by organization", async () => {
    const [firstBase, secondBase, user] = await Promise.all([
      createBase("CONCURRENT-A"),
      createBase("CONCURRENT-B"),
      createUser("concurrent"),
    ]);
    const firstContext = createContext(
      firstBase.organization.id,
      user.id,
      "concurrent-a",
    );
    const secondContext = createContext(
      secondBase.organization.id,
      user.id,
      "concurrent-b",
    );

    const [first, second] = await Promise.all([
      createAuditedOrder(firstContext, firstBase, "CONCURRENT-A"),
      createAuditedOrder(secondContext, secondBase, "CONCURRENT-B"),
    ]);
    const entries = await prisma.auditEntry.findMany({
      orderBy: { organizationId: "asc" },
      where: { id: { in: [first.auditId, second.auditId] } },
    });

    expect(entries).toHaveLength(2);
    expect(
      entries.map((entry) => [entry.organizationId, entry.resourceId]),
    ).toEqual(
      expect.arrayContaining([
        [firstContext.organizationId, first.orderId],
        [secondContext.organizationId, second.orderId],
      ]),
    );
  });

  it("commits storefront order, reservation, COD profile, and audit atomically", async () => {
    const base = await createBase("STOREFRONT-COMMIT");
    await seedOnHand(base, 2);
    const result = await placeStorefrontOrder(base, "storefront-commit");
    expect(result.status).toBe("RESERVED");
    await expect(
      prisma.salesOrderCommerceProfile.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.inventoryReservation.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEntry.count({
        where: {
          action: "STOREFRONT_ORDER_PLACED",
          organizationId: base.organization.id,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.salesOrder.delete({ where: { id: result.id } }),
    ).rejects.toThrow();
  });

  it("publishes only active tenant catalog with customer-safe availability", async () => {
    const [base, other] = await Promise.all([
      createBase("STOREFRONT-CATALOG"),
      createBase("STOREFRONT-CATALOG-OTHER"),
    ]);
    await seedOnHand(base, 2);
    const storefront = new PrismaStorefrontRepository(prisma);
    const catalog = await storefront.listCatalog({
      organizationId: base.organization.id,
    });
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]).toMatchObject({
      id: base.product.id,
      variants: [
        expect.objectContaining({
          availability: "IN_STOCK",
          sellingPriceMinor: 1000,
        }),
      ],
    });
    expect(
      catalog.products.some((product) => product.id === other.product.id),
    ).toBe(false);
    await expect(
      storefront.listCatalog({
        category: `category-${"STOREFRONT-CATALOG".toLowerCase()}`,
        color: `COLOR-STOREFRONT-CATALOG`,
        organizationId: base.organization.id,
        search: "product-storefront",
        size: `SIZE-STOREFRONT-CATALOG`,
      }),
    ).resolves.toMatchObject({
      products: [expect.objectContaining({ id: base.product.id })],
    });
    await prisma.product.update({
      data: { status: "INACTIVE" },
      where: { id: base.product.id },
    });
    await expect(
      storefront.listCatalog({ organizationId: base.organization.id }),
    ).resolves.toMatchObject({ products: [] });
  });

  it("rolls back every storefront write when checkout fails", async () => {
    const base = await createBase("STOREFRONT-ROLLBACK");
    await seedOnHand(base, 1);
    await expect(
      transactionManager.execute(
        createContext(base.organization.id, null, "storefront-rollback"),
        async (transaction) => {
          const sales = transaction.salesOrderLifecycleRepository;
          const storefront = transaction.storefrontRepository;
          if (!sales || !storefront)
            throw new Error("Missing storefront transaction capabilities.");
          const draft = await createSalesOrder(
            sales,
            storefrontOrderInput(base, "rollback"),
          );
          const reserved = await reserveSalesOrder(sales, {
            expectedVersion: draft.version,
            organizationId: base.organization.id,
            reservationIdempotencyKey: "storefront-reservation:rollback",
            reservationNumber: "WEB-RSV-ROLLBACK",
            salesOrderId: draft.id,
          });
          await storefront.createCommerceProfile({
            id: randomUUID(),
            organizationId: base.organization.id,
            paymentPreference: "CASH_ON_DELIVERY",
            requestSignature: "rollback",
            salesOrderId: reserved.id,
            source: "STOREFRONT",
          });
          throw new Error("Force storefront rollback.");
        },
      ),
    ).rejects.toThrow("Force storefront rollback.");
    await expect(
      prisma.salesOrder.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.inventoryReservation.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.salesOrderCommerceProfile.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
  });

  it("leaves no storefront writes when the reviewed price is stale", async () => {
    const base = await createBase("STOREFRONT-PRICE-CHANGE");
    await seedOnHand(base, 1);
    await expect(
      transactionManager.execute(
        createContext(base.organization.id, null, "storefront-price-change"),
        async (transaction) => {
          const storefront = transaction.storefrontRepository;
          if (!storefront)
            throw new Error("Missing storefront transaction capabilities.");
          const facts = await storefront.loadCheckoutFacts(
            base.organization.id,
            [base.variant.id],
          );
          if (facts.variants[0]?.sellingPriceMinor !== 1) {
            throw new Error("Reviewed storefront price changed.");
          }
        },
      ),
    ).rejects.toThrow("Reviewed storefront price changed.");
    await expect(
      prisma.salesOrder.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.inventoryReservation.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.salesOrderCommerceProfile.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditEntry.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
  });

  it("prevents two concurrent storefront checkouts from overselling", async () => {
    const base = await createBase("STOREFRONT-RACE");
    await seedOnHand(base, 1);
    const attempts = await Promise.allSettled([
      placeStorefrontOrder(base, "race-a"),
      placeStorefrontOrder(base, "race-b"),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);
    await expect(
      prisma.salesOrder.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.inventoryReservation.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.salesOrderCommerceProfile.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEntry.count({
        where: {
          action: "STOREFRONT_ORDER_PLACED",
          organizationId: base.organization.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it("does not satisfy a storefront order from another organization inventory", async () => {
    const [empty, stocked] = await Promise.all([
      createBase("STOREFRONT-EMPTY"),
      createBase("STOREFRONT-OTHER"),
    ]);
    await seedOnHand(stocked, 5);
    await expect(
      placeStorefrontOrder(empty, "tenant-isolation"),
    ).rejects.toThrow();
    await expect(
      prisma.salesOrder.count({
        where: { organizationId: empty.organization.id },
      }),
    ).resolves.toBe(0);
  });

  async function createAuditedOrder(
    context: TestApplicationContext,
    base: Awaited<ReturnType<typeof createBase>>,
    suffix: string,
  ) {
    return transactionManager.execute(context, async (transaction) => {
      const order = await createSalesOrder(
        transaction.salesOrderRepository,
        orderInput(base, suffix, context.organizationId),
      );
      const audit = await transaction.auditWriter.recordWithinTransaction({
        action: "SALES_ORDER_CREATED",
        actor: { userId: context.userId },
        metadata: { requestId: context.requestId },
        organizationId: context.organizationId,
        resource: "SALES_ORDER",
        resourceId: order.id,
      });
      return { auditId: audit.id, orderId: order.id };
    });
  }

  async function placeStorefrontOrder(
    base: Awaited<ReturnType<typeof createBase>>,
    key: string,
  ) {
    const context = createContext(base.organization.id, null, key);
    return transactionManager.execute(context, async (transaction) => {
      const sales = transaction.salesOrderLifecycleRepository;
      const storefront = transaction.storefrontRepository;
      if (!sales || !storefront)
        throw new Error("Missing storefront transaction capabilities.");
      await storefront.lockCheckoutAttempt(base.organization.id, key);
      const draft = await createSalesOrder(
        sales,
        storefrontOrderInput(base, key),
      );
      const reserved = await reserveSalesOrder(sales, {
        expectedVersion: draft.version,
        organizationId: base.organization.id,
        reservationIdempotencyKey: `storefront-reservation:${key}`,
        reservationNumber: `WEB-RSV-${key.toUpperCase()}`,
        salesOrderId: draft.id,
      });
      await storefront.createCommerceProfile({
        id: randomUUID(),
        organizationId: base.organization.id,
        paymentPreference: "CASH_ON_DELIVERY",
        requestSignature: key,
        salesOrderId: reserved.id,
        source: "STOREFRONT",
      });
      await transaction.auditWriter.recordWithinTransaction({
        action: "STOREFRONT_ORDER_PLACED",
        actor: { userId: null },
        metadata: { channel: "ONLINE" },
        organizationId: base.organization.id,
        resource: "SALES_ORDER",
        resourceId: reserved.id,
      });
      return reserved;
    });
  }

  async function createBase(suffix: string) {
    const organization = await prisma.organization.create({
      data: { code: `ORG-${suffix}`, name: `Org ${suffix}` },
    });
    const branch = await prisma.branch.create({
      data: {
        code: `BR-${suffix}`,
        name: `Branch ${suffix}`,
        organizationId: organization.id,
      },
    });
    const location = await prisma.stockLocation.create({
      data: {
        branchId: branch.id,
        code: `LOC-${suffix}`,
        isSellable: true,
        name: `Location ${suffix}`,
        organizationId: organization.id,
        type: "WAREHOUSE",
      },
    });
    const category = await prisma.category.create({
      data: {
        name: `Category ${suffix}`,
        organizationId: organization.id,
        slug: `category-${suffix.toLowerCase()}`,
      },
    });
    const color = await prisma.color.create({
      data: {
        code: `COLOR-${suffix}`,
        name: `Color ${suffix}`,
        normalizedName: `color-${suffix.toLowerCase()}`,
        organizationId: organization.id,
      },
    });
    const size = await prisma.size.create({
      data: {
        code: `SIZE-${suffix}`,
        name: `Size ${suffix}`,
        organizationId: organization.id,
      },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Product ${suffix}`,
        organizationId: organization.id,
        productCode: `PRODUCT-${suffix}`,
        slug: `product-${suffix.toLowerCase()}`,
        status: "ACTIVE",
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        colorId: color.id,
        organizationId: organization.id,
        productId: product.id,
        sizeId: size.id,
        sku: `SKU-${suffix}`,
        sellingPriceMinor: 1000,
        status: "ACTIVE",
      },
    });
    const policy = await prisma.inventoryAllocationPolicy.create({
      data: {
        code: `POLICY-${suffix}`,
        name: `Policy ${suffix}`,
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
    return { location, organization, policy, product, variant };
  }

  async function seedOnHand(
    base: Awaited<ReturnType<typeof createBase>>,
    quantity: number,
  ) {
    const movement = await prisma.inventoryMovement.create({
      data: {
        destinationLocationId: base.location.id,
        idempotencyKey: `seed-${base.organization.code}`,
        movementNumber: `SEED-${base.organization.code}`,
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        organizationId: base.organization.id,
        payloadSignature: "{}",
        postedAt: new Date("2026-08-11T00:00:00.000Z"),
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

  function storefrontOrderInput(
    base: Awaited<ReturnType<typeof createBase>>,
    key: string,
  ) {
    return {
      allocationPolicyId: base.policy.id,
      channel: "ONLINE" as const,
      currencyCode: "BDT",
      customerName: "Guest Customer",
      customerPhone: "+8801712345678",
      deliveryAddressLine1: "House 10",
      deliveryCity: "Dhaka",
      deliveryDistrict: "Dhaka",
      idempotencyKey: `storefront:${key}`,
      lines: [
        {
          productVariantId: base.variant.id,
          quantity: 1,
          unitPriceMinor: 1000,
        },
      ],
      orderNumber: `WEB-${key.toUpperCase()}`,
      organizationId: base.organization.id,
    };
  }

  function createUser(suffix: string) {
    return prisma.user.create({
      data: { email: `${suffix}@senvo.test` },
    });
  }

  function orderInput(
    base: Awaited<ReturnType<typeof createBase>>,
    suffix: string,
    organizationId: string,
  ) {
    return {
      channel: "ONLINE" as const,
      currencyCode: "BDT",
      idempotencyKey: `order-${suffix.toLowerCase()}`,
      lines: [
        {
          productVariantId: base.variant.id,
          quantity: 1,
          unitPriceMinor: 1000,
        },
      ],
      orderNumber: `SO-${suffix}`,
      organizationId,
    };
  }
});

function createContext(
  organizationId: string,
  userId: string | null,
  suffix: string,
): TestApplicationContext {
  return {
    organizationId,
    requestId: `req_transaction_${suffix}`,
    userId,
  };
}
