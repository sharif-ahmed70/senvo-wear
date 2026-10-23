import { describe, expect, it } from "vitest";
import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";
import {
  discountSignature,
  planCheckoutDiscount,
} from "./checkout-discount.js";

const lines = [
  { quantity: 1, unitPriceMinor: 120_000 },
  { quantity: 2, unitPriceMinor: 50_000 },
  { quantity: 1, unitPriceMinor: 3_333 },
];

describe("planCheckoutDiscount", () => {
  it("returns no discount without a request", () => {
    expect(planCheckoutDiscount(lines, null)).toEqual({
      discountMinor: 0,
      lineDiscountsMinor: [0, 0, 0],
    });
  });

  it("converts a percentage to an exact amount", () => {
    const plan = planCheckoutDiscount(lines, {
      kind: "PERCENT",
      basisPoints: 1000,
    });
    expect(plan.discountMinor).toBe(Math.round(223_333 * 0.1));
  });

  it("spreads any discount over the lines without losing a paisa", () => {
    for (const amountMinor of [1, 7, 999, 12_345, 100_001, 223_333]) {
      const plan = planCheckoutDiscount(lines, { kind: "AMOUNT", amountMinor });
      expect(plan.discountMinor).toBe(amountMinor);
      expect(plan.lineDiscountsMinor.reduce((a, b) => a + b, 0)).toBe(
        amountMinor,
      );
      plan.lineDiscountsMinor.forEach((value, index) => {
        const line = lines[index]!;
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(line.quantity * line.unitPriceMinor);
      });
    }
  });

  it("allows 100% and rejects more than the sale total", () => {
    expect(
      planCheckoutDiscount(lines, { kind: "PERCENT", basisPoints: 10_000 })
        .discountMinor,
    ).toBe(223_333);
    expect(() =>
      planCheckoutDiscount(lines, { kind: "AMOUNT", amountMinor: 223_334 }),
    ).toThrow(BusinessRuleError);
  });

  it("rejects invalid values", () => {
    expect(() =>
      planCheckoutDiscount(lines, { kind: "PERCENT", basisPoints: 0 }),
    ).toThrow(ValidationApplicationError);
    expect(() =>
      planCheckoutDiscount(lines, { kind: "PERCENT", basisPoints: 10_001 }),
    ).toThrow(ValidationApplicationError);
    expect(() =>
      planCheckoutDiscount(lines, { kind: "AMOUNT", amountMinor: 1.5 }),
    ).toThrow(ValidationApplicationError);
  });
});

describe("item discounts", () => {
  const items = [
    { productVariantId: "a", quantity: 2, unitPriceMinor: 50_000 },
    { productVariantId: "b", quantity: 1, unitPriceMinor: 120_000 },
  ];

  it("discounts only the chosen item", () => {
    expect(
      planCheckoutDiscount(items, null, [
        {
          discount: { kind: "PERCENT", basisPoints: 1000 },
          productVariantId: "a",
        },
      ]),
    ).toEqual({ discountMinor: 10_000, lineDiscountsMinor: [10_000, 0] });
  });

  it("applies a sale discount after item discounts", () => {
    const plan = planCheckoutDiscount(
      items,
      { kind: "AMOUNT", amountMinor: 21_000 },
      [
        {
          discount: { kind: "AMOUNT", amountMinor: 10_000 },
          productVariantId: "b",
        },
      ],
    );
    // Net after item discount: 100000 + 110000 = 210000; 10% of it is spread.
    expect(plan.discountMinor).toBe(31_000);
    expect(plan.lineDiscountsMinor).toEqual([10_000, 21_000]);
  });

  it("rejects unknown, duplicate or too large item discounts", () => {
    const amount = (amountMinor: number) =>
      ({ kind: "AMOUNT", amountMinor }) as const;
    expect(() =>
      planCheckoutDiscount(items, null, [
        { discount: amount(1), productVariantId: "x" },
      ]),
    ).toThrow(BusinessRuleError);
    expect(() =>
      planCheckoutDiscount(items, null, [
        { discount: amount(1), productVariantId: "a" },
        { discount: amount(2), productVariantId: "a" },
      ]),
    ).toThrow(ValidationApplicationError);
    expect(() =>
      planCheckoutDiscount(items, null, [
        { discount: amount(100_001), productVariantId: "a" },
      ]),
    ).toThrow(BusinessRuleError);
  });
});

describe("discountSignature", () => {
  it("includes item discounts in a stable order", () => {
    const one = { kind: "AMOUNT", amountMinor: 1 } as const;
    expect(
      discountSignature(null, [
        { discount: one, productVariantId: "b" },
        { discount: one, productVariantId: "a" },
      ]),
    ).toBe(
      discountSignature(null, [
        { discount: one, productVariantId: "a" },
        { discount: one, productVariantId: "b" },
      ]),
    );
  });

  it("is empty without a discount and distinguishes kind and value", () => {
    expect(discountSignature(null)).toBeNull();
    expect(discountSignature({ kind: "PERCENT", basisPoints: 500 })).not.toBe(
      discountSignature({ kind: "AMOUNT", amountMinor: 500 }),
    );
  });
});
