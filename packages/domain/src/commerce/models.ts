import type { PaymentMethod } from "../payment/domain/models.js";

export type CommercePartyStatus = "ACTIVE" | "INACTIVE";
export type PurchaseOrderStatus = "DRAFT" | "RECEIVED" | "CANCELLED";

export type CustomerSummary = {
  address: string | null;
  dueMinor: number;
  email: string | null;
  id: string;
  name: string;
  phone: string;
  status: CommercePartyStatus;
  totalPurchaseMinor: number;
  updatedAt: Date;
  version: number;
};

export type CustomerProfile = CustomerSummary & {
  orders: {
    createdAt: Date;
    id: string;
    orderNumber: string;
    paidMinor: number;
    status: string;
    totalMinor: number;
  }[];
};

export type VendorSummary = {
  address: string | null;
  dueMinor: number;
  id: string;
  location: string | null;
  name: string;
  paidMinor: number;
  phone: string | null;
  purchaseMinor: number;
  status: CommercePartyStatus;
  updatedAt: Date;
  version: number;
};

export type PurchaseOrderSummary = {
  destinationLocationId: string;
  destinationLocationName: string;
  dueMinor: number;
  id: string;
  inventoryMovementId: string | null;
  lines: {
    lineTotalMinor: number;
    productName: string;
    productVariantId: string;
    quantity: number;
    sku: string;
    unitCostMinor: number;
  }[];
  orderedAt: Date;
  paidMinor: number;
  purchaseNumber: string;
  receivedAt: Date | null;
  status: PurchaseOrderStatus;
  totalMinor: number;
  vendorId: string;
  vendorName: string;
  version: number;
};

export type VendorPaymentRecord = {
  amountMinor: number;
  id: string;
  method: Exclude<PaymentMethod, "ONLINE_GATEWAY">;
  paidAt: Date;
  purchaseOrderId: string | null;
  reference: string | null;
  vendorId: string;
};
