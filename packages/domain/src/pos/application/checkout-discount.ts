import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";

/** A cashier discount: a fixed amount or a percentage (basis points, 1000 = 10%). */
export type PosCheckoutDiscountInput =
  | { kind: "AMOUNT"; amountMinor: number }
  | { kind: "PERCENT"; basisPoints: number };

/** A discount on one cart item (the whole line: every piece of that variant). */
export type PosCheckoutLineDiscountInput = {
  discount: PosCheckoutDiscountInput;
  productVariantId: string;
};

export type PosCheckoutDiscountPlan = {
  discountMinor: number;
  /** Total discount on each input line (item + its share of a sale discount). */
  lineDiscountsMinor: number[];
};

type PlanLine = {
  productVariantId?: string;
  quantity: number;
  unitPriceMinor: number;
};

/**
 * Turns discount requests into exact amounts. Item discounts apply first; a
 * whole-sale discount then applies to what is left and is spread over the lines.
 * Everything is stored on the order lines, so line totals, receipts and return
 * credits all use the price the customer actually paid.
 */
export function planCheckoutDiscount(
  lines: readonly PlanLine[],
  discount: PosCheckoutDiscountInput | null | undefined,
  lineDiscounts: readonly PosCheckoutLineDiscountInput[] = [],
): PosCheckoutDiscountPlan {
  const grossLines = lines.map((line) => line.quantity * line.unitPriceMinor);

  const itemDiscounts = grossLines.map(() => 0);
  const seen = new Set<string>();
  for (const item of lineDiscounts) {
    if (seen.has(item.productVariantId))
      throw new ValidationApplicationError(
        "An item can only have one discount.",
      );
    seen.add(item.productVariantId);
    const index = lines.findIndex(
      (line) => line.productVariantId === item.productVariantId,
    );
    if (index < 0)
      throw new BusinessRuleError(
        "A discounted item is no longer in the cart.",
      );
    const gross = grossLines[index] ?? 0;
    const amount = discountAmount(item.discount, gross);
    if (amount > gross)
      throw new BusinessRuleError(
        "An item discount cannot exceed that item's total.",
      );
    itemDiscounts[index] = amount;
  }

  const netLines = grossLines.map(
    (gross, index) => gross - (itemDiscounts[index] ?? 0),
  );
  const netMinor = netLines.reduce((sum, value) => sum + value, 0);
  const saleMinor = discount ? discountAmount(discount, netMinor) : 0;
  if (saleMinor > netMinor)
    throw new BusinessRuleError("Discount cannot exceed the sale total.");
  const saleShares = allocate(saleMinor, netLines);

  const lineDiscountsMinor = itemDiscounts.map(
    (value, index) => value + (saleShares[index] ?? 0),
  );
  return {
    discountMinor: lineDiscountsMinor.reduce((sum, value) => sum + value, 0),
    lineDiscountsMinor,
  };
}

function discountAmount(
  discount: PosCheckoutDiscountInput,
  baseMinor: number,
): number {
  if (discount.kind === "PERCENT") {
    if (
      !Number.isInteger(discount.basisPoints) ||
      discount.basisPoints < 1 ||
      discount.basisPoints > 10_000
    )
      throw new ValidationApplicationError(
        "Discount percentage must be between 0.01% and 100%.",
      );
    return Math.round((baseMinor * discount.basisPoints) / 10_000);
  }
  if (!Number.isInteger(discount.amountMinor) || discount.amountMinor < 1)
    throw new ValidationApplicationError("Discount amount is invalid.");
  return discount.amountMinor;
}

/**
 * Proportional share per line (BigInt avoids overflow). The remainder goes to
 * the lines with the largest fractional part, so the parts add up exactly.
 */
function allocate(totalMinor: number, weights: readonly number[]): number[] {
  const weightMinor = weights.reduce((sum, value) => sum + value, 0);
  if (totalMinor === 0 || weightMinor === 0) return weights.map(() => 0);
  const total = BigInt(totalMinor);
  const weight = BigInt(weightMinor);
  const shares = weights.map((value) => {
    const exact = total * BigInt(value);
    return { floor: exact / weight, rest: exact % weight };
  });
  const result = shares.map((share) => Number(share.floor));
  let remainder = totalMinor - result.reduce((sum, value) => sum + value, 0);
  const order = shares
    .map((share, index) => ({ index, rest: share.rest }))
    .sort((left, right) =>
      left.rest === right.rest
        ? left.index - right.index
        : left.rest > right.rest
          ? -1
          : 1,
    );
  for (const { index } of order) {
    if (remainder <= 0) break;
    const share = result[index] ?? 0;
    if ((weights[index] ?? 0) - share > 0) {
      result[index] = share + 1;
      remainder -= 1;
    }
  }
  return result;
}

/** Stable text for idempotency checks: same request, same discounts. */
export function discountSignature(
  discount: PosCheckoutDiscountInput | null | undefined,
  lineDiscounts: readonly PosCheckoutLineDiscountInput[] = [],
): string | null {
  const text = (value: PosCheckoutDiscountInput) =>
    value.kind === "PERCENT"
      ? `PERCENT:${value.basisPoints}`
      : `AMOUNT:${value.amountMinor}`;
  const items = [...lineDiscounts]
    .sort((left, right) =>
      left.productVariantId.localeCompare(right.productVariantId),
    )
    .map((item) => `${item.productVariantId}=${text(item.discount)}`);
  if (!discount && items.length === 0) return null;
  return [discount ? text(discount) : "", ...items].join("|");
}
