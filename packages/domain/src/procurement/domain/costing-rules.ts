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
  afterAverageCostMinor: number;
  afterQuantity: number;
  afterValueMinor: bigint;
  beforeAverageCostMinor: number | null;
  beforeQuantity: number;
  beforeValueMinor: bigint;
  isCostKnown: boolean;
  valueChangeMinor: bigint;
};

/**
 * Derives new variant cost state and inventory cost entry values when receiving stock from a purchase.
 *
 * Rules:
 * - When existing cost is known, applies perpetual moving weighted average.
 * - When existing cost is unknown or null (e.g. uncosted opening stock or initial receipt),
 *   the purchase establishes the unit cost baseline for the variant.
 * - Uses physical on-hand quantity only (never available quantity).
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

  if (
    costState &&
    costState.isCostKnown &&
    costState.averageCostMinor !== null
  ) {
    const beforeAverageCostMinor = costState.averageCostMinor;
    const beforeValueMinor =
      beforeQuantity === 0
        ? 0n
        : BigInt(beforeQuantity) * BigInt(beforeAverageCostMinor);

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
      isCostKnown: true,
      valueChangeMinor,
    };
  }

  // Cost was not previously known; receipt establishes the unit cost baseline
  const afterAverageCostMinor = unitCostMinor;
  const afterValueMinor = BigInt(afterQuantity) * BigInt(unitCostMinor);

  return {
    afterAverageCostMinor,
    afterQuantity,
    afterValueMinor,
    beforeAverageCostMinor: null,
    beforeQuantity,
    beforeValueMinor: 0n,
    isCostKnown: true,
    valueChangeMinor,
  };
}
