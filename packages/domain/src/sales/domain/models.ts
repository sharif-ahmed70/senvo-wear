export type SalesOrderStatus =
  "DRAFT" | "RESERVED" | "CONFIRMED" | "CANCELLED" | "FULFILLED";

export type SalesOrderChannel = "ONLINE" | "POS" | "MANUAL";

export type SalesOrderLine = {
  colorSnapshot: string | null;
  createdAt: Date;
  discountMinor: number;
  id: string;
  lineNumber: number;
  lineTotalMinor: number;
  organizationId: string;
  productNameSnapshot: string;
  productVariantId: string;
  quantity: number;
  salesOrderId: string;
  sizeSnapshot: string | null;
  skuSnapshot: string;
  unitPriceMinor: number;
};

export type SalesOrder = {
  allocationPolicyId: string | null;
  cancelledAt: Date | null;
  channel: SalesOrderChannel;
  confirmedAt: Date | null;
  createdAt: Date;
  currencyCode: string;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddressLine1: string | null;
  deliveryAddressLine2: string | null;
  deliveryCity: string | null;
  deliveryDistrict: string | null;
  deliveryMinor: number;
  deliveryPostalCode: string | null;
  discountMinor: number;
  fulfilledAt: Date | null;
  fulfillmentMovementId: string | null;
  id: string;
  idempotencyKey: string;
  inventoryReservationId: string | null;
  lines: SalesOrderLine[];
  note: string | null;
  orderNumber: string;
  organizationId: string;
  payloadSignature: string;
  reservedAt: Date | null;
  status: SalesOrderStatus;
  subtotalMinor: number;
  totalMinor: number;
  updatedAt: Date;
  version: number;
};
