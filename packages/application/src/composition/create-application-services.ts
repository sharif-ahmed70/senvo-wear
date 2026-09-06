import {
  PrismaBarcodeRepository,
  PrismaCategoryRepository,
  PrismaCollectionRepository,
  PrismaColorRepository,
  PrismaCatalogMediaRepository,
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
  PrismaPosReturnRepository,
  PrismaPaymentRepository,
  PrismaPaymentRefundRepository,
  PrismaOnlinePaymentRepository,
  PrismaReceiptRepository,
  PrismaSizeRepository,
  PrismaTransactionManager,
  PrismaStorefrontRepository,
  PrismaRolePermissionRepository,
  PrismaUserRepository,
  PrismaUserCredentialRepository,
  PrismaCustomerAuthenticationRepository,
  PrismaWorkforceAuthenticationRepository,
  createPrismaClient,
  getPrismaClient,
} from "@senvo/database";
import type {
  BarcodeRepository,
  CatalogCategoryManagementRepository,
  CatalogCollectionManagementRepository,
  CatalogColorManagementRepository,
  CatalogMediaRepository,
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
  PosReturnRepository,
  PaymentRepository,
  PaymentRefundRepository,
  PaymentRefundReceiptRepository,
  OnlinePaymentProviderAdapter,
  OnlinePaymentRepository,
  ReceiptRepository,
  PosReturnReceiptRepository,
  RolePermissionRepository,
  UserRepository,
  AuthenticationMessageProvider,
  AuthenticationSecretService,
  CustomerAuthenticationRepository,
  PasswordHasher,
  GoogleOAuthProvider,
  StorefrontRepository,
  UserCredentialRepository,
  WorkforceAuthenticationRepository,
} from "@senvo/domain";
import {
  SslCommerzAdapter,
  loadSslCommerzConfig,
} from "@senvo/payment-provider";
import { createConsoleLogger, type Logger } from "@senvo/logger";
import {
  LocalFileObjectStorageProvider,
  type ObjectStorageProvider,
} from "@senvo/storage";
import type { ApplicationAuthenticationService } from "../context/authentication.js";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import { systemClock, type Clock } from "../context/clock.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import { CatalogApplicationService } from "../catalog/catalog-application-service.js";
import { CatalogMediaApplicationService } from "../catalog/catalog-media-application-service.js";
import { InventoryApplicationService } from "../inventory/inventory-application-service.js";
import { OrganizationApplicationService } from "../organization/organization-application-service.js";
import { SalesApplicationService } from "../sales/sales-application-service.js";
import { PosApplicationService } from "../pos/pos-application-service.js";
import { StorefrontApplicationService } from "../storefront/storefront-application-service.js";
import { OnlinePaymentApplicationService } from "../payment/online-payment-application-service.js";
import { CustomerAuthenticationService } from "../authentication/customer-authentication-service.js";
import { WorkforceAuthenticationService } from "../workforce/workforce-authentication-service.js";

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
  mediaRepository?: CatalogMediaRepository;
  organizationRepository?: OrganizationRepository;
  membershipRepository?: OrganizationMembershipRepository &
    OrganizationTeamReadRepository;
  organizationProfileRepository?: OrganizationProfileRepository;
  posRepository?: PosRepository;
  posCheckoutRepository?: PosCheckoutRepository;
  paymentRepository?: PaymentRepository;
  paymentRefundRepository?: PaymentRefundRepository;
  paymentRefundReceiptRepository?: PaymentRefundReceiptRepository;
  onlinePaymentProvider?: OnlinePaymentProviderAdapter;
  onlinePaymentRepository?: OnlinePaymentRepository;
  receiptRepository?: ReceiptRepository;
  posReturnRepository?: PosReturnRepository;
  posReturnReceiptRepository?: PosReturnReceiptRepository;
  prismaClient?: PrismaClientHandle;
  requestIdGenerator?: () => string;
  rolePermissionRepository?: RolePermissionRepository;
  productRepository?: CatalogProductManagementRepository;
  productVariantRepository?: CatalogProductVariantManagementRepository;
  salesOrderRepository?: SalesOrderRepository;
  salesOrderReadRepository?: SalesOrderReadRepository;
  salesSourceRepository?: SalesSourceRepository;
  transactionManager?: ApplicationTransactionManager;
  storefrontOrganizationCode?: string;
  storefrontRepository?: StorefrontRepository;
  sizeRepository?: CatalogSizeManagementRepository;
  storageProvider?: ObjectStorageProvider;
  useSharedPrismaClient?: boolean;
  userRepository?: UserRepository;
  customerAuthenticationRepository?: CustomerAuthenticationRepository;
  workforceAuthenticationRepository?: WorkforceAuthenticationRepository;
  userCredentialRepository?: UserCredentialRepository;
  authenticationMessages?: AuthenticationMessageProvider;
  authenticationSecrets?: AuthenticationSecretService;
  passwordHasher?: PasswordHasher;
  fallbackPasswordHash?: string;
  googleOAuthProvider?: GoogleOAuthProvider;
};

export type ApplicationServices = {
  catalog: CatalogApplicationService;
  checkReadiness?(): Promise<boolean>;
  disconnect(): Promise<void>;
  inventory: InventoryApplicationService;
  organization: OrganizationApplicationService;
  pos: PosApplicationService;
  onlinePayments?: OnlinePaymentApplicationService;
  sales: SalesApplicationService;
  storefront: StorefrontApplicationService;
  customerAuthentication?: CustomerAuthenticationService;
  workforceAuthentication?: WorkforceAuthenticationService;
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
  let mediaRepository = options.mediaRepository;
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
  let paymentRepository = options.paymentRepository;
  let paymentRefundRepository = options.paymentRefundRepository;
  let paymentRefundReceiptRepository = options.paymentRefundReceiptRepository;
  let onlinePaymentRepository = options.onlinePaymentRepository;
  let receiptRepository = options.receiptRepository;
  let posReturnRepository = options.posReturnRepository;
  let posReturnReceiptRepository = options.posReturnReceiptRepository;
  let sizeRepository = options.sizeRepository;
  let storefrontRepository = options.storefrontRepository;
  let customerAuthenticationRepository =
    options.customerAuthenticationRepository;
  let workforceAuthenticationRepository =
    options.workforceAuthenticationRepository;
  let userCredentialRepository = options.userCredentialRepository;

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
    !paymentRepository ||
    !receiptRepository ||
    !sizeRepository ||
    !storefrontRepository
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
  storefrontRepository ??= new PrismaStorefrontRepository(
    requirePrismaClient(prismaClient),
  );
  if (!customerAuthenticationRepository && prismaClient) {
    customerAuthenticationRepository =
      new PrismaCustomerAuthenticationRepository(prismaClient);
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
  if (!mediaRepository && prismaClient) {
    mediaRepository = new PrismaCatalogMediaRepository(prismaClient);
  }
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
  receiptRepository ??= new PrismaReceiptRepository(
    requirePrismaClient(prismaClient),
  );
  paymentRepository ??= new PrismaPaymentRepository(
    requirePrismaClient(prismaClient),
  );
  if (!paymentRefundRepository && prismaClient)
    paymentRefundRepository = new PrismaPaymentRefundRepository(prismaClient);
  if (!paymentRefundReceiptRepository && prismaClient)
    paymentRefundReceiptRepository = new PrismaReceiptRepository(prismaClient);
  if (!onlinePaymentRepository && prismaClient)
    onlinePaymentRepository = new PrismaOnlinePaymentRepository(prismaClient);
  if (!posReturnRepository && prismaClient)
    posReturnRepository = new PrismaPosReturnRepository(prismaClient);
  if (!posReturnReceiptRepository && prismaClient)
    posReturnReceiptRepository = new PrismaReceiptRepository(prismaClient);

  if (!workforceAuthenticationRepository && prismaClient)
    workforceAuthenticationRepository =
      new PrismaWorkforceAuthenticationRepository(prismaClient);

  if (!userCredentialRepository && prismaClient)
    userCredentialRepository = new PrismaUserCredentialRepository(prismaClient);

  const mediaService = mediaRepository
    ? new CatalogMediaApplicationService({
        authorizationService: options.authorizationService,
        media: mediaRepository,
        products: productRepository,
        requestIdGenerator: options.requestIdGenerator,
        storage: resolveStorageProvider(options.storageProvider),
        transactionManager,
      })
    : undefined;

  const onlinePayments = onlinePaymentRepository
    ? new OnlinePaymentApplicationService({
        authenticationService: options.authenticationService,
        authorizationService: options.authorizationService,
        clock,
        provider:
          options.onlinePaymentProvider ??
          new SslCommerzAdapter(loadSslCommerzConfig(process.env)),
        repository: onlinePaymentRepository,
        requestIdGenerator: options.requestIdGenerator,
        transactionManager,
      })
    : undefined;

  const customerAuthentication =
    customerAuthenticationRepository &&
    options.authenticationMessages &&
    options.authenticationSecrets &&
    options.passwordHasher &&
    options.fallbackPasswordHash
      ? new CustomerAuthenticationService({
          fallbackPasswordHash: options.fallbackPasswordHash,
          messages: options.authenticationMessages,
          organizationCode:
            options.storefrontOrganizationCode ??
            process.env.STOREFRONT_ORGANIZATION_CODE ??
            "",
          passwords: options.passwordHasher,
          repository: customerAuthenticationRepository,
          secrets: options.authenticationSecrets,
          google: options.googleOAuthProvider,
        })
      : undefined;

  const workforceAuthentication =
    workforceAuthenticationRepository &&
    userCredentialRepository &&
    membershipRepository &&
    organizationRepository &&
    userRepository &&
    options.authenticationSecrets &&
    options.passwordHasher
      ? new WorkforceAuthenticationService({
          credentials: userCredentialRepository,
          fallbackPasswordHash: options.fallbackPasswordHash,
          memberships: membershipRepository,
          organizationResolver: {
            findOrganizationById: async (id: string) => {
              const organization = await organizationRepository.findById(id);
              return organization
                ? {
                    id: organization.id,
                    name: organization.name,
                    status: organization.status,
                  }
                : null;
            },
            findOrganizationIdByCode: async (code: string) => {
              const org = await organizationRepository.findByCode(code);
              return org?.id ?? null;
            },
          },
          passwords: options.passwordHasher,
          rateLimiter: customerAuthenticationRepository
            ? {
                consumeRateLimit: (input) =>
                  customerAuthenticationRepository.consumeRateLimit(input),
              }
            : undefined,
          rolePermissions: rolePermissionRepository,
          secrets: options.authenticationSecrets,
          users: userRepository,
          workforceSessions: workforceAuthenticationRepository,
        })
      : undefined;

  return {
    catalog: new CatalogApplicationService({
      barcodes: barcodeRepository,
      authorizationService: options.authorizationService,
      categories: categoryRepository,
      collections: collectionRepository,
      colors: colorRepository,
      mediaService,
      organizations: organizationRepository,
      products: productRepository,
      productVariants: productVariantRepository,
      requestIdGenerator: options.requestIdGenerator,
      sizes: sizeRepository,
      transactionManager,
    }),
    checkReadiness: async () => {
      try {
        if (prismaClient) {
          await (
            prismaClient as {
              $queryRaw(query: TemplateStringsArray): Promise<unknown>;
            }
          ).$queryRaw`SELECT 1`;
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
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
    onlinePayments,
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
      payments: paymentRepository,
      refunds: paymentRefundRepository,
      refundReceipts: paymentRefundReceiptRepository,
      receipts: receiptRepository,
      returns: posReturnRepository,
      returnReceipts: posReturnReceiptRepository,
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
    storefront: new StorefrontApplicationService({
      mediaService,
      onlinePayments,
      organizationCode:
        options.storefrontOrganizationCode ??
        process.env.STOREFRONT_ORGANIZATION_CODE ??
        "",
      repository: storefrontRepository,
      requestIdGenerator: options.requestIdGenerator,
      transactionManager,
    }),
    customerAuthentication,
    workforceAuthentication,
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

function resolveStorageProvider(
  provider: ObjectStorageProvider | undefined,
): ObjectStorageProvider {
  if (provider) return provider;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "A production object storage provider must be configured explicitly.",
    );
  }
  return new LocalFileObjectStorageProvider(
    process.env.MEDIA_STORAGE_ROOT ?? ".senvo-media",
  );
}
