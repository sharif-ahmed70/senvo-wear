import type { AuditWriter } from "../audit/application/audit-writer.js";
import type { InventoryMovementPostingRepository } from "../inventory/repositories/inventory-repositories.js";
import type { SalesOrderCreationRepository } from "../sales/repositories/sales-order-repositories.js";

export type TransactionContext<TApplicationContext> = {
  applicationContext: TApplicationContext;
  auditWriter: Pick<AuditWriter, "recordWithinTransaction">;
  inventoryMovementRepository: InventoryMovementPostingRepository;
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
