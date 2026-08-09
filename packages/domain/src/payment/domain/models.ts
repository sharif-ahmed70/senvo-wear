export type PaymentMethod =
  "CASH" | "CARD" | "MOBILE_BANKING" | "BANK_TRANSFER";

export type PaymentBalanceStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type CheckoutSettlementStatus =
  PaymentBalanceStatus | "REFUND_DUE" | "SETTLED" | "UNRECORDED";
export type CheckoutPaymentStatus = CheckoutSettlementStatus;

export type PaymentInstruction = {
  amountMinor: number;
  method: PaymentMethod;
  reference: string | null;
};

export type PaymentLine = PaymentInstruction & {
  createdAt: Date;
  id: string;
  lineNumber: number;
  organizationId: string;
  paymentBatchId: string;
};

export type PaymentBatch = {
  checkoutId: string;
  counterId: string;
  createdAt: Date;
  currencyCode: "BDT";
  id: string;
  idempotencyKey: string;
  lines: PaymentLine[];
  organizationId: string;
  outstandingMinor: number;
  paidMinor: number;
  payableMinor: number;
  requestSignature: string;
  salesOrderId: string;
  salesSessionId: string;
  staffId: string;
  status: PaymentBalanceStatus;
};

export type PaymentBalance = {
  outstandingMinor: number;
  paidMinor: number;
  status: PaymentBalanceStatus;
};

export type PaymentCollectionLine = PaymentInstruction & {
  collectionId: string;
  createdAt: Date;
  id: string;
  lineNumber: number;
  organizationId: string;
};

export type PaymentCollection = {
  acceptedByName: string;
  acceptedByUserId: string;
  amountMinor: number;
  balanceAfterMinor: number;
  balanceBeforeMinor: number;
  checkoutId: string;
  createdAt: Date;
  currencyCode: "BDT";
  id: string;
  idempotencyKey: string;
  lines: PaymentCollectionLine[];
  organizationId: string;
  receiptId: string;
  receiptNumber: string;
  requestSignature: string;
  salesOrderId: string;
};

export type PaymentAccount = {
  adjustedPayableMinor: number | null;
  checkoutId: string;
  collections: PaymentCollection[];
  cumulativePaidMinor: number | null;
  currencyCode: "BDT";
  initialPaidMinor: number | null;
  initialPayments: PaymentInstruction[];
  legacyPaymentRecorded: boolean;
  originalPayableMinor: number;
  orderNumber: string;
  organizationId: string;
  outstandingMinor: number | null;
  refundableMinor: number | null;
  returnCreditMinor: number;
  settlementStatus: CheckoutSettlementStatus;
  status: CheckoutSettlementStatus;
  totalMinor: number;
};

export type PaymentCollectionPreparation = {
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
  returnCreditMinor: number;
  salesOrderId: string;
  totalMinor: number;
};
