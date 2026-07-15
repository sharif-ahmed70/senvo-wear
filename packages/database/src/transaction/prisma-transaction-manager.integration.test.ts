import {
  createInventoryMovement,
  createSalesOrder,
  postInventoryMovement,
} from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import { PrismaInventoryMovementRepository } from "../inventory/repositories.js";
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
    await prisma.auditEntry.deleteMany();
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
        status: "ACTIVE",
      },
    });
    return { location, organization, variant };
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
