import type {
  CheckoutSettlementStatus,
  PaymentBatch,
  PaymentCollection,
  PaymentInstruction,
} from "./models.js";

export type PaymentRefundLine = PaymentInstruction & {
  createdAt: Date;
  id: string;
  lineNumber: number;
  organizationId: string;
  refundId: string;
};

export type PaymentRefund = {
  acceptedByName: string;
  acceptedByUserId: string;
  amountMinor: number;
  checkoutId: string;
  createdAt: Date;
  id: string;
  idempotencyKey: string;
  issuedAt: Date;
  lines: PaymentRefundLine[];
  organizationId: string;
  receiptId: string;
  receiptNumber: string;
  requestSignature: string;
  salesOrderId: string;
};

export type PaymentRefundAccount = {
  adjustedPayableMinor: number | null;
  checkoutId: string;
  cumulativeRefundedMinor: number | null;
  grossReceivedMinor: number | null;
  legacyPaymentRecorded: boolean;
  netReceivedMinor: number | null;
  orderNumber: string;
  organizationId: string;
  originalPayableMinor: number;
  outstandingMinor: number | null;
  refundableMinor: number | null;
  refunds: PaymentRefund[];
  returnCreditMinor: number;
  settlementStatus: CheckoutSettlementStatus;
};

export type PaymentRefundPreparation = {
  acceptedByName: string;
  checkoutId: string;
  collections: PaymentCollection[];
  initialPayment: PaymentBatch | null;
  orderNumber: string;
  organizationAddressLine1: string | null;
  organizationAddressLine2: string | null;
  organizationCity: string | null;
  organizationDistrict: string | null;
  organizationEmail: string | null;
  organizationId: string;
  organizationName: string;
  organizationPhone: string | null;
  organizationPostalCode: string | null;
  originalReceiptNumber: string | null;
  refunds: PaymentRefund[];
  returnCreditMinor: number;
  salesOrderId: string;
  totalMinor: number;
};

export type PaymentRefundReceipt = {
  acceptedByName: string;
  adjustedPayableMinor: number;
  amountMinor: number;
  checkoutId: string;
  cumulativeRefundedMinor: number;
  grossReceivedMinor: number;
  id: string;
  issuedAt: Date;
  lines: Array<{
    amountMinor: number;
    lineNumber: number;
    method: PaymentInstruction["method"];
    reference: string | null;
  }>;
  netReceivedMinor: number;
  orderNumber: string;
  organizationAddressLine1: string | null;
  organizationAddressLine2: string | null;
  organizationCity: string | null;
  organizationDistrict: string | null;
  organizationEmail: string | null;
  organizationName: string;
  organizationPhone: string | null;
  organizationPostalCode: string | null;
  originalPayableMinor: number;
  originalReceiptNumber: string | null;
  outstandingMinor: number;
  receiptNumber: string;
  refundableMinor: number;
  refundId: string;
  returnCreditMinor: number;
  settlementStatus: Exclude<CheckoutSettlementStatus, "UNRECORDED">;
};
