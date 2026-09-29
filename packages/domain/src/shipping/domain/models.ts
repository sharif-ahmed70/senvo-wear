export type CourierProvider =
  | "STEADFAST"
  | "PATHAO"
  | "REDX"
  | "PAPERFLY"
  | "IN_HOUSE";

export type ShipmentStatus =
  | "DRAFT"
  | "BOOKED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "RETURNED_TO_ORIGIN"
  | "CANCELLED";

export type CourierConsignment = {
  cancelledAt: Date | null;
  codAmountMinor: bigint;
  consignmentNumber: string;
  courierProvider: CourierProvider;
  createdAt: Date;
  deliveredAt: Date | null;
  deliveryAddressLine1: string;
  deliveryAddressLine2: string | null;
  deliveryCity: string | null;
  deliveryDistrict: string | null;
  deliveryFeeMinor: bigint;
  deliveryPostalCode: string | null;
  dispatchedAt: Date | null;
  id: string;
  itemWeightGram: number | null;
  note: string | null;
  organizationId: string;
  recipientEmail: string | null;
  recipientName: string;
  recipientPhone: string;
  returnedAt: Date | null;
  salesOrderId: string;
  status: ShipmentStatus;
  trackingCode: string | null;
  trackingUrl: string | null;
  updatedAt: Date;
  version: number;
};

export type ShipmentReturnEvent = {
  consignmentId: string;
  consignmentNumber: string;
  organizationId: string;
  reason: string | null;
  requiresRestocking: boolean;
  returnedAt: Date;
  salesOrderId: string;
};
