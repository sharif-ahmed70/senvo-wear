import type {
  PaymentBalanceStatus,
  PaymentBatch,
  PaymentInstruction,
} from "../domain/models.js";

export type CreatePaymentBatchRecord = {
  checkoutId: string;
  counterId: string;
  createdAt: Date;
  currencyCode: "BDT";
  id: string;
  idempotencyKey: string;
  lines: readonly PaymentInstruction[];
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

export type PaymentRepository = {
  create(record: CreatePaymentBatchRecord): Promise<PaymentBatch>;
};
