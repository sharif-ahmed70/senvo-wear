import { describe, expect, it } from "vitest";
import { generateCode128BarcodeValue } from "./stock-intake-rules.js";

describe("generateCode128BarcodeValue", () => {
  it("returns a short 12-digit value (Code 128 set C, readable on small labels)", () => {
    const values = new Set(
      Array.from({ length: 200 }, () => generateCode128BarcodeValue()),
    );
    for (const value of values) expect(value).toMatch(/^[1-9]\d{11}$/u);
    expect(values.size).toBe(200);
  });
});
