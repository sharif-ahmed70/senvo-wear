import type { CheckoutPosCartServiceInputContract } from "@senvo/contracts";
import { parseTaka } from "./money";

export type DiscountMode = "NONE" | "PERCENT" | "AMOUNT";
export type DiscountRequest = NonNullable<
  CheckoutPosCartServiceInputContract["discount"]
>;

export type DiscountResult =
  | { discountMinor: number; ok: true; request: DiscountRequest | null }
  | { error: string; ok: false };

/**
 * Previews a cashier discount. The server recomputes the exact amount and
 * remains authoritative; this only shows the cashier what to expect.
 */
export function parseDiscount(
  mode: DiscountMode,
  text: string,
  grossMinor: number,
): DiscountResult {
  const value = text.trim();
  if (mode === "NONE" || value === "")
    return { discountMinor: 0, ok: true, request: null };
  if (mode === "PERCENT") {
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/u.test(value))
      return { error: "Enter a percentage like 10 or 7.5.", ok: false };
    const basisPoints = Math.round(Number(value) * 100);
    if (basisPoints < 1 || basisPoints > 10_000)
      return { error: "Percentage must be between 0.01 and 100.", ok: false };
    return {
      discountMinor: Math.round((grossMinor * basisPoints) / 10_000),
      ok: true,
      request: { basisPoints, kind: "PERCENT" },
    };
  }
  const amountMinor = parseTaka(value);
  if (amountMinor === null || amountMinor < 1)
    return {
      error: "Enter the discount in taka, like 200 or 150.50.",
      ok: false,
    };
  if (amountMinor > grossMinor)
    return { error: "Discount cannot be more than the total.", ok: false };
  return {
    discountMinor: amountMinor,
    ok: true,
    request: { amountMinor, kind: "AMOUNT" },
  };
}

export type ItemDiscountDraft = { mode: "PERCENT" | "AMOUNT"; text: string };
export type ItemDiscountRequest = NonNullable<
  CheckoutPosCartServiceInputContract["lineDiscounts"]
>[number];

/** Previews per-item discounts, keyed by product variant. */
export function previewItemDiscounts(
  lines: readonly { lineSubtotalMinor: number; productVariantId: string }[],
  drafts: Readonly<Record<string, ItemDiscountDraft>>,
) {
  const amounts: Record<string, number> = {};
  const errors: Record<string, string> = {};
  const requests: ItemDiscountRequest[] = [];
  for (const line of lines) {
    const draft = drafts[line.productVariantId];
    if (!draft) continue;
    const result = parseDiscount(
      draft.mode,
      draft.text,
      line.lineSubtotalMinor,
    );
    if (!result.ok) errors[line.productVariantId] = result.error;
    else if (result.request) {
      amounts[line.productVariantId] = result.discountMinor;
      requests.push({
        discount: result.request,
        productVariantId: line.productVariantId,
      });
    }
  }
  const totalMinor = Object.values(amounts).reduce((a, b) => a + b, 0);
  return { amounts, errors, requests, totalMinor };
}
