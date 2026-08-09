import type {
  PaymentAccount,
  PaymentBalanceStatus,
  PaymentBatch,
  PaymentCollection,
  PaymentCollectionPreparation,
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
  createCollection(
    record: CreatePaymentCollectionRecord,
  ): Promise<PaymentCollection>;
  findAccountByCheckoutId(
    checkoutId: string,
    organizationId: string,
  ): Promise<PaymentAccount | null>;
  prepareCollection(
    checkoutId: string,
    organizationId: string,
    acceptedByUserId: string,
  ): Promise<PaymentCollectionPreparation | null>;
};

export type CreatePaymentCollectionRecord = {
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
  lines: readonly PaymentInstruction[];
  organizationId: string;
  paymentBatchId: string;
  receiptId: string;
  receiptNumber: string;
  requestSignature: string;
  salesOrderId: string;
};
