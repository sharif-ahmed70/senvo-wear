import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
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
import CatalogPage from "./catalog/page";
import CategoriesPage from "./catalog/categories/page";
import CollectionsPage from "./catalog/collections/page";
import ColorsPage from "./catalog/colors/page";
import BarcodesPage from "./catalog/barcodes/page";
import ProductsPage from "./catalog/products/page";
import { ProductMedia } from "./catalog/products/_components/product-inventory-detail";
import SizesPage from "./catalog/sizes/page";
import { CatalogWorkspace } from "./catalog/_components/catalog-workspace";
import { BarcodeWorkspace } from "./catalog/barcodes/_components/barcode-workspace";
import InventoryPage from "./inventory/page";
import InventoryLocationsPage from "./inventory/locations/page";
import InventoryMovementsPage from "./inventory/movements/page";
import { InventoryWorkspace } from "./inventory/_components/inventory-workspace";
import OrganizationPage from "./organization/page";
import StoreLocationsPage from "./store-locations/page";
import TeamPage from "./team/page";
import RolesPage from "./roles/page";
import { OrganizationWorkspace } from "./organization/_components/organization-workspace";
import AdminPage from "./page";
import SalesOrdersPage from "./sales-orders/page";
import SalesManagementPage from "./sales/orders/page";
import SalesBoothsPage from "./sales/booths/page";
import SalesChannelsPage from "./sales/channels/page";
import { SalesSourcesOverview } from "./sales/channels/_components/sales-sources-overview";
import {
  SalesOrderDetailsPanel,
  SalesOrdersWorkspace,
} from "./sales/orders/_components/sales-orders-workspace";
import type {
  PosReturnAccountContract,
  SalesOrderDetailsReadContract,
} from "@senvo/contracts";
import UsersPage from "./users/page";
import SalesCountersPage from "./pos/counters/page";
import SalesSessionsPage from "./pos/sessions/page";
import PosCheckoutsPage from "./pos/checkouts/page";
import PosSellPage from "./pos/sell/page";
import { PosManagementWorkspace } from "./pos/_components/pos-management-workspace";
import { ReceiptPreview } from "./pos/checkouts/[id]/receipt/receipt-preview";
import { CheckoutPaymentWorkspace } from "./pos/checkouts/[id]/checkout-payment-workspace";
import { PaymentReceiptPreview } from "./pos/payment-collections/[id]/receipt/payment-receipt-preview";
import {
  CheckoutReturnWorkspace,
  ReturnSuccessState,
  messageFor as returnMessageFor,
} from "./pos/checkouts/[id]/checkout-return-workspace";
import { ReturnReceiptPreview } from "./pos/returns/[id]/receipt/return-receipt-preview";
import { CheckoutRefundWorkspace } from "./pos/checkouts/[id]/checkout-refund-workspace";
import { RefundReceiptPreview } from "./pos/refunds/[id]/receipt/refund-receipt-preview";
import { AdminApiError } from "./_lib/api-client";

describe("admin routes", () => {
  it("renders ordered media controls only with catalog update access", () => {
    const details = {
      collectionIds: [],
      media: [
        {
          altText: "Oxford shirt front",
          assetId: "10000000-0000-4000-8000-000000000001",
          byteSize: 256,
          contentType: "image/png" as const,
          linkId: "10000000-0000-4000-8000-000000000002",
          productVariantId: null,
          role: "PRIMARY" as const,
          sortOrder: 0,
          url: "data:image/png;base64,iVBORw0KGgo=",
        },
      ],
      primaryImage: null,
      product: {
        categoryId: "10000000-0000-4000-8000-000000000003",
        createdAt: "2026-08-18T00:00:00.000Z",
        description: null,
        id: "10000000-0000-4000-8000-000000000004",
        name: "Oxford Shirt",
        organizationId: "10000000-0000-4000-8000-000000000005",
        productCode: "OXFORD",
        slug: "oxford-shirt",
        status: "ACTIVE" as const,
        updatedAt: "2026-08-18T00:00:00.000Z",
      },
      variants: [],
    };
    const editable = renderToStaticMarkup(
      <ProductMedia canUpdate details={details} onChange={() => undefined} />,
    );
    const readonly = renderToStaticMarkup(
      <ProductMedia
        canUpdate={false}
        details={details}
        onChange={() => undefined}
      />,
    );
    expect(editable).toContain("Set as primary image");
    expect(editable).toContain("Move image down");
    expect(readonly).not.toContain("Set as primary image");
    expect(readonly).toContain("view-only catalog access");
  });
  it("renders sales source and booth history routes", () => {
    const channelsHtml = renderToStaticMarkup(<SalesChannelsPage />);
    // SalesChannelsPage is a client workspace: initial static render shows the
    // loading state ("Loading sales sources") before the effect fetches data.
    // Accept either the loaded heading or the loading heading.
    expect(channelsHtml.toLowerCase()).toContain("sales sources");
    expect(renderToStaticMarkup(<SalesBoothsPage />).toLowerCase()).toContain(
      "booth history",
    );
  });

  it("hides sales source management without sales access", () => {
    const html = renderToStaticMarkup(
      <SalesSourcesOverview permissions={[]} />,
    );
    expect(html).toContain("Sales sources are restricted");
    expect(html).not.toContain("New booth");
  });
  it("renders POS routes and hides controls without POS access", () => {
    expect(renderToStaticMarkup(<PosSellPage />)).toContain("New Sale");
    expect(renderToStaticMarkup(<SalesCountersPage />)).toContain(
      "Sales Counters",
    );
    expect(renderToStaticMarkup(<SalesSessionsPage />)).toContain(
      "Sales Sessions",
    );
    expect(renderToStaticMarkup(<PosCheckoutsPage />)).toContain(
      "Checkout History",
    );
    const restricted = renderToStaticMarkup(
      <PosManagementWorkspace permissions={[]} view="counters" />,
    );
    expect(restricted).toContain("Access unavailable");
    expect(restricted).not.toContain("New counter");
  });
  it("hides receipt details without receipt and payment read access", () => {
    const html = renderToStaticMarkup(
      <ReceiptPreview
        checkoutId="10000000-0000-4000-8000-000000000001"
        permissions={["POS:READ"]}
      />,
    );
    expect(html).toContain("Receipt access unavailable");
    expect(html).not.toContain("Print");
  });
  it("hides outstanding collection and payment receipts without payment access", () => {
    expect(
      renderToStaticMarkup(
        <CheckoutPaymentWorkspace
          checkoutId="10000000-0000-4000-8000-000000000001"
          permissions={[]}
        />,
      ),
    ).toContain("Payment access unavailable");
    expect(
      renderToStaticMarkup(
        <PaymentReceiptPreview
          collectionId="10000000-0000-4000-8000-000000000001"
          permissions={["POS:READ"]}
        />,
      ),
    ).toContain("Receipt access unavailable");
  });
  it("hides return action and return receipt without the required access", () => {
    const workspace = renderToStaticMarkup(
      <CheckoutReturnWorkspace
        checkoutId="10000000-0000-4000-8000-000000000001"
        permissions={[]}
      />,
    );
    expect(workspace).toContain("Return access unavailable");
    expect(workspace).not.toContain("Record return");
    const receipt = renderToStaticMarkup(
      <ReturnReceiptPreview
        returnId="10000000-0000-4000-8000-000000000001"
        permissions={["POS:READ"]}
      />,
    );
    expect(receipt).toContain("Receipt access unavailable");
    expect(receipt).not.toContain("Print");
  });
  it("hides refund action and refund receipt without the required access", () => {
    const workspace = renderToStaticMarkup(
      <CheckoutRefundWorkspace
        checkoutId="10000000-0000-4000-8000-000000000001"
        permissions={[]}
      />,
    );
    expect(workspace).toContain("Refund access unavailable");
    expect(workspace).not.toContain("Record refund");
    const receipt = renderToStaticMarkup(
      <RefundReceiptPreview
        refundId="10000000-0000-4000-8000-000000000001"
        permissions={["POS:READ"]}
      />,
    );
    expect(receipt).toContain("Receipt access unavailable");
    expect(receipt).not.toContain("Print");
  });
  it("keeps idempotency conflict wording specific inside the return UI", () => {
    expect(
      returnMessageFor(
        new AdminApiError({
          code: "CONFLICT.IDEMPOTENCY",
          message: "This request was already used with different details.",
          requestId: "req_return_conflict",
          status: 409,
        }),
      ),
    ).toBe(
      "This return attempt was already used with different details. (req_return_conflict)",
    );
  });
  it("shows refund due without claiming a refund and keeps recovery actions", () => {
    const account = {
      adjustedPayableMinor: 7_000,
      checkoutId: "10000000-0000-4000-8000-000000000001",
      cumulativeReceivedMinor: 10_000,
      cumulativeRefundedMinor: 0,
      legacyPaymentRecorded: true,
      lines: [],
      netReceivedMinor: 10_000,
      orderNumber: "POS-1001",
      originalTotalMinor: 10_000,
      outstandingMinor: 0,
      refundableMinor: 3_000,
      returnCreditMinor: 3_000,
      returns: [],
      settlementStatus: "REFUND_DUE",
    } satisfies PosReturnAccountContract;
    const html = renderToStaticMarkup(
      <ReturnSuccessState
        account={account}
        canReadReceipt
        checkoutId={account.checkoutId}
        hasReturnable
        onReturnMore={() => undefined}
        success={{
          id: "10000000-0000-4000-8000-000000000002",
          receiptNumber: "RET-1001",
          totalCreditMinor: 3_000,
        }}
      />,
    );
    expect(html).toContain("Return recorded");
    expect(html).toContain("refund has not been issued yet");
    expect(html).toContain("View return receipt");
    expect(html).toContain("Print return receipt");
    expect(html).toContain("Back to sale");
    expect(html).toContain("Return more items");
    expect(html).not.toContain(">Refunded<");
  });
  it.each([
    ["Operations overview", AdminPage],
    ["Catalog", CatalogPage],
    ["Barcodes", BarcodesPage],
    ["Categories", CategoriesPage],
    ["Collections", CollectionsPage],
    ["Colors", ColorsPage],
    ["Products", ProductsPage],
    ["Sizes", SizesPage],
    ["Inventory", InventoryPage],
    ["Stock Locations", InventoryLocationsPage],
    ["Movement History", InventoryMovementsPage],
    ["Sales Orders", SalesOrdersPage],
    ["Sales Orders", SalesManagementPage],
    ["Organization", OrganizationPage],
    ["Store locations", StoreLocationsPage],
    ["Team", TeamPage],
    ["Roles", RolesPage],
    ["Users & Roles", UsersPage],
  ])("renders the %s route", (title, Page) => {
    const html = renderToStaticMarkup(createElement(Page));

    expect(html.toLowerCase()).toContain(
      title.toLowerCase().replace("&", "&amp;"),
    );
  });

  it("keeps barcode data hidden without catalog read access", () => {
    const html = renderToStaticMarkup(
      createElement(BarcodeWorkspace, { permissions: [] }),
    );

    expect(html).toContain("Catalog access is restricted");
    expect(html).not.toContain("Add barcode");
    expect(html).not.toContain("Test a Scan Code");
  });

  it("keeps catalog attribute mutations hidden for read-only users", () => {
    const html = renderToStaticMarkup(
      createElement(CatalogWorkspace, {
        kind: "colors",
        permissions: ["CATALOG:READ"],
      }),
    );

    expect(html).toContain("Colors");
    expect(html).not.toContain("Add color");
  });

  it("renders a restricted inventory state without INVENTORY.READ", () => {
    const html = renderToStaticMarkup(
      createElement(InventoryWorkspace, {
        permissions: ["CATALOG:READ"],
        view: "availability",
      }),
    );

    expect(html).toContain("Inventory access is restricted");
    expect(html).not.toContain("Search SKU");
  });

  it("renders restricted sales state without SALES_ORDER.READ", () => {
    const html = renderToStaticMarkup(
      createElement(SalesOrdersWorkspace, {
        permissions: ["CATALOG:READ"],
        view: "list",
      }),
    );
    expect(html).toContain("Sales access is restricted");
    expect(html).not.toContain("Search order number");
  });

  it("offers an Online orders queue filter to authorized staff", () => {
    const html = renderToStaticMarkup(
      createElement(SalesOrdersWorkspace, {
        permissions: ["SALES_ORDER:READ"],
        view: "list",
      }),
    );
    expect(html).toContain("Online orders");
    expect(html).toContain('value="ONLINE"');
  });

  it("labels storefront COD as unpaid without creating payment history", () => {
    const order = salesOrderDetails("RESERVED");
    order.commerce = {
      paymentPreference: "CASH_ON_DELIVERY",
      source: "STOREFRONT",
    };
    const html = renderToStaticMarkup(
      createElement(SalesOrderDetailsPanel, {
        busy: false,
        canUpdate: false,
        onAction: () => undefined,
        order,
      }),
    );
    expect(html).toContain("Cash on delivery - Unpaid");
    expect(html).not.toContain(">Paid<");
  });

  it.each([
    ["DRAFT", ["Reserve", "Cancel"]],
    ["RESERVED", ["Confirm", "Cancel"]],
    ["CONFIRMED", ["Fulfill"]],
    ["FULFILLED", []],
  ] as const)("shows allowed %s lifecycle actions", (status, actions) => {
    const html = renderToStaticMarkup(
      createElement(SalesOrderDetailsPanel, {
        busy: false,
        canUpdate: true,
        onAction: () => undefined,
        order: salesOrderDetails(status),
      }),
    );
    for (const action of ["Reserve", "Confirm", "Fulfill", "Cancel"]) {
      expect(html.includes(`>${action}<`)).toBe(
        actions.includes(action as never),
      );
    }
    expect(html).toContain("Order items");
    expect(html).toContain("Customer");
    expect(html).toContain("Inventory");
  });

  it("hides lifecycle controls without SALES_ORDER.UPDATE", () => {
    const html = renderToStaticMarkup(
      createElement(SalesOrderDetailsPanel, {
        busy: false,
        canUpdate: false,
        onAction: () => undefined,
        order: salesOrderDetails("DRAFT"),
      }),
    );
    expect(html).not.toContain(">Reserve<");
    expect(html).not.toContain(">Cancel<");
  });

  it("renders friendly restricted organization access without view permission", () => {
    const html = renderToStaticMarkup(
      createElement(OrganizationWorkspace, {
        permissions: ["CATALOG:READ"],
        view: "team",
      }),
    );
    expect(html).toContain("Access restricted");
    expect(html).not.toContain("Add team member");
    expect(html).not.toContain("Membership");
  });
});

function salesOrderDetails(
  status: SalesOrderDetailsReadContract["status"],
): SalesOrderDetailsReadContract {
  return {
    boothId: null,
    channel: "ONLINE",
    commerce: null,
    currencyCode: "BDT",
    customer: { email: "buyer@test.dev", name: "Buyer", phone: "01700000000" },
    delivery: {
      addressLine1: "Road 1",
      addressLine2: null,
      city: "Dhaka",
      district: "Dhaka",
      postalCode: "1207",
    },
    id: "10000000-0000-4000-8000-000000000003",
    inventory: {
      fulfillment: { movement: null, status: "PENDING" },
      reservation: null,
    },
    lines: [
      {
        color: "Black",
        id: "10000000-0000-4000-8000-000000000004",
        lineNumber: 1,
        lineTotalMinor: 2500,
        productName: "Oxford Shirt",
        quantity: 1,
        size: "L",
        sku: "OX-BLK-L",
        unitPriceMinor: 2500,
      },
    ],
    orderNumber: "SO-1001",
    status,
    timestamps: {
      cancelledAt: null,
      confirmedAt: null,
      createdAt: "2026-08-03T10:00:00.000Z",
      fulfilledAt: null,
      reservedAt: null,
      updatedAt: "2026-08-03T10:00:00.000Z",
    },
    totals: {
      deliveryMinor: 0,
      discountMinor: 0,
      subtotalMinor: 2500,
      totalMinor: 2500,
    },
    version: 1,
  };
}
