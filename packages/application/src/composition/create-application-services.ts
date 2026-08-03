import {
  PrismaBarcodeRepository,
  PrismaCategoryRepository,
  PrismaCollectionRepository,
  PrismaColorRepository,
  PrismaInventoryMovementRepository,
  PrismaInventoryReadRepository,
  PrismaBranchRepository,
  PrismaOrganizationMembershipRepository,
  PrismaOrganizationRepository,
  PrismaProductRepository,
  PrismaProductVariantRepository,
  PrismaSalesOrderRepository,
  PrismaSalesOrderReadRepository,
  PrismaSalesSourceRepository,
  PrismaPosRepository,
  PrismaPosCheckoutRepository,
  PrismaSizeRepository,
  PrismaTransactionManager,
  PrismaRolePermissionRepository,
  PrismaUserRepository,
  createPrismaClient,
  getPrismaClient,
} from "@senvo/database";
import type {
  BarcodeRepository,
  CatalogCategoryManagementRepository,
  CatalogCollectionManagementRepository,
  CatalogColorManagementRepository,
  CatalogProductManagementRepository,
  CatalogProductVariantManagementRepository,
  CatalogSizeManagementRepository,
  InventoryMovementRepository,
  InventoryReadRepository,
  BranchRepository,
  OrganizationMembershipRepository,
  OrganizationProfileRepository,
  OrganizationTeamReadRepository,
  OrganizationRepository,
  SalesOrderRepository,
  SalesOrderReadRepository,
  SalesSourceRepository,
  PosRepository,
  PosCheckoutRepository,
  RolePermissionRepository,
  UserRepository,
} from "@senvo/domain";
import { createConsoleLogger, type Logger } from "@senvo/logger";
import type { ApplicationAuthenticationService } from "../context/authentication.js";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import { systemClock, type Clock } from "../context/clock.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import { CatalogApplicationService } from "../catalog/catalog-application-service.js";
import { InventoryApplicationService } from "../inventory/inventory-application-service.js";
import { OrganizationApplicationService } from "../organization/organization-application-service.js";
import { SalesApplicationService } from "../sales/sales-application-service.js";
import { PosApplicationService } from "../pos/pos-application-service.js";

type PrismaClientHandle = ReturnType<typeof createPrismaClient>;

export type CreateApplicationServicesOptions = {
  authenticationService?: ApplicationAuthenticationService;
  authorizationService?: ApplicationAuthorizationService;
  barcodeRepository?: BarcodeRepository;
  branchRepository?: BranchRepository;
  categoryRepository?: CatalogCategoryManagementRepository;
  clock?: Clock;
  collectionRepository?: CatalogCollectionManagementRepository;
  colorRepository?: CatalogColorManagementRepository;
  inventoryMovementRepository?: InventoryMovementRepository;
  inventoryReadRepository?: InventoryReadRepository;
  logger?: Logger;
  organizationRepository?: OrganizationRepository;
  membershipRepository?: OrganizationMembershipRepository &
    OrganizationTeamReadRepository;
  organizationProfileRepository?: OrganizationProfileRepository;
  posRepository?: PosRepository;
  posCheckoutRepository?: PosCheckoutRepository;
  prismaClient?: PrismaClientHandle;
  requestIdGenerator?: () => string;
  rolePermissionRepository?: RolePermissionRepository;
  productRepository?: CatalogProductManagementRepository;
  productVariantRepository?: CatalogProductVariantManagementRepository;
  salesOrderRepository?: SalesOrderRepository;
  salesOrderReadRepository?: SalesOrderReadRepository;
  salesSourceRepository?: SalesSourceRepository;
  transactionManager?: ApplicationTransactionManager;
  sizeRepository?: CatalogSizeManagementRepository;
  useSharedPrismaClient?: boolean;
  userRepository?: UserRepository;
};

export type ApplicationServices = {
  catalog: CatalogApplicationService;
  disconnect(): Promise<void>;
  inventory: InventoryApplicationService;
  organization: OrganizationApplicationService;
  pos: PosApplicationService;
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
  let salesSourceRepository = options.salesSourceRepository;
  let transactionManager = options.transactionManager;
  let categoryRepository = options.categoryRepository;
  let barcodeRepository = options.barcodeRepository;
  let collectionRepository = options.collectionRepository;
  let colorRepository = options.colorRepository;
  let organizationRepository = options.organizationRepository;
  let organizationProfileRepository = options.organizationProfileRepository;
  let branchRepository = options.branchRepository;
  let membershipRepository = options.membershipRepository;
  let rolePermissionRepository = options.rolePermissionRepository;
  let userRepository = options.userRepository;
  let productRepository = options.productRepository;
  let productVariantRepository = options.productVariantRepository;
  let posRepository = options.posRepository;
  let posCheckoutRepository = options.posCheckoutRepository;
  let sizeRepository = options.sizeRepository;

  if (
    !salesOrderRepository ||
    !inventoryMovementRepository ||
    !inventoryReadRepository ||
    !transactionManager ||
    !categoryRepository ||
    !barcodeRepository ||
    !collectionRepository ||
    !colorRepository ||
    !organizationRepository ||
    !organizationProfileRepository ||
    !branchRepository ||
    !membershipRepository ||
    !rolePermissionRepository ||
    !userRepository ||
    !productRepository ||
    !productVariantRepository ||
    !posRepository ||
    !posCheckoutRepository ||
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

  barcodeRepository ??= new PrismaBarcodeRepository(
    requirePrismaClient(prismaClient),
  );

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

  if (!salesSourceRepository && prismaClient) {
    salesSourceRepository = new PrismaSalesSourceRepository(prismaClient);
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
  organizationProfileRepository ??=
    organizationRepository as OrganizationRepository &
      OrganizationProfileRepository;
  branchRepository ??= new PrismaBranchRepository(
    requirePrismaClient(prismaClient),
  );
  membershipRepository ??= new PrismaOrganizationMembershipRepository(
    requirePrismaClient(prismaClient),
  );
  rolePermissionRepository ??= new PrismaRolePermissionRepository(
    requirePrismaClient(prismaClient),
  );
  userRepository ??= new PrismaUserRepository(
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
  posRepository ??= new PrismaPosRepository(requirePrismaClient(prismaClient));
  posCheckoutRepository ??= new PrismaPosCheckoutRepository(
    requirePrismaClient(prismaClient),
  );

  return {
    catalog: new CatalogApplicationService({
      barcodes: barcodeRepository,
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
    organization: new OrganizationApplicationService({
      authorizationService: options.authorizationService,
      branches: branchRepository,
      memberships: membershipRepository,
      organizations: organizationProfileRepository,
      requestIdGenerator: options.requestIdGenerator,
      rolePermissions: rolePermissionRepository,
      users: userRepository,
    }),
    pos: new PosApplicationService({
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      barcodes: barcodeRepository,
      branches: branchRepository,
      clock,
      checkouts: posCheckoutRepository,
      inventory: inventoryReadRepository,
      memberships: membershipRepository,
      pos: posRepository,
      requestIdGenerator: options.requestIdGenerator,
      salesSources:
        salesSourceRepository ??
        new PrismaSalesSourceRepository(requirePrismaClient(prismaClient)),
      transactionManager,
      users: userRepository,
    }),
    sales: new SalesApplicationService({
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      clock,
      logger,
      requestIdGenerator: options.requestIdGenerator,
      salesOrderRepository,
      salesOrderReadRepository,
      salesSourceRepository,
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
