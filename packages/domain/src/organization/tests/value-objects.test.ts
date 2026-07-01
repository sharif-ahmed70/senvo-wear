import { describe, expect, it } from "vitest";
import {
  normalizeCountryCode,
  normalizeDisplayName,
  normalizeOperationCode,
  normalizeOptionalEmail,
  normalizeOptionalPhone,
  normalizeStockLocationSellable,
  normalizeTimezone,
} from "../domain/value-objects.js";

describe("organization operation value objects", () => {
  it("normalizes branch, location, and counter codes", () => {
    expect(normalizeOperationCode(" main-01 ", "branch code")).toBe("MAIN-01");
    expect(normalizeOperationCode(" floor-1 ", "stock location code")).toBe(
      "FLOOR-1",
    );
    expect(normalizeOperationCode(" counter-1 ", "POS counter code")).toBe(
      "COUNTER-1",
    );
  });

  it("rejects blank names and invalid codes", () => {
    expect(() => normalizeDisplayName("   ", "branch name")).toThrow("blank");
    expect(() => normalizeOperationCode("BAD CODE")).toThrow("spaces");
    expect(() => normalizeOperationCode("BAD/CODE")).toThrow("A-Z");
  });

  it("validates country code and timezone inputs", () => {
    expect(normalizeCountryCode()).toBe("BD");
    expect(normalizeCountryCode(" us ")).toBe("US");
    expect(() => normalizeCountryCode("BGD")).toThrow("two-letter");

    expect(normalizeTimezone()).toBe("Asia/Dhaka");
    expect(normalizeTimezone("Asia/Dhaka")).toBe("Asia/Dhaka");
    expect(() => normalizeTimezone("Dhaka")).toThrow("IANA");
  });

  it("validates optional email and phone with transport-level rules", () => {
    expect(normalizeOptionalEmail(" ops@example.com ")).toBe("ops@example.com");
    expect(normalizeOptionalEmail("   ")).toBeNull();
    expect(() => normalizeOptionalEmail("bad-email")).toThrow("email");

    expect(normalizeOptionalPhone(" +880 1700-000000 ")).toBe(
      "+880 1700-000000",
    );
    expect(() => normalizeOptionalPhone("call-me")).toThrow("phone");
  });

  it("defaults sellable behavior without allowing hold locations to sell", () => {
    expect(normalizeStockLocationSellable("SHOWROOM")).toBe(true);
    expect(normalizeStockLocationSellable("WAREHOUSE")).toBe(false);
    expect(normalizeStockLocationSellable("WAREHOUSE", true)).toBe(true);
    expect(normalizeStockLocationSellable("QC_HOLD")).toBe(false);
    expect(() => normalizeStockLocationSellable("DAMAGE_HOLD", true)).toThrow(
      "cannot be sellable",
    );
  });
});
