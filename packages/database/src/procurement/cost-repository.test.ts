import {
  ConcurrencyError,
  ConflictError,
  type InventoryCostEntry,
  type SaleLineCostSnapshot,
  type VariantCostState,
} from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import {
  type CostPrismaClient,
  PrismaCostRepository,
} from "./cost-repository.js";

class MockPrismaKnownError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = code;
  }
}

describe("PrismaCostRepository", () => {
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";
  const variantId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const costStateId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const entryId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const orderLineId = "oooooooo-oooo-oooo-oooo-oooooooooooo";

  function createMockCostState(
    overrides?: Partial<VariantCostState>,
  ): VariantCostState {
    return {
      averageCostMinor: 45000,
      costUnknownReason: null,
      createdAt: new Date("2026-09-27T00:00:00.000Z"),
      id: costStateId,
      inventoryValueMinor: 9000000n,
      isCostKnown: true,
      lastCostEventAt: new Date("2026-09-27T00:00:00.000Z"),
      organizationId: orgA,
      productVariantId: variantId,
      updatedAt: new Date("2026-09-27T00:00:00.000Z"),
      version: 1,
      ...overrides,
    };
  }

  function createMockPrismaClient(): {
    client: CostPrismaClient;
    inventoryCostEntry: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    queryRaw: ReturnType<typeof vi.fn>;
    saleLineCostSnapshot: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    variantCostState: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  } {
    const variantCostState = {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    };

    const inventoryCostEntry = {
      create: vi.fn(),
      findMany: vi.fn(),
    };

    const saleLineCostSnapshot = {
      create: vi.fn(),
      findUnique: vi.fn(),
    };

    const queryRaw = vi.fn();

    const client = {
      $queryRaw: queryRaw as unknown as CostPrismaClient["$queryRaw"],
      inventoryCostEntry:
        inventoryCostEntry as unknown as CostPrismaClient["inventoryCostEntry"],
      saleLineCostSnapshot:
        saleLineCostSnapshot as unknown as CostPrismaClient["saleLineCostSnapshot"],
      variantCostState:
        variantCostState as unknown as CostPrismaClient["variantCostState"],
    };

    return {
      client,
      inventoryCostEntry,
      queryRaw,
      saleLineCostSnapshot,
      variantCostState,
    };
  }

  describe("getCostState", () => {
    it("returns variant cost state when found with tenant isolation", async () => {
      const mockState = createMockCostState();
      const { client, variantCostState } = createMockPrismaClient();
      variantCostState.findUnique.mockResolvedValue(mockState);

      const repo = new PrismaCostRepository(client);
      const result = await repo.getCostState(orgA, variantId);

      expect(variantCostState.findUnique).toHaveBeenCalledWith({
        where: {
          productVariantId_organizationId: {
            organizationId: orgA,
            productVariantId: variantId,
          },
        },
      });
      expect(result?.id).toBe(costStateId);
      expect(result?.averageCostMinor).toBe(45000);
      expect(result?.inventoryValueMinor).toBe(9000000n);
    });

    it("returns null when no cost state exists for variant/org", async () => {
      const { client, variantCostState } = createMockPrismaClient();
      variantCostState.findUnique.mockResolvedValue(null);

      const repo = new PrismaCostRepository(client);
      const result = await repo.getCostState(orgB, variantId);

      expect(result).toBeNull();
    });
  });

  describe("upsertCostState", () => {
    it("uses standard upsert when expectedVersion is not specified", async () => {
      const mockState = createMockCostState({ version: 2 });
      const { client, variantCostState } = createMockPrismaClient();
      variantCostState.upsert.mockResolvedValue(mockState);

      const repo = new PrismaCostRepository(client);
      const result = await repo.upsertCostState({
        averageCostMinor: 45000,
        inventoryValueMinor: 9000000n,
        isCostKnown: true,
        organizationId: orgA,
        productVariantId: variantId,
      });

      expect(variantCostState.upsert).toHaveBeenCalledWith({
        create: {
          averageCostMinor: 45000,
          costUnknownReason: null,
          inventoryValueMinor: 9000000n,
          isCostKnown: true,
          lastCostEventAt: null,
          organizationId: orgA,
          productVariantId: variantId,
          version: 1,
        },
        update: {
          averageCostMinor: 45000,
          costUnknownReason: null,
          inventoryValueMinor: 9000000n,
          isCostKnown: true,
          lastCostEventAt: null,
          version: { increment: 1 },
        },
        where: {
          productVariantId_organizationId: {
            organizationId: orgA,
            productVariantId: variantId,
          },
        },
      });
      expect(result.version).toBe(2);
    });

    it("creates initial record if not existing when expectedVersion is specified", async () => {
      const mockState = createMockCostState({ version: 1 });
      const { client, variantCostState } = createMockPrismaClient();
      variantCostState.findUnique.mockResolvedValue(null);
      variantCostState.create.mockResolvedValue(mockState);

      const repo = new PrismaCostRepository(client);
      const result = await repo.upsertCostState({
        averageCostMinor: 45000,
        expectedVersion: 1,
        inventoryValueMinor: 9000000n,
        isCostKnown: true,
        organizationId: orgA,
        productVariantId: variantId,
      });

      expect(variantCostState.create).toHaveBeenCalled();
      expect(result.version).toBe(1);
    });

    it("increments version and updates when expectedVersion matches existing", async () => {
      const existingState = createMockCostState({ version: 3 });
      const updatedState = createMockCostState({
        version: 4,
        averageCostMinor: 48000,
      });
      const { client, variantCostState } = createMockPrismaClient();
      variantCostState.findUnique.mockResolvedValue(existingState);
      variantCostState.update.mockResolvedValue(updatedState);

      const repo = new PrismaCostRepository(client);
      const result = await repo.upsertCostState({
        averageCostMinor: 48000,
        expectedVersion: 3,
        inventoryValueMinor: 10000000n,
        isCostKnown: true,
        organizationId: orgA,
        productVariantId: variantId,
      });

      expect(variantCostState.update).toHaveBeenCalledWith({
        data: {
          averageCostMinor: 48000,
          costUnknownReason: null,
          inventoryValueMinor: 10000000n,
          isCostKnown: true,
          lastCostEventAt: null,
          version: 4,
        },
        where: {
          productVariantId_organizationId: {
            organizationId: orgA,
            productVariantId: variantId,
          },
        },
      });
      expect(result.version).toBe(4);
    });

    it("throws ConcurrencyError when expectedVersion does not match existing", async () => {
      const existingState = createMockCostState({ version: 5 });
      const { client, variantCostState } = createMockPrismaClient();
      variantCostState.findUnique.mockResolvedValue(existingState);

      const repo = new PrismaCostRepository(client);
      await expect(
        repo.upsertCostState({
          averageCostMinor: 50000,
          expectedVersion: 4, // stale version
          inventoryValueMinor: 10000000n,
          isCostKnown: true,
          organizationId: orgA,
          productVariantId: variantId,
        }),
      ).rejects.toThrow(ConcurrencyError);
    });
  });

  describe("recordCostEntry", () => {
    it("records immutable inventory cost entry", async () => {
      const mockEntry: InventoryCostEntry = {
        afterAverageCostMinor: 45000,
        afterQuantity: 200,
        afterValueMinor: 9000000n,
        beforeAverageCostMinor: 40000,
        beforeQuantity: 100,
        beforeValueMinor: 4000000n,
        createdAt: new Date("2026-09-27T00:00:00.000Z"),
        eventType: "PURCHASE_RECEIPT",
        id: entryId,
        organizationId: orgA,
        productVariantId: variantId,
        quantityChange: 100,
        reference: "Purchase PO-202609-0001",
        sourceMovementId: null,
        sourcePurchaseId: "po-1",
        valueChangeMinor: 5000000n,
      };

      const { client, inventoryCostEntry } = createMockPrismaClient();
      inventoryCostEntry.create.mockResolvedValue(mockEntry);

      const repo = new PrismaCostRepository(client);
      const result = await repo.recordCostEntry({
        afterAverageCostMinor: 45000,
        afterQuantity: 200,
        afterValueMinor: 9000000n,
        beforeAverageCostMinor: 40000,
        beforeQuantity: 100,
        beforeValueMinor: 4000000n,
        eventType: "PURCHASE_RECEIPT",
        organizationId: orgA,
        productVariantId: variantId,
        quantityChange: 100,
        reference: "Purchase PO-202609-0001",
        sourcePurchaseId: "po-1",
        valueChangeMinor: 5000000n,
      });

      expect(inventoryCostEntry.create).toHaveBeenCalledWith({
        data: {
          afterAverageCostMinor: 45000,
          afterQuantity: 200,
          afterValueMinor: 9000000n,
          beforeAverageCostMinor: 40000,
          beforeQuantity: 100,
          beforeValueMinor: 4000000n,
          eventType: "PURCHASE_RECEIPT",
          organizationId: orgA,
          productVariantId: variantId,
          quantityChange: 100,
          reference: "Purchase PO-202609-0001",
          sourceMovementId: null,
          sourcePurchaseId: "po-1",
          valueChangeMinor: 5000000n,
        },
      });
      expect(result.id).toBe(entryId);
    });

    it("lists cost entries ordered by createdAt desc", async () => {
      const { client, inventoryCostEntry } = createMockPrismaClient();
      inventoryCostEntry.findMany.mockResolvedValue([]);

      const repo = new PrismaCostRepository(client);
      await repo.listCostEntries(orgA, variantId, 20);

      expect(inventoryCostEntry.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: "desc" },
        take: 20,
        where: {
          organizationId: orgA,
          productVariantId: variantId,
        },
      });
    });
  });

  describe("sale line cost snapshot", () => {
    it("creates sale line cost snapshot successfully", async () => {
      const mockSnapshot: SaleLineCostSnapshot = {
        costUnknownReason: null,
        costingMethod: "MOVING_WEIGHTED_AVERAGE",
        createdAt: new Date("2026-09-27T00:00:00.000Z"),
        id: "snapshot-1",
        isCostKnown: true,
        organizationId: orgA,
        productVariantId: variantId,
        quantity: 2,
        salesOrderLineId: orderLineId,
        totalCostMinor: 90000n,
        unitCostMinor: 45000,
      };

      const { client, saleLineCostSnapshot } = createMockPrismaClient();
      saleLineCostSnapshot.create.mockResolvedValue(mockSnapshot);

      const repo = new PrismaCostRepository(client);
      const result = await repo.recordSaleLineCostSnapshot({
        isCostKnown: true,
        organizationId: orgA,
        productVariantId: variantId,
        quantity: 2,
        salesOrderLineId: orderLineId,
        totalCostMinor: 90000n,
        unitCostMinor: 45000,
      });

      expect(saleLineCostSnapshot.create).toHaveBeenCalledWith({
        data: {
          costUnknownReason: null,
          costingMethod: "MOVING_WEIGHTED_AVERAGE",
          isCostKnown: true,
          organizationId: orgA,
          productVariantId: variantId,
          quantity: 2,
          salesOrderLineId: orderLineId,
          totalCostMinor: 90000n,
          unitCostMinor: 45000,
        },
      });
      expect(result.unitCostMinor).toBe(45000);
    });

    it("throws ConflictError if snapshot already exists for sale line", async () => {
      const { client, saleLineCostSnapshot } = createMockPrismaClient();
      saleLineCostSnapshot.create.mockRejectedValue(
        new MockPrismaKnownError("Unique constraint failed", "P2002"),
      );

      const repo = new PrismaCostRepository(client);
      await expect(
        repo.recordSaleLineCostSnapshot({
          isCostKnown: true,
          organizationId: orgA,
          productVariantId: variantId,
          quantity: 2,
          salesOrderLineId: orderLineId,
          totalCostMinor: 90000n,
          unitCostMinor: 45000,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("retrieves snapshot by order line id with organization scoping", async () => {
      const mockSnapshot: SaleLineCostSnapshot = {
        costUnknownReason: null,
        costingMethod: "MOVING_WEIGHTED_AVERAGE",
        createdAt: new Date("2026-09-27T00:00:00.000Z"),
        id: "snapshot-1",
        isCostKnown: true,
        organizationId: orgA,
        productVariantId: variantId,
        quantity: 2,
        salesOrderLineId: orderLineId,
        totalCostMinor: 90000n,
        unitCostMinor: 45000,
      };

      const { client, saleLineCostSnapshot } = createMockPrismaClient();
      saleLineCostSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const repo = new PrismaCostRepository(client);
      const result = await repo.getSaleLineCostSnapshot(orgA, orderLineId);

      expect(saleLineCostSnapshot.findUnique).toHaveBeenCalledWith({
        where: {
          salesOrderLineId_organizationId: {
            organizationId: orgA,
            salesOrderLineId: orderLineId,
          },
        },
      });
      expect(result?.id).toBe("snapshot-1");
    });
  });

  describe("getVariantOnHandQuantity", () => {
    it("returns on-hand quantity from inventory movement ledger query", async () => {
      const { client, queryRaw } = createMockPrismaClient();
      queryRaw.mockResolvedValue([{ quantity: 75n }]);

      const repo = new PrismaCostRepository(client);
      const onHand = await repo.getVariantOnHandQuantity(orgA, variantId);

      expect(queryRaw).toHaveBeenCalled();
      expect(onHand).toBe(75);
    });

    it("returns 0 when no rows or null quantity returned", async () => {
      const { client, queryRaw } = createMockPrismaClient();
      queryRaw.mockResolvedValue([]);

      const repo = new PrismaCostRepository(client);
      const onHand = await repo.getVariantOnHandQuantity(orgA, variantId);

      expect(onHand).toBe(0);
    });
  });
});
