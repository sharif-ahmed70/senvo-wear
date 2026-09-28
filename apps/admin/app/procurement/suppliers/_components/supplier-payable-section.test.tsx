import type {
  SupplierBalanceSummaryContract,
  SupplierContract,
  SupplierLedgerEntryContract,
} from "@senvo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  formatPayableAmount,
  formatPayableDate,
  SupplierBalanceCard,
  SupplierLedgerTimeline,
  SupplierPaymentModal,
  SupplierPayableSection,
} from "./supplier-payable-section";

vi.mock("next/navigation", () => ({
  usePathname: () =>
    "/procurement/suppliers/10000000-0000-4000-8000-000000000001",
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

const mockSupplier: SupplierContract = {
  address: "Islampur Market, Dhaka",
  code: "SUP-01",
  contactPerson: "Al-Amin",
  createdAt: "2026-09-20T10:00:00.000Z",
  email: "alamin@test.com",
  id: "10000000-0000-4000-8000-000000000001",
  name: "Islampur Wholesale Textile",
  notes: null,
  organizationId: "10000000-0000-4000-8000-000000000099",
  phone: "01711223344",
  status: "ACTIVE",
  updatedAt: "2026-09-20T10:00:00.000Z",
};

const mockSummaryDue: SupplierBalanceSummaryContract = {
  lastBillDate: "2026-09-22T10:00:00.000Z",
  lastPaymentDate: "2026-09-23T10:00:00.000Z",
  organizationId: "10000000-0000-4000-8000-000000000099",
  outstandingBalanceMinor: "5000000", // 50,000.00 BDT
  supplierId: "10000000-0000-4000-8000-000000000001",
  totalAdjustedMinor: "0",
  totalBilledMinor: "15000000", // 150,000.00 BDT
  totalPaidMinor: "10000000", // 100,000.00 BDT
};

const mockSummarySettled: SupplierBalanceSummaryContract = {
  lastBillDate: "2026-09-22T10:00:00.000Z",
  lastPaymentDate: "2026-09-23T10:00:00.000Z",
  organizationId: "10000000-0000-4000-8000-000000000099",
  outstandingBalanceMinor: "0",
  supplierId: "10000000-0000-4000-8000-000000000001",
  totalAdjustedMinor: "0",
  totalBilledMinor: "10000000",
  totalPaidMinor: "10000000",
};

const mockSummaryCredit: SupplierBalanceSummaryContract = {
  lastBillDate: null,
  lastPaymentDate: "2026-09-23T10:00:00.000Z",
  organizationId: "10000000-0000-4000-8000-000000000099",
  outstandingBalanceMinor: "-2500000", // -25,000.00 BDT advance
  supplierId: "10000000-0000-4000-8000-000000000001",
  totalAdjustedMinor: "0",
  totalBilledMinor: "0",
  totalPaidMinor: "2500000",
};

const mockLedgerEntries: SupplierLedgerEntryContract[] = [
  {
    amountMinor: "15000000",
    balanceAfterMinor: "15000000",
    createdAt: "2026-09-22T10:00:00.000Z",
    direction: "CREDIT",
    entryDate: "2026-09-22T10:00:00.000Z",
    entryType: "BILL",
    id: "30000000-0000-4000-8000-000000000001",
    notes: "Purchase order PO-001 confirmed",
    organizationId: "10000000-0000-4000-8000-000000000099",
    referenceId: "PO-001",
    referenceType: "PURCHASE_ORDER",
    supplierId: "10000000-0000-4000-8000-000000000001",
  },
  {
    amountMinor: "10000000",
    balanceAfterMinor: "5000000",
    createdAt: "2026-09-23T10:00:00.000Z",
    direction: "DEBIT",
    entryDate: "2026-09-23T10:00:00.000Z",
    entryType: "PAYMENT",
    id: "30000000-0000-4000-8000-000000000002",
    notes: "First installment paid via bank",
    organizationId: "10000000-0000-4000-8000-000000000099",
    referenceId: "CHQ-88291",
    referenceType: "SUPPLIER_PAYMENT",
    supplierId: "10000000-0000-4000-8000-000000000001",
  },
];

describe("Supplier Payable Unit Helpers", () => {
  it("formats payable amounts correctly", () => {
    expect(formatPayableAmount("5000000")).toBe("৳50,000.00");
    expect(formatPayableAmount(15000000)).toBe("৳150,000.00");
    expect(formatPayableAmount("-2500000")).toBe("-৳25,000.00");
    expect(formatPayableAmount(0)).toBe("৳0.00");
    expect(formatPayableAmount(null)).toBe("৳০.০০");
  });

  it("formats dates gracefully", () => {
    const formatted = formatPayableDate("2026-09-23T10:00:00.000Z");
    expect(formatted).toContain("2026");
    expect(formatPayableDate("invalid-date")).toBe("invalid-date");
  });
});

describe("SupplierBalanceCard", () => {
  it("renders due balance state with amber status pill and amount", () => {
    const html = renderToStaticMarkup(
      <SupplierBalanceCard
        canCreatePayment={true}
        onOpenPaymentModal={() => {}}
        summary={mockSummaryDue}
      />,
    );
    expect(html).toContain(
      "সরবরাহকারী দেনা ও ব্যালেন্স (Payable &amp; Balance)",
    );
    expect(html).toContain("বকেয়া দেনা বাকি (Due)");
    expect(html).toContain("৳50,000.00");
    expect(html).toContain("৳150,000.00");
    expect(html).toContain("৳100,000.00");
    expect(html).toContain("পেমেন্ট পরিশোধ রেকর্ড");
  });

  it("renders settled balance state when outstanding is 0", () => {
    const html = renderToStaticMarkup(
      <SupplierBalanceCard
        canCreatePayment={true}
        summary={mockSummarySettled}
      />,
    );
    expect(html).toContain("সম্পূর্ণ পরিশোধিত (Settled)");
    expect(html).toContain("৳0.00");
  });

  it("renders advance credit state when balance is negative", () => {
    const html = renderToStaticMarkup(
      <SupplierBalanceCard
        canCreatePayment={false}
        summary={mockSummaryCredit}
      />,
    );
    expect(html).toContain("অগ্রিম জমা (Advance Credit)");
    expect(html).toContain("-৳25,000.00");
    // Should not render payment record button if canCreatePayment is false
    expect(html).not.toContain("পেমেন্ট পরিশোধ রেকর্ড");
  });

  it("renders loading state when loading and no summary", () => {
    const html = renderToStaticMarkup(
      <SupplierBalanceCard loading={true} summary={null} />,
    );
    expect(html).toContain("দেনা ও ব্যালেন্স তথ্য লোড হচ্ছে...");
  });

  it("renders error state when error present and no summary", () => {
    const html = renderToStaticMarkup(
      <SupplierBalanceCard
        error="সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।"
        summary={null}
      />,
    );
    expect(html).toContain("ব্যালেন্স লোড করা সম্ভব হয়নি");
    expect(html).toContain("সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।");
  });
});

describe("SupplierPaymentModal", () => {
  it("renders modal form with supplier info and all payment input fields", () => {
    const html = renderToStaticMarkup(
      <SupplierPaymentModal
        onClose={() => {}}
        onSuccess={() => {}}
        supplier={mockSupplier}
      />,
    );
    expect(html).toContain("পেমেন্ট পরিশোধ রেকর্ড (Record Payment)");
    expect(html).toContain("Islampur Wholesale Textile");
    expect(html).toContain("SUP-01");
    expect(html).toContain("পরিশোধের পরিমাণ (Amount in Taka)");
    expect(html).toContain("পেমেন্টের তারিখ (Payment Date)");
    expect(html).toContain("পদ্ধতি (Payment Method)");
    expect(html).toContain("ক্যাশ / নগদ (Cash)");
    expect(html).toContain("ব্যাংক ট্রান্সফার (Bank Transfer)");
    expect(html).toContain("চেক (Cheque)");
    expect(html).toContain("মোবাইল ব্যাংকিং (bKash / Nagad / Rocket)");
    expect(html).toContain(
      "রেফারেন্স বা স্লিপ নম্বর (Reference / Cheque / TxID)",
    );
    expect(html).toContain("মন্তব্য বা বিবরণ (Notes)");
    expect(html).toContain("পেমেন্ট নিশ্চিত করুন");
  });
});

describe("SupplierLedgerTimeline", () => {
  it("renders ledger timeline with BILL and PAYMENT entries", () => {
    const html = renderToStaticMarkup(
      <SupplierLedgerTimeline
        entries={mockLedgerEntries}
        supplierId={mockSupplier.id}
      />,
    );
    expect(html).toContain("লেজার লেনদেন ইতিহাস (Ledger Transactions)");
    expect(html).toContain("ক্রয় বিল (Bill)");
    expect(html).toContain("পরিশোধ (Payment)");
    expect(html).toContain("দেনা বৃদ্ধি (+ Credit)");
    expect(html).toContain("দেনা হ্রাস (- Debit)");
    expect(html).toContain("+৳150,000.00");
    expect(html).toContain("-৳100,000.00");
    expect(html).toContain("PO-001");
    expect(html).toContain("CHQ-88291");
  });

  it("renders empty state when no entries exist", () => {
    const html = renderToStaticMarkup(
      <SupplierLedgerTimeline entries={[]} supplierId={mockSupplier.id} />,
    );
    expect(html).toContain("কোনো লেনদেন পাওয়া যায়নি");
    expect(html).toContain(
      "এই সরবরাহকারীর জন্য নির্বাচিত ফিল্টারে কোনো বিল বা পেমেন্ট রেকর্ড নেই।",
    );
  });

  it("renders loading state when loading without entries", () => {
    const html = renderToStaticMarkup(
      <SupplierLedgerTimeline
        entries={[]}
        loading={true}
        supplierId={mockSupplier.id}
      />,
    );
    expect(html).toContain("লেনদেনের ইতিহাস লোড হচ্ছে...");
  });

  it("renders error state when error occurs without entries", () => {
    const html = renderToStaticMarkup(
      <SupplierLedgerTimeline
        entries={[]}
        error="নেটওয়ার্ক সংযোগ ত্রুটি"
        supplierId={mockSupplier.id}
      />,
    );
    expect(html).toContain("লেনদেন লোড করা সম্ভব হয়নি");
    expect(html).toContain("নেটওয়ার্ক সংযোগ ত্রুটি");
  });
});

describe("SupplierPayableSection Integration", () => {
  it("renders both balance card and ledger timeline with initial data", () => {
    const html = renderToStaticMarkup(
      <SupplierPayableSection
        canCreatePayment={true}
        initialBalance={mockSummaryDue}
        initialLedger={mockLedgerEntries}
        supplier={mockSupplier}
      />,
    );
    expect(html).toContain(
      "সরবরাহকারী দেনা ও ব্যালেন্স (Payable &amp; Balance)",
    );
    expect(html).toContain("৳50,000.00");
    expect(html).toContain("লেজার লেনদেন ইতিহাস (Ledger Transactions)");
    expect(html).toContain("PO-001");
  });
});
