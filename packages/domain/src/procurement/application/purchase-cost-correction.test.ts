import { describe, expect, it } from "vitest";
import type {
  InventoryCostEntry,
  PurchaseWithLines,
  VariantCostState,
} from "../domain/models.js";
import type { CostRepository } from "../repositories/cost-repository.js";
import type { PurchaseRepository } from "../repositories/purchase-repository.js";
import {
  correctPurchaseExtraCost,
  replayVariantCost,
} from "./purchase-cost-correction.js";

const org = "11111111-1111-4111-8111-111111111111";
const at = new Date("2026-10-28T06:00:00Z");

function receipt(
  variantId: string,
  purchaseId: string,
  beforeQuantity: number,
  quantity: number,
  unitCostMinor: number,
): InventoryCostEntry {
  return {
    afterAverageCostMinor: unitCostMinor,
    afterQuantity: beforeQuantity + quantity,
    afterValueMinor: BigInt(quantity * unitCostMinor),
    beforeAverageCostMinor: null,
    beforeQuantity,
    beforeValueMinor: 0n,
    createdAt: at,
    eventType: "PURCHASE_RECEIPT",
    id: `${purchaseId}-${variantId}`,
    organizationId: org,
    productVariantId: variantId,
    quantityChange: quantity,
    reference: purchaseId,
    sourceMovementId: null,
    sourcePurchaseId: purchaseId,
    valueChangeMinor: BigInt(quantity * unitCostMinor),
  };
}

describe("replayVariantCost", () => {
  it("rebuilds the moving average with a corrected receipt cost", () => {
    // 2 pcs at 100, then 3 more at 200 while 2 were on hand: avg 160.
    const entries = [
      receipt("v1", "p1", 0, 2, 10_000),
      receipt("v1", "p2", 2, 3, 20_000),
    ];
    expect(replayVariantCost(entries, () => undefined)).toMatchObject({
      averageCostMinor: 16_000,
      inventoryValueMinor: 80_000n,
    });
    // First purchase really cost 150 a piece: (300 + 600) / 5 = 180.
    expect(
      replayVariantCost(entries, (entry) =>
        entry.sourcePurchaseId === "p1" ? 15_000 : undefined,
      ),
    ).toMatchObject({ averageCostMinor: 18_000, inventoryValueMinor: 90_000n });
  });

  it("refuses history it cannot replay", () => {
    expect(() =>
      replayVariantCost(
        [{ ...receipt("v1", "p1", 0, 2, 100), eventType: "INVENTORY_ADJUSTMENT" }],
        () => undefined,
      ),
    ).toThrow(/cannot be corrected automatically/u);
  });
});

function setup(purchase: PurchaseWithLines, entries: InventoryCostEntry[]) {
  const states = new Map<string, VariantCostState>();
  for (const entry of entries)
    states.set(entry.productVariantId, {
      averageCostMinor: entry.afterAverageCostMinor,
      costUnknownReason: null,
      createdAt: at,
      id: entry.productVariantId,
      inventoryValueMinor: entry.afterValueMinor,
      isCostKnown: true,
      lastCostEventAt: at,
      organizationId: org,
      productVariantId: entry.productVariantId,
      updatedAt: at,
      version: 1,
    });
  const recorded: InventoryCostEntry[] = [];
  let current = purchase;
  const purchases = {
    findById: () => Promise.resolve(current),
    listPostedLinesForVariants: () =>
      Promise.resolve(
        current.lines.map((line) => ({
          productVariantId: line.productVariantId,
          purchaseId: current.id,
          quantity: line.quantity,
          unitCostMinor: line.unitCostMinor,
        })),
      ),
    update: (record: { totalCostMinor?: bigint }) => {
      current = { ...current, totalCostMinor: record.totalCostMinor ?? 0n };
      return Promise.resolve(current);
    },
    updateLineCosts: (input: {
      lines: ReadonlyArray<{
        extraCostPerUnitMinor: number;
        id: string;
        totalCostMinor: bigint;
        unitCostMinor: number;
      }>;
    }) => {
      current = {
        ...current,
        lines: current.lines.map((line) => {
          const next = input.lines.find((item) => item.id === line.id);
          return next ? { ...line, ...next } : line;
        }),
      };
      return Promise.resolve();
    },
  } as unknown as PurchaseRepository;
  const costs = {
    getCostState: (_org: string, variantId: string) =>
      Promise.resolve(states.get(variantId) ?? null),
    getVariantOnHandQuantity: () => Promise.resolve(1),
    listCostEntries: (_org: string, variantId: string) =>
      Promise.resolve(
        entries.filter((entry) => entry.productVariantId === variantId).reverse(),
      ),
    recordCostEntry: (record: InventoryCostEntry) => {
      recorded.push(record);
      return Promise.resolve(record);
    },
    upsertCostState: (record: VariantCostState) => {
      states.set(record.productVariantId, { ...states.get(record.productVariantId)!, ...record });
      return Promise.resolve(states.get(record.productVariantId)!);
    },
  } as unknown as CostRepository;
  return { costs, purchases, recorded, states, get purchase() { return current; } };
}

const cargo = (): PurchaseWithLines => ({
  createdAt: at,
  destinationLocationId: org,
  expectedDeliveryDate: null,
  id: "p-cargo",
  idempotencyKey: null,
  lines: ["v1", "v2"].map((variantId, index) => ({
    createdAt: at,
    extraCostPerUnitMinor: 0,
    id: `line-${variantId}`,
    lineNumber: index + 1,
    notes: null,
    organizationId: org,
    productName: "Cargo",
    productVariantId: variantId,
    purchaseId: "p-cargo",
    quantity: 1,
    sku: `CAR-${variantId}`,
    supplierUnitCostMinor: index === 0 ? 85_000 : 75_000,
    totalCostMinor: index === 0 ? 85_000n : 75_000n,
    unitCostMinor: index === 0 ? 85_000 : 75_000,
    updatedAt: at,
    variantName: null,
  })),
  notes: "Memo: 074",
  organizationId: org,
  purchaseDate: at,
  purchaseNumber: "PO-CARGO",
  receiptMovementId: null,
  status: "POSTED",
  supplierId: org,
  totalCostMinor: 160_000n,
  updatedAt: at,
});

describe("correctPurchaseExtraCost", () => {
  it("adds a forgotten transport to every piece, keeping the supplier price", async () => {
    const harness = setup(cargo(), [
      receipt("v1", "p-cargo", 0, 1, 85_000),
      receipt("v2", "p-cargo", 0, 1, 75_000),
    ]);
    const result = await correctPurchaseExtraCost(harness, {
      correctedAt: at,
      organizationId: org,
      purchaseId: "p-cargo",
      transportCostMinor: 20_000,
    });

    expect(result.appliedMinor).toBe(20_000);
    expect(
      harness.purchase.lines.map((line) => [
        line.supplierUnitCostMinor,
        line.extraCostPerUnitMinor,
        line.unitCostMinor,
      ]),
    ).toEqual([
      [85_000, 10_000, 95_000],
      [75_000, 10_000, 85_000],
    ]);
    expect(harness.purchase.totalCostMinor).toBe(180_000n);
    expect(harness.states.get("v1")).toMatchObject({
      averageCostMinor: 95_000,
      inventoryValueMinor: 95_000n,
    });
    expect(harness.recorded).toEqual([
      expect.objectContaining({
        eventType: "COST_CORRECTION",
        productVariantId: "v1",
        quantityChange: 0,
        valueChangeMinor: 10_000n,
      }),
      expect.objectContaining({ productVariantId: "v2", valueChangeMinor: 10_000n }),
    ]);
  });

  it("does nothing when the extra cost is unchanged", async () => {
    const harness = setup(cargo(), [receipt("v1", "p-cargo", 0, 1, 85_000)]);
    await correctPurchaseExtraCost(harness, {
      correctedAt: at,
      organizationId: org,
      purchaseId: "p-cargo",
      transportCostMinor: 0,
    });
    expect(harness.recorded).toEqual([]);
  });

  it("rejects a purchase without a supplier price per piece", async () => {
    const purchase = cargo();
    purchase.lines[0] = { ...purchase.lines[0]!, supplierUnitCostMinor: null };
    const harness = setup(purchase, []);
    await expect(
      correctPurchaseExtraCost(harness, {
        correctedAt: at,
        organizationId: org,
        purchaseId: "p-cargo",
        transportCostMinor: 10_000,
      }),
    ).rejects.toThrow(/supplier price/u);
  });
});
