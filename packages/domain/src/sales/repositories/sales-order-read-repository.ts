import type { SalesOrderChannel, SalesOrderStatus } from "../domain/models.js";

export type SalesOrderDateOrder = "NEWEST" | "OLDEST";

export type SalesOrderCustomerSnapshot = {
  email: string | null;
  name: string | null;
  phone: string | null;
};

export type SalesOrderListReadItem = {
  channel: SalesOrderChannel;
  commerce: {
    paymentPreference: "CASH_ON_DELIVERY" | "ONLINE_PAYMENT";
    source: "STOREFRONT";
  } | null;
  createdAt: Date;
  currencyCode: string;
  customer: SalesOrderCustomerSnapshot;
  delivery: { city: string | null; district: string | null };
  id: string;
  orderNumber: string;
  status: SalesOrderStatus;
  totalMinor: number;
};

export type SalesOrderDetailsReadItem = {
  boothId: string | null;
  channel: SalesOrderChannel;
  commerce: {
    paymentPreference: "CASH_ON_DELIVERY" | "ONLINE_PAYMENT";
    source: "STOREFRONT";
  } | null;
  currencyCode: string;
  customer: SalesOrderCustomerSnapshot;
  delivery: {
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    district: string | null;
    postalCode: string | null;
  };
  id: string;
  inventory: {
    fulfillment: {
      movement: {
        id: string;
        movementNumber: string;
        occurredAt: Date;
        postedAt: Date | null;
        status: "DRAFT" | "POSTED";
        type:
          | "OPENING"
          | "RECEIPT"
          | "ISSUE"
          | "TRANSFER"
          | "ADJUSTMENT_IN"
          | "ADJUSTMENT_OUT";
      } | null;
      status: "PENDING" | "FULFILLED";
    };
    reservation: {
      id: string;
      reservationNumber: string;
      status: "ACTIVE" | "CONFIRMED" | "RELEASED" | "EXPIRED";
      stockLocation: { id: string; name: string };
    } | null;
  };
  lines: Array<{
    color: string | null;
    id: string;
    lineNumber: number;
    lineTotalMinor: number;
    productName: string;
    quantity: number;
    size: string | null;
    sku: string;
    unitPriceMinor: number;
  }>;
  orderNumber: string;
  status: SalesOrderStatus;
  timestamps: {
    cancelledAt: Date | null;
    confirmedAt: Date | null;
    createdAt: Date;
    fulfilledAt: Date | null;
    reservedAt: Date | null;
    updatedAt: Date;
  };
  totals: {
    deliveryMinor: number;
    discountMinor: number;
    subtotalMinor: number;
    totalMinor: number;
  };
  version: number;
};

export type SalesOrderReadPage = {
  hasMore: boolean;
  items: SalesOrderListReadItem[];
  nextCursor: string | null;
};

export type SalesOrderReadRepository = {
  getDetails(input: {
    organizationId: string;
    salesOrderId: string;
  }): Promise<SalesOrderDetailsReadItem | null>;
  list(input: {
    channel?: SalesOrderChannel;
    cursor?: string;
    order: SalesOrderDateOrder;
    organizationId: string;
    pageSize: number;
    search?: string;
    status?: SalesOrderStatus;
  }): Promise<SalesOrderReadPage>;
};
