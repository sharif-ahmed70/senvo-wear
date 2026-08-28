import { describe, expect, it } from "vitest";
import {
  addToCart,
  canContinueToCheckout,
  canSubmitCheckout,
  checkoutPriceRefreshMessage,
  hydrateCart,
  hydrateStoredCart,
  readCart,
  writeCart,
} from "./_lib/cart";
import type {
  StorefrontCatalog,
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
  primaryImage: null,
  productCode: "TEE",
  slug: "everyday-tee",
  variants: [variant],
} satisfies StorefrontProduct;

function catalog(
  currentVariant: StorefrontVariant = variant,
): StorefrontCatalog {
  return {
    categories: [],
    collections: [],
    hasMore: false,
    page: 1,
    pageSize: 24,
    products: [{ ...product, variants: [currentVariant] }],
  };
}

describe("guest storefront cart", () => {
  it("adds and increments only the selected available variant", () => {
    const first = addToCart([], variant);
    expect(first).toEqual([{ productVariantId: variant.id, quantity: 1 }]);
    expect(addToCart(first, variant)[0]?.quantity).toBe(2);
    expect(addToCart([], { ...variant, availability: "OUT_OF_STOCK" })).toEqual(
      [],
    );
  });

  it("persists only versioned variant IDs and quantities", () => {
    let value = "";
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    };
    writeCart(storage, [
      {
        productVariantId: variant.id,
        quantity: 2,
        unitPriceMinor: 1,
        productName: "Fake",
      } as never,
    ]);
    expect(JSON.parse(value)).toEqual({
      lines: [{ productVariantId: variant.id, quantity: 2 }],
      version: 1,
    });
    expect(readCart(storage)).toEqual([
      { productVariantId: variant.id, quantity: 2 },
    ]);
  });

  it("reads legacy carts but discards stale and tampered metadata", () => {
    const storage = {
      getItem: () =>
        JSON.stringify([
          {
            productName: "Fake",
            productVariantId: variant.id,
            quantity: 1,
            unitPriceMinor: 1,
          },
        ]),
    };
    expect(readCart(storage)).toEqual([
      { productVariantId: variant.id, quantity: 1 },
    ]);
  });

  it("hydrates current server metadata and price, never legacy values", () => {
    const current = hydrateCart(
      [{ productVariantId: variant.id, quantity: 1 }],
      catalog({ ...variant, sellingPriceMinor: 139900 }),
    );
    expect(current.lines[0]).toMatchObject({
      productName: "Everyday Tee",
      sku: "TEE-BLK-M",
      unitPriceMinor: 139900,
    });
  });

  it("hydrates variant imagery from the current catalog without persisting it", () => {
    const mediaProduct: StorefrontProduct = {
      ...product,
      media: [
        {
          altText: "Everyday Tee in black",
          assetId: "asset-1",
          byteSize: 128,
          contentType: "image/webp",
          linkId: "link-1",
          productVariantId: variant.id,
          role: "GALLERY",
          sortOrder: 1,
          url: "https://cdn.senvo.test/tee-black.webp",
        },
      ],
    };
    const hydrated = hydrateCart(
      [{ productVariantId: variant.id, quantity: 1 }],
      { ...catalog(), products: [mediaProduct] },
    );
    expect(hydrated.lines[0]).toMatchObject({
      imageAlt: "Everyday Tee in black",
      imageUrl: "https://cdn.senvo.test/tee-black.webp",
    });
  });

  it("preserves missing selections as unavailable instead of deleting them", () => {
    const selection = { productVariantId: variant.id, quantity: 1 };
    const hydrated = hydrateCart([selection], {
      ...catalog(),
      products: [],
    });
    expect(hydrated.lines).toEqual([]);
    expect(hydrated.unavailable).toEqual([selection]);
    expect(canContinueToCheckout("ready", hydrated)).toBe(false);
  });

  it("preserves the selection when current catalog hydration fails", async () => {
    const stored = JSON.stringify({
      lines: [{ productVariantId: variant.id, quantity: 2 }],
      version: 1,
    });
    const storage = { getItem: () => stored };
    await expect(
      hydrateStoredCart(storage, () =>
        Promise.reject(new Error("Catalog unavailable")),
      ),
    ).rejects.toThrow("Catalog unavailable");
    expect(readCart(storage)).toEqual([
      { productVariantId: variant.id, quantity: 2 },
    ]);
  });

  it("allows checkout only after successful complete hydration", () => {
    const hydrated = hydrateCart(
      [{ productVariantId: variant.id, quantity: 1 }],
      catalog(),
    );
    expect(canContinueToCheckout("loading", hydrated)).toBe(false);
    expect(canContinueToCheckout("error", hydrated)).toBe(false);
    expect(canContinueToCheckout("ready", hydrated)).toBe(true);
    expect(canSubmitCheckout("loading", hydrated, false)).toBe(false);
    expect(canSubmitCheckout("unavailable", hydrated, false)).toBe(false);
    expect(canSubmitCheckout("ready", hydrated, true)).toBe(false);
    expect(canSubmitCheckout("ready", hydrated, false)).toBe(true);
    expect(checkoutPriceRefreshMessage).toContain(
      "refreshed with current prices",
    );
  });
});
