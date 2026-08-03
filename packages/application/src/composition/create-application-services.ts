import {
  PrismaCategoryRepository,
  PrismaCollectionRepository,
  PrismaColorRepository,
  PrismaInventoryMovementRepository,
  PrismaInventoryReadRepository,
  PrismaOrganizationRepository,
  PrismaProductRepository,
  PrismaProductVariantRepository,
  PrismaSalesOrderRepository,
  PrismaSalesOrderReadRepository,
  PrismaSizeRepository,
  PrismaTransactionManager,
  createPrismaClient,
  getPrismaClient,
} from "@senvo/database";
import type {
  CatalogCategoryManagementRepository,
  CatalogCollectionManagementRepository,
  CatalogColorManagementRepository,
  CatalogProductManagementRepository,
  CatalogProductVariantManagementRepository,
  CatalogSizeManagementRepository,
  InventoryMovementRepository,
  InventoryReadRepository,
  OrganizationRepository,
  SalesOrderRepository,
  SalesOrderReadRepository,
} from "@senvo/domain";
import { createConsoleLogger, type Logger } from "@senvo/logger";
import type { ApplicationAuthenticationService } from "../context/authentication.js";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import { systemClock, type Clock } from "../context/clock.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import { CatalogApplicationService } from "../catalog/catalog-application-service.js";
import { InventoryApplicationService } from "../inventory/inventory-application-service.js";
import { SalesApplicationService } from "../sales/sales-application-service.js";

type PrismaClientHandle = ReturnType<typeof createPrismaClient>;

export type CreateApplicationServicesOptions = {
  authenticationService?: ApplicationAuthenticationService;
  authorizationService?: ApplicationAuthorizationService;
  categoryRepository?: CatalogCategoryManagementRepository;
  clock?: Clock;
  collectionRepository?: CatalogCollectionManagementRepository;
  colorRepository?: CatalogColorManagementRepository;
  inventoryMovementRepository?: InventoryMovementRepository;
  inventoryReadRepository?: InventoryReadRepository;
  logger?: Logger;
  organizationRepository?: OrganizationRepository;
  prismaClient?: PrismaClientHandle;
  requestIdGenerator?: () => string;
  productRepository?: CatalogProductManagementRepository;
  productVariantRepository?: CatalogProductVariantManagementRepository;
  salesOrderRepository?: SalesOrderRepository;
  salesOrderReadRepository?: SalesOrderReadRepository;
  transactionManager?: ApplicationTransactionManager;
  sizeRepository?: CatalogSizeManagementRepository;
  useSharedPrismaClient?: boolean;
};

export type ApplicationServices = {
  catalog: CatalogApplicationService;
  disconnect(): Promise<void>;
  inventory: InventoryApplicationService;
  sales: SalesApplicationService;
};

export function createApplicationServices(
  options: CreateApplicationServicesOptions = {},
): ApplicationServices {
  const logger = options.logger ?? createConsoleLogger("application");
  const clock = options.clock ?? systemClock;
  let ownsPrismaClient = false;
  let prismaClient = options.prismaClient;
  let inventoryMovementRepository = options.inventoryMovementRepository;
  let inventoryReadRepository = options.inventoryReadRepository;
  let salesOrderRepository = options.salesOrderRepository;
  let salesOrderReadRepository = options.salesOrderReadRepository;
  let transactionManager = options.transactionManager;
  let categoryRepository = options.categoryRepository;
  let collectionRepository = options.collectionRepository;
  let colorRepository = options.colorRepository;
  let organizationRepository = options.organizationRepository;
  let productRepository = options.productRepository;
  let productVariantRepository = options.productVariantRepository;
  let sizeRepository = options.sizeRepository;

  if (
    !salesOrderRepository ||
    !inventoryMovementRepository ||
    !inventoryReadRepository ||
    !transactionManager ||
    !categoryRepository ||
    !collectionRepository ||
    !colorRepository ||
    !organizationRepository ||
    !productRepository ||
    !productVariantRepository ||
    !sizeRepository
  ) {
    if (!prismaClient) {
      const useSharedPrismaClient =
        options.useSharedPrismaClient ?? process.env.NODE_ENV !== "production";
      prismaClient = useSharedPrismaClient
        ? getPrismaClient()
        : createPrismaClient();
      ownsPrismaClient = !useSharedPrismaClient;
    }
  }

  if (!inventoryMovementRepository) {
    inventoryMovementRepository = new PrismaInventoryMovementRepository(
      requirePrismaClient(prismaClient),
    );
  }

  inventoryReadRepository ??= new PrismaInventoryReadRepository(
    requirePrismaClient(prismaClient),
  );

  if (!salesOrderRepository) {
    salesOrderRepository = new PrismaSalesOrderRepository(
      requirePrismaClient(prismaClient),
    );
  }

  if (!salesOrderReadRepository && prismaClient) {
    salesOrderReadRepository = new PrismaSalesOrderReadRepository(prismaClient);
  }

  if (!transactionManager && prismaClient) {
    transactionManager = new PrismaTransactionManager(
      requirePrismaClient(prismaClient),
    );
  }

  if (!transactionManager) {
    throw new Error(
      "Transaction manager is required for application services.",
    );
  }

  categoryRepository ??= new PrismaCategoryRepository(
    requirePrismaClient(prismaClient),
  );
  collectionRepository ??= new PrismaCollectionRepository(
    requirePrismaClient(prismaClient),
  );
  colorRepository ??= new PrismaColorRepository(
    requirePrismaClient(prismaClient),
  );
  organizationRepository ??= new PrismaOrganizationRepository(
    requirePrismaClient(prismaClient),
  );
  productRepository ??= new PrismaProductRepository(
    requirePrismaClient(prismaClient),
  );
  productVariantRepository ??= new PrismaProductVariantRepository(
    requirePrismaClient(prismaClient),
  );
  sizeRepository ??= new PrismaSizeRepository(
    requirePrismaClient(prismaClient),
  );

  return {
    catalog: new CatalogApplicationService({
      authorizationService: options.authorizationService,
      categories: categoryRepository,
      collections: collectionRepository,
      colors: colorRepository,
      organizations: organizationRepository,
      products: productRepository,
      productVariants: productVariantRepository,
      requestIdGenerator: options.requestIdGenerator,
      sizes: sizeRepository,
    }),
    disconnect: async () => {
      if (ownsPrismaClient) {
        await prismaClient?.$disconnect();
      }
    },
    inventory: new InventoryApplicationService({
      authorizationService: options.authorizationService,
      clock,
      inventoryMovementRepository,
      inventoryReadRepository,
      logger,
      requestIdGenerator: options.requestIdGenerator,
      transactionManager,
    }),
    sales: new SalesApplicationService({
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      clock,
      logger,
      requestIdGenerator: options.requestIdGenerator,
      salesOrderRepository,
      salesOrderReadRepository,
      transactionManager,
    }),
  };
}

function requirePrismaClient(
  prismaClient: PrismaClientHandle | undefined,
): PrismaClientHandle {
  if (!prismaClient) {
    throw new Error("Prisma client is required for default repositories.");
  }
  return prismaClient;
}
