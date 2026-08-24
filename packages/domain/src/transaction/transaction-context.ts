import type { AuditWriter } from "../audit/application/audit-writer.js";
import type {
  InventoryMovementPostingRepository,
  InventoryMovementRepository,
} from "../inventory/repositories/inventory-repositories.js";
import type { PosCheckoutRepository } from "../pos/repositories/pos-checkout-repository.js";
import type {
  SalesOrderCreationRepository,
  SalesOrderRepository,
} from "../sales/repositories/sales-order-repositories.js";
import type { StorefrontRepository } from "../storefront/repository.js";
import type { PosCheckoutSalesOrderRepository } from "../pos/application/checkout-use-cases.js";
import type { PaymentRepository } from "../payment/repositories/payment-repository.js";
import type { ReceiptRepository } from "../receipt/repositories/receipt-repository.js";
import type { PosReturnReceiptRepository } from "../receipt/repositories/receipt-repository.js";
import type { PosReturnRepository } from "../pos/repositories/pos-return-repository.js";
import type {
  PaymentRefundReceiptRepository,
  PaymentRefundRepository,
} from "../payment/repositories/payment-refund-repository.js";
import type { CatalogMediaRepository } from "../catalog/repositories/catalog-media-repository.js";
import type { CatalogProductManagementRepository } from "../catalog/repositories/catalog-repositories.js";
import type { CommerceRepository } from "../commerce/repository.js";
import type { OnlinePaymentRepository } from "../payment/repositories/online-payment-repository.js";

type TransactionalInventoryMovementRepository =
  InventoryMovementPostingRepository &
    Pick<InventoryMovementRepository, "createDraft" | "findByIdempotencyKey">;

export type TransactionContext<TApplicationContext> = {
  applicationContext: TApplicationContext;
  auditWriter: Pick<AuditWriter, "recordWithinTransaction">;
  catalogMediaRepository?: CatalogMediaRepository;
  catalogProductRepository?: CatalogProductManagementRepository;
  commerceRepository?: CommerceRepository;
  inventoryMovementRepository: TransactionalInventoryMovementRepository;
  onlinePaymentRepository?: OnlinePaymentRepository;
  posCheckoutRepository?: PosCheckoutRepository;
  paymentRepository?: PaymentRepository;
  paymentRefundRepository?: PaymentRefundRepository;
  paymentRefundReceiptRepository?: PaymentRefundReceiptRepository;
  receiptRepository?: ReceiptRepository;
  posReturnReceiptRepository?: PosReturnReceiptRepository;
  posReturnRepository?: PosReturnRepository;
  posCheckoutSalesOrderRepository?: PosCheckoutSalesOrderRepository;
  salesOrderRepository: SalesOrderCreationRepository;
  salesOrderLifecycleRepository?: SalesOrderRepository;
  storefrontRepository?: StorefrontRepository;
};

export type TransactionManager<TApplicationContext> = {
  execute<TResult>(
    applicationContext: TApplicationContext,
    operation: (
      transactionContext: TransactionContext<TApplicationContext>,
    ) => Promise<TResult>,
  ): Promise<TResult>;
};
