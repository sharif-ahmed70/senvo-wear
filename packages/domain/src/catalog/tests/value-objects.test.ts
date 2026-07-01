import { describe, expect, it } from "vitest";
import {
  assertCategoryParentDoesNotCreateCycle,
  assertCategoryParentIsNotSelf,
  assertNonNegativeSortOrder,
  normalizeCode,
  normalizeDisplayName,
  normalizeHexValue,
  normalizeSku,
  normalizeSlug,
  slugFromDisplayName,
} from "../domain/value-objects.js";

describe("catalog value objects", () => {
  it("normalizes display names while preserving human casing", () => {
    expect(normalizeDisplayName("  Premium   Oxford Shirt  ")).toBe(
      "Premium Oxford Shirt",
    );
  });

  it("normalizes and validates business codes", () => {
    expect(normalizeCode(" senvo-men ")).toBe("SENVO-MEN");
    expect(() => normalizeCode("BAD CODE")).toThrow("spaces");
    expect(() => normalizeCode("bad/code")).toThrow("A-Z");
  });

  it("normalizes and validates SKU values", () => {
    expect(normalizeSku(" oxford-blk-l ")).toBe("OXFORD-BLK-L");
    expect(() => normalizeSku("OXFORD BLK L")).toThrow("spaces");
  });

  it("validates slugs and can derive a neutral slug from a display name", () => {
    expect(normalizeSlug("formal-shirts")).toBe("formal-shirts");
    expect(slugFromDisplayName("Premium Oxford Formal Shirt")).toBe(
      "premium-oxford-formal-shirt",
    );
    expect(() => normalizeSlug("Formal Shirts")).toThrow("lowercase");
  });

  it("validates optional hex values", () => {
    expect(normalizeHexValue("#0f1a2b")).toBe("#0F1A2B");
    expect(normalizeHexValue(null)).toBeNull();
    expect(() => normalizeHexValue("black")).toThrow("#RRGGBB");
  });

  it("rejects negative sort order and self-parent categories", () => {
    expect(assertNonNegativeSortOrder(0)).toBe(0);
    expect(() => assertNonNegativeSortOrder(-1)).toThrow("non-negative");
    expect(() => assertCategoryParentIsNotSelf("cat_1", "cat_1")).toThrow(
      "own parent",
    );
  });

  it("detects deeper category parent cycles when ancestor ids are supplied", () => {
    expect(() =>
      assertCategoryParentDoesNotCreateCycle("cat_a", ["cat_c", "cat_b"]),
    ).not.toThrow();
    expect(() =>
      assertCategoryParentDoesNotCreateCycle("cat_a", [
        "cat_c",
        "cat_b",
        "cat_a",
      ]),
    ).toThrow("cycle");
  });
});
