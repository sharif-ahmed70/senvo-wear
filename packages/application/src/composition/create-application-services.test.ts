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
  OrganizationRepository,
  PaymentRepository,
  PosCheckoutRepository,
  ReceiptRepository,
  SalesOrderRepository,
  StorefrontRepository,
  SupplierRepository,
} from "@senvo/domain";
import { describe, expect, it } from "vitest";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import { createApplicationServices } from "./create-application-services.js";

describe("createApplicationServices", () => {
  it("composes sales services with an injected repository without opening Prisma", async () => {
    const services = createApplicationServices({
      barcodeRepository: fakeBarcodeRepository,
      branchRepository: {} as never,
      inventoryMovementRepository: fakeInventoryMovementRepository,
      inventoryReadRepository: fakeInventoryReadRepository,
      categoryRepository: fakeCategoryRepository,
      collectionRepository: fakeCollectionRepository,
      colorRepository: fakeColorRepository,
      logger: nullLogger,
      membershipRepository: {} as never,
      requestIdGenerator: () => "generated_request_1",
      organizationProfileRepository: {} as never,
      organizationRepository: fakeOrganizationRepository,
      productRepository: fakeProductRepository,
      productVariantRepository: fakeProductVariantRepository,
      posRepository: {} as never,
      posCheckoutRepository: fakePosCheckoutRepository,
      paymentRepository: fakePaymentRepository,
      receiptRepository: fakeReceiptRepository,
      rolePermissionRepository: {} as never,
      salesOrderRepository: fakeSalesOrderRepository,
      salesSourceRepository: {} as never,
      storefrontRepository: fakeStorefrontRepository,
      transactionManager: fakeTransactionManager,
      sizeRepository: fakeSizeRepository,
      supplierRepository: fakeSupplierRepository,
      userRepository: {} as never,
    });

    const result = await services.sales.getOrderById(
      { organizationId: "11111111-1111-4111-8111-111111111111" },
      { salesOrderId: "22222222-2222-4222-8222-222222222222" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "NOT_FOUND",
        requestId: "generated_request_1",
      });
    }
    await expect(services.disconnect()).resolves.toBeUndefined();
  });
});

const fakeInventoryMovementRepository: InventoryMovementRepository = {
  createDraft: () => Promise.reject(unreachableError()),
  findById: () => Promise.resolve(null),
  findByIdempotencyKey: () => Promise.resolve(null),
  getPayloadSignature: () => Promise.resolve(null),
  list: () => Promise.resolve({ hasMore: false, items: [], nextCursor: null }),
  post: () => Promise.reject(unreachableError()),
  replaceDraftLines: () => Promise.reject(unreachableError()),
  reversePostedMovement: () => Promise.reject(unreachableError()),
};

const fakeBarcodeRepository: BarcodeRepository = {
  create: () => Promise.reject(unreachableError()),
  existsByValue: () => Promise.resolve(false),
  findActiveByVariant: () => Promise.resolve(null),
  findById: () => Promise.resolve(null),
  listByVariant: () => Promise.resolve([]),
  lookupActive: () => Promise.resolve(null),
  updateStatus: () => Promise.resolve(null),
  variantExists: () => Promise.resolve(false),
};

const fakeInventoryReadRepository: InventoryReadRepository = {
  listProductSummaries: () =>
    Promise.resolve({
      hasMore: false,
      items: [],
      nextCursor: null,
    }),
  getVariantAvailability: () => Promise.resolve(null),
  listAvailability: () =>
    Promise.resolve({ hasMore: false, items: [], nextCursor: null }),
  listLocations: () =>
    Promise.resolve({ hasMore: false, items: [], nextCursor: null }),
  listMovements: () =>
    Promise.resolve({ hasMore: false, items: [], nextCursor: null }),
};

const fakeCategoryRepository: CatalogCategoryManagementRepository = {
  create: () => Promise.reject(unreachableError()),
  findById: () => Promise.resolve(null),
  findBySlug: () => Promise.resolve(null),
  list: () => Promise.resolve([]),
  updateStatus: () => Promise.resolve(null),
};

const fakeCollectionRepository: CatalogCollectionManagementRepository = {
  create: () => Promise.reject(unreachableError()),
  findById: () => Promise.resolve(null),
  findBySlug: () => Promise.resolve(null),
  list: () => Promise.resolve([]),
};

const fakeColorRepository: CatalogColorManagementRepository = {
  create: () => Promise.reject(unreachableError()),
  findByCode: () => Promise.resolve(null),
  findById: () => Promise.resolve(null),
  findByNormalizedName: () => Promise.resolve(null),
  list: () => Promise.resolve([]),
  updateStatus: () => Promise.resolve(null),
};

const fakeOrganizationRepository: OrganizationRepository = {
  create: () => Promise.reject(unreachableError()),
  findByCode: () => Promise.resolve(null),
  findById: () => Promise.resolve(null),
};

const fakeProductRepository: CatalogProductManagementRepository = {
  assignCollection: () => Promise.reject(unreachableError()),
  create: () => Promise.reject(unreachableError()),
  findByCode: () => Promise.resolve(null),
  findById: () => Promise.resolve(null),
  findBySlug: () => Promise.resolve(null),
  list: () => Promise.resolve([]),
  listCollectionProductOrder: () => Promise.resolve([]),
  listCollectionIds: () => Promise.resolve([]),
  reorderCollectionProducts: () => Promise.resolve(),
};

const fakeProductVariantRepository: CatalogProductVariantManagementRepository =
  {
    create: () => Promise.reject(unreachableError()),
    existsBySku: () => Promise.resolve(false),
    existsVariantCombination: () => Promise.resolve(false),
    listByProduct: () => Promise.resolve([]),
    updatePrice: () => Promise.resolve(null),
  };

const fakeSizeRepository: CatalogSizeManagementRepository = {
  create: () => Promise.reject(unreachableError()),
  findByCode: () => Promise.resolve(null),
  findById: () => Promise.resolve(null),
  list: () => Promise.resolve([]),
  updateStatus: () => Promise.resolve(null),
};

const fakeTransactionManager: ApplicationTransactionManager = {
  execute: () => Promise.reject(unreachableError()),
};

const fakePosCheckoutRepository: PosCheckoutRepository = {
  createCompleted: () => Promise.reject(unreachableError()),
  findById: () => Promise.resolve(null),
  list: () => Promise.resolve([]),
  prepare: () => Promise.resolve(null),
};

const fakeReceiptRepository: ReceiptRepository = {
  create: () => Promise.reject(unreachableError()),
  createPaymentCollectionReceipt: () => Promise.reject(unreachableError()),
  findByCheckoutId: () => Promise.resolve(null),
  findPaymentCollectionReceiptById: () => Promise.resolve(null),
};

const fakePaymentRepository: PaymentRepository = {
  create: () => Promise.reject(unreachableError()),
  createCollection: () => Promise.reject(unreachableError()),
  findAccountByCheckoutId: () => Promise.resolve(null),
  prepareCollection: () => Promise.resolve(null),
};

const fakeSalesOrderRepository: SalesOrderRepository = {
  amendDraft: () => Promise.reject(unreachableError()),
  cancel: () => Promise.reject(unreachableError()),
  confirm: () => Promise.reject(unreachableError()),
  createDraft: () => Promise.reject(unreachableError()),
  findById: () => Promise.resolve(null),
  findByIdempotencyKey: () => Promise.resolve(null),
  findByOrderNumber: () => Promise.resolve(null),
  findDueStorefrontReservationOrderIds: () => Promise.resolve([]),
  findLegacyNullExpiryCandidates: () => Promise.resolve([]),
  fulfill: () => Promise.reject(unreachableError()),
  list: () => Promise.resolve({ hasMore: false, items: [], nextCursor: null }),
  normalizeLegacyStorefrontReservation: (record) =>
    Promise.resolve({
      orderId: record.salesOrderId,
      previousExpiresAt: null,
      reclaimed: false,
      status: "SKIPPED",
    }),
  reclaimExpiredStorefrontReservation: (record) =>
    Promise.resolve({
      expiresAt: null,
      orderId: record.salesOrderId,
      reclaimed: false,
    }),
  reserve: () => Promise.reject(unreachableError()),
};

const fakeStorefrontRepository: StorefrontRepository = {
  createCommerceProfile: () => Promise.reject(unreachableError()),
  findCheckoutByIdempotencyKey: () => Promise.resolve(null),
  getProductBySlug: () => Promise.resolve(null),
  listCatalog: () =>
    Promise.resolve({
      categories: [],
      collections: [],
      hasMore: false,
      page: 1,
      pageSize: 24,
      products: [],
    }),
  loadCheckoutFacts: () => Promise.reject(unreachableError()),
  lockCheckoutAttempt: () => Promise.reject(unreachableError()),
  resolveActiveOrganizationByCode: () => Promise.resolve(null),
};

const fakeSupplierRepository: SupplierRepository = {
  create: () => Promise.reject(unreachableError()),
  deactivate: () => Promise.resolve(null),
  findByCode: () => Promise.resolve(null),
  findById: () => Promise.resolve(null),
  list: () => Promise.resolve([]),
  update: () => Promise.resolve(null),
};

const nullLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

function unreachableError(): Error {
  return new Error("Unexpected repository call.");
}
