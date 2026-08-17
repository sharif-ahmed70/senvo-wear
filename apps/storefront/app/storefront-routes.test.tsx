import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogWorkspace, ProductCard } from "./_components/catalog-workspace";
import { CartWorkspace } from "./_components/cart-workspace";
import { CheckoutWorkspace } from "./_components/checkout-workspace";
import { OrderSuccess } from "./_components/order-success";
import type { StorefrontProduct } from "./_lib/storefront-api";
import { mediaForVariant } from "./_components/product-workspace";

const product: StorefrontProduct = {
  category: { code: "SHIRTS", id: "category-1", name: "Shirts" },
  collection: null,
  description: "Everyday oxford shirt",
  id: "product-1",
  name: "Oxford Shirt",
  primaryImage: null,
  productCode: "OXFORD",
  slug: "oxford-shirt",
  variants: [
    {
      availability: "IN_STOCK",
      color: { code: "NAVY", hexValue: "#000080", name: "Navy" },
      id: "variant-1",
      sellingPriceMinor: 250000,
      size: { code: "M", name: "Medium", sortOrder: 1 },
      sku: "OXFORD-NAVY-M",
    },
  ],
};

describe("storefront route states", () => {
  it("uses variant imagery with product fallback and removes duplicate assets", () => {
    const base = {
      altText: "Product front",
      byteSize: 8,
      contentType: "image/png",
      role: "GALLERY" as const,
      sortOrder: 1,
      url: "data:image/png;base64,iVBORw0KGgo=",
    };
    const media = [
      {
        ...base,
        assetId: "asset-product",
        linkId: "link-product",
        productVariantId: null,
      },
      {
        ...base,
        assetId: "asset-variant",
        linkId: "link-variant",
        productVariantId: "variant-1",
      },
      {
        ...base,
        assetId: "asset-variant",
        linkId: "link-variant-duplicate",
        productVariantId: "variant-1",
      },
    ];
    expect(
      mediaForVariant(media, "variant-1").map((item) => item.linkId),
    ).toEqual(["link-variant"]);
    expect(
      mediaForVariant(media, "variant-2").map((item) => item.linkId),
    ).toEqual(["link-product"]);
  });
  it("renders a published primary product image with accessible alternative text", () => {
    const html = renderToStaticMarkup(
      createElement(ProductCard, {
        product: {
          ...product,
          primaryImage: {
            altText: "Navy oxford shirt",
            assetId: "asset-1",
            byteSize: 8,
            contentType: "image/png",
            url: "data:image/png;base64,iVBORw0KGgo=",
          },
        },
      }),
    );
    expect(html).toContain('alt="Navy oxford shirt"');
    expect(html).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  it("renders the category fallback when a product has no primary image", () => {
    const html = renderToStaticMarkup(createElement(ProductCard, { product }));
    expect(html).toContain("Shirts");
    expect(html).not.toContain("<img");
  });

  it("renders customer discovery controls and an accessible loading state", () => {
    const html = renderToStaticMarkup(createElement(CatalogWorkspace));
    expect(html).toContain("Search products");
    expect(html).toContain("Filter by category");
    expect(html).toContain("Loading products");
  });

  it("keeps COD collection wording on the confirmation screen", () => {
    const html = renderToStaticMarkup(createElement(OrderSuccess));
    expect(html).toContain("Order received");
    expect(html).toContain("Payment will be collected during delivery.");
    expect(html).toContain("Continue shopping");
  });

  it("does not expose cart prices or checkout navigation before hydration", () => {
    const html = renderToStaticMarkup(createElement(CartWorkspace));
    expect(html).toContain("Refreshing your bag");
    expect(html).not.toContain("Continue to checkout");
    expect(html).not.toContain("Order summary");
  });

  it("does not expose final checkout submission before hydration", () => {
    const html = renderToStaticMarkup(createElement(CheckoutWorkspace));
    expect(html).toContain("Refreshing your order");
    expect(html).not.toContain("Place order");
    expect(html).not.toContain("Delivery details");
  });
});
