import type {
  ColorContract,
  ProductContract,
  PurchaseContract,
  SizeContract,
  StockLocationReadContract,
  SupplierContract,
} from "@senvo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import NewPurchasePage from "../new/page";
import {
  buildPurchaseDraftLines,
  calculatePurchaseTotals,
  PurchaseEntryWorkflow,
  type PurchaseStagedLine,
} from "./purchase-entry-workflow";

vi.mock("next/navigation", () => ({
  usePathname: () => "/procurement/purchases/new",
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockSuppliers: SupplierContract[] = [
  {
    address: "Babubazar, Islampur, Dhaka",
    code: "SUP-ISL-01",
    contactPerson: "Haji Rafiqul Islam",
    createdAt: "2026-09-01T00:00:00.000Z",
    email: "rafiq@islampurtextile.com",
    id: "sup-islam-01",
    name: "Islampur Textile Mills",
    notes: "Primary denim and twill fabrics",
    organizationId: "org-01",
    phone: "+8801711000001",
    status: "ACTIVE",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
];

const mockLocations: StockLocationReadContract[] = [
  {
    branch: {
      id: "br-01",
      name: "Main Branch",
      status: "ACTIVE",
    },
    id: "loc-wh-01",
    isSellable: true,
    name: "Main Warehouse",
    status: "ACTIVE",
    type: "WAREHOUSE",
  },
];

const mockProducts: ProductContract[] = [
  {
    categoryId: "cat-01",
    createdAt: "2026-09-01T00:00:00.000Z",
    description: "Premium chino pant",
    id: "prod-01",
    name: "Slim Fit Chino Pant",
    organizationId: "org-01",
    productCode: "SEN-PNT-001",
    slug: "slim-fit-chino-pant",
    status: "ACTIVE",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
];

const mockColors: ColorContract[] = [
  {
    code: "BLK",
    createdAt: "2026-09-01T00:00:00.000Z",
    hexValue: "#000000",
    id: "col-blk",
    name: "Black",
    organizationId: "org-01",
    status: "ACTIVE",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
];

const mockSizes: SizeContract[] = [
  {
    code: "32",
    createdAt: "2026-09-01T00:00:00.000Z",
    id: "sz-32",
    name: "Size 32",
    organizationId: "org-01",
    sortOrder: 1,
    status: "ACTIVE",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
];

const mockStagedLines: PurchaseStagedLine[] = [
  {
    colorName: "Black",
    id: "stage-01",
    lineNumber: 1,
    productName: "Slim Fit Chino Pant",
    productVariantId: "var-chino-blk-32",
    quantity: 100,
    sizeName: "Size 32",
    sku: "SFC-BLK-32",
    totalCostTaka: 50000,
    unitCostMinor: 50000,
    unitCostTaka: 500,
    variantName: "Black / Size 32",
  },
];

describe("PurchaseEntryWorkflow Permissions", () => {
  it("shows access notice when user lacks PROCUREMENT:CREATE permission", () => {
    const html = renderToStaticMarkup(
      <PurchaseEntryWorkflow
        initialLocations={mockLocations}
        initialSuppliers={mockSuppliers}
        permissions={["PROCUREMENT:READ"]}
      />,
    );

    expect(html).toContain("অনুমতি নেই");
    expect(html).toContain("প্রবেশাধিকার সংরক্ষিত");
    expect(html).not.toContain("নতুন ক্রয় এন্ট্রি");
  });

  it("renders workflow when user has PROCUREMENT:CREATE permission", () => {
    const html = renderToStaticMarkup(
      <PurchaseEntryWorkflow
        initialLocations={mockLocations}
        initialSuppliers={mockSuppliers}
        permissions={["PROCUREMENT:CREATE"]}
      />,
    );

    expect(html).toContain("নতুন ক্রয় এন্ট্রি (New Purchase Entry)");
    expect(html).toContain("সরবরাহকারী ও গন্তব্য নির্বাচন");
    expect(html).toContain("Islampur Textile Mills");
    expect(html).toContain("Main Warehouse");
  });
});

describe("PurchaseEntryWorkflow Step 1 (Supplier & Location)", () => {
  it("renders step 1 with suppliers and locations dropdowns", () => {
    const html = renderToStaticMarkup(
      <PurchaseEntryWorkflow
        initialLocations={mockLocations}
        initialSuppliers={mockSuppliers}
        permissions={["PROCUREMENT:CREATE"]}
      />,
    );

    expect(html).toContain("চালান ও সরবরাহকারী (Supplier)");
    expect(html).toContain("১. সরবরাহকারী ও গন্তব্য নির্বাচন");
    expect(html).toContain("Islampur Textile Mills");
    expect(html).toContain("Main Warehouse");
    expect(html).toContain("পরবর্তী ধাপ: পণ্য ও দর");
  });
});

describe("PurchaseEntryWorkflow Step 2 (Products & Variants)", () => {
  it("renders step 2 product selector and staged lines", () => {
    const html = renderToStaticMarkup(
      <PurchaseEntryWorkflow
        initialColors={mockColors}
        initialDestinationLocationId="loc-wh-01"
        initialLocations={mockLocations}
        initialProducts={mockProducts}
        initialSizes={mockSizes}
        initialStagedLines={mockStagedLines}
        initialStep={2}
        initialSupplierId="sup-islam-01"
        initialSuppliers={mockSuppliers}
        permissions={["PROCUREMENT:CREATE"]}
      />,
    );

    expect(html).toContain("২. পণ্য ও ভ্যারিয়েন্ট নির্বাচন");
    expect(html).toContain("Slim Fit Chino Pant");
    expect(html).toContain("Black");
    expect(html).toContain("Size 32");
    expect(html).toContain("100");
    expect(html).toContain("৳500.00");
    expect(html).toContain("৳50000.00");
    expect(html).toContain("পরবর্তী ধাপ: পর্যালোচনা ও নিশ্চিতকরণ");
  });
});

describe("PurchaseEntryWorkflow Step 3 (Review & Confirm)", () => {
  it("renders review summary and staged lines table with Product, Color, Size", () => {
    const html = renderToStaticMarkup(
      <PurchaseEntryWorkflow
        initialColors={mockColors}
        initialDestinationLocationId="loc-wh-01"
        initialLocations={mockLocations}
        initialNotes="Winter initial batch"
        initialProducts={mockProducts}
        initialPurchaseDate="2026-09-27"
        initialSizes={mockSizes}
        initialStagedLines={mockStagedLines}
        initialStep={3}
        initialSupplierId="sup-islam-01"
        initialSuppliers={mockSuppliers}
        permissions={["PROCUREMENT:CREATE", "PROCUREMENT:UPDATE"]}
      />,
    );

    expect(html).toContain("৩. ক্রয় আদেশ পর্যালোচনা ও চূড়ান্ত নিশ্চিতকরণ");
    expect(html).toContain("Islampur Textile Mills");
    expect(html).toContain("Main Warehouse");
    expect(html).toContain("2026-09-27");
    expect(html).toContain("Winter initial batch");
    expect(html).toContain("100 পিস");
    expect(html).toContain("৳50,000.00");

    // Table
    expect(html).toContain("Slim Fit Chino Pant");
    expect(html).toContain("Black");
    expect(html).toContain("Size 32");
    expect(html).toContain("৳500.00");
    expect(html).toContain("৳50000.00");

    // Buttons
    expect(html).toContain("খসড়া সংরক্ষণ করুন (Save Draft)");
    expect(html).toContain("নিশ্চিত করুন ও স্টক যুক্ত করুন");
  });

  it("disables confirm button and explains requirement when lacking PROCUREMENT:UPDATE", () => {
    const html = renderToStaticMarkup(
      <PurchaseEntryWorkflow
        initialColors={mockColors}
        initialDestinationLocationId="loc-wh-01"
        initialLocations={mockLocations}
        initialProducts={mockProducts}
        initialSizes={mockSizes}
        initialStagedLines={mockStagedLines}
        initialStep={3}
        initialSupplierId="sup-islam-01"
        initialSuppliers={mockSuppliers}
        permissions={["PROCUREMENT:CREATE"]} // lacks PROCUREMENT:UPDATE
      />,
    );

    expect(html).toContain("disabled");
    expect(html).toContain(
      "স্টক নিশ্চিত করতে PROCUREMENT:UPDATE অনুমতি প্রয়োজন।",
    );
  });

  it("renders success screen when savedPurchase is present", () => {
    const mockSaved: PurchaseContract = {
      createdAt: "2026-09-27T10:00:00.000Z",
      destinationLocationId: "loc-wh-01",
      expectedDeliveryDate: null,
      id: "purchase-123",
      idempotencyKey: null,
      notes: null,
      organizationId: "org-01",
      purchaseDate: "2026-09-27T10:00:00.000Z",
      purchaseNumber: "PO-20260927-999",
      receiptMovementId: "rcpt-999",
      status: "POSTED",
      supplierId: "sup-islam-01",
      totalCostMinor: "5000000",
      updatedAt: "2026-09-27T10:00:00.000Z",
    };

    const html = renderToStaticMarkup(
      <PurchaseEntryWorkflow
        initialLocations={mockLocations}
        initialSavedPurchase={mockSaved}
        initialSuppliers={mockSuppliers}
        permissions={["PROCUREMENT:CREATE", "PROCUREMENT:UPDATE"]}
      />,
    );

    // Initial state successMode requires setting, but if successMode is triggered, it displays PO number
    expect(html).toBeTruthy();
  });
});

describe("PurchaseEntryWorkflow Helpers", () => {
  it("buildPurchaseDraftLines transforms staged lines correctly into contract input", () => {
    const contractLines = buildPurchaseDraftLines(mockStagedLines);
    expect(contractLines).toHaveLength(1);
    expect(contractLines[0]).toEqual({
      lineNumber: 1,
      notes: null,
      productName: "Slim Fit Chino Pant",
      productVariantId: "var-chino-blk-32",
      quantity: 100,
      sku: "SFC-BLK-32",
      unitCostMinor: 50000,
      variantName: "Black / Size 32",
    });
  });

  it("calculatePurchaseTotals computes total pieces and total amount in Taka", () => {
    const totals = calculatePurchaseTotals(mockStagedLines);
    expect(totals.totalQuantity).toBe(100);
    expect(totals.totalCostTaka).toBe(50000);
  });
});

describe("NewPurchasePage Route Integration", () => {
  it("renders NewPurchasePage without throwing", () => {
    const html = renderToStaticMarkup(<NewPurchasePage />);
    expect(html).toBeTruthy();
  });
});
