import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  PosCartDetailsContract,
  PosCheckoutContract,
  SalesCounterContract,
  SalesReceiptContract,
  SalesSessionContract,
} from "@senvo/contracts";
import { PosSaleWorkspace } from "./_components/pos-sale-workspace";
import { SellingContextSelector } from "./_components/selling-context-selector";
import { CartLineList } from "./_components/cart-line-list";
import { PaymentPanel } from "./_components/payment-panel";
import { SaleSuccess } from "./_components/sale-success";
import { ReceiptDocument } from "../checkouts/[id]/receipt/receipt-preview";

const id = (suffix: string) =>
  `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const counter: SalesCounterContract = {
  boothId: null,
  branchId: id("1"),
  code: "MAIN",
  createdAt: "2026-08-06T00:00:00.000Z",
  id: id("2"),
  name: "Main counter",
  status: "ACTIVE",
  type: "STORE",
  updatedAt: "2026-08-06T00:00:00.000Z",
  version: 1,
};
const session: SalesSessionContract = {
  cartId: id("3"),
  closedAt: null,
  counterId: counter.id,
  createdAt: "2026-08-06T00:00:00.000Z",
  id: id("4"),
  openedAt: "2026-08-06T00:00:00.000Z",
  openedByUserId: id("5"),
  openedByName: "Shop Owner",
  openingFloatMinor: 0,
  status: "OPEN",
  updatedAt: "2026-08-06T00:00:00.000Z",
  version: 1,
};
const cart: PosCartDetailsContract = {
  status: "ACTIVE",
  version: 1,
  checkoutId: null,
  createdAt: session.createdAt,
  id: session.cartId,
  lines: [
    {
      cartId: session.cartId,
      color: "Black",
      createdAt: session.createdAt,
      id: id("6"),
      lineSubtotalMinor: 250000,
      productName: "Oxford Shirt",
      productVariantId: id("7"),
      quantity: 2,
      size: "Large",
      sku: "OX-BLK-L",
      unitPriceMinor: 125000,
      updatedAt: session.updatedAt,
    },
  ],
  salesSessionId: session.id,
  sessionStatus: "OPEN",
  updatedAt: session.updatedAt,
};

describe("guided POS selling components", () => {
  it("shows who opened the shared counter", () => {
    const html = renderToStaticMarkup(
      <SellingContextSelector
        contexts={[{ counter, session }]}
        onSelect={() => undefined}
        selectedId={session.id}
      />,
    );
    expect(html).toContain("Opened by Shop Owner");
  });

  it("renders a friendly restricted state", () => {
    const html = renderToStaticMarkup(
      <PosSaleWorkspace permissions={["POS:READ"]} />,
    );
    expect(html).toContain("New Sale access is restricted");
    expect(html).not.toContain("PAYMENT.CREATE");
  });

  it("guides the cashier to open a session", () => {
    const html = renderToStaticMarkup(
      <SellingContextSelector
        contexts={[]}
        onSelect={() => undefined}
        selectedId=""
      />,
    );
    expect(html).toContain("Start a sales session");
    expect(html).toContain("/pos/sessions");
  });

  it("provides inline counter opening when available counters are present", () => {
    const html = renderToStaticMarkup(
      <SellingContextSelector
        availableCounters={[counter]}
        contexts={[]}
        onOpenCounter={() => undefined}
        onSelect={() => undefined}
        selectedId=""
      />,
    );
    expect(html).toContain("Open Counter &amp; Start Selling");
    expect(html).toContain("Main counter");
  });

  it("shows one session as the confirmed counter", () => {
    const html = renderToStaticMarkup(
      <SellingContextSelector
        contexts={[{ counter, session }]}
        onSelect={() => undefined}
        selectedId={session.id}
      />,
    );
    expect(html).toContain("Main counter");
    expect(html).not.toContain("<select");
  });

  it("requires counter selection when multiple sessions are open", () => {
    const second = {
      counter: { ...counter, id: id("8"), name: "Event counter" },
      session: { ...session, counterId: id("8"), id: id("9") },
    };
    const html = renderToStaticMarkup(
      <SellingContextSelector
        contexts={[{ counter, session }, second]}
        onSelect={() => undefined}
        selectedId=""
      />,
    );
    expect(html).toContain("Choose a counter");
    expect(html).toContain("Event counter");
  });

  it("shows an actionable empty cart", () => {
    const html = renderToStaticMarkup(
      <CartLineList
        cart={{ ...cart, lines: [] }}
        mutatingId={null}
        onQuantity={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(html).toContain("Your order is empty");
    expect(html).toContain("Scan a barcode");
  });

  it("renders cart product details and keyboard quantity controls", () => {
    const html = renderToStaticMarkup(
      <CartLineList
        cart={cart}
        mutatingId={null}
        onQuantity={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(html).toContain("Oxford Shirt");
    expect(html).toContain("OX-BLK-L");
    expect(html).toContain("Decrease Oxford Shirt quantity");
    expect(html).toContain("Remove Oxford Shirt");
  });

  it("defaults payment to full cash and hides due access", () => {
    const html = renderToStaticMarkup(
      <PaymentPanel
        canApproveDue={false}
        onCancel={() => undefined}
        onComplete={() => undefined}
        submitting={false}
        totalMinor={250000}
      />,
    );
    expect(html).toContain("Complete this sale");
    expect(html).toContain("Cash");
    expect(html).toContain('value="2500.00"');
    expect(html).toContain("bKash / Nagad (MFS)");
    expect(html).toContain("Cash change calculator");
    expect(html).toContain("Cash received from customer");
    expect(html).not.toContain("Allow remaining balance");
  });

  it("shows split-payment and due controls only with approval", () => {
    const html = renderToStaticMarkup(
      <PaymentPanel
        canApproveDue
        onCancel={() => undefined}
        onComplete={() => undefined}
        submitting={false}
        totalMinor={250000}
      />,
    );
    expect(html).toContain("Add payment method");
    expect(html).toContain("Allow a remaining balance");
  });

  it("renders optional customer details capture fields in payment panel", () => {
    const html = renderToStaticMarkup(
      <PaymentPanel
        canApproveDue={false}
        onCancel={() => undefined}
        onComplete={() => undefined}
        submitting={false}
        totalMinor={250000}
      />,
    );
    expect(html).toContain("Customer information (Optional)");
    expect(html).toContain("Customer name");
    expect(html).toContain("Phone number");
    expect(html).toContain("Address");
    expect(html).toContain('name="customerName"');
    expect(html).toContain('name="customerPhone"');
    expect(html).toContain('name="customerAddress"');
  });

  it("shows success without leaking receipt actions", () => {
    const html = renderToStaticMarkup(
      <SaleSuccess
        canReadReceipt={false}
        checkout={checkout()}
        onNextSale={() => undefined}
        preparationError={null}
        preparingNext={false}
      />,
    );
    expect(html).toContain("Sale completed");
    expect(html).toContain("Start new sale");
    expect(html).not.toContain("View receipt");
  });

  it("shows receipt and print actions with read access", () => {
    const html = renderToStaticMarkup(
      <SaleSuccess
        canReadReceipt
        checkout={checkout()}
        onNextSale={() => undefined}
        preparationError={null}
        preparingNext={false}
      />,
    );
    expect(html).toContain("View receipt");
    expect(html).toContain("Print receipt");
  });

  it("preserves completed-sale details while showing preparation recovery", () => {
    const html = renderToStaticMarkup(
      <SaleSuccess
        canReadReceipt
        checkout={checkout()}
        onNextSale={() => undefined}
        preparationError={{
          message: "We could not prepare the next sale.",
          requestId: "req_recovery_1",
          uncertain: true,
        }}
        preparingNext={false}
      />,
    );
    expect(html).toContain("Sale completed");
    expect(html).toContain("View receipt");
    expect(html).toContain(
      "Use Start new sale again to retry only the next-sale preparation.",
    );
    expect(html).toContain("req_recovery_1");
  });

  it("displays customer information on the receipt preview when available", () => {
    const html = renderToStaticMarkup(
      <ReceiptDocument receipt={mockReceipt()} />,
    );
    expect(html).toContain("Customer");
    expect(html).toContain("Rahim Uddin");
    expect(html).toContain("Phone");
    expect(html).toContain("+8801700000000");
  });

  it("omits customer fields on the receipt preview when not provided", () => {
    const html = renderToStaticMarkup(
      <ReceiptDocument
        receipt={{
          ...mockReceipt(),
          customerName: null,
          customerPhone: null,
        }}
      />,
    );
    expect(html).not.toContain("<dt>Customer</dt>");
    expect(html).not.toContain("<dt>Phone</dt>");
  });
});

function mockReceipt(): SalesReceiptContract {
  return {
    checkoutId: id("10"),
    counterCode: "MAIN",
    counterName: "Main counter",
    currencyCode: "BDT",
    customerEmail: null,
    customerName: "Rahim Uddin",
    customerPhone: "+8801700000000",
    deliveryMinor: 0,
    discountMinor: 0,
    id: id("11"),
    issuedAt: "2026-08-06T00:10:00.000Z",
    lines: [
      {
        color: "Black",
        discountMinor: 0,
        lineNumber: 1,
        lineTotalMinor: 250000,
        productName: "Oxford Shirt",
        quantity: 2,
        size: "Large",
        sku: "OX-BLK-L",
        unitPriceMinor: 125000,
      },
    ],
    orderNumber: "SO-1001",
    organizationAddressLine1: "123 Dhaka St",
    organizationAddressLine2: null,
    organizationCity: "Dhaka",
    organizationDistrict: "Dhaka",
    organizationEmail: "store@senvo.test",
    organizationName: "SENVO Wear",
    organizationPhone: "+8801700000001",
    organizationPostalCode: "1200",
    outstandingMinor: 0,
    paidMinor: 250000,
    paymentStatus: "PAID",
    payments: [
      {
        amountMinor: 250000,
        lineNumber: 1,
        method: "CASH",
        reference: null,
      },
    ],
    receiptNumber: "R-1001",
    salesChannel: "OFFLINE_STORE",
    salesOrderId: id("12"),
    sourceName: "Store",
    staffName: "Cashier",
    subtotalMinor: 250000,
    totalMinor: 250000,
  };
}

function checkout(): PosCheckoutContract {
  return {
    cartId: cart.id,
    completedAt: "2026-08-06T00:10:00.000Z",
    counterId: counter.id,
    counterName: counter.name,
    createdAt: "2026-08-06T00:10:00.000Z",
    id: id("10"),
    idempotencyKey: "pos-test-key",
    orderNumber: "SO-1001",
    outstandingMinor: 0,
    paidMinor: 250000,
    paymentStatus: "PAID",
    receiptId: id("11"),
    receiptNumber: "R-1001",
    salesOrderId: id("12"),
    salesSessionId: session.id,
    staffName: "Cashier",
    status: "COMPLETED",
    subtotalMinor: 250000,
    totalMinor: 250000,
    updatedAt: "2026-08-06T00:10:00.000Z",
  };
}
