import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogWorkspace } from "./_components/catalog-workspace";
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
});
