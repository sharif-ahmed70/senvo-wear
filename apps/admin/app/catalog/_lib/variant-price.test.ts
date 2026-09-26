import { describe, expect, it } from "vitest";
import { parseVariantPrice, formatVariantPrice } from "./variant-price";
describe("BDT variant pricing", () => {
  it.each([
    ["125.50", 12550],
    ["0.01", 1],
    ["1.1", 110],
    ["21474836.47", 2147483647],
  ])("converts %s exactly", (text, minor) => {
    expect(parseVariantPrice(String(text))).toBe(minor);
  });
  it.each(["", "0", "-1", "1.001", "1e2", "1,000", "21474836.48", "Infinity"])(
    "rejects %s",
    (text) => {
      expect(parseVariantPrice(text)).toBeNull();
    },
  );
  it("marks readable legacy zero for review", () => {
    expect(formatVariantPrice(0)).toBe("\u09f30.00 - Review price");
    expect(formatVariantPrice(12550)).toBe("\u09f3125.50");
  });
});
