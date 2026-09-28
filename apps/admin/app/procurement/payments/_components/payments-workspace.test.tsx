import type {
  SupplierContract,
  SupplierPaymentContract,
} from "@senvo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  NewPaymentForm,
  PaymentsListPanel,
  PaymentsWorkspace,
} from "./payments-workspace";

vi.mock("next/navigation", () => ({
  usePathname: () => "/procurement/payments",
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
  },
];

const mockPayments: SupplierPaymentContract[] = [
  {
    amountMinor: "2500000", // 25,000.00 BDT
    createdAt: "2026-09-23T10:00:00.000Z",
    id: "20000000-0000-4000-8000-000000000001",
    idempotencyKey: "idem-key-1",
    notes: "Payment for order 1",
    organizationId: "10000000-0000-4000-8000-000000000099",
    paymentDate: "2026-09-23T10:00:00.000Z",
    paymentMethod: "BANK_TRANSFER",
    purchaseId: null,
    reference: "SLIP-9901",
    supplierId: "10000000-0000-4000-8000-000000000001",
    updatedAt: "2026-09-23T10:00:00.000Z",
  },
];

describe("PaymentsWorkspace Permission Gating", () => {
  it("renders access notice when user lacks PROCUREMENT:READ", () => {
    const html = renderToStaticMarkup(
      <PaymentsWorkspace permissions={["CATALOG:READ"]} />,
    );
    expect(html).toContain("প্রবেশাধিকার সংরক্ষিত");
    expect(html).toContain("পেমেন্ট দেখার অনুমতি নেই");
  });

  it("renders payments list when user has PROCUREMENT:READ", () => {
    const html = renderToStaticMarkup(
      <PaymentsWorkspace
        initialPayments={mockPayments}
        initialSuppliers={mockSuppliers}
        permissions={["PROCUREMENT:READ"]}
      />,
    );
    expect(html).toContain("সরবরাহকারী পেমেন্ট হিসাব (Supplier Payments)");
    expect(html).toContain("Islampur Wholesale Textile");
    expect(html).toContain("SLIP-9901");
    // Hides add button because lack of PROCUREMENT:CREATE
    expect(html).not.toContain("নতুন পেমেন্ট রেকর্ড করুন");
  });

  it("renders new payment button when user has PROCUREMENT:CREATE", () => {
    const html = renderToStaticMarkup(
      <PaymentsWorkspace
        initialPayments={mockPayments}
        initialSuppliers={mockSuppliers}
        permissions={["PROCUREMENT:READ", "PROCUREMENT:CREATE"]}
      />,
    );
    expect(html).toContain("নতুন পেমেন্ট রেকর্ড করুন");
  });

  it("renders new payment view when view='new'", () => {
    const html = renderToStaticMarkup(
      <PaymentsWorkspace
        initialSuppliers={mockSuppliers}
        permissions={["PROCUREMENT:READ", "PROCUREMENT:CREATE"]}
        view="new"
      />,
    );
    expect(html).toContain("সরবরাহকারী পেমেন্ট রেকর্ড (Record Payment)");
    expect(html).toContain("Islampur Wholesale Textile (SUP-01)");
  });
});

describe("PaymentsListPanel", () => {
  it("renders summary statistics and payment table row", () => {
    const html = renderToStaticMarkup(
      <PaymentsListPanel
        canCreate={true}
        initialPayments={mockPayments}
        initialSuppliers={mockSuppliers}
      />,
    );
    expect(html).toContain("মোট পেমেন্ট সংখ্যা");
    expect(html).toContain("1 টি");
    expect(html).toContain("সর্বমোট পরিশোধিত অর্থ");
    expect(html).toContain("৳25,000.00");
    expect(html).toContain("ব্যাংক ট্রান্সফার (Bank)");
    expect(html).toContain("SLIP-9901");
  });

  it("renders empty state when no payments exist", () => {
    const html = renderToStaticMarkup(
      <PaymentsListPanel
        canCreate={true}
        initialPayments={[]}
        initialSuppliers={mockSuppliers}
      />,
    );
    expect(html).toContain("কোনো পেমেন্ট রেকর্ড পাওয়া যায়নি");
    expect(html).toContain("প্রথম পেমেন্ট রেকর্ড করুন");
  });

  it("renders error state when initialError is provided", () => {
    const html = renderToStaticMarkup(
      <PaymentsListPanel
        canCreate={true}
        initialError="ডাটাবেজ সংযোগে সমস্যা"
        initialPayments={[]}
        initialSuppliers={[]}
      />,
    );
    expect(html).toContain("ডাটাবেজ সংযোগে সমস্যা");
  });
});

describe("NewPaymentForm", () => {
  it("renders form elements and fields", () => {
    const html = renderToStaticMarkup(
      <NewPaymentForm
        canCreate={true}
        initialSuppliers={mockSuppliers}
        supplierId={mockSuppliers[0]?.id}
      />,
    );
    expect(html).toContain("সরবরাহকারী পেমেন্ট রেকর্ড (Record Payment)");
    expect(html).toContain("সরবরাহকারী (Supplier)");
    expect(html).toContain("পরিশোধের পরিমাণ (Amount in Taka)");
    expect(html).toContain("পেমেন্টের তারিখ (Payment Date)");
    expect(html).toContain("পদ্ধতি (Payment Method)");
    expect(html).toContain("ক্যাশ / নগদ (Cash)");
    expect(html).toContain("ব্যাংক ট্রান্সফার (Bank Transfer)");
    expect(html).toContain("চেক (Cheque)");
    expect(html).toContain("মোবাইল ব্যাংকিং (bKash / Nagad / Rocket)");
    expect(html).toContain("পেমেন্ট নিশ্চিত করুন");
  });

  it("blocks rendering if canCreate is false", () => {
    const html = renderToStaticMarkup(
      <NewPaymentForm canCreate={false} initialSuppliers={mockSuppliers} />,
    );
    expect(html).toContain("প্রবেশাধিকার সংরক্ষিত");
    expect(html).toContain("পেমেন্ট রেকর্ডের অনুমতি নেই");
  });
});
