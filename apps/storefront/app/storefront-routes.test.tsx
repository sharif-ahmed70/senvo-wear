import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogWorkspace } from "./_components/catalog-workspace";
import { CartWorkspace } from "./_components/cart-workspace";
import { CheckoutWorkspace } from "./_components/checkout-workspace";
import { OrderSuccess } from "./_components/order-success";

describe("storefront route states", () => {
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
