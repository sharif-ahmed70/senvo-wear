import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { getRuntimeDatabaseUrl } from "./environment.js";

type GlobalWithPrisma = typeof globalThis & {
  __senvoPrisma?: PrismaClient;
};

export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: getRuntimeDatabaseUrl(process.env),
  });

  return new PrismaClient({ adapter });
}

export function getPrismaClient(): PrismaClient {
  const globalForPrisma = globalThis as GlobalWithPrisma;

  if (process.env.NODE_ENV === "production") {
    return createPrismaClient();
  }

  globalForPrisma.__senvoPrisma ??= createPrismaClient();
  return globalForPrisma.__senvoPrisma;
}

export {
  PrismaCategoryRepository,
  PrismaCollectionRepository,
  PrismaColorRepository,
  PrismaOrganizationRepository,
  PrismaProductRepository,
  PrismaProductVariantRepository,
  PrismaSizeRepository,
} from "./catalog/repositories.js";
export { PrismaCatalogMediaRepository } from "./catalog/media-repository.js";
export { PrismaBarcodeRepository } from "./catalog/barcode-repository.js";
export {
  PrismaBranchRepository,
  PrismaPosCounterRepository,
  PrismaStockLocationRepository,
} from "./organization/repositories.js";
export {
  PrismaOrganizationMembershipRepository,
  PrismaUserRepository,
} from "./identity/repositories.js";
export {
  PrismaPermissionRepository,
  PrismaRolePermissionRepository,
} from "./authorization/repositories.js";
export { PrismaUserCredentialRepository } from "./authentication/repositories.js";
export { PrismaCustomerAuthenticationRepository } from "./authentication/customer-authentication-repository.js";
export { PrismaAuditEntryRepository } from "./audit/repositories.js";
export { PrismaTransactionManager } from "./transaction/prisma-transaction-manager.js";
export {
  PrismaInventoryAllocationPolicyRepository,
  PrismaInventoryAllocationQueryRepository,
  PrismaInventoryAvailabilityQueryRepository,
  PrismaInventoryBalanceQueryRepository,
  PrismaInventoryMovementRepository,
  PrismaInventoryReservationConsumptionRepository,
  PrismaInventoryReservationRepository,
} from "./inventory/repositories.js";
export { PrismaInventoryReadRepository } from "./inventory/read-repository.js";
export {
  PrismaSalesOrderRepository,
  createTransactionScopedSalesOrderRepository,
} from "./sales/repositories.js";
export { PrismaSalesOrderReadRepository } from "./sales/read-repository.js";
export { PrismaSalesSourceRepository } from "./sales/source-repository.js";
export { PrismaPosRepository } from "./pos/repository.js";
export { PrismaPosCheckoutRepository } from "./pos/checkout-repository.js";
export { PrismaPosReturnRepository } from "./pos/return-repository.js";
export { PrismaPosSettlementRepository } from "./pos/settlement-repository.js";
export { PrismaPaymentRepository } from "./payment/repository.js";
export { PrismaPaymentRefundRepository } from "./payment/refund-repository.js";
export { PrismaOnlinePaymentRepository } from "./payment/online-payment-repository.js";
export { PrismaReceiptRepository } from "./receipt/repository.js";
export { PrismaStorefrontRepository } from "./storefront/repository.js";
export { PrismaWorkforceAuthenticationRepository } from "./workforce/workforce-authentication-repository.js";
export { PrismaWorkforcePasswordTransactionManager } from "./workforce/workforce-password-transaction.js";
export { PrismaSupplierRepository } from "./procurement/supplier-repository.js";
export { PrismaStockIntakeRepository } from "./procurement/stock-intake-repository.js";
export { PrismaPurchaseRepository } from "./procurement/purchase-repository.js";
export { PrismaCostRepository } from "./procurement/cost-repository.js";
export {
  PrismaSupplierPaymentRepository,
  PrismaSupplierLedgerRepository,
} from "./procurement/supplier-payment-repository.js";
export { PrismaCourierConsignmentRepository } from "./shipping/courier-consignment-repository.js";
