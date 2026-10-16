import type {
  CourierConsignmentContract,
  SalesOrderDetailsReadContract,
} from "@senvo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminApiClient } from "../../../_lib/api-client";
import { CourierDispatchModal } from "./_components/courier-dispatch-modal";
import { ShipmentTrackingCard } from "./_components/shipment-tracking-card";
import { ShippingLabelPreview } from "./shipping-label/shipping-label-preview";

const mockOrder: SalesOrderDetailsReadContract = {
  boothId: null,
  channel: "ONLINE",
  commerce: {
    paymentPreference: "CASH_ON_DELIVERY",
    source: "STOREFRONT",
  },
  currencyCode: "BDT",
  customer: {
    email: "customer@example.com",
    name: "Rahim Uddin",
    phone: "01711000000",
  },
  delivery: {
    addressLine1: "House 42, Road 11",
    addressLine2: "Block D, Banani",
    city: "Dhaka",
    district: "Dhaka",
    postalCode: "1213",
  },
  id: "order-1",
  inventory: {
    fulfillment: {
      movement: null,
      status: "PENDING",
    },
    reservation: {
      id: "res-1",
      reservationNumber: "RES-001",
      status: "CONFIRMED",
      stockLocation: {
        id: "loc-1",
        name: "Banani Main Store",
      },
    },
  },
  lines: [
    {
      color: "Blue",
      id: "line-1",
      lineNumber: 1,
      lineTotalMinor: 250000,
      productName: "Signature Oxford Shirt",
      quantity: 1,
      size: "M",
      sku: "OXF-BLU-M",
      unitPriceMinor: 250000,
    },
  ],
  orderNumber: "SO-2026-0001",
  status: "CONFIRMED",
  timestamps: {
    cancelledAt: null,
    confirmedAt: "2026-09-29T10:00:00.000Z",
    createdAt: "2026-09-29T10:00:00.000Z",
    fulfilledAt: null,
    reservedAt: "2026-09-29T10:00:00.000Z",
    updatedAt: "2026-09-29T10:00:00.000Z",
  },
  totals: {
    deliveryMinor: 10000,
    discountMinor: 0,
    subtotalMinor: 250000,
    totalMinor: 260000,
  },
  version: 1,
};

const mockConsignment: CourierConsignmentContract = {
  cancelledAt: null,
  codAmountMinor: "260000",
  consignmentNumber: "CNS-20260929-1",
  courierProvider: "STEADFAST",
  createdAt: "2026-09-29T10:30:00.000Z",
  deliveredAt: null,
  deliveryAddressLine1: "House 42, Road 11",
  deliveryAddressLine2: "Block D, Banani",
  deliveryCity: "Dhaka",
  deliveryDistrict: "Dhaka",
  deliveryFeeMinor: "10000",
  deliveryPostalCode: "1213",
  dispatchedAt: "2026-09-29T10:30:00.000Z",
  id: "consignment-1",
  itemWeightGram: null,
  note: "Handle carefully",
  organizationId: "org-1",
  recipientEmail: "customer@example.com",
  recipientName: "Rahim Uddin",
  recipientPhone: "01711000000",
  returnedAt: null,
  salesOrderId: "order-1",
  status: "BOOKED",
  trackingCode: "STDF-TRK-987654",
  trackingUrl: "https://steadfast.com.bd/track/STDF-TRK-987654",
  updatedAt: "2026-09-29T10:30:00.000Z",
  version: 1,
};

const mockClient = new AdminApiClient({ baseUrl: "" });

describe("Admin Courier Shipping & Dispatch", () => {
  describe("CourierDispatchModal", () => {
    it("renders courier selection and pre-populates COD and delivery fees", () => {
      const html = renderToStaticMarkup(
        <CourierDispatchModal
          client={mockClient}
          isOpen={true}
          onClose={() => {}}
          onDispatched={() => {}}
          order={mockOrder}
        />,
      );

      expect(html).toContain("Courier Dispatch");
      expect(html).toContain("Steadfast Courier");
      expect(html).toContain("Pathao Courier");
      expect(html).toContain("RedX");
      expect(html).toContain("Paperfly");
      expect(html).toContain("In-House Fleet");
      expect(html).toContain("House 42, Road 11");
      expect(html).toContain("Rahim Uddin");
      expect(html).toContain("01711000000");
      // Default delivery fee: 10000 minor / 100 = 100
      expect(html).toContain('value="100"');
      // Default COD amount for COD order: 260000 minor / 100 = 2600
      expect(html).toContain('value="2600"');
    });

    it("pre-populates COD amount as 0 when order is paid online", () => {
      const onlineOrder: SalesOrderDetailsReadContract = {
        ...mockOrder,
        commerce: {
          paymentPreference: "ONLINE_PAYMENT",
          source: "STOREFRONT",
        },
      };

      const html = renderToStaticMarkup(
        <CourierDispatchModal
          client={mockClient}
          isOpen={true}
          onClose={() => {}}
          onDispatched={() => {}}
          order={onlineOrder}
        />,
      );

      expect(html).toContain('value="0"');
    });

    it("returns null when modal is not open", () => {
      const html = renderToStaticMarkup(
        <CourierDispatchModal
          client={mockClient}
          isOpen={false}
          onClose={() => {}}
          onDispatched={() => {}}
          order={mockOrder}
        />,
      );

      expect(html).toBe("");
    });
  });

  describe("ShipmentTrackingCard", () => {
    it("renders shipment details, tracking code and lifecycle timeline", () => {
      const html = renderToStaticMarkup(
        <ShipmentTrackingCard
          canUpdate={true}
          client={mockClient}
          onStatusUpdated={() => {}}
          order={mockOrder}
          shipments={[mockConsignment]}
        />,
      );

      expect(html).toContain("Courier Dispatch &amp; Tracking");
      expect(html).toContain("Steadfast Courier");
      expect(html).toContain("STDF-TRK-987654");
      expect(html).toContain("https://steadfast.com.bd/track/STDF-TRK-987654");
      expect(html).toContain("Print Label");
      expect(html).toContain("Booked");
      expect(html).toContain("Picked Up");
      expect(html).toContain("In Transit");
      expect(html).toContain("Delivered");
    });

    it("shows next transition options when user has SALES_ORDER:UPDATE permission", () => {
      const html = renderToStaticMarkup(
        <ShipmentTrackingCard
          canUpdate={true}
          client={mockClient}
          onStatusUpdated={() => {}}
          order={mockOrder}
          shipments={[mockConsignment]}
        />,
      );

      expect(html).toContain("Update Shipment Status");
      expect(html).toContain("Picked Up by Courier");
      expect(html).toContain("Cancel Consignment");
    });

    it("hides status update action when canUpdate is false", () => {
      const html = renderToStaticMarkup(
        <ShipmentTrackingCard
          canUpdate={false}
          client={mockClient}
          onStatusUpdated={() => {}}
          order={mockOrder}
          shipments={[mockConsignment]}
        />,
      );

      expect(html).not.toContain("Update Shipment Status");
      expect(html).toContain("Courier Dispatch &amp; Tracking");
    });

    it("returns null when no shipments exist", () => {
      const html = renderToStaticMarkup(
        <ShipmentTrackingCard
          canUpdate={true}
          client={mockClient}
          onStatusUpdated={() => {}}
          order={mockOrder}
          shipments={[]}
        />,
      );

      expect(html).toBe("");
    });
  });

  describe("ShippingLabelPreview", () => {
    it("renders permission denied message when permission is missing", () => {
      const html = renderToStaticMarkup(
        <ShippingLabelPreview orderId="order-1" permissions={[]} />,
      );

      expect(html).toContain("Access restricted");
    });

    it("renders loading state when authorized", () => {
      const html = renderToStaticMarkup(
        <ShippingLabelPreview
          orderId="order-1"
          permissions={["SALES_ORDER:READ"]}
        />,
      );

      expect(html).toContain("Generating shipping label");
    });
  });
});
