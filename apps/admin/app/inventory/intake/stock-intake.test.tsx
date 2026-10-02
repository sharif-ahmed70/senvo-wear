import {
  createStockIntakeServiceInputSchema,
  type CategoryContract,
  type ProductInventorySummaryContract,
  type ProductVariantContract,
  type SizeContract,
  type StockIntakeContract,
} from "@senvo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../../_lib/api-client";
import { IntakeSuccess } from "./_components/intake-success";
import { labelCopies } from "./_components/intake-barcode-labels";
import { StockIntakeWizard } from "./_components/stock-intake-wizard";
import type { IntakeReferences } from "./_components/intake-parts";
import {
  calculateProfit,
  formatTaka,
  parseTaka,
  takaToPoisha,
  transportPerPieceMinor,
} from "./_lib/currency-math";
import {
  applyRowToSameSize,
  blankPrices,
  blankPurchase,
  buildNewProductPayload,
  buildRestockPayload,
  keyAfterAttempt,
  linesFromGrid,
  rowProfitMinor,
  setPriceForAll,
  setRowPrice,
  summarizeIntake,
  validatePriceStep,
  validateProductStep,
  validateQuantityStep,
  variantKey,
  type ExistingVariant,
  type PriceDraft,
  type PurchaseDraft,
  type QuantityGrid,
} from "./_lib/intake-draft";
import {
  audienceOptions,
  canRecordStockIntake,
  intakeErrorMessage,
  OWNER_ONLY_MESSAGE,
  typeOptions,
} from "./_lib/intake-support";
import { restockSetupFrom } from "./_lib/restock";
import { SIZE_PRESETS, sizePresetFor } from "./_lib/size-presets";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inventory/intake",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const VARIANT_BLACK_M = "44444444-4444-4444-8444-444444444444";
const VARIANT_BLACK_L = "55555555-5555-4555-8555-555555555555";
const KEY = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

function grid(
  colors: Array<[string, string, Record<string, string>]>,
  sizes: string[],
): QuantityGrid {
  return {
    colors: colors.map(([id, name, quantities]) => ({ id, name, quantities })),
    sizes,
    sizesCustomized: false,
  };
}

function purchase(patch: Partial<PurchaseDraft> = {}): PurchaseDraft {
  return {
    ...blankPurchase([LOCATION_ID], "2026-10-02"),
    supplierMode: "none",
    ...patch,
  };
}

const twoColorGrid = grid(
  [
    ["c1", "Black", { M: "3", L: "2", S: "" }],
    ["c2", "Navy", { M: "4", L: "0" }],
  ],
  ["S", "M", "L"],
);

const prices: PriceDraft = {
  ...blankPrices,
  costAll: "250",
  sellAll: "450",
};

describe("currency-math", () => {
  it("converts taka to poisha without floats, Bangla digits included", () => {
    expect(takaToPoisha("100")).toBe(10000);
    expect(takaToPoisha("100.5")).toBe(10050);
    expect(takaToPoisha("100.05")).toBe(10005);
    expect(takaToPoisha("1,000.50")).toBe(100050);
    expect(takaToPoisha("১২৫০")).toBe(125000);
    expect(parseTaka("0.1")).toBe(10);
    expect(parseTaka("-5")).toBeNull();
    expect(parseTaka("1.234")).toBeNull();
    expect(parseTaka("")).toBeNull();
    expect(() => takaToPoisha("abc")).toThrow();
  });

  it("formats poisha as taka with lakh grouping", () => {
    expect(formatTaka(125000)).toBe("৳1,250");
    expect(formatTaka("12345678905")).toBe("৳12,34,56,789.05");
    expect(formatTaka(-1050n)).toBe("−৳10.50");
  });

  it("calculates profit per piece including transport", () => {
    expect(calculateProfit("100", "50", "10")).toBe(4000);
    expect(calculateProfit("100", "50", "")).toBe(5000);
    expect(transportPerPieceMinor(100000, 3)).toBe(33333);
    expect(transportPerPieceMinor(0, 3)).toBe(0);
  });
});

describe("size presets", () => {
  it.each([
    ["T-shirt", "Men", SIZE_PRESETS.top],
    ["Shirt", "Men", SIZE_PRESETS.top],
    ["Kamiz", "Women", SIZE_PRESETS.top],
    ["Tops", "Women", SIZE_PRESETS.top],
    ["Pant", "Men", ["28", "30", "32", "34", "36"]],
    ["Jeans", "Men", SIZE_PRESETS.pant],
    ["Panjabi", "Men", ["38", "40", "42", "44", "46"]],
    ["Shorts", "Men", ["S", "M", "L", "XL"]],
    ["Saree", "Women", ["Free Size"]],
    ["T-shirt", "Kids", ["2Y", "4Y", "6Y", "8Y", "10Y"]],
    ["Panjabi", "Kids", SIZE_PRESETS.kids],
    ["Hoodie", "Men", ["S", "M", "L", "XL", "XXL"]],
  ])("%s for %s", (type, audience, expected) => {
    expect(sizePresetFor(type, audience)).toEqual([...expected]);
  });

  it("returns a fresh array each time", () => {
    const first = sizePresetFor("Shirt");
    first.push("XXXL");
    expect(sizePresetFor("Shirt")).not.toContain("XXXL");
  });
});

describe("grid, prices and profit", () => {
  it("creates lines only for boxes above zero", () => {
    const lines = linesFromGrid(twoColorGrid);
    expect(
      lines.map(
        (line) => `${line.colorName}/${line.sizeName}x${line.quantity}`,
      ),
    ).toEqual(["Black/Mx3", "Black/Lx2", "Navy/Mx4"]);
  });

  it("fills all rows, marks an edited row, and copies it to the same size", () => {
    const lines = linesFromGrid(twoColorGrid);
    const blackM = lines[0]!;
    let draft = setRowPrice(prices, blackM.key, "sell", "500");
    expect(rowProfitMinor(blackM, draft, 0)).toBe(25000);
    draft = applyRowToSameSize(draft, lines, blackM);
    const navyM = lines[2]!;
    expect(rowProfitMinor(navyM, draft, 1000)).toBe(24000);
    // Typing into "সবগুলোতে" again clears per-row selling prices.
    draft = setPriceForAll(draft, "sell", "480");
    expect(draft.overrides[blackM.key]?.sell).toBeUndefined();
    expect(draft.overrides[blackM.key]?.cost).toBe("250");
  });

  it("summarizes totals, payable and due", () => {
    const lines = linesFromGrid(twoColorGrid);
    const totals = summarizeIntake(
      lines,
      prices,
      purchase({ paid: "1000", transport: "90" }),
    );
    expect(totals.pieces).toBe(9);
    expect(totals.colorCount).toBe(2);
    expect(totals.goodsMinor).toBe(225000n);
    expect(totals.totalCostMinor).toBe(234000n);
    expect(totals.sellTotalMinor).toBe(405000n);
    expect(totals.profitMinor).toBe(171000n);
    expect(totals.payableMinor).toBe(225000n);
    expect(totals.supplierDueMinor).toBe(125000n);
    expect(totals.transportPerPieceMinor).toBe(1000);

    const paidToSupplier = summarizeIntake(
      lines,
      prices,
      purchase({ transport: "90", transportPaidToSupplier: true }),
    );
    expect(paidToSupplier.payableMinor).toBe(234000n);
  });
});

describe("payload builder", () => {
  const product = {
    audience: " Men ",
    description: "",
    name: "  Cotton   Panjabi ",
    status: "ACTIVE" as const,
    type: "Panjabi",
  };

  it("builds a new-product intake with no supplier", () => {
    const payload = buildNewProductPayload({
      idempotencyKey: KEY,
      lines: linesFromGrid(twoColorGrid),
      prices,
      product,
      purchase: purchase({ memoNumber: " ১২৩ ", paid: "500", transport: "" }),
    });
    expect(createStockIntakeServiceInputSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload).toEqual({
      idempotencyKey: KEY,
      lines: [
        {
          colorName: "Black",
          quantity: 3,
          sellingPriceMinor: 45000,
          sizeName: "M",
          unitCostMinor: 25000,
        },
        {
          colorName: "Black",
          quantity: 2,
          sellingPriceMinor: 45000,
          sizeName: "L",
          unitCostMinor: 25000,
        },
        {
          colorName: "Navy",
          quantity: 4,
          sellingPriceMinor: 45000,
          sizeName: "M",
          unitCostMinor: 25000,
        },
      ],
      payment: { amountMinor: 50000, method: "CASH" },
      product: {
        audienceCategoryName: "Men",
        name: "Cotton Panjabi",
        status: "ACTIVE",
        typeCategoryName: "Panjabi",
      },
      purchase: {
        destinationLocationId: LOCATION_ID,
        memoNumber: "১২৩",
        purchaseDate: "2026-10-02",
      },
      supplier: null,
      transportCostMinor: 0,
      transportPaidToSupplier: false,
    });
  });

  it("sends a new supplier and the transport flag", () => {
    const payload = buildNewProductPayload({
      idempotencyKey: KEY,
      lines: linesFromGrid(twoColorGrid),
      prices,
      product: { ...product, description: "Soft cotton" },
      purchase: purchase({
        method: "MOBILE_BANKING",
        newSupplier: {
          address: "",
          name: " Rahim  Traders ",
          phone: "01711-000000",
        },
        note: "Eid lot",
        supplierMode: "new",
        transport: "120.50",
        transportPaidToSupplier: true,
      }),
    });
    expect(createStockIntakeServiceInputSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.supplier).toEqual({
      new: { name: "Rahim Traders", phone: "01711-000000" },
    });
    expect(payload.transportCostMinor).toBe(12050);
    expect(payload.transportPaidToSupplier).toBe(true);
    expect(payload.payment).toBeNull();
    expect(payload.purchase.note).toBe("Eid lot");
    expect(payload.product).toMatchObject({ description: "Soft cotton" });
  });

  it("sends an existing supplier with only the changed details", () => {
    const selected = {
      address: "Gulistan",
      id: SUPPLIER_ID,
      name: "Karim",
      phone: "01811",
    };
    const base = {
      existingSupplier: selected,
      supplierMode: "existing" as const,
    };
    const build = (patch: Partial<PurchaseDraft>) =>
      buildNewProductPayload({
        idempotencyKey: KEY,
        lines: linesFromGrid(twoColorGrid),
        prices,
        product,
        purchase: purchase({ ...base, ...patch }),
      });

    expect(build({}).supplier).toEqual({ existingSupplierId: SUPPLIER_ID });
    expect(
      build({
        editSupplier: true,
        supplierAddress: "Gulistan",
        supplierPhone: "01811",
      }).supplier,
    ).toEqual({ existingSupplierId: SUPPLIER_ID });
    const updated = build({
      editSupplier: true,
      supplierAddress: "",
      supplierPhone: "01999",
    });
    expect(updated.supplier).toEqual({
      existingSupplierId: SUPPLIER_ID,
      updates: { address: null, phone: "01999" },
    });
    expect(createStockIntakeServiceInputSchema.safeParse(updated).success).toBe(
      true,
    );
  });

  it("builds a restock with existing variants and a new colour", () => {
    const existing = new Map<string, ExistingVariant>([
      [
        variantKey("Black", "M"),
        {
          colorName: "Black",
          onHand: 5,
          sellingPriceMinor: 45000,
          sizeName: "M",
          variantId: VARIANT_BLACK_M,
        },
      ],
      [
        variantKey("Black", "L"),
        {
          colorName: "Black",
          onHand: 1,
          sellingPriceMinor: 45000,
          sizeName: "L",
          variantId: VARIANT_BLACK_L,
        },
      ],
    ]);
    const restockGrid = grid(
      [
        ["existing:black", "Black", { M: "6", L: "2" }],
        ["n1", "Olive", { M: "3" }],
      ],
      ["M", "L"],
    );
    const lines = linesFromGrid(restockGrid, existing);
    let draft: PriceDraft = { ...blankPrices, costAll: "260" };
    draft = setRowPrice(draft, lines[1]!.key, "sell", "480");
    draft = setRowPrice(draft, lines[2]!.key, "sell", "470");

    const payload = buildRestockPayload({
      idempotencyKey: KEY,
      lines,
      prices: draft,
      productId: PRODUCT_ID,
      purchase: purchase(),
    });
    expect(createStockIntakeServiceInputSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(payload.product).toEqual({ existingProductId: PRODUCT_ID });
    expect(payload.lines).toEqual([
      // Unchanged price: no sellingPriceMinor, so the old price stays.
      { existingVariantId: VARIANT_BLACK_M, quantity: 6, unitCostMinor: 26000 },
      {
        existingVariantId: VARIANT_BLACK_L,
        quantity: 2,
        sellingPriceMinor: 48000,
        unitCostMinor: 26000,
      },
      {
        colorName: "Olive",
        quantity: 3,
        sellingPriceMinor: 47000,
        sizeName: "M",
        unitCostMinor: 26000,
      },
    ]);
  });
});

describe("idempotency key", () => {
  it("is reused after a failed attempt and replaced after a save", () => {
    let counter = 0;
    const make = () => `key-${(counter += 1)}-abcdef`;
    const first = make();
    const afterNetworkError = keyAfterAttempt(first, "failed", make);
    expect(afterNetworkError).toBe(first);
    const afterSecondFailure = keyAfterAttempt(
      afterNetworkError,
      "failed",
      make,
    );
    expect(afterSecondFailure).toBe(first);
    const afterSave = keyAfterAttempt(afterSecondFailure, "saved", make);
    expect(afterSave).not.toBe(first);
  });
});

describe("step validation", () => {
  it("requires name, audience and type", () => {
    expect(
      validateProductStep({
        audience: "",
        description: "",
        name: " ",
        status: "ACTIVE",
        type: "",
      }),
    ).toEqual({
      audience: "কার জন্য — একটা বেছে নিন বা লিখুন।",
      name: "Product-এর নাম লিখুন।",
      type: "কী মাল — একটা বেছে নিন বা লিখুন।",
    });
    expect(
      validateProductStep({
        audience: "Men",
        description: "",
        name: "Polo",
        status: "ACTIVE",
        type: "T-shirt",
      }),
    ).toEqual({});
  });

  it("requires at least one piece, whole numbers and unique colours", () => {
    expect(
      validateQuantityStep(grid([["c1", "Black", {}]], ["M"])).pieces,
    ).toBeDefined();
    const errors = validateQuantityStep(
      grid(
        [
          ["c1", "Black", { M: "2.5" }],
          ["c2", " black ", { M: "1" }],
          ["c3", "", { M: "1" }],
        ],
        ["M"],
      ),
    );
    expect(errors["qty:c1:M"]).toBe("শুধু পুরো সংখ্যা।");
    expect(errors["color:c2"]).toBe("এই রং আগেই আছে।");
    expect(errors["color:c3"]).toBe("রঙের নাম লিখুন।");
    expect(validateQuantityStep(twoColorGrid)).toEqual({});
  });

  it("checks prices, supplier and payment limits", () => {
    const lines = linesFromGrid(twoColorGrid);
    const noPrices = validatePriceStep(lines, blankPrices, purchase());
    expect(noPrices[`cost:${lines[0]!.key}`]).toBe(
      "কেনা দাম লিখুন (০ বা বেশি)।",
    );
    expect(noPrices[`sell:${lines[0]!.key}`]).toBe(
      "বিক্রির দাম লিখুন (০-এর বেশি)।",
    );

    const zeroSell = validatePriceStep(
      lines,
      { ...prices, sellAll: "0", costAll: "0" },
      purchase(),
    );
    expect(zeroSell[`cost:${lines[0]!.key}`]).toBeUndefined();
    expect(zeroSell[`sell:${lines[0]!.key}`]).toBeDefined();

    const overpaid = validatePriceStep(
      lines,
      prices,
      purchase({ paid: "2250.01", transport: "100" }),
    );
    expect(overpaid.paid).toBe(
      "এই মালের জন্য Supplier-কে সর্বোচ্চ ৳2,250 দেওয়া যায়।",
    );
    expect(
      validatePriceStep(
        lines,
        prices,
        purchase({
          paid: "2350",
          transport: "100",
          transportPaidToSupplier: true,
        }),
      ).paid,
    ).toBeUndefined();

    expect(
      validatePriceStep(lines, prices, purchase({ supplierMode: "existing" }))
        .supplier,
    ).toBeDefined();
    const newSupplier = validatePriceStep(
      lines,
      prices,
      purchase({
        newSupplier: { address: "", name: "", phone: "abc" },
        supplierMode: "new",
      }),
    );
    expect(newSupplier.newSupplierName).toBeDefined();
    expect(newSupplier.newSupplierPhone).toBe(
      "Phone-এ শুধু সংখ্যা, +, -, ( ) দিন।",
    );
    expect(
      validatePriceStep(lines, prices, purchase({ locationId: "" })).locationId,
    ).toBeDefined();
    expect(validatePriceStep(lines, prices, purchase())).toEqual({});
  });

  it("lets restocked variants keep their old selling price", () => {
    const existing = new Map<string, ExistingVariant>([
      [
        variantKey("Black", "M"),
        {
          colorName: "Black",
          onHand: 5,
          sellingPriceMinor: 45000,
          sizeName: "M",
          variantId: VARIANT_BLACK_M,
        },
      ],
    ]);
    const lines = linesFromGrid(
      grid([["existing:black", "Black", { M: "2" }]], ["M"]),
      existing,
    );
    expect(
      validatePriceStep(lines, { ...blankPrices, costAll: "200" }, purchase()),
    ).toEqual({});
  });
});

describe("catalog helpers and permissions", () => {
  const category = (
    id: string,
    name: string,
    parentId: string | null,
  ): CategoryContract => ({
    createdAt: "2026-01-01T00:00:00.000Z",
    description: null,
    id,
    name,
    organizationId: "org",
    parentId,
    slug: name.toLowerCase(),
    sortOrder: 0,
    status: "ACTIVE",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const categories = [
    category("a", "Men", null),
    category("b", "Unisex", null),
    category("c", "Panjabi", "a"),
    category("d", "Shirt", "a"),
  ];

  it("offers Men/Women/Kids plus top-level categories, and audience children", () => {
    expect(audienceOptions(categories)).toEqual([
      "Men",
      "Women",
      "Kids",
      "Unisex",
    ]);
    expect(typeOptions(categories, "men")).toEqual(["Panjabi", "Shirt"]);
    expect(typeOptions(categories, "Women")).toEqual([]);
  });

  it("maps 403 to the Owner-only message and knows the needed permissions", () => {
    const forbidden = new AdminApiError({
      code: "AUTHORIZATION.FORBIDDEN",
      message: "Forbidden",
      requestId: "r1",
      status: 403,
    });
    expect(intakeErrorMessage(forbidden)).toBe(OWNER_ONLY_MESSAGE);
    expect(canRecordStockIntake(null)).toBe(true);
    expect(canRecordStockIntake(["INVENTORY:READ"])).toBe(false);
    expect(
      canRecordStockIntake([
        "CATALOG:CREATE",
        "CATALOG:UPDATE",
        "INVENTORY:CREATE",
        "INVENTORY:UPDATE",
        "PROCUREMENT:CREATE",
      ]),
    ).toBe(true);
  });
});

describe("restock setup", () => {
  it("lists active variants with stock, ordered by size", () => {
    const summaryVariant = (
      id: string,
      color: string,
      size: string,
      onHand: number,
    ) => ({
      availableToSell: onHand,
      locations: [],
      onHand,
      reserved: 0,
      variant: {
        color,
        id,
        productId: PRODUCT_ID,
        productName: "Polo",
        size,
        sku: `${color}-${size}`,
      },
    });
    const summary: ProductInventorySummaryContract = {
      availableToSell: 9,
      isLowStock: null,
      locations: [],
      lowStockThreshold: null,
      onHand: 9,
      product: { id: PRODUCT_ID, name: "Polo", productCode: "TS-0001" },
      reserved: 0,
      variants: [
        summaryVariant(VARIANT_BLACK_L, "Black", "L", 4),
        summaryVariant(VARIANT_BLACK_M, "Black", "M", 5),
        summaryVariant("66666666-6666-4666-8666-666666666666", "Red", "M", 0),
      ],
    };
    const catalogVariant = (
      id: string,
      status: ProductVariantContract["status"],
    ): ProductVariantContract => ({
      colorId: "x",
      createdAt: "2026-01-01T00:00:00.000Z",
      id,
      organizationId: "org",
      productId: PRODUCT_ID,
      sellingPriceMinor: 45000,
      sizeId: "y",
      sku: "sku",
      status,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const sizes = [
      { name: "M", sortOrder: 1 },
      { name: "L", sortOrder: 2 },
    ] as SizeContract[];
    const setup = restockSetupFrom(
      summary,
      [
        catalogVariant(VARIANT_BLACK_L, "ACTIVE"),
        catalogVariant(VARIANT_BLACK_M, "ACTIVE"),
        catalogVariant("66666666-6666-4666-8666-666666666666", "ARCHIVED"),
      ],
      sizes,
    );
    expect(setup.grid.sizes).toEqual(["M", "L"]);
    expect(setup.grid.colors.map((color) => color.name)).toEqual(["Black"]);
    expect(setup.existing.get(variantKey("black", "m"))?.onHand).toBe(5);
    expect(setup.existing.has(variantKey("Red", "M"))).toBe(false);
  });
});

const references: IntakeReferences = {
  categories: [],
  colors: [],
  locations: [],
  sizes: [],
  suppliers: [],
};

describe("StockIntakeWizard render", () => {
  it("shows both tabs, the first step and the piece badge", () => {
    const html = renderToStaticMarkup(
      <StockIntakeWizard initialReferences={references} />,
    );
    expect(html).toContain("নতুন মাল তুলুন");
    expect(html).toContain("নতুন Product");
    expect(html).toContain("পুরোনো মাল আবার এলো");
    expect(html).toContain("Product-এর তথ্য");
    expect(html).toContain("মোট 0 পিস · 0 টা রং");
    expect(html).toContain("Product code Save করলে তৈরি হবে");
    expect(html).toContain('role="tablist"');
  });

  it("warns staff without intake permission", () => {
    const html = renderToStaticMarkup(
      <StockIntakeWizard
        initialReferences={references}
        permissions={["INVENTORY:READ"]}
      />,
    );
    expect(html).toContain(OWNER_ONLY_MESSAGE);
  });
});

describe("success screen", () => {
  const result: StockIntakeContract = {
    dueMinor: "125000",
    payment: {
      amountMinor: "100000",
      id: "77777777-7777-4777-8777-777777777777",
      method: "CASH",
    },
    product: { code: "PJ-0007", id: PRODUCT_ID, name: "Cotton Panjabi" },
    purchase: {
      id: "88888888-8888-4888-8888-888888888888",
      purchaseNumber: "PO-0012",
      totalCostMinor: "234000",
    },
    replayed: false,
    supplier: { id: SUPPLIER_ID, name: "Rahim Traders" },
    transportAppliedMinor: 8999,
    transportRequestedMinor: 9000,
    variants: [
      {
        barcode: "SV-1",
        color: "Black",
        id: VARIANT_BLACK_M,
        quantity: 3,
        sellingPriceMinor: 45000,
        size: "M",
        sku: "PJ-0007-BLK-M",
        unitCostMinor: 26000,
      },
      {
        barcode: null,
        color: "Black",
        id: VARIANT_BLACK_L,
        quantity: 2,
        sellingPriceMinor: 45000,
        size: "L",
        sku: "PJ-0007-BLK-L",
        unitCostMinor: 26000,
      },
    ],
  };

  it("shows pieces, totals, due and a transport adjustment note", () => {
    const html = renderToStaticMarkup(
      <IntakeSuccess
        onAnother={() => undefined}
        result={result}
        typedTransportMinor={9000}
      />,
    );
    expect(html).toContain("Cotton Panjabi — 5 পিস Stock-এ");
    expect(html).toContain("1 টা");
    expect(html).toContain("৳2,340");
    expect(html).toContain("৳1,250");
    expect(html).toContain("৳89.99");
    expect(html).toContain(`/procurement/suppliers/${SUPPLIER_ID}`);
    expect(html).toContain("Barcode label print");
  });

  it("prints one label per piece or per variant, skipping missing barcodes", () => {
    expect(labelCopies(result.variants, "perPiece")).toHaveLength(3);
    expect(labelCopies(result.variants, "perVariant")).toHaveLength(1);
  });
});
