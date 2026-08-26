export type EntityId = string & { readonly __brand: "EntityId" };

export type FoundationModuleName =
  | "identity"
  | "organization"
  | "catalog"
  | "pricing"
  | "inventory"
  | "procurement"
  | "sales"
  | "orders"
  | "payments"
  | "after-sales"
  | "customers"
  | "finance"
  | "marketing"
  | "analytics"
  | "audit"
  | "settings";

export {
  ApplicationError,
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  IntegrationError,
  InternalApplicationError,
  NotFoundError,
  RateLimitError,
  ValidationApplicationError,
} from "./errors.js";
export type {
  ApplicationErrorCategory,
  PublicApplicationError,
} from "./errors.js";
export type {
  BarcodeLookupResult,
  BarcodeStatus,
  BarcodeType,
  Category,
  Collection,
  Color,
  Organization,
  Product,
  ProductVariant,
  Size,
  VariantBarcode,
} from "./catalog/domain/models.js";
export type {
  CatalogMediaLink,
  CatalogMediaLinkStatus,
  CatalogMediaRole,
  MediaAsset,
  MediaAssetStatus,
  PrimaryProductMedia,
  ProductMedia,
} from "./catalog/domain/media-models.js";
export type {
  CatalogMediaRepository,
  CreatePrimaryProductMediaRecord,
  CreateProductMediaRecord,
} from "./catalog/repositories/catalog-media-repository.js";
export {
  createVariantBarcode,
  listVariantBarcodes,
  lookupVariantByBarcode,
  normalizeBarcodeLookupValue,
  normalizeBarcodeValue,
  updateBarcodeStatus,
} from "./catalog/application/barcode-use-cases.js";
export type {
  Branch,
  BranchStatus,
  BranchType,
  PosCounter,
  PosCounterStatus,
  StockLocation,
  StockLocationStatus,
  StockLocationType,
} from "./organization/domain/models.js";
export type {
  InventoryMovement,
  InventoryMovementLine,
  InventoryMovementStatus,
  InventoryMovementType,
  InventoryAllocationLine,
  InventoryAllocationLineAvailability,
  InventoryAllocationPolicy,
  InventoryAllocationPolicyLocation,
  InventoryAllocationPolicyStatus,
  InventoryAllocationPreview,
  InventoryAllocationStrategy,
  InventoryAvailability,
  InventoryReservation,
  InventoryReservationLine,
  InventoryReservationStatus,
  OnHandBalance,
} from "./inventory/domain/models.js";
export type {
  SalesBooth,
  SalesBoothStatus,
  SalesChannel,
  SalesOrder,
  SalesOrderChannel,
  SalesOrderLine,
  SalesOrderStatus,
} from "./sales/domain/models.js";
export type {
  PosCheckout,
  PosCheckoutPreparation,
  PosCheckoutStatus,
  PosCart,
  PosCartDetails,
  PosCartLine,
  PosSaleLookup,
  SalesCounter,
  SalesCounterStatus,
  SalesCounterType,
  SalesSession,
  SalesSessionStatus,
  SellableVariant,
} from "./pos/domain/models.js";
export type {
  PosReturnAccount,
  PosReturnReasonCode,
  PosReturnReceipt,
  PosReturnableLine,
  PosSaleReturn,
  PosSaleReturnLine,
} from "./pos/domain/return-models.js";
export {
  calculateAllocatedReturnCredit,
  getPosReturnAccount,
  getPosReturnReceipt,
  recordPosSaleReturn,
} from "./pos/application/return-use-cases.js";
export type {
  CreatePosSaleReturnRecord,
  PosReturnPreparation,
  PosReturnRepository,
} from "./pos/repositories/pos-return-repository.js";
export {
  checkoutCart,
  getCheckoutStatus,
  listCheckoutHistory,
} from "./pos/application/checkout-use-cases.js";
export type { PosCheckoutSalesOrderRepository } from "./pos/application/checkout-use-cases.js";
export {
  addPosCartItem,
  addCartItem,
  changeSalesCounterStatus,
  closeSalesSession,
  createSalesCounter,
  getPosCart,
  listSalesCounters,
  listSalesSessions,
  listCurrentUserSalesSessions,
  lookupPosSale,
  lookupBarcodeForSale,
  openSalesSession,
  removePosCartItem,
  removeCartItem,
  updatePosCartItem,
  updateCartQuantity,
} from "./pos/application/pos-use-cases.js";
export type { PosRepository } from "./pos/repositories/pos-repository.js";
export type { PosCheckoutRepository } from "./pos/repositories/pos-checkout-repository.js";
export {
  calculateCumulativePaymentBalance,
  calculateCheckoutSettlement,
  calculatePaymentCollection,
  calculatePaymentRefund,
  calculatePaymentBalance,
  createPaymentCollectionRequestSignature,
  createPaymentRefundRequestSignature,
  createPaymentRequestSignature,
  normalizePaymentInstructions,
} from "./payment/application/payment-rules.js";
export {
  getPaymentRefundAccount,
  getPaymentRefundReceipt,
  recordCheckoutRefund,
} from "./payment/application/payment-refund-use-cases.js";
export type {
  PaymentRefund,
  PaymentRefundAccount,
  PaymentRefundLine,
  PaymentRefundPreparation,
  PaymentRefundReceipt,
} from "./payment/domain/refund-models.js";
export type {
  CreatePaymentRefundRecord,
  PaymentRefundReceiptRepository,
  PaymentRefundRepository,
} from "./payment/repositories/payment-refund-repository.js";
export type {
  CheckoutPaymentStatus,
  CheckoutSettlementStatus,
  PaymentBalance,
  PaymentBalanceStatus,
  PaymentBatch,
  PaymentAccount,
  PaymentCollection,
  PaymentCollectionLine,
  PaymentCollectionPreparation,
  PaymentInstruction,
  PaymentLine,
  PaymentMethod,
} from "./payment/domain/models.js";
export type {
  OnlinePaymentAttempt,
  OnlinePaymentAttemptStatus,
  OnlinePaymentOrderFacts,
  OnlinePaymentProjection,
  OnlinePaymentProvider,
  OnlinePaymentResolutionStatus,
  PaymentReconciliation,
  ProviderPaymentObservation,
  ProviderRefund,
  ProviderRefundStatus,
  ProviderSessionRequest,
  ProviderSessionResult,
} from "./payment/domain/online-payment-models.js";
export type {
  OnlinePaymentProviderAdapter,
  OnlinePaymentRepository,
} from "./payment/repositories/online-payment-repository.js";
export type {
  CreatePaymentBatchRecord,
  CreatePaymentCollectionRecord,
  PaymentRepository,
} from "./payment/repositories/payment-repository.js";
export {
  collectOutstandingPayment,
  getPaymentAccount,
} from "./payment/application/payment-collection-use-cases.js";
export {
  getPaymentCollectionReceipt,
  getSalesReceipt,
} from "./receipt/application/receipt-use-cases.js";
export type {
  ReceiptDocument,
  PaymentCollectionReceipt,
  SalesReceipt,
  SalesReceiptLine,
  SalesReceiptPayment,
} from "./receipt/domain/models.js";
export type {
  CreatePosReturnReceiptRecord,
  CreateSalesReceiptRecord,
  CreatePaymentCollectionReceiptRecord,
  PosReturnReceiptRepository,
  ReceiptRepository,
} from "./receipt/repositories/receipt-repository.js";
export {
  changeSalesBoothStatus,
  createSalesBooth,
  getSalesSourceSummary,
  listSalesBooths,
  validateOrderSalesSource,
} from "./sales/application/source-use-cases.js";
export type {
  OrganizationMembership,
  OrganizationMembershipStatus,
  Permission,
  Role,
  User,
  UserStatus,
} from "./identity/domain/models.js";
export type {
  AuthorizationContext,
  AuthorizationDecision,
  Permission as AuthorizationPermission,
  PermissionAction,
  PermissionKey,
  PermissionResource,
  PermissionStatus,
  RolePermission,
} from "./authorization/domain/models.js";
export type {
  AuthenticatedPrincipal,
  AuthenticationContext,
  AuthenticationSessionBoundary,
  CredentialStatus,
  IdentityProvider,
  PasswordHasher,
  UserCredential,
} from "./authentication/domain/models.js";
export type {
  AuthenticationChallenge,
  AuthenticationChallengeType,
  AuthenticationMessage,
  AuthenticationMessageProvider,
  AuthenticationSecretService,
  AuthenticationSession,
  CustomerAccountStatus,
  CustomerAuthenticationProfile,
  GoogleIdentity,
  GoogleOAuthProvider,
} from "./authentication/domain/models.js";
export type {
  CustomerAuthenticationRepository,
  CustomerAuthenticationStatus,
  PasswordCustomerRecord,
} from "./authentication/repositories/customer-authentication-repository.js";
export {
  assertCategoryParentIsNotSelf,
  assertNonNegativeSortOrder,
  normalizeCode,
  normalizeDisplayName,
  normalizeHexValue,
  normalizeSku,
  normalizeSlug,
  slugFromDisplayName,
} from "./catalog/domain/value-objects.js";
export {
  createCategory,
  createCollection,
  createColor,
  createOrganization,
  createProduct,
  createProductVariant,
  createSize,
} from "./catalog/application/create-use-cases.js";
export {
  createBranch,
  createPosCounter,
  createStockLocation,
} from "./organization/application/create-use-cases.js";
export {
  changeBranchStatus,
  changePosCounterStatus,
  changeStockLocationStatus,
  updateBranchMetadata,
  updatePosCounterMetadata,
  updateStockLocationMetadata,
} from "./organization/application/lifecycle-use-cases.js";
export {
  encodeCursor,
  getBranchById,
  getPosCounterById,
  getStockLocationById,
  listBranches,
  listPosCounters,
  listStockLocations,
  parseCursor,
} from "./organization/application/read-use-cases.js";
export { consumeInventoryReservation } from "./inventory/application/consumption-use-cases.js";
export {
  allocateAndCreateInventoryReservation,
  changeInventoryAllocationPolicyStatus,
  createInventoryAllocationPolicy,
  getInventoryAllocationPolicyById,
  listInventoryAllocationPolicies,
  previewInventoryAllocation,
  replaceInventoryAllocationPolicyLocations,
  updateInventoryAllocationPolicyMetadata,
} from "./inventory/application/allocation-use-cases.js";
export {
  createInventoryMovement,
  encodeBalanceCursor,
  encodeMovementCursor,
  getInventoryMovementById,
  getOnHandBalance,
  listInventoryMovements,
  listLocationBalances,
  parseBalanceCursor,
  parseMovementCursor,
  postInventoryMovement,
  replaceDraftMovementLines,
  reverseInventoryMovement,
} from "./inventory/application/movement-use-cases.js";
export {
  confirmInventoryReservation,
  createInventoryReservation,
  encodeAvailabilityCursor,
  encodeReservationCursor,
  expireInventoryReservation,
  getAvailableToSell,
  getInventoryReservationById,
  getReservedQuantity,
  listInventoryReservations,
  listLocationAvailability,
  parseAvailabilityCursor,
  parseReservationCursor,
  releaseInventoryReservation,
} from "./inventory/application/reservation-use-cases.js";
export {
  getVariantAvailability,
  listInventoryAvailability,
  listInventoryMovementHistory,
  listStockLocations as listInventoryStockLocations,
} from "./inventory/application/read-query-use-cases.js";
export {
  cancelSalesOrder,
  amendDraftSalesOrder,
  calculateSalesOrderTotals,
  confirmSalesOrder,
  createSalesOrder,
  encodeSalesOrderCursor,
  fulfillSalesOrder,
  getSalesOrderById,
  listSalesOrders,
  replaceDraftSalesOrderLines,
  parseSalesOrderCursor,
  reserveSalesOrder,
  updateDraftSalesOrderMetadata,
} from "./sales/application/order-use-cases.js";
export {
  assignOrganizationMembershipRole,
  createOrganizationMembership,
  createUser,
  updateOrganizationMembershipStatus,
  validateOrganizationAccess,
} from "./identity/application/identity-use-cases.js";
export {
  assignRolePermission,
  authorize,
  createPermission,
} from "./authorization/application/authorization-service.js";
export {
  defaultRolePermissions,
  roleAllowsPermission,
} from "./authorization/application/role-permission-policy.js";
export type {
  CreateBranchInput,
  CreatePosCounterInput,
  CreateStockLocationInput,
} from "./organization/application/create-use-cases.js";
export type {
  ChangeBranchStatusInput,
  ChangePosCounterStatusInput,
  ChangeStockLocationStatusInput,
  UpdateBranchMetadataInput,
  UpdatePosCounterMetadataInput,
  UpdateStockLocationMetadataInput,
} from "./organization/application/lifecycle-use-cases.js";
export type {
  GetBranchByIdInput,
  GetPosCounterByIdInput,
  GetStockLocationByIdInput,
  ListBranchesInput,
  ListPosCountersInput,
  ListStockLocationsInput,
} from "./organization/application/read-use-cases.js";
export type { ConsumeInventoryReservationInput } from "./inventory/application/consumption-use-cases.js";
export type {
  AllocateAndCreateInventoryReservationInput,
  ChangeInventoryAllocationPolicyStatusInput,
  CreateInventoryAllocationPolicyInput,
  GetInventoryAllocationPolicyByIdInput,
  ListInventoryAllocationPoliciesInput,
  PreviewInventoryAllocationInput,
  ReplaceInventoryAllocationPolicyLocationsInput,
  UpdateInventoryAllocationPolicyMetadataInput,
} from "./inventory/application/allocation-use-cases.js";
export type {
  CreateInventoryMovementInput,
  GetInventoryMovementByIdInput,
  GetOnHandBalanceInput,
  ListInventoryMovementsInput,
  ListLocationBalancesInput,
  PostInventoryMovementInput,
  ReplaceDraftMovementLinesInput,
  ReverseInventoryMovementInput,
} from "./inventory/application/movement-use-cases.js";
export type {
  ChangeInventoryReservationStatusInput,
  CreateInventoryReservationInput,
  GetAvailableToSellInput,
  GetInventoryReservationByIdInput,
  GetReservedQuantityInput,
  ListInventoryReservationsInput,
  ListLocationAvailabilityInput,
} from "./inventory/application/reservation-use-cases.js";
export type {
  GetVariantAvailabilityInput,
  InventoryReadPageInput,
  ListInventoryAvailabilityInput,
  ListInventoryMovementHistoryInput,
  ListStockLocationsInput as ListInventoryStockLocationsInput,
} from "./inventory/application/read-query-use-cases.js";
export type {
  AssignRoleInput,
  CreateOrganizationMembershipInput,
  CreateUserInput,
  UpdateMembershipStatusInput,
  ValidateOrganizationAccessInput,
} from "./identity/application/identity-use-cases.js";
export type {
  AssignRolePermissionInput,
  AuthorizationRepositories,
  AuthorizationService,
  AuthorizeInput,
  CreatePermissionInput,
} from "./authorization/application/authorization-service.js";
export type {
  ConfirmSalesOrderInput,
  AmendDraftSalesOrderInput,
  CreateSalesOrderInput,
  FulfillSalesOrderInput,
  GetSalesOrderByIdInput,
  ListSalesOrdersInput,
  ReplaceDraftSalesOrderLinesInput,
  ReserveSalesOrderInput,
  UpdateDraftSalesOrderMetadataInput,
} from "./sales/application/order-use-cases.js";
export type {
  BarcodeRepository,
  CategoryRepository,
  CatalogCategoryManagementRepository,
  CatalogCollectionManagementRepository,
  CatalogColorManagementRepository,
  CatalogListFilter,
  CatalogProductManagementRepository,
  CatalogProductVariantManagementRepository,
  CatalogSizeManagementRepository,
  CollectionRepository,
  ColorRepository,
  CreateCategoryRecord,
  CreateVariantBarcodeRecord,
  CreateCollectionRecord,
  CreateColorRecord,
  CreateOrganizationRecord,
  CreateProductRecord,
  CreateProductVariantRecord,
  CreateSizeRecord,
  OrganizationRepository,
  ProductRepository,
  ProductVariantRepository,
  SizeRepository,
} from "./catalog/repositories/catalog-repositories.js";
export type {
  BranchChildStatusCounts,
  BranchListFilter,
  BranchMetadataPatch,
  BranchRepository,
  CreateBranchRecord,
  CreatePosCounterRecord,
  CreateStockLocationRecord,
  CursorPageRequest,
  CursorPageResult,
  OrganizationLookupRepository,
  OrganizationProfilePatch,
  OrganizationProfileRepository,
  OrganizationTeamMember,
  OrganizationTeamReadRepository,
  PosCounterListFilter,
  PosCounterMetadataPatch,
  PosCounterRepository,
  StockLocationListFilter,
  StockLocationMetadataPatch,
  StockLocationRepository,
} from "./organization/repositories/organization-repositories.js";
export {
  getOrganizationProfile,
  listOrganizationTeam,
  updateOrganizationProfile,
} from "./organization/application/admin-management-use-cases.js";
export type { UpdateOrganizationProfileInput } from "./organization/application/admin-management-use-cases.js";
export type {
  AllocateInventoryReservationRecord,
  AllocateInventoryReservationResult,
  ChangeInventoryAllocationPolicyStatusRecord,
  ConsumeInventoryReservationRecord,
  ConsumeInventoryReservationResult,
  CreateInventoryAllocationPolicyRecord,
  CreateInventoryMovementRecord,
  CursorPageRequest as InventoryCursorPageRequest,
  CursorPageResult as InventoryCursorPageResult,
  InventoryBalanceFilter,
  InventoryAllocationPolicyListFilter,
  InventoryAllocationPolicyLocationDraft,
  InventoryAllocationPolicyLocationInput,
  InventoryAllocationPolicyMetadataPatch,
  InventoryAllocationPolicyRepository,
  InventoryAllocationQueryRepository,
  InventoryAvailabilityFilter,
  InventoryAvailabilityQueryRepository,
  InventoryReservationLineInput,
  InventoryReservationListFilter,
  InventoryReservationConsumptionRepository,
  InventoryReservationRepository,
  InventoryBalanceQueryRepository,
  InventoryMovementLineDraft,
  InventoryMovementLineInput,
  InventoryMovementListFilter,
  InventoryMovementPostingRepository,
  InventoryMovementRepository,
  PreviewInventoryAllocationRecord,
  ReplaceInventoryAllocationPolicyLocationsRecord,
  ReplaceInventoryMovementLinesRecord,
  ReverseInventoryMovementRecord,
  UpdateInventoryAllocationPolicyMetadataRecord,
  ChangeInventoryReservationStatusRecord,
  CreateInventoryReservationRecord,
} from "./inventory/repositories/inventory-repositories.js";
export type {
  InventoryAvailabilityReadItem,
  InventoryLocationReadItem,
  InventoryMovementHistoryItem,
  InventoryReadPage,
  InventoryReadPageFilter,
  InventoryReadRepository,
  InventoryVariantReadItem,
  StockLocationReadItem,
  VariantInventoryAvailability,
} from "./inventory/repositories/inventory-read-repository.js";
export type {
  CreateOrganizationMembershipRecord,
  CreateUserRecord,
  OrganizationMembershipRepository,
  UserRepository,
} from "./identity/repositories/identity-repositories.js";
export type {
  CreatePermissionRecord,
  CreateRolePermissionRecord,
  PermissionRepository,
  RolePermissionRepository,
} from "./authorization/repositories/authorization-repositories.js";
export {
  authenticateCredential,
  createUserCredential,
  disableUserCredential,
} from "./authentication/application/authentication-service.js";
export type {
  AuthenticationRequest,
  AuthenticationService,
  CreateUserCredentialInput,
  DisableUserCredentialInput,
} from "./authentication/application/authentication-service.js";
export type {
  CreateUserCredentialRecord,
  UserCredentialRepository,
} from "./authentication/repositories/authentication-repositories.js";
export type {
  CancelSalesOrderRecord,
  AmendDraftSalesOrderRecord,
  ConfirmSalesOrderRecord,
  CreateDraftSalesOrderRecord,
  CreateSalesBoothRecord,
  CreateSalesOrderLineRecord,
  DraftSalesOrderMetadataChanges,
  CursorPageRequest as SalesCursorPageRequest,
  CursorPageResult as SalesCursorPageResult,
  FulfillSalesOrderRecord,
  ReserveSalesOrderRecord,
  ReplaceSalesOrderLineRecord,
  SalesOrderListFilter,
  SalesOrderCreationRepository,
  SalesOrderRepository,
  SalesBoothPerformance,
  SalesChannelPerformance,
  SalesSourceRepository,
  SalesSourceSummary,
} from "./sales/repositories/sales-order-repositories.js";
export {
  getSalesOrderDetails,
  listSalesOrderReadModel,
} from "./sales/application/read-query-use-cases.js";
export type { ListSalesOrderReadInput } from "./sales/application/read-query-use-cases.js";
export type {
  SalesOrderCustomerSnapshot,
  SalesOrderDateOrder,
  SalesOrderDetailsReadItem,
  SalesOrderListReadItem,
  SalesOrderReadPage,
  SalesOrderReadRepository,
} from "./sales/repositories/sales-order-read-repository.js";
export type {
  TransactionContext,
  TransactionManager,
} from "./transaction/transaction-context.js";
export type {
  CommerceOrderSource,
  CommercePaymentPreference,
  StorefrontAvailability,
  StorefrontCatalog,
  StorefrontCheckoutFacts,
  StorefrontCommerceProfile,
  StorefrontProduct,
  StorefrontVariant,
} from "./storefront/models.js";
export type { StorefrontRepository } from "./storefront/repository.js";
export { RepositoryAuditWriter } from "./audit/application/audit-writer.js";
export type { AuditWriter } from "./audit/application/audit-writer.js";
export type {
  AuditAction,
  AuditActor,
  AuditEntry,
  AuditJsonValue,
  AuditMetadata,
  AuditResource,
  RecordAuditEntryInput,
} from "./audit/domain/models.js";
export {
  auditActions,
  auditResources,
  assertAuditId,
  normalizeAuditAction,
  normalizeAuditMetadata,
  normalizeAuditResource,
} from "./audit/domain/value-objects.js";
export type {
  WorkforceAuthenticationSession,
  WorkforcePrincipal,
  WorkforceSessionRecord,
} from "./workforce/domain/models.js";
export type {
  WorkforceAuthenticationRepository,
  WorkforceSessionWithPrincipal,
} from "./workforce/repositories/workforce-authentication-repository.js";
export type {
  AuditEntryRepository,
  CreateAuditEntryRecord,
} from "./audit/repositories/audit-repositories.js";
