import { describe, expect, it } from "vitest";
import { parseDiscount, previewItemDiscounts } from "./discount";

describe("previewItemDiscounts", () => {
  const lines = [
    { lineSubtotalMinor: 100_000, productVariantId: "a" },
    { lineSubtotalMinor: 50_000, productVariantId: "b" },
  ];
  it("previews discounts per item and reports bad input per item", () => {
    const preview = previewItemDiscounts(lines, {
      a: { mode: "PERCENT", text: "10" },
      b: { mode: "AMOUNT", text: "600" },
    });
    expect(preview.amounts).toEqual({ a: 10_000 });
    expect(preview.totalMinor).toBe(10_000);
    expect(preview.requests).toEqual([
      {
        discount: { basisPoints: 1000, kind: "PERCENT" },
        productVariantId: "a",
      },
    ]);
    expect(preview.errors.b).toBeDefined();
  });
});

describe("parseDiscount", () => {
  it("means no discount when empty or off", () => {
    expect(parseDiscount("PERCENT", "", 100_000)).toEqual({
      discountMinor: 0,
      ok: true,
      request: null,
    });
    expect(parseDiscount("NONE", "10", 100_000)).toMatchObject({
      discountMinor: 0,
    });
  });

  it("previews a percentage as basis points", () => {
    expect(parseDiscount("PERCENT", "7.5", 120_000)).toEqual({
      discountMinor: 9_000,
      ok: true,
      request: { basisPoints: 750, kind: "PERCENT" },
    });
  });

  it("converts a taka amount to minor units and caps it at the total", () => {
    expect(parseDiscount("AMOUNT", "150.50", 100_000)).toMatchObject({
      discountMinor: 15_050,
      request: { amountMinor: 15_050, kind: "AMOUNT" },
    });
    expect(parseDiscount("AMOUNT", "1001", 100_000)).toMatchObject({
      ok: false,
    });
  });

  it("rejects bad input", () => {
    expect(parseDiscount("PERCENT", "101", 100_000)).toMatchObject({
      ok: false,
    });
    expect(parseDiscount("PERCENT", "abc", 100_000)).toMatchObject({
      ok: false,
    });
    expect(parseDiscount("AMOUNT", "-5", 100_000)).toMatchObject({ ok: false });
  });
});
