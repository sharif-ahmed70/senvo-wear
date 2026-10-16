import type {
  ProductContract,
  ProductDetailsContract,
  ProductVariantContract,
} from "@senvo/contracts";
import type * as React from "react";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminApiClient } from "../_lib/api-client";
import { VariantPriceEditor } from "./products/_components/product-inventory-detail";
import {
  VariantsStep,
  ReviewStep,
  validateStep,
} from "./products/_components/product-create-wizard";
import { ProductFields, submitProduct } from "./_components/catalog-workspace";
import { ProductCard } from "./_components/catalog-overview";

// Exercise the component's event handlers with persistent hook state, without a browser dependency.
const hooks = vi.hoisted(() => ({
  enabled: false,
  cursor: 0,
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  refCursor: 0,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.enabled) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.states))
        hooks.states[index] =
          typeof initial === "function"
            ? (initial as () => unknown)()
            : initial;
      return [
        hooks.states[index],
        (value: unknown) => {
          hooks.states[index] =
            typeof value === "function"
              ? (value as (old: unknown) => unknown)(hooks.states[index])
              : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      if (!hooks.enabled) return actual.useRef(initial);
      const index = hooks.refCursor++;
      return hooks.refs[index] ?? (hooks.refs[index] = { current: initial });
    },
  };
});
afterEach(() => {
  hooks.enabled = false;
  hooks.states = [];
  hooks.refs = [];
  vi.restoreAllMocks();
});
const variant = {
  id: "10000000-0000-4000-8000-000000000001",
  organizationId: "10000000-0000-4000-8000-000000000002",
  productId: "10000000-0000-4000-8000-000000000003",
  colorId: "color",
  sizeId: "size",
  sku: "SHIRT-BLACK-M",
  sellingPriceMinor: 0,
  status: "ACTIVE" as const,
  createdAt: "2026-09-26T00:00:00Z",
  updatedAt: "2026-09-26T00:00:00Z",
};
const draft = {
  id: "draft",
  colorId: "color",
  sizeId: "size",
  sku: variant.sku,
  sellingPrice: "125.50",
};
const basics = {
  name: "Shirt",
  productCode: "SHIRT",
  categoryId: "category",
  collectionId: "",
  description: "",
  status: "DRAFT" as const,
};
const references = { categories: [], collections: [], colors: [], sizes: [] };
type NodeProps = {
  children?: ReactNode;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => void;
  disabled?: boolean;
  "aria-label"?: string;
};
function nodes(node: ReactNode): ReactElement<NodeProps>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<NodeProps>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function editor(onSaved: (value: ProductVariantContract) => void) {
  hooks.cursor = 0;
  hooks.refCursor = 0;
  return VariantPriceEditor({ variant, canUpdate: true, onSaved });
}
function startEdit(onSaved: (value: ProductVariantContract) => void) {
  hooks.enabled = true;
  nodes(editor(onSaved)).find((node) => node.type === "button")!.props
    .onClick!();
  nodes(editor(onSaved)).find((node) => node.type === "input")!.props.onChange!(
    { target: { value: "125.50" } },
  );
}
function submit(onSaved: (value: ProductVariantContract) => void) {
  nodes(editor(onSaved)).find((node) => node.type === "form")!.props.onSubmit!({
    preventDefault: vi.fn(),
  });
}

describe("catalog variant pricing UI", () => {
  it("collects a wizard price and requires it before Review", () => {
    const setVariants = vi.fn();
    const tree = VariantsStep({ references, variants: [draft], setVariants });
    const price = nodes(tree).find(
      (node) => node.props["aria-label"] === "Selling price for variant 1",
    )!;
    price.props.onChange!({ target: { value: "200.25" } });
    expect(setVariants).toHaveBeenCalledWith([
      { ...draft, sellingPrice: "200.25" },
    ]);
    expect(
      validateStep(3, basics, [{ ...draft, sellingPrice: "" }], []),
    ).toContain("positive selling price");
    expect(validateStep(3, basics, [draft], [])).toBe("");
  });
  it("shows price and SKU in Review", () => {
    const html = renderToStaticMarkup(
      <ReviewStep
        basics={basics}
        variants={[draft]}
        media={[]}
        categoryMap={new Map()}
        collectionMap={new Map()}
        colorMap={new Map()}
        sizeMap={new Map()}
      />,
    );
    expect(html).toContain("125.50");
    expect(html).toContain(variant.sku);
  });
  it("requires price before alternate creation and sends minor units", async () => {
    expect(renderToStaticMarkup(<ProductFields {...references} />)).toContain(
      'name="sellingPrice"',
    );
    const form = new FormData();
    for (const [key, value] of Object.entries({
      categoryId: "category",
      productCode: "SHIRT",
      colorId: "color",
      sizeId: "size",
      sku: variant.sku,
    }))
      form.set(key, value);
    const createProduct = vi
      .spyOn(AdminApiClient.prototype, "createProduct")
      .mockResolvedValue({ data: { id: variant.productId } } as Awaited<
        ReturnType<AdminApiClient["createProduct"]>
      >);
    const createVariant = vi
      .spyOn(AdminApiClient.prototype, "createVariant")
      .mockResolvedValue({ data: variant, requestId: "test" });
    const error = vi.fn();
    await submitProduct(form, "Shirt", vi.fn(), error);
    expect(createProduct).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("positive selling price"),
    );
    form.set("sellingPrice", "125.50");
    await submitProduct(form, "Shirt", vi.fn(), error);
    expect(createVariant).toHaveBeenCalledWith(
      expect.objectContaining({ sellingPriceMinor: 12550 }),
    );
  });
  it("displays zero for review and hides editing without UPDATE", () => {
    const html = renderToStaticMarkup(
      <VariantPriceEditor
        variant={variant}
        canUpdate={false}
        onSaved={vi.fn()}
      />,
    );
    expect(html).toContain("0.00 - Review price");
    expect(html).not.toContain("Edit price");
  });
  it("edits with the original price and prevents concurrent submissions", async () => {
    let resolve!: (
      value: Awaited<ReturnType<AdminApiClient["updateVariantPrice"]>>,
    ) => void;
    const request = new Promise<
      Awaited<ReturnType<AdminApiClient["updateVariantPrice"]>>
    >((done) => {
      resolve = done;
    });
    const update = vi
      .spyOn(AdminApiClient.prototype, "updateVariantPrice")
      .mockReturnValue(request);
    const onSaved = vi.fn();
    startEdit(onSaved);
    submit(onSaved);
    submit(onSaved);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      variantId: variant.id,
      expectedSellingPriceMinor: 0,
      sellingPriceMinor: 12550,
    });
    expect(
      nodes(editor(onSaved))
        .filter((node) => node.type === "button")
        .every((node) => node.props.disabled),
    ).toBe(true);
    resolve({
      data: { ...variant, sellingPriceMinor: 12550 },
      requestId: "test",
    });
    await request;
    await Promise.resolve();
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ sellingPriceMinor: 12550 }),
    );
    expect(nodes(editor(onSaved)).some((node) => node.type === "form")).toBe(
      false,
    );
  });
  it("retains the expected price after a failed save", async () => {
    const update = vi
      .spyOn(AdminApiClient.prototype, "updateVariantPrice")
      .mockRejectedValue(new Error("conflict"));
    const onSaved = vi.fn();
    startEdit(onSaved);
    submit(onSaved);
    await Promise.resolve();
    await Promise.resolve();
    expect(onSaved).not.toHaveBeenCalled();
    submit(onSaved);
    await Promise.resolve();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedSellingPriceMinor: 0 }),
    );
  });
});

const mockProduct: ProductContract = {
  categoryId: "cat-1",
  createdAt: new Date().toISOString(),
  description: "Test description",
  id: "prod-1",
  name: "Panjabi Special",
  organizationId: "org-1",
  productCode: "PANJ-001",
  slug: "panjabi-special",
  status: "ACTIVE",
  updatedAt: new Date().toISOString(),
};

const mockColors = new Map([
  ["col-1", { hexValue: "#000000", id: "col-1", name: "Black" }],
  ["col-2", { hexValue: "#000080", id: "col-2", name: "Navy Blue" }],
]);

const mockSizes = new Map([
  ["sz-1", { id: "sz-1", name: "M" }],
  ["sz-2", { id: "sz-2", name: "L" }],
]);

function createCardDetail(overrides?: {
  sellingPriceMinor1?: number;
  sellingPriceMinor2?: number;
  totalAvailableStock?: number;
}) {
  const variants: ProductVariantContract[] = [
    {
      colorId: "col-1",
      createdAt: new Date().toISOString(),
      id: "var-1",
      organizationId: "org-1",
      productId: "prod-1",
      sellingPriceMinor: overrides?.sellingPriceMinor1 ?? 85000,
      sizeId: "sz-1",
      sku: "PANJ-BLK-M",
      status: "ACTIVE",
      updatedAt: new Date().toISOString(),
    },
    {
      colorId: "col-2",
      createdAt: new Date().toISOString(),
      id: "var-2",
      organizationId: "org-1",
      productId: "prod-1",
      sellingPriceMinor: overrides?.sellingPriceMinor2 ?? 95000,
      sizeId: "sz-2",
      sku: "PANJ-NAV-L",
      status: "ACTIVE",
      updatedAt: new Date().toISOString(),
    },
  ];

  const details: ProductDetailsContract = {
    collectionIds: [],
    primaryImage: {
      altText: "Panjabi Front",
      assetId: "asset-1",
      byteSize: 1024,
      contentType: "image/jpeg",
      url: "https://example.com/panjabi.jpg",
    },
    product: mockProduct,
    variants,
  };

  return {
    barcodeVariantCount: 2,
    details,
    totalAvailableStock: overrides?.totalAvailableStock ?? 25,
  };
}

describe("ProductCard", () => {
  it("renders product name, category, and code", () => {
    const detail = createCardDetail();
    const html = renderToStaticMarkup(
      <ProductCard
        category="Panjabi Collection"
        colorMap={mockColors}
        detail={detail}
        product={mockProduct}
        sizeMap={mockSizes}
      />,
    );

    expect(html).toContain("Panjabi Special");
    expect(html).toContain("Panjabi Collection");
    expect(html).toContain("PANJ-001");
  });

  it("renders formatted selling price range when prices differ", () => {
    const detail = createCardDetail();
    const html = renderToStaticMarkup(
      <ProductCard
        category="Panjabi"
        colorMap={mockColors}
        detail={detail}
        product={mockProduct}
        sizeMap={mockSizes}
      />,
    );

    expect(html).toContain("৳850");
    expect(html).toContain("৳950");
  });

  it("renders single selling price when all variants share the same price", () => {
    const detail = createCardDetail({ sellingPriceMinor2: 85000 });
    const html = renderToStaticMarkup(
      <ProductCard
        category="Panjabi"
        colorMap={mockColors}
        detail={detail}
        product={mockProduct}
        sizeMap={mockSizes}
      />,
    );

    expect(html).toContain("৳850");
    expect(html).not.toContain("৳950");
  });

  it("renders in-stock badge (>10 pcs)", () => {
    const detail = createCardDetail({ totalAvailableStock: 50 });
    const html = renderToStaticMarkup(
      <ProductCard
        category="Panjabi"
        colorMap={mockColors}
        detail={detail}
        product={mockProduct}
        sizeMap={mockSizes}
      />,
    );

    expect(html).toContain("50 পিস স্টকে");
  });

  it("renders low stock badge (1-10 pcs)", () => {
    const detail = createCardDetail({ totalAvailableStock: 4 });
    const html = renderToStaticMarkup(
      <ProductCard
        category="Panjabi"
        colorMap={mockColors}
        detail={detail}
        product={mockProduct}
        sizeMap={mockSizes}
      />,
    );

    expect(html).toContain("মাত্র 4 পিস বাকি");
  });

  it("renders out of stock badge (0 pcs)", () => {
    const detail = createCardDetail({ totalAvailableStock: 0 });
    const html = renderToStaticMarkup(
      <ProductCard
        category="Panjabi"
        colorMap={mockColors}
        detail={detail}
        product={mockProduct}
        sizeMap={mockSizes}
      />,
    );

    expect(html).toContain("স্টক খালি (0 পিস)");
  });

  it("renders colors and sizes", () => {
    const detail = createCardDetail();
    const html = renderToStaticMarkup(
      <ProductCard
        category="Panjabi"
        colorMap={mockColors}
        detail={detail}
        product={mockProduct}
        sizeMap={mockSizes}
      />,
    );

    expect(html).toContain("Black");
    expect(html).toContain("Navy Blue");
    expect(html).toContain("M");
    expect(html).toContain("L");
  });

  it("shows Add Stock button when canAddStock is true", () => {
    const detail = createCardDetail();
    const html = renderToStaticMarkup(
      <ProductCard
        canAddStock={true}
        category="Panjabi"
        colorMap={mockColors}
        detail={detail}
        product={mockProduct}
        sizeMap={mockSizes}
      />,
    );

    expect(html).toContain("+ মাল ঢুকান (Add Stock)");
    expect(html).toContain("/inventory/receive?productId=prod-1");
  });

  it("hides Add Stock button when canAddStock is false", () => {
    const detail = createCardDetail();
    const html = renderToStaticMarkup(
      <ProductCard
        canAddStock={false}
        category="Panjabi"
        colorMap={mockColors}
        detail={detail}
        product={mockProduct}
        sizeMap={mockSizes}
      />,
    );

    expect(html).not.toContain("+ মাল ঢুকান (Add Stock)");
  });
});
