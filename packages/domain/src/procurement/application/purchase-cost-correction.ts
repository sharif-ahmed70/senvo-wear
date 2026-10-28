import {
  BusinessRuleError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import { deriveCostStateAfterReceipt } from "../domain/costing-rules.js";
import type {
  InventoryCostEntry,
  PurchaseWithLines,
  VariantCostState,
} from "../domain/models.js";
import { distributeTransportCost } from "../domain/stock-intake-rules.js";
import type { CostRepository } from "../repositories/cost-repository.js";
import type { PurchaseRepository } from "../repositories/purchase-repository.js";

export type ReplayedCost = Pick<
  VariantCostState,
  "averageCostMinor" | "costUnknownReason" | "inventoryValueMinor" | "isCostKnown"
>;

/**
 * Rebuilds a variant's cost state from its receipt history, as if every
 * receipt had been booked at `unitCostFor(entry)` (the purchase line's
 * current unit cost). Uses the same rule as a receipt
 * (deriveCostStateAfterReceipt) with the on-hand quantity recorded at the
 * time, so the result equals what intake would have produced with the
 * corrected cost. Earlier COST_CORRECTION entries are notes only and are
 * skipped; any other event type cannot be replayed safely.
 */
export function replayVariantCost(
  entriesOldestFirst: readonly InventoryCostEntry[],
  unitCostFor: (entry: InventoryCostEntry) => number | undefined,
): ReplayedCost | null {
  let state: ReplayedCost | null = null;
  for (const entry of entriesOldestFirst) {
    if (entry.eventType === "COST_CORRECTION") continue;
    if (entry.eventType !== "PURCHASE_RECEIPT" || entry.quantityChange <= 0)
      throw new BusinessRuleError(
        "This item has stock history other than purchases; its cost cannot be corrected automatically.",
        "COST_CORRECTION_UNSUPPORTED_HISTORY",
      );
    const recordedUnit = Number(entry.valueChangeMinor) / entry.quantityChange;
    const after = deriveCostStateAfterReceipt({
      costState: state,
      existingOnHandQuantity: entry.beforeQuantity,
      receivedQuantity: entry.quantityChange,
      unitCostMinor: unitCostFor(entry) ?? Math.round(recordedUnit),
    });
    state = {
      averageCostMinor: after.afterAverageCostMinor,
      costUnknownReason: after.costUnknownReason,
      inventoryValueMinor: after.afterValueMinor,
      isCostKnown: after.isCostKnown,
    };
  }
  return state;
}

/**
 * Sets the transport/labour ("extra cost") of a posted purchase after the
 * fact, e.g. when it was forgotten at intake. The amount is spread over the
 * pieces exactly like at intake; the supplier price and the supplier's
 * balance stay unchanged. Each affected variant's cost is replayed from its
 * receipts and the change is recorded as a COST_CORRECTION entry.
 */
export async function correctPurchaseExtraCost(
  repositories: { costs: CostRepository; purchases: PurchaseRepository },
  input: {
    correctedAt: Date;
    organizationId: string;
    purchaseId: string;
    transportCostMinor: number;
  },
): Promise<{ appliedMinor: number; purchase: PurchaseWithLines }> {
  const { costs, purchases } = repositories;
  if (!purchases.updateLineCosts || !purchases.listPostedLinesForVariants)
    throw new BusinessRuleError(
      "Purchase cost correction is not available.",
      "COST_CORRECTION_UNAVAILABLE",
    );
  if (
    !Number.isSafeInteger(input.transportCostMinor) ||
    input.transportCostMinor < 0
  )
    throw new ValidationApplicationError(
      "Extra cost must be zero or more, in whole poisha.",
    );

  const purchase = await purchases.findById(
    input.purchaseId,
    input.organizationId,
  );
  if (!purchase) throw new NotFoundError("Purchase was not found.");
  if (purchase.status !== "POSTED")
    throw new BusinessRuleError(
      "Only a received (posted) purchase can be corrected.",
      "PURCHASE_NOT_POSTED",
    );
  if (purchase.lines.length === 0)
    throw new BusinessRuleError("The purchase has no lines.", "PURCHASE_EMPTY");
  const supplierUnits = purchase.lines.map((line) => {
    if (line.supplierUnitCostMinor === null)
      throw new BusinessRuleError(
        "This purchase was recorded without a supplier price per piece, so its extra cost cannot be separated.",
        "SUPPLIER_PRICE_UNKNOWN",
      );
    return line.supplierUnitCostMinor;
  });

  const distribution = distributeTransportCost(
    purchase.lines.map((line, index) => ({
      quantity: line.quantity,
      unitCostMinor: supplierUnits[index] ?? 0,
    })),
    input.transportCostMinor,
  );
  const corrected = purchase.lines.map((line, index) => {
    const unitCostMinor = distribution.unitCosts[index] ?? line.unitCostMinor;
    return {
      extraCostPerUnitMinor: unitCostMinor - (supplierUnits[index] ?? 0),
      id: line.id,
      productVariantId: line.productVariantId,
      totalCostMinor: BigInt(line.quantity) * BigInt(unitCostMinor),
      unitCostMinor,
    };
  });
  const changed = corrected.filter(
    (line, index) => line.unitCostMinor !== purchase.lines[index]?.unitCostMinor,
  );
  if (changed.length === 0)
    return { appliedMinor: distribution.appliedMinor, purchase };

  await purchases.updateLineCosts({
    lines: corrected,
    organizationId: input.organizationId,
    purchaseId: purchase.id,
  });
  await purchases.update({
    id: purchase.id,
    organizationId: input.organizationId,
    totalCostMinor: corrected.reduce(
      (sum, line) => sum + line.totalCostMinor,
      0n,
    ),
  });

  const variantIds = [...new Set(changed.map((line) => line.productVariantId))];
  const postedLines = await purchases.listPostedLinesForVariants(
    input.organizationId,
    variantIds,
  );
  for (const variantId of variantIds) {
    // Each purchase's current per-piece cost for this variant (quantity
    // weighted if one purchase has several lines of the same variant).
    const unitByPurchase = new Map<string, number>();
    const lines = postedLines.filter(
      (line) => line.productVariantId === variantId,
    );
    for (const purchaseId of new Set(lines.map((line) => line.purchaseId))) {
      const own = lines.filter((line) => line.purchaseId === purchaseId);
      const quantity = own.reduce((sum, line) => sum + line.quantity, 0);
      const value = own.reduce(
        (sum, line) => sum + line.quantity * line.unitCostMinor,
        0,
      );
      if (quantity > 0) unitByPurchase.set(purchaseId, Math.round(value / quantity));
    }
    const entries = await costs.listCostEntries(input.organizationId, variantId);
    const replayed = replayVariantCost([...entries].reverse(), (entry) =>
      entry.sourcePurchaseId
        ? unitByPurchase.get(entry.sourcePurchaseId)
        : undefined,
    );
    if (!replayed) continue;
    const before = await costs.getCostState(input.organizationId, variantId);
    const onHand = await costs.getVariantOnHandQuantity(
      input.organizationId,
      variantId,
    );
    await costs.upsertCostState({
      averageCostMinor: replayed.averageCostMinor,
      costUnknownReason: replayed.costUnknownReason,
      ...(before ? { expectedVersion: before.version } : {}),
      inventoryValueMinor: replayed.inventoryValueMinor,
      isCostKnown: replayed.isCostKnown,
      lastCostEventAt: input.correctedAt,
      organizationId: input.organizationId,
      productVariantId: variantId,
    });
    const beforeValue = before?.inventoryValueMinor ?? 0n;
    await costs.recordCostEntry({
      afterAverageCostMinor: replayed.averageCostMinor,
      afterQuantity: Math.max(0, onHand),
      afterValueMinor: replayed.inventoryValueMinor,
      beforeAverageCostMinor: before?.averageCostMinor ?? null,
      beforeQuantity: Math.max(0, onHand),
      beforeValueMinor: beforeValue,
      eventType: "COST_CORRECTION",
      organizationId: input.organizationId,
      productVariantId: variantId,
      quantityChange: 0,
      reference: purchase.purchaseNumber,
      sourcePurchaseId: purchase.id,
      valueChangeMinor: replayed.inventoryValueMinor - beforeValue,
    });
  }

  const updated = await purchases.findById(purchase.id, input.organizationId);
  return { appliedMinor: distribution.appliedMinor, purchase: updated ?? purchase };
}
