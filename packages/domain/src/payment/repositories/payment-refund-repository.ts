import type { PaymentInstruction } from "../domain/models.js";
import type {
  PaymentRefund,
  PaymentRefundAccount,
  PaymentRefundPreparation,
  PaymentRefundReceipt,
} from "../domain/refund-models.js";

export type CreatePaymentRefundRecord = {
  acceptedByUserId: string;
  amountMinor: number;
  checkoutId: string;
  createdAt: Date;
  id: string;
  idempotencyKey: string;
  issuedAt: Date;
  lines: readonly PaymentInstruction[];
  organizationId: string;
  receiptId: string;
  receiptNumber: string;
  requestSignature: string;
  salesOrderId: string;
};

export type PaymentRefundRepository = {
  create(record: CreatePaymentRefundRecord): Promise<PaymentRefund>;
  findAccountByCheckoutId(
    checkoutId: string,
    organizationId: string,
  ): Promise<PaymentRefundAccount | null>;
  prepare(
    checkoutId: string,
    organizationId: string,
    acceptedByUserId: string,
  ): Promise<PaymentRefundPreparation | null>;
};

export type PaymentRefundReceiptRepository = {
  createPaymentRefundReceipt(
    record: PaymentRefundReceipt & {
      organizationId: string;
      salesOrderId: string;
    },
  ): Promise<PaymentRefundReceipt>;
  findByRefundId(
    refundId: string,
    organizationId: string,
  ): Promise<PaymentRefundReceipt | null>;
};
