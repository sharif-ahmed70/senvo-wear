import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";
import type { CostUnknownReason, VariantCostState } from "./models.js";

export type MovingWeightedAverageResult = {
  newAverageCostMinor: number;
  newTotalQuantity: number;
  newTotalValueMinor: bigint;
};

/**
 * Calculates the new perpetual moving weighted average cost at Organization + ProductVariant level.
 *
 * Formula:
 * New Average Cost = (Existing Inventory Value + Received Purchase Cost) / (Existing On-Hand Quantity + Received Quantity)
 *
 * Rules:
 * - Uses total on-hand quantity (includes reserved stock; available stock must NOT be used).
 * - Received quantity must be positive (> 0).
 * - Received cost must be non-negative (>= 0).
 */
export function calculateMovingWeightedAverage(params: {
  existingOnHandQuantity: number;
  existingValueMinor: bigint;
  receivedCostMinor: bigint;
  receivedQuantity: number;
}): MovingWeightedAverageResult {
  const {
    existingOnHandQuantity,
    existingValueMinor,
    receivedCostMinor,
    receivedQuantity,
  } = params;

  if (receivedQuantity <= 0) {
    throw new ValidationApplicationError(
      "Received quantity must be greater than zero for costing update.",
      [{ field: "receivedQuantity", reason: "Quantity must be > 0" }],
    );
  }

  if (receivedCostMinor < 0n) {
    throw new ValidationApplicationError("Received cost cannot be negative.", [
      { field: "receivedCostMinor", reason: "Cost must be >= 0" },
    ]);
  }

  if (existingOnHandQuantity < 0) {
    throw new BusinessRuleError(
      "Negative on-hand quantity cannot be used to compute moving weighted average.",
      "INVENTORY_ON_HAND_NEGATIVE",
    );
  }

  const effectiveExistingValue =
    existingOnHandQuantity === 0 ? 0n : existingValueMinor;

  const newTotalQuantity = existingOnHandQuantity + receivedQuantity;
  const newTotalValueMinor = effectiveExistingValue + receivedCostMinor;

  if (newTotalQuantity <= 0) {
    throw new BusinessRuleError(
      "Total quantity after receipt must be greater than zero.",
      "INVALID_TOTAL_QUANTITY",
    );
  }

  // Exact poisha calculation with rounding
  // Math.round(Number(newTotalValueMinor) / newTotalQuantity)
  const averageCostMinor = Math.round(
    Number(newTotalValueMinor) / newTotalQuantity,
  );

  return {
    newAverageCostMinor: averageCostMinor,
    newTotalQuantity,
    newTotalValueMinor,
  };
}

/**
 * Derives a sale line cost snapshot based on current variant cost state.
 *
 * Rules:
 * - If cost is known, snapshots unitCostMinor and totalCostMinor.
 * - If cost is unknown (e.g. opening balance unknown), records isCostKnown = false and reason.
 * - Historical snapshots remain immutable and cannot be retroactively altered by future purchases.
 */
export function calculateSaleLineCostSnapshot(params: {
  costState: VariantCostState | null;
  quantity: number;
}): {
  costUnknownReason: CostUnknownReason | null;
  isCostKnown: boolean;
  totalCostMinor: bigint | null;
  unitCostMinor: number | null;
} {
  const { costState, quantity } = params;

  if (quantity <= 0) {
    throw new ValidationApplicationError(
      "Sale line quantity must be greater than zero for cost snapshot.",
      [{ field: "quantity", reason: "Quantity must be > 0" }],
    );
  }

  if (
    !costState ||
    !costState.isCostKnown ||
    costState.averageCostMinor === null
  ) {
    return {
      costUnknownReason:
        costState?.costUnknownReason ?? "OPENING_STOCK_UNKNOWN",
      isCostKnown: false,
      totalCostMinor: null,
      unitCostMinor: null,
    };
  }

  const unitCostMinor = costState.averageCostMinor;
  const totalCostMinor = BigInt(unitCostMinor) * BigInt(quantity);

  return {
    costUnknownReason: null,
    isCostKnown: true,
    totalCostMinor,
    unitCostMinor,
  };
}

/**
 * Validates purchase line data prior to persistence.
 */
export function validatePurchaseLineData(params: {
  lineNumber: number;
  productName: string;
  productVariantId: string;
  quantity: number;
  sku: string;
  unitCostMinor: number;
}): void {
  const errors: Array<{ field: string; reason: string }> = [];

  if (params.lineNumber <= 0) {
    errors.push({ field: "lineNumber", reason: "Line number must be >= 1" });
  }

  if (!params.productVariantId || params.productVariantId.trim() === "") {
    errors.push({
      field: "productVariantId",
      reason: "Product variant ID is required",
    });
  }

  if (params.quantity <= 0) {
    errors.push({
      field: "quantity",
      reason: "Quantity must be greater than zero",
    });
  }

  if (params.unitCostMinor < 0) {
    errors.push({
      field: "unitCostMinor",
      reason: "Unit cost cannot be negative",
    });
  }

  if (!params.productName || params.productName.trim() === "") {
    errors.push({
      field: "productName",
      reason: "Product name snapshot is required",
    });
  }

  if (!params.sku || params.sku.trim() === "") {
    errors.push({ field: "sku", reason: "SKU snapshot is required" });
  }

  if (errors.length > 0) {
    throw new ValidationApplicationError("Invalid purchase line data", errors);
  }
}

export type DeriveCostStateAfterReceiptParams = {
  costState: VariantCostState | null;
  existingOnHandQuantity: number;
  receivedQuantity: number;
  unitCostMinor: number;
};

export type DeriveCostStateAfterReceiptResult = {
  afterAverageCostMinor: number | null;
  afterQuantity: number;
  afterValueMinor: bigint;
  beforeAverageCostMinor: number | null;
  beforeQuantity: number;
  beforeValueMinor: bigint;
  costUnknownReason: CostUnknownReason | null;
  isCostKnown: boolean;
  valueChangeMinor: bigint;
};

/**
 * Derives new variant cost state and inventory cost entry values when receiving stock from a purchase.
 *
 * Rules:
 * - Case 1 (Zero existing quantity): Establishes known unit cost baseline for the newly received stock.
 * - Case 2 (Existing known cost): Applies perpetual moving weighted average using stored inventoryValueMinor
 *   as authoritative source of truth (no rounding reconstruction drift).
 * - Case 3 (Existing unknown cost): Preserves isCostKnown = false and costUnknownReason = "OPENING_STOCK_UNKNOWN".
 *   averageCostMinor remains null. Never assigns purchase cost to existing unknown stock; only adds received
 *   purchase cost to inventory value.
 */
export function deriveCostStateAfterReceipt(
  params: DeriveCostStateAfterReceiptParams,
): DeriveCostStateAfterReceiptResult {
  const { costState, existingOnHandQuantity, receivedQuantity, unitCostMinor } =
    params;

  if (receivedQuantity <= 0) {
    throw new ValidationApplicationError(
      "Received quantity must be greater than zero for costing update.",
      [{ field: "receivedQuantity", reason: "Quantity must be > 0" }],
    );
  }

  if (unitCostMinor < 0) {
    throw new ValidationApplicationError("Unit cost cannot be negative.", [
      { field: "unitCostMinor", reason: "Cost must be >= 0" },
    ]);
  }

  const beforeQuantity = Math.max(0, existingOnHandQuantity);
  const valueChangeMinor = BigInt(receivedQuantity) * BigInt(unitCostMinor);
  const afterQuantity = beforeQuantity + receivedQuantity;

  // Case 1: Zero existing quantity on hand — establishes known cost for the received stock
  if (beforeQuantity === 0) {
    return {
      afterAverageCostMinor: unitCostMinor,
      afterQuantity,
      afterValueMinor: valueChangeMinor,
      beforeAverageCostMinor: null,
      beforeQuantity: 0,
      beforeValueMinor: 0n,
      costUnknownReason: null,
      isCostKnown: true,
      valueChangeMinor,
    };
  }

  // Case 2: Existing quantity with known cost — apply perpetual moving weighted average
  if (
    costState &&
    costState.isCostKnown &&
    costState.averageCostMinor !== null
  ) {
    const beforeAverageCostMinor = costState.averageCostMinor;
    const beforeValueMinor = costState.inventoryValueMinor;

    const moving = calculateMovingWeightedAverage({
      existingOnHandQuantity: beforeQuantity,
      existingValueMinor: beforeValueMinor,
      receivedCostMinor: valueChangeMinor,
      receivedQuantity,
    });

    return {
      afterAverageCostMinor: moving.newAverageCostMinor,
      afterQuantity,
      afterValueMinor: moving.newTotalValueMinor,
      beforeAverageCostMinor,
      beforeQuantity,
      beforeValueMinor,
      costUnknownReason: null,
      isCostKnown: true,
      valueChangeMinor,
    };
  }

  // Case 3: Existing quantity with unknown opening cost — remains unknown
  const beforeAverageCostMinor = costState?.averageCostMinor ?? null;
  const beforeValueMinor = costState?.inventoryValueMinor ?? 0n;
  const afterValueMinor = beforeValueMinor + valueChangeMinor;

  return {
    afterAverageCostMinor: null,
    afterQuantity,
    afterValueMinor,
    beforeAverageCostMinor,
    beforeQuantity,
    beforeValueMinor,
    costUnknownReason: costState?.costUnknownReason ?? "OPENING_STOCK_UNKNOWN",
    isCostKnown: false,
    valueChangeMinor,
  };
}
