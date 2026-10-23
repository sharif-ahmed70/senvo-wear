import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { ProductVariantContract } from "@senvo/contracts";
import { VariantLifecycleActions } from "./products/_components/variant-lifecycle-actions";

const variant: ProductVariantContract = {
  colorId: "10000000-0000-4000-8000-000000000001",
  createdAt: new Date(0).toISOString(),
  id: "10000000-0000-4000-8000-000000000002",
  organizationId: "10000000-0000-4000-8000-000000000003",
  productId: "10000000-0000-4000-8000-000000000004",
  sellingPriceMinor: 120000,
  sizeId: "10000000-0000-4000-8000-000000000005",
  sku: "TEE-BLK-M",
  status: "ACTIVE",
  updatedAt: new Date(0).toISOString(),
};
const render = (
  props: Partial<Parameters<typeof VariantLifecycleActions>[0]>,
) =>
  renderToStaticMarkup(
    <VariantLifecycleActions
      variant={variant}
      canUpdate={false}
      canDelete={false}
      onSaved={() => {}}
      onDeleted={() => {}}
      {...props}
    />,
  );

it("shows nothing without catalog update or owner access", () => {
  expect(render({})).toBe("");
});

it("offers Archive for an active option and Restore for an archived one", () => {
  expect(render({ canUpdate: true })).toContain(">Archive</button>");
  expect(
    render({ canUpdate: true, variant: { ...variant, status: "ARCHIVED" } }),
  ).toContain(">Restore</button>");
});

it("shows Delete only to the owner", () => {
  expect(render({ canUpdate: true })).not.toContain(">Delete</button>");
  expect(render({ canUpdate: true, canDelete: true })).toContain(
    'aria-label="Delete TEE-BLK-M"',
  );
});
