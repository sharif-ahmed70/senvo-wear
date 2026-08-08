import type {
  PaymentCollectionReceipt,
  SalesReceipt,
} from "../domain/models.js";

export type CreateSalesReceiptRecord = Omit<
  SalesReceipt,
  "lines" | "payments"
> & {
  lines: readonly SalesReceipt["lines"][number][];
  payments: readonly SalesReceipt["payments"][number][];
};

export type ReceiptRepository = {
  create(record: CreateSalesReceiptRecord): Promise<SalesReceipt>;
  createPaymentCollectionReceipt(
    record: CreatePaymentCollectionReceiptRecord,
  ): Promise<PaymentCollectionReceipt>;
  findByCheckoutId(
    checkoutId: string,
    organizationId: string,
  ): Promise<SalesReceipt | null>;
  findPaymentCollectionReceiptById(
    collectionId: string,
    organizationId: string,
  ): Promise<PaymentCollectionReceipt | null>;
};

export type CreatePaymentCollectionReceiptRecord = Omit<
  PaymentCollectionReceipt,
  "payments"
> & {
  payments: readonly PaymentCollectionReceipt["payments"][number][];
};
