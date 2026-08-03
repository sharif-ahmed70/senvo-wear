export type SalesOrderStatus =
  "DRAFT" | "RESERVED" | "CONFIRMED" | "CANCELLED" | "FULFILLED";

export type SalesChannel = "ONLINE" | "OFFLINE_STORE" | "EVENT_BOOTH";
export type SalesOrderChannel = SalesChannel | "POS" | "MANUAL";

export type SalesBoothStatus = "ACTIVE" | "INACTIVE";

export type SalesBooth = {
  createdAt: Date;
  endDate: Date;
  id: string;
  location: string;
  name: string;
  organizationId: string;
  responsibleStaffId: string;
  responsibleStaffName: string | null;
  startDate: Date;
  status: SalesBoothStatus;
  updatedAt: Date;
  version: number;
};

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
  boothId: string | null;
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
