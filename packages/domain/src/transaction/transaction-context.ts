import type { AuditWriter } from "../audit/application/audit-writer.js";
import type { InventoryMovementPostingRepository } from "../inventory/repositories/inventory-repositories.js";
import type { PosCheckoutRepository } from "../pos/repositories/pos-checkout-repository.js";
import type { SalesOrderCreationRepository } from "../sales/repositories/sales-order-repositories.js";
import type { PosCheckoutSalesOrderRepository } from "../pos/application/checkout-use-cases.js";

export type TransactionContext<TApplicationContext> = {
  applicationContext: TApplicationContext;
  auditWriter: Pick<AuditWriter, "recordWithinTransaction">;
  inventoryMovementRepository: InventoryMovementPostingRepository;
  posCheckoutRepository?: PosCheckoutRepository;
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
