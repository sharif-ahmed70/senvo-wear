import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { ProductContract } from "@senvo/contracts";
import { ProductLifecycleActions } from "./products/_components/product-lifecycle-actions";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const product: ProductContract = {
  id: "10000000-0000-4000-8000-000000000001",
  organizationId: "10000000-0000-4000-8000-000000000002",
  categoryId: "10000000-0000-4000-8000-000000000003",
  name: "Product",
  description: null,
  slug: "product",
  productCode: "PRODUCT",
  status: "ACTIVE",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};
it("hides lifecycle actions without permission", () => {
  const html = renderToStaticMarkup(
    <ProductLifecycleActions
      product={product}
      permissions={["CATALOG:READ"]}
      onSaved={() => {}}
    />,
  );
  expect(html).not.toContain("<button");
});
it("shows update actions and disables delete until its authoritative history check completes", () => {
  const html = renderToStaticMarkup(
    <ProductLifecycleActions
      product={product}
      permissions={["CATALOG:UPDATE", "CATALOG:DELETE"]}
      onSaved={() => {}}
    />,
  );
  expect(html).toContain(">Edit</button>");
  expect(html).toContain(">Archive</button>");
  expect(html).toMatch(/disabled=""[^>]*>Delete/);
  expect(html).toContain("Checking product history");
});
it("offers Restore for an archived product", () => {
  const html = renderToStaticMarkup(
    <ProductLifecycleActions
      product={{ ...product, status: "ARCHIVED" }}
      permissions={["CATALOG:UPDATE"]}
      onSaved={() => {}}
    />,
  );
  expect(html).toContain(">Restore</button>");
  expect(html).not.toContain(">Delete</button>");
});
