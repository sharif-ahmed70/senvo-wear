import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SupplierContract } from "@senvo/contracts";
import type { AdminSession } from "../../../_lib/admin-access";
import { AdminSessionProvider } from "../../../admin-shell";
import SuppliersPage from "../page";
import SupplierDetailPage from "../[id]/page";
import {
  AccessNotice,
  SupplierDetailsPanel,
  SupplierFormModal,
  SupplierListPanel,
  SupplierWorkspace,
} from "./supplier-workspace";

vi.mock("next/navigation", () => ({
  usePathname: () => "/procurement/suppliers",
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

const mockSupplierActive: SupplierContract = {
  address: "Islampur Market, 3rd Floor, Dhaka",
  code: "SUP-ISLAM-01",
  contactPerson: "Al-Amin Mia",
  createdAt: "2026-09-20T10:00:00.000Z",
  email: "alamin@islampurtextile.test",
  id: "10000000-0000-4000-8000-000000000001",
  name: "Islampur Wholesale Textile",
  notes: "Delivers cotton fabrics within 2 days.",
  organizationId: "10000000-0000-4000-8000-000000000099",
  phone: "01711223344",
  status: "ACTIVE",
  updatedAt: "2026-09-20T10:00:00.000Z",
};

const mockSupplierInactive: SupplierContract = {
  address: "Babubazar, Dhaka",
  code: "SUP-BABU-02",
  contactPerson: "Kamal Hossain",
  createdAt: "2026-09-21T10:00:00.000Z",
  email: null,
  id: "10000000-0000-4000-8000-000000000002",
  name: "Babubazar Fabrics",
  notes: null,
  organizationId: "10000000-0000-4000-8000-000000000099",
  phone: "01811223344",
  status: "INACTIVE",
  updatedAt: "2026-09-21T10:00:00.000Z",
};

describe("SupplierWorkspace Permission Gating", () => {
  it("renders AccessNotice when user lacks PROCUREMENT:READ", () => {
    const html = renderToStaticMarkup(
      <SupplierWorkspace permissions={["CATALOG:READ"]} />,
    );
    expect(html).toContain("প্রবেশাধিকার সংরক্ষিত");
    expect(html).toContain("সরবরাহকারী দেখার অনুমতি নেই");
    expect(html).toContain("দোকানের মালিকের সাথে যোগাযোগ করুন");
    expect(html).not.toContain("নতুন সরবরাহকারী যোগ করুন");
    expect(html).not.toContain("নাম বা কোড দিয়ে খুঁজুন");
  });

  it("renders AccessNotice directly via AccessNotice component", () => {
    const html = renderToStaticMarkup(<AccessNotice />);
    expect(html).toContain("প্রবেশাধিকার সংরক্ষিত");
    expect(html).toContain("সরবরাহকারী দেখার অনুমতি নেই");
  });

  it("hides Add Supplier button when user lacks PROCUREMENT:CREATE", () => {
    const html = renderToStaticMarkup(
      <SupplierWorkspace
        initialSuppliers={[mockSupplierActive]}
        permissions={["PROCUREMENT:READ"]}
      />,
    );
    expect(html).toContain("সরবরাহকারী তালিকা");
    expect(html).not.toContain("নতুন সরবরাহকারী যোগ করুন");
  });

  it("shows Add Supplier button when user has PROCUREMENT:CREATE", () => {
    const html = renderToStaticMarkup(
      <SupplierWorkspace
        initialSuppliers={[mockSupplierActive]}
        permissions={["PROCUREMENT:READ", "PROCUREMENT:CREATE"]}
      />,
    );
    expect(html).toContain("সরবরাহকারী তালিকা");
    expect(html).toContain("নতুন সরবরাহকারী যোগ করুন");
  });

  it("hides edit and deactivate actions when user lacks PROCUREMENT:UPDATE", () => {
    const html = renderToStaticMarkup(
      <SupplierWorkspace
        initialSuppliers={[mockSupplierActive]}
        permissions={["PROCUREMENT:READ"]}
      />,
    );
    expect(html).toContain("Islampur Wholesale Textile");
    expect(html).toContain("বিস্তারিত");
    expect(html).not.toContain("সম্পাদনা");
    expect(html).not.toContain('title="নিষ্ক্রিয় করুন"');
  });

  it("shows edit and deactivate actions when user has PROCUREMENT:UPDATE", () => {
    const html = renderToStaticMarkup(
      <SupplierWorkspace
        initialSuppliers={[mockSupplierActive]}
        permissions={["PROCUREMENT:READ", "PROCUREMENT:UPDATE"]}
      />,
    );
    expect(html).toContain("Islampur Wholesale Textile");
    expect(html).toContain("বিস্তারিত");
    expect(html).toContain("সম্পাদনা");
    expect(html).toContain('title="নিষ্ক্রিয় করুন"');
  });
});

describe("SupplierListPanel States and Content", () => {
  it("renders loading state when initial data is pending", () => {
    const html = renderToStaticMarkup(
      <SupplierListPanel canCreate={true} canUpdate={true} />,
    );
    expect(html).toContain("সরবরাহকারীদের তথ্য লোড হচ্ছে");
  });

  it("renders empty state with owner-friendly guidance when no suppliers exist", () => {
    const html = renderToStaticMarkup(
      <SupplierListPanel
        canCreate={true}
        canUpdate={true}
        initialSuppliers={[]}
      />,
    );
    expect(html).toContain("কোনো সরবরাহকারী পাওয়া যায়নি");
    expect(html).toContain("আপনার দোকানে এখনও কোনো সরবরাহকারী যোগ করা হয়নি।");
    expect(html).toContain("প্রথম সরবরাহকারী যোগ করুন");
  });

  it("renders error state when an error occurs loading suppliers", () => {
    const html = renderToStaticMarkup(
      <SupplierListPanel
        canCreate={true}
        canUpdate={true}
        initialError="সার্ভারের সাথে সংযোগ স্থাপন করা সম্ভব হয়নি।"
        initialSuppliers={[]}
      />,
    );
    expect(html).toContain("সার্ভারের সাথে সংযোগ স্থাপন করা সম্ভব হয়নি।");
  });

  it("renders supplier cards with business details and status badges", () => {
    const html = renderToStaticMarkup(
      <SupplierListPanel
        canCreate={true}
        canUpdate={true}
        initialSuppliers={[mockSupplierActive, mockSupplierInactive]}
      />,
    );
    expect(html).toContain("Islampur Wholesale Textile");
    expect(html).toContain("SUP-ISLAM-01");
    expect(html).toContain("Al-Amin Mia");
    expect(html).toContain("01711223344");
    expect(html).toContain("Islampur Market, 3rd Floor, Dhaka");
    expect(html).toContain("সক্রিয়");

    expect(html).toContain("Babubazar Fabrics");
    expect(html).toContain("SUP-BABU-02");
    expect(html).toContain("নিষ্ক্রিয়");
  });

  it("shows filter tabs for status filtering", () => {
    const html = renderToStaticMarkup(
      <SupplierListPanel
        canCreate={false}
        canUpdate={false}
        initialSuppliers={[mockSupplierActive]}
      />,
    );
    expect(html).toContain("সকল (1)");
    expect(html).toContain("সক্রিয়");
    expect(html).toContain("নিষ্ক্রিয়");
  });
});

describe("SupplierDetailsPanel and Purchase History Placeholder", () => {
  it("renders loading state when supplier data is being fetched", () => {
    const html = renderToStaticMarkup(
      <SupplierDetailsPanel
        canUpdate={true}
        supplierId="10000000-0000-4000-8000-000000000001"
      />,
    );
    expect(html).toContain("সরবরাহকারীর বিস্তারিত তথ্য লোড হচ্ছে");
  });

  it("renders not found error state when supplier does not exist", () => {
    const html = renderToStaticMarkup(
      <SupplierDetailsPanel
        canUpdate={true}
        initialError="সরবরাহকারী খুঁজে পাওয়া যায়নি"
        initialSupplier={null}
        supplierId="non-existent-id"
      />,
    );
    expect(html).toContain("সরবরাহকারী খুঁজে পাওয়া যায়নি");
    expect(html).toContain("তালিকায় ফিরে যান");
  });

  it("renders supplier details with all contact information", () => {
    const html = renderToStaticMarkup(
      <SupplierDetailsPanel
        canUpdate={true}
        initialSupplier={mockSupplierActive}
        supplierId={mockSupplierActive.id}
      />,
    );
    expect(html).toContain("Islampur Wholesale Textile");
    expect(html).toContain("SUP-ISLAM-01");
    expect(html).toContain("Al-Amin Mia");
    expect(html).toContain("01711223344");
    expect(html).toContain("alamin@islampurtextile.test");
    expect(html).toContain("Islampur Market, 3rd Floor, Dhaka");
    expect(html).toContain("Delivers cotton fabrics within 2 days.");
    expect(html).toContain("সক্রিয়");
  });

  it("renders purchase history placeholder for Phase C4", () => {
    const html = renderToStaticMarkup(
      <SupplierDetailsPanel
        canUpdate={true}
        initialSupplier={mockSupplierActive}
        supplierId={mockSupplierActive.id}
      />,
    );
    expect(html).toContain("ক্রয় ইতিহাস (Purchase History)");
    expect(html).toContain("পরবর্তী ফিচার (Phase C4)");
    expect(html).toContain(
      "এই সরবরাহকারীর কাছ থেকে কোন তারিখে কত পিস মাল কেনা হয়েছে এবং খরচের হিসাব শীঘ্রই এখানে দেখা যাবে।",
    );
  });

  it("hides edit and deactivate buttons in details when canUpdate is false", () => {
    const html = renderToStaticMarkup(
      <SupplierDetailsPanel
        canUpdate={false}
        initialSupplier={mockSupplierActive}
        supplierId={mockSupplierActive.id}
      />,
    );
    expect(html).not.toContain("তথ্য সম্পাদনা");
    expect(html).not.toContain("নিষ্ক্রিয় করুন");
  });

  it("shows edit and deactivate buttons in details when canUpdate is true and supplier is active", () => {
    const html = renderToStaticMarkup(
      <SupplierDetailsPanel
        canUpdate={true}
        initialSupplier={mockSupplierActive}
        supplierId={mockSupplierActive.id}
      />,
    );
    expect(html).toContain("তথ্য সম্পাদনা");
    expect(html).toContain("নিষ্ক্রিয় করুন");
  });

  it("hides deactivate button when supplier is already inactive", () => {
    const html = renderToStaticMarkup(
      <SupplierDetailsPanel
        canUpdate={true}
        initialSupplier={mockSupplierInactive}
        supplierId={mockSupplierInactive.id}
      />,
    );
    expect(html).toContain("তথ্য সম্পাদনা");
    expect(html).not.toContain("নিষ্ক্রিয় করুন");
  });
});

describe("SupplierFormModal (Add & Edit Flows)", () => {
  it("renders add modal with empty form and auto-code note", () => {
    const html = renderToStaticMarkup(
      <SupplierFormModal
        onClose={vi.fn()}
        onSuccess={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(html).toContain("নতুন সরবরাহকারী যোগ করুন");
    expect(html).toContain("সরবরাহকারী / প্রতিষ্ঠানের নাম");
    expect(html).toContain("যোগাযোগকারী ব্যক্তি (ঐচ্ছিক)");
    expect(html).toContain("ফোন নম্বর (ঐচ্ছিক)");
    expect(html).toContain("ইমেইল (ঐচ্ছিক)");
    expect(html).toContain("দোকান / গোডাউনের ঠিকানা (ঐচ্ছিক)");
    expect(html).toContain("নোট বা মন্তব্য (ঐচ্ছিক)");
    expect(html).toContain("সংরক্ষণ করুন");
    expect(html).toContain("বাতিল");
  });

  it("renders edit modal with populated supplier data", () => {
    const html = renderToStaticMarkup(
      <SupplierFormModal
        onClose={vi.fn()}
        onSuccess={vi.fn().mockResolvedValue(undefined)}
        supplier={mockSupplierActive}
      />,
    );
    expect(html).toContain("সরবরাহকারীর তথ্য সম্পাদনা");
    expect(html).toContain('value="Islampur Wholesale Textile"');
    expect(html).toContain('value="Al-Amin Mia"');
    expect(html).toContain('value="01711223344"');
    expect(html).toContain('value="alamin@islampurtextile.test"');
    expect(html).toContain('value="Islampur Market, 3rd Floor, Dhaka"');
    expect(html).toContain("Delivers cotton fabrics within 2 days.");
    expect(html).toContain("আপডেট করুন");
  });
});

describe("Page Routes with AdminSessionProvider", () => {
  const fullSession: AdminSession = {
    displayName: "Shop Owner",
    organizationName: "SENVO Wear",
    permissions: [
      "PROCUREMENT:READ",
      "PROCUREMENT:CREATE",
      "PROCUREMENT:UPDATE",
    ],
    role: "OWNER",
    userId: "owner-01",
  };

  it("renders SuppliersPage for authorized session", () => {
    const html = renderToStaticMarkup(
      createElement(
        AdminSessionProvider,
        { session: fullSession },
        createElement(SuppliersPage),
      ),
    );
    expect(html).toContain("সরবরাহকারী তালিকা (Suppliers)");
    expect(html).toContain("নতুন সরবরাহকারী যোগ করুন");
  });

  it("renders SupplierDetailPage for authorized session", async () => {
    const pageElement = await SupplierDetailPage({
      params: Promise.resolve({ id: "10000000-0000-4000-8000-000000000001" }),
    });

    const html = renderToStaticMarkup(
      createElement(
        AdminSessionProvider,
        { session: fullSession },
        pageElement,
      ),
    );
    expect(html).toContain("সরবরাহকারীর বিস্তারিত তথ্য লোড হচ্ছে");
  });
});
