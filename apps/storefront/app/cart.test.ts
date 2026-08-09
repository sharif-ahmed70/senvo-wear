import { describe, expect, it } from "vitest";
import { addToCart, hydrateCart, readCart, writeCart } from "./_lib/cart";
import type {
  StorefrontProduct,
  StorefrontVariant,
} from "./_lib/storefront-api";

const variant: StorefrontVariant = {
  availability: "IN_STOCK",
  color: { code: "BLACK", hexValue: "#000000", name: "Black" },
  id: "variant-1",
  sellingPriceMinor: 129900,
  size: { code: "M", name: "Medium", sortOrder: 2 },
  sku: "TEE-BLK-M",
};
const product = {
  category: { code: "tops", id: "category-1", name: "Tops" },
  collection: null,
  description: null,
  id: "product-1",
  name: "Everyday Tee",
  productCode: "TEE",
  slug: "everyday-tee",
  variants: [variant],
} satisfies StorefrontProduct;

describe("guest storefront cart", () => {
  it("adds and increments a selected available variant", () => {
    const first = addToCart([], product, variant);
    expect(addToCart(first, product, variant)[0]?.quantity).toBe(2);
  });

  it("does not add an out-of-stock variant", () => {
    expect(
      addToCart([], product, { ...variant, availability: "OUT_OF_STOCK" }),
    ).toEqual([]);
  });

  it("hydrates valid browser storage and ignores corrupt data", () => {
    let value = "";
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    };
    const lines = addToCart([], product, variant);
    writeCart(storage, lines);
    expect(readCart(storage)).toEqual(lines);
    value = "{broken";
    expect(readCart(storage)).toEqual([]);
  });

  it("hydrates current price and removes unavailable variants", () => {
    const lines = addToCart([], product, variant);
    const current = hydrateCart(lines, {
      categories: [],
      collections: [],
      hasMore: false,
      page: 1,
      pageSize: 24,
      products: [
        { ...product, variants: [{ ...variant, sellingPriceMinor: 139900 }] },
      ],
    });
    expect(current.lines[0]?.unitPriceMinor).toBe(139900);
    expect(
      hydrateCart(lines, {
        categories: [],
        collections: [],
        hasMore: false,
        page: 1,
        pageSize: 24,
        products: [],
      }).removed,
    ).toBe(1);
  });
});
