import type { SalesReceipt } from "../domain/models.js";

export type CreateSalesReceiptRecord = Omit<
  SalesReceipt,
  "lines" | "payments"
> & {
  lines: readonly SalesReceipt["lines"][number][];
  payments: readonly SalesReceipt["payments"][number][];
};

export type ReceiptRepository = {
  create(record: CreateSalesReceiptRecord): Promise<SalesReceipt>;
  findByCheckoutId(
    checkoutId: string,
    organizationId: string,
  ): Promise<SalesReceipt | null>;
};
