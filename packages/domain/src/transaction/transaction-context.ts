import type { AuditWriter } from "../audit/application/audit-writer.js";
import type {
  InventoryMovementPostingRepository,
  InventoryMovementRepository,
} from "../inventory/repositories/inventory-repositories.js";
import type { PosCheckoutRepository } from "../pos/repositories/pos-checkout-repository.js";
import type { SalesOrderCreationRepository } from "../sales/repositories/sales-order-repositories.js";
import type { PosCheckoutSalesOrderRepository } from "../pos/application/checkout-use-cases.js";
import type { PaymentRepository } from "../payment/repositories/payment-repository.js";
import type { ReceiptRepository } from "../receipt/repositories/receipt-repository.js";
import type { PosReturnReceiptRepository } from "../receipt/repositories/receipt-repository.js";
import type { PosReturnRepository } from "../pos/repositories/pos-return-repository.js";

type TransactionalInventoryMovementRepository =
  InventoryMovementPostingRepository &
    Pick<InventoryMovementRepository, "createDraft" | "findByIdempotencyKey">;

export type TransactionContext<TApplicationContext> = {
  applicationContext: TApplicationContext;
  auditWriter: Pick<AuditWriter, "recordWithinTransaction">;
  inventoryMovementRepository: TransactionalInventoryMovementRepository;
  posCheckoutRepository?: PosCheckoutRepository;
  paymentRepository?: PaymentRepository;
  receiptRepository?: ReceiptRepository;
  posReturnReceiptRepository?: PosReturnReceiptRepository;
  posReturnRepository?: PosReturnRepository;
  posCheckoutSalesOrderRepository?: PosCheckoutSalesOrderRepository;
  salesOrderRepository: SalesOrderCreationRepository;
};

export type TransactionManager<TApplicationContext> = {
  execute<TResult>(
    applicationContext: TApplicationContext,
    operation: (
      transactionContext: TransactionContext<TApplicationContext>,
    ) => Promise<TResult>,
  ): Promise<TResult>;
};
