import {
  BusinessRuleError,
  RepositoryAuditWriter,
  type RecordAuditEntryInput,
  type TransactionContext,
  type TransactionManager,
} from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaAuditEntryRepository } from "../audit/repositories.js";
import { PrismaTransactionalInventoryMovementPostingRepository } from "../inventory/repositories.js";
import { PrismaTransactionalSalesOrderCreationRepository } from "../sales/repositories.js";
import { PrismaPosCheckoutRepository } from "../pos/checkout-repository.js";
import { createTransactionScopedSalesOrderRepository } from "../sales/repositories.js";
import { PrismaPaymentRepository } from "../payment/repository.js";
import { PrismaPaymentRefundRepository } from "../payment/refund-repository.js";
import { PrismaReceiptRepository } from "../receipt/repository.js";
import { PrismaPosReturnRepository } from "../pos/return-repository.js";
import { PrismaStorefrontRepository } from "../storefront/repository.js";
import { PrismaCatalogMediaRepository } from "../catalog/media-repository.js";
import { PrismaProductRepository } from "../catalog/repositories.js";

type TransactionCapablePrismaClient = Pick<PrismaClient, "$transaction">;
type TransactionActorContext = {
  organizationId: string;
  userId: string | null;
};

export class PrismaTransactionManager<
  TApplicationContext extends TransactionActorContext,
> implements TransactionManager<TApplicationContext> {
  constructor(private readonly prisma: TransactionCapablePrismaClient) {}

  execute<TResult>(
    applicationContext: TApplicationContext,
    operation: (
      transactionContext: TransactionContext<TApplicationContext>,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    return this.prisma.$transaction(async (transaction) =>
      operation({
        applicationContext,
        auditWriter: new ContextBoundTransactionalAuditWriter(
          applicationContext,
          new RepositoryAuditWriter(
            new PrismaAuditEntryRepository(transaction),
          ),
        ),
        catalogMediaRepository: new PrismaCatalogMediaRepository(transaction),
        catalogProductRepository: new PrismaProductRepository(transaction),
        inventoryMovementRepository:
          new PrismaTransactionalInventoryMovementPostingRepository(
            transaction,
          ),
        posCheckoutRepository: new PrismaPosCheckoutRepository(transaction),
        paymentRepository: new PrismaPaymentRepository(transaction),
        paymentRefundRepository: new PrismaPaymentRefundRepository(transaction),
        paymentRefundReceiptRepository: new PrismaReceiptRepository(
          transaction,
        ),
        receiptRepository: new PrismaReceiptRepository(transaction),
        posReturnReceiptRepository: new PrismaReceiptRepository(transaction),
        posReturnRepository: new PrismaPosReturnRepository(transaction),
        posCheckoutSalesOrderRepository:
          createTransactionScopedSalesOrderRepository(transaction),
        salesOrderRepository:
          new PrismaTransactionalSalesOrderCreationRepository(transaction),
        salesOrderLifecycleRepository:
          createTransactionScopedSalesOrderRepository(transaction),
        storefrontRepository: new PrismaStorefrontRepository(transaction),
      }),
    );
  }
}

class ContextBoundTransactionalAuditWriter {
  constructor(
    private readonly applicationContext: TransactionActorContext,
    private readonly auditWriter: RepositoryAuditWriter,
  ) {}

  recordWithinTransaction(input: RecordAuditEntryInput) {
    if (
      input.organizationId !== this.applicationContext.organizationId ||
      input.actor.userId !== this.applicationContext.userId
    ) {
      throw new BusinessRuleError(
        "Audit actor and organization must match the transaction context.",
      );
    }
    return this.auditWriter.recordWithinTransaction(input);
  }
}
