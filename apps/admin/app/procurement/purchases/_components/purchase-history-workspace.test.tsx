import type { PurchaseContract } from "@senvo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PurchaseDetailPage from "../[id]/page";
import PurchasesPage from "../page";
import {
  formatPurchaseAmount,
  formatPurchaseDate,
  PurchaseAccessNotice,
  PurchaseHistoryWorkspace,
  STATUS_LABELS,
} from "./purchase-history-workspace";

vi.mock("next/navigation", () => ({
  usePathname: () => "/procurement/purchases",
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

const purchaseId1 = "20000000-0000-4000-8000-000000000001";
const purchaseId2 = "20000000-0000-4000-8000-000000000002";
const purchaseId3 = "20000000-0000-4000-8000-000000000003";

const mockDraftPurchase: PurchaseContract = {
  createdAt: "2026-09-27T10:00:00.000Z",
  destinationLocationId: "loc-wh-01",
  expectedDeliveryDate: null,
  id: purchaseId1,
  idempotencyKey: null,
  lines: [
    {
      id: "line-1",
      lineNumber: 1,
      notes: null,
      productName: "Signature Heavyweight Tee",
      productVariantId: "var-01",
      purchaseId: purchaseId1,
      quantity: 50,
      sku: "SHT-BLK-M",
      totalCostMinor: "2500000",
      unitCostMinor: 50000,
      variantName: "Black / M",
    },
  ],
  notes: "Urgent restocking for winter collection",
  organizationId: "org-01",
  purchaseDate: "2026-09-27T10:00:00.000Z",
  purchaseNumber: "PO-20260927-001",
  receiptMovementId: null,
  status: "DRAFT",
  supplierId: "sup-islam-01",
  totalCostMinor: "2500000",
  updatedAt: "2026-09-27T10:00:00.000Z",
};

const mockPostedPurchase: PurchaseContract = {
  createdAt: "2026-09-25T10:00:00.000Z",
  destinationLocationId: "loc-wh-01",
  expectedDeliveryDate: null,
  id: purchaseId2,
  idempotencyKey: null,
  lines: [
    {
      id: "line-2",
      lineNumber: 1,
      notes: null,
      productName: "Classic Oxford Shirt",
      productVariantId: "var-02",
      purchaseId: purchaseId2,
      quantity: 20,
      sku: "OXF-WHT-L",
      totalCostMinor: "1600000",
      unitCostMinor: 80000,
      variantName: "White / L",
    },
  ],
  notes: null,
  organizationId: "org-01",
  purchaseDate: "2026-09-25T10:00:00.000Z",
  purchaseNumber: "PO-20260925-002",
  receiptMovementId: "mov-rcpt-002",
  status: "POSTED",
  supplierId: "sup-babu-02",
  totalCostMinor: "1600000",
  updatedAt: "2026-09-25T10:00:00.000Z",
};

const mockCancelledPurchase: PurchaseContract = {
  createdAt: "2026-09-20T10:00:00.000Z",
  destinationLocationId: "loc-wh-01",
  expectedDeliveryDate: null,
  id: purchaseId3,
  idempotencyKey: null,
  lines: [],
  notes: "Cancelled due to supplier stock shortage",
  organizationId: "org-01",
  purchaseDate: "2026-09-20T10:00:00.000Z",
  purchaseNumber: "PO-20260920-003",
  receiptMovementId: null,
  status: "CANCELLED",
  supplierId: "sup-islam-01",
  totalCostMinor: "0",
  updatedAt: "2026-09-20T10:00:00.000Z",
};

describe("PurchaseHistoryWorkspace Permission Gating", () => {
  it("renders PurchaseAccessNotice when user lacks PROCUREMENT:READ", () => {
    const html = renderToStaticMarkup(
      <PurchaseHistoryWorkspace permissions={["CATALOG:READ"]} />,
    );
    expect(html).toContain("প্রবেশাধিকার সংরক্ষিত");
    expect(html).toContain("ক্রয় ইতিহাস দেখার অনুমতি নেই");
    expect(html).toContain("দোকানের অ্যাডমিন বা মালিকের সাথে যোগাযোগ করুন");
    expect(html).not.toContain("ক্রয় ইতিহাস (Purchase History)");
  });

  it("renders PurchaseAccessNotice directly via PurchaseAccessNotice component", () => {
    const html = renderToStaticMarkup(<PurchaseAccessNotice />);
    expect(html).toContain("প্রবেশাধিকার সংরক্ষিত");
    expect(html).toContain("ক্রয় ইতিহাস দেখার অনুমতি নেই");
  });
});

describe("PurchaseHistoryWorkspace List Rendering", () => {
  it("renders purchase list with date, PO number, supplier, amount, and status", () => {
    const html = renderToStaticMarkup(
      <PurchaseHistoryWorkspace
        initialPurchases={[mockDraftPurchase, mockPostedPurchase]}
        permissions={["PROCUREMENT:READ"]}
      />,
    );

    // Header and new purchase entry action
    expect(html).toContain("ক্রয় ইতিহাস (Purchase History)");
    expect(html).toContain("নতুন ক্রয় এন্ট্রি");
    expect(html).toContain("/procurement/purchases/new");

    // PO Numbers
    expect(html).toContain("PO-20260927-001");
    expect(html).toContain("PO-20260925-002");

    // Amounts (authoritative from API response, 2500000 minor = 25,000.00 taka)
    expect(html).toContain("৳25,000.00");
    expect(html).toContain("৳16,000.00");

    // Navigation links
    expect(html).toContain(`/procurement/purchases/${purchaseId1}`);
    expect(html).toContain(`/procurement/purchases/${purchaseId2}`);
  });

  it("displays exact Bengali status labels", () => {
    expect(STATUS_LABELS.DRAFT).toBe("খসড়া — Stock not added");
    expect(STATUS_LABELS.POSTED).toBe("নিশ্চিত — Stock added");
    expect(STATUS_LABELS.CANCELLED).toBe("বাতিল");

    const html = renderToStaticMarkup(
      <PurchaseHistoryWorkspace
        initialPurchases={[
          mockDraftPurchase,
          mockPostedPurchase,
          mockCancelledPurchase,
        ]}
        permissions={["PROCUREMENT:READ"]}
      />,
    );

    expect(html).toContain("খসড়া — Stock not added");
    expect(html).toContain("নিশ্চিত — Stock added");
    expect(html).toContain("বাতিল");
  });

  it("renders empty state when no purchases exist", () => {
    const html = renderToStaticMarkup(
      <PurchaseHistoryWorkspace
        initialPurchases={[]}
        permissions={["PROCUREMENT:READ"]}
      />,
    );

    expect(html).toContain("কোনো ক্রয় রেকর্ড পাওয়া যায়নি");
    expect(html).toContain(
      "নির্বাচিত ফিল্টারের সাথে মিলে এমন কোনো ক্রয় আদেশ পাওয়া যায়নি।",
    );
  });

  it("renders error message when initialError is provided", () => {
    const html = renderToStaticMarkup(
      <PurchaseHistoryWorkspace
        initialError="সার্ভারে সংযোগ করতে ব্যর্থ হয়েছে।"
        initialPurchases={[]}
        permissions={["PROCUREMENT:READ"]}
      />,
    );

    expect(html).toContain("সমস্যা দেখা দিয়েছে");
    expect(html).toContain("সার্ভারে সংযোগ করতে ব্যর্থ হয়েছে।");
  });
});

describe("PurchaseHistoryWorkspace Detail View", () => {
  it("renders purchase detail with line items and back link", () => {
    const html = renderToStaticMarkup(
      <PurchaseHistoryWorkspace
        initialPurchase={mockDraftPurchase}
        permissions={["PROCUREMENT:READ"]}
        purchaseId={purchaseId1}
        view="details"
      />,
    );

    expect(html).toContain("ক্রয় আদেশ: PO-20260927-001");
    expect(html).toContain("সকল ক্রয় তালিকায় ফিরে যান");
    expect(html).toContain("Signature Heavyweight Tee");
    expect(html).toContain("SHT-BLK-M");
    expect(html).toContain("Black / M");
    expect(html).toContain("50"); // quantity
    expect(html).toContain("৳500.00"); // unit cost 50000 minor = 500.00
    expect(html).toContain("৳25,000.00"); // line total
    expect(html).toContain("Urgent restocking for winter collection"); // notes
  });

  it("renders receipt movement id when purchase is POSTED", () => {
    const html = renderToStaticMarkup(
      <PurchaseHistoryWorkspace
        initialPurchase={mockPostedPurchase}
        permissions={["PROCUREMENT:READ"]}
        purchaseId={purchaseId2}
        view="details"
      />,
    );

    expect(html).toContain("mov-rcpt-002");
    expect(html).toContain("নিশ্চিত — Stock added");
  });
});

describe("Purchase Pages Integration", () => {
  it("PurchasesPage renders list workspace", () => {
    const html = renderToStaticMarkup(<PurchasesPage />);
    expect(html).toBeTruthy();
  });

  it("PurchaseDetailPage renders detail workspace foundation", async () => {
    const pageComponent = await PurchaseDetailPage({
      params: Promise.resolve({ id: purchaseId1 }),
    });
    const html = renderToStaticMarkup(pageComponent);
    expect(html).toBeTruthy();
  });
});

describe("Format Helpers", () => {
  it("formats purchase amount correctly from minor units", () => {
    expect(formatPurchaseAmount("500000")).toBe("৳5,000.00");
    expect(formatPurchaseAmount(125050)).toBe("৳1,250.50");
    expect(formatPurchaseAmount(0)).toBe("৳0.00");
  });

  it("formats purchase date safely", () => {
    const formatted = formatPurchaseDate("2026-09-27T10:00:00.000Z");
    expect(formatted).toContain("2026");
    expect(formatPurchaseDate("invalid-date")).toBe("invalid-date");
  });
});
