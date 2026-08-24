import type { PaymentMethod } from "../payment/domain/models.js";
import type {
  CommercePartyStatus,
  CustomerProfile,
  CustomerSummary,
  PurchaseOrderSummary,
  VendorPaymentRecord,
  VendorSummary,
} from "./models.js";

export type CommerceRepository = {
  createCustomer(input: {
    address: string | null;
    email: string | null;
    id: string;
    name: string;
    organizationId: string;
    phone: string;
  }): Promise<CustomerSummary>;
  createVendor(input: {
    address: string | null;
    id: string;
    location: string | null;
    name: string;
    organizationId: string;
    phone: string | null;
  }): Promise<VendorSummary>;
  findCustomer(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerProfile | null>;
  listCustomers(organizationId: string): Promise<CustomerSummary[]>;
  listPurchases(organizationId: string): Promise<PurchaseOrderSummary[]>;
  listVendors(organizationId: string): Promise<VendorSummary[]>;
  receivePurchase(input: {
    destinationLocationId: string;
    id: string;
    idempotencyKey: string;
    lines: readonly {
      productVariantId: string;
      quantity: number;
      unitCostMinor: number;
    }[];
    movementId: string;
    movementNumber: string;
    note: string | null;
    orderedAt: Date;
    organizationId: string;
    paidMinor: number;
    paymentId: string | null;
    paymentMethod: Exclude<PaymentMethod, "ONLINE_GATEWAY"> | null;
    paymentReference: string | null;
    purchaseNumber: string;
    receivedAt: Date;
    vendorId: string;
  }): Promise<{ purchase: PurchaseOrderSummary; replayed: boolean }>;
  recordVendorPayment(input: {
    amountMinor: number;
    id: string;
    idempotencyKey: string;
    method: Exclude<PaymentMethod, "ONLINE_GATEWAY">;
    organizationId: string;
    paidAt: Date;
    purchaseOrderId: string | null;
    reference: string | null;
    vendorId: string;
  }): Promise<{ payment: VendorPaymentRecord; replayed: boolean }>;
  updateCustomer(input: {
    address: string | null;
    email: string | null;
    expectedVersion: number;
    id: string;
    name: string;
    organizationId: string;
    phone: string;
    status: CommercePartyStatus;
  }): Promise<CustomerSummary | null>;
  updateVendor(input: {
    address: string | null;
    expectedVersion: number;
    id: string;
    location: string | null;
    name: string;
    organizationId: string;
    phone: string | null;
    status: CommercePartyStatus;
  }): Promise<VendorSummary | null>;
};
