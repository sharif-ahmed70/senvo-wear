import {
  recordStockIntake,
  type RecordStockIntakeDependencies,
  type RecordStockIntakeInput,
  type TransactionContext,
} from "@senvo/domain";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import { PrismaTransactionManager } from "../transaction/prisma-transaction-manager.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

type TestApplicationContext = {
  organizationId: string;
  requestId: string;
  userId: string | null;
};

class ForcedFailure extends Error {}

describeWithDatabase("Stock intake transaction integration", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let transactionManager: PrismaTransactionManager<TestApplicationContext>;
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    transactionManager = new PrismaTransactionManager(prisma);
  });

  afterEach(async () => {
    for (const organizationId of organizationIds.splice(0)) {
      await deleteOrganizationData(organizationId);
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("commits catalog, stock, cost, supplier ledger and audit together and replays by key", async () => {
    const base = await createBase("COMMIT");
    const input = intakeInput(base);

    const first = await runIntake(base.context, input);
    const replay = await runIntake(base.context, input);

    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ replayed: true, result: first.result });
    const variantIds = first.result.variants.map((variant) => variant.id);
    await expect(
      prisma.inventoryMovementLine.aggregate({
        _sum: { quantity: true },
        where: { productVariantId: { in: variantIds } },
      }),
    ).resolves.toMatchObject({ _sum: { quantity: 15 } });
    await expect(
      prisma.variantBarcode.count({
        where: { productVariantId: { in: variantIds }, status: "ACTIVE" },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.supplierLedgerEntry.findMany({
        select: { amountMinor: true, entryType: true },
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { amountMinor: 751_500n, entryType: "BILL" },
        { amountMinor: 1_500n, entryType: "ADJUSTMENT" },
      ]) as unknown,
    );
    // Transport stays in inventory cost but is not owed to the supplier.
    expect(first.result.dueMinor).toBe("750000");
    await expect(
      prisma.supplierLedgerEntry.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.auditEntry.count({
        where: {
          action: "STOCK_INTAKE_RECORDED",
          organizationId: base.organization.id,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.purchase.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(1);
  });

  it("rolls back every write when a later step fails after variants are created", async () => {
    const base = await createBase("ROLLBACK");
    let variantsCreatedInTransaction = 0;

    await expect(
      transactionManager.execute(base.context, async (transaction) => {
        const dependencies = transactionDependencies(transaction);
        return recordStockIntake(
          {
            ...dependencies,
            purchases: {
              ...dependencies.purchases,
              // Purchase creation runs after categories, product, variants and
              // barcodes exist inside the transaction.
              create: async () => {
                const [product] =
                  await (transaction.catalogProductRepository?.list({
                    organizationId: base.organization.id,
                  }) ?? Promise.resolve([]));
                variantsCreatedInTransaction = (
                  await dependencies.productVariants.listByProduct(
                    base.organization.id,
                    product?.id ?? "",
                  )
                ).length;
                throw new ForcedFailure("forced failure after variants");
              },
            },
          },
          intakeInput(base),
        );
      }),
    ).rejects.toBeInstanceOf(ForcedFailure);

    expect(variantsCreatedInTransaction).toBe(2);
    const where = { organizationId: base.organization.id };
    const counts = await Promise.all([
      prisma.product.count({ where }),
      prisma.productVariant.count({ where }),
      prisma.variantBarcode.count({ where }),
      prisma.category.count({ where }),
      prisma.color.count({ where }),
      prisma.size.count({ where }),
      prisma.supplier.count({ where }),
      prisma.purchase.count({ where }),
      prisma.inventoryMovement.count({ where }),
      prisma.inventoryCostEntry.count({ where }),
      prisma.variantCostState.count({ where }),
      prisma.supplierLedgerEntry.count({ where }),
      prisma.supplierPayment.count({ where }),
      prisma.auditEntry.count({ where }),
    ]);
    expect(counts).toEqual(counts.map(() => 0));
  });

  function runIntake(
    context: TestApplicationContext,
    input: RecordStockIntakeInput,
  ) {
    return transactionManager.execute(context, (transaction) =>
      recordStockIntake(transactionDependencies(transaction), input),
    );
  }

  function transactionDependencies(
    transaction: TransactionContext<TestApplicationContext>,
  ): RecordStockIntakeDependencies {
    const required = <T>(value: T | undefined, name: string): T => {
      if (!value) throw new Error(`${name} is missing from the transaction.`);
      return value;
    };
    return {
      auditWriter: transaction.auditWriter,
      barcodes: required(transaction.barcodeRepository, "barcodes"),
      categories: required(transaction.categoryRepository, "categories"),
      colors: required(transaction.colorRepository, "colors"),
      costs: required(transaction.costRepository, "costs"),
      inventoryMovements: transaction.inventoryMovementRepository,
      organizations: required(
        transaction.organizationRepository,
        "organizations",
      ),
      products: required(transaction.catalogProductRepository, "products"),
      productVariants: required(
        transaction.productVariantRepository,
        "productVariants",
      ),
      purchases: required(transaction.purchaseRepository, "purchases"),
      sizes: required(transaction.sizeRepository, "sizes"),
      stockIntakes: required(transaction.stockIntakeRepository, "stockIntakes"),
      supplierLedger: required(
        transaction.supplierLedgerRepository,
        "supplierLedger",
      ),
      supplierPayments: required(
        transaction.supplierPaymentRepository,
        "supplierPayments",
      ),
      suppliers: required(transaction.supplierRepository, "suppliers"),
    };
  }

  function intakeInput(
    base: Awaited<ReturnType<typeof createBase>>,
  ): RecordStockIntakeInput {
    return {
      actorUserId: base.context.userId,
      idempotencyKey: `intake-${base.suffix.toLowerCase()}`,
      lines: [
        {
          colorName: "Black",
          quantity: 10,
          sellingPriceMinor: 90_000,
          sizeName: "M",
          unitCostMinor: 50_000,
        },
        {
          colorName: "Black",
          quantity: 5,
          sellingPriceMinor: 90_000,
          sizeName: "L",
          unitCostMinor: 50_000,
        },
      ],
      organizationId: base.organization.id,
      product: {
        audienceCategoryName: "Men",
        name: "Classic Crew Tee",
        typeCategoryName: "T-shirt",
      },
      purchase: { destinationLocationId: base.location.id },
      supplier: null,
      transportCostMinor: 1_500,
    };
  }

  async function createBase(suffix: string) {
    const unique = `${suffix}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const organization = await prisma.organization.create({
      data: { code: `ORG-${unique}`, name: `Org ${unique}` },
    });
    organizationIds.push(organization.id);
    const branch = await prisma.branch.create({
      data: {
        code: `BR-${unique}`,
        name: `Branch ${unique}`,
        organizationId: organization.id,
      },
    });
    const location = await prisma.stockLocation.create({
      data: {
        branchId: branch.id,
        code: `LOC-${unique}`,
        isSellable: true,
        name: `Location ${unique}`,
        organizationId: organization.id,
        type: "WAREHOUSE",
      },
    });
    const user = await prisma.user.create({
      data: { email: `${unique.toLowerCase()}@senvo.test` },
    });
    userIds.push(user.id);
    return {
      context: {
        organizationId: organization.id,
        requestId: `req_stock_intake_${unique}`,
        userId: user.id,
      },
      location,
      organization,
      suffix: unique,
    };
  }

  async function deleteOrganizationData(organizationId: string) {
    const where = { organizationId };
    await prisma.auditEntry.deleteMany({ where });
    await prisma.supplierLedgerEntry.deleteMany({ where });
    await prisma.supplierPayment.deleteMany({ where });
    await prisma.inventoryCostEntry.deleteMany({ where });
    await prisma.variantCostState.deleteMany({ where });
    await prisma.purchaseLine.deleteMany({ where });
    await prisma.purchase.deleteMany({ where });
    await prisma.supplier.deleteMany({ where });
    await prisma.inventoryMovementLine.deleteMany({ where });
    await prisma.inventoryMovement.deleteMany({ where });
    await prisma.variantBarcode.deleteMany({ where });
    await prisma.productVariant.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.category.deleteMany({
      where: { ...where, parentId: { not: null } },
    });
    await prisma.category.deleteMany({ where });
    await prisma.color.deleteMany({ where });
    await prisma.size.deleteMany({ where });
    await prisma.stockLocation.deleteMany({ where });
    await prisma.branch.deleteMany({ where });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }
});
