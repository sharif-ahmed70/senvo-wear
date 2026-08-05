export type PaymentMethod =
  "CASH" | "CARD" | "MOBILE_BANKING" | "BANK_TRANSFER";

export type PaymentBalanceStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type CheckoutPaymentStatus = PaymentBalanceStatus | "UNRECORDED";

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
