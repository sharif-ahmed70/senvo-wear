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
import { PrismaPosSettlementRepository } from "../pos/settlement-repository.js";
import { PrismaStorefrontRepository } from "../storefront/repository.js";
import { PrismaCatalogMediaRepository } from "../catalog/media-repository.js";
import {
  PrismaCategoryRepository,
  PrismaColorRepository,
  PrismaOrganizationRepository,
  PrismaProductRepository,
  PrismaProductVariantRepository,
  PrismaSizeRepository,
} from "../catalog/repositories.js";
import { PrismaBarcodeRepository } from "../catalog/barcode-repository.js";
import { PrismaStockIntakeRepository } from "../procurement/stock-intake-repository.js";
import { PrismaSupplierRepository } from "../procurement/supplier-repository.js";
import { PrismaOnlinePaymentRepository } from "../payment/online-payment-repository.js";
import { PrismaPurchaseRepository } from "../procurement/purchase-repository.js";
import { PrismaCostRepository } from "../procurement/cost-repository.js";
import {
  PrismaSupplierLedgerRepository,
  PrismaSupplierPaymentRepository,
} from "../procurement/supplier-payment-repository.js";

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
        costRepository: new PrismaCostRepository(transaction),
        inventoryMovementRepository:
          new PrismaTransactionalInventoryMovementPostingRepository(
            transaction,
          ),
        onlinePaymentRepository: new PrismaOnlinePaymentRepository(transaction),
        posCheckoutRepository: new PrismaPosCheckoutRepository(transaction),
        paymentRepository: new PrismaPaymentRepository(transaction),
        paymentRefundRepository: new PrismaPaymentRefundRepository(transaction),
        paymentRefundReceiptRepository: new PrismaReceiptRepository(
          transaction,
        ),
        receiptRepository: new PrismaReceiptRepository(transaction),
        posReturnReceiptRepository: new PrismaReceiptRepository(transaction),
        posReturnRepository: new PrismaPosReturnRepository(transaction),
        posSettlementRepository: new PrismaPosSettlementRepository(transaction),
        posCheckoutSalesOrderRepository:
          createTransactionScopedSalesOrderRepository(transaction),
        purchaseRepository: new PrismaPurchaseRepository(transaction),
        salesOrderRepository:
          new PrismaTransactionalSalesOrderCreationRepository(transaction),
        salesOrderLifecycleRepository:
          createTransactionScopedSalesOrderRepository(transaction),
        storefrontRepository: new PrismaStorefrontRepository(transaction),
        supplierLedgerRepository: new PrismaSupplierLedgerRepository(
          transaction,
        ),
        supplierPaymentRepository: new PrismaSupplierPaymentRepository(
          transaction,
        ),
        barcodeRepository: new PrismaBarcodeRepository(transaction),
        categoryRepository: new PrismaCategoryRepository(transaction),
        colorRepository: new PrismaColorRepository(transaction),
        organizationRepository: new PrismaOrganizationRepository(transaction),
        productVariantRepository: new PrismaProductVariantRepository(
          transaction,
        ),
        sizeRepository: new PrismaSizeRepository(transaction),
        stockIntakeRepository: new PrismaStockIntakeRepository(transaction),
        supplierRepository: new PrismaSupplierRepository(transaction),
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
