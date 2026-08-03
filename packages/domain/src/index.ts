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
  Category,
  Collection,
  Color,
  Organization,
  Product,
  ProductVariant,
  Size,
} from "./catalog/domain/models.js";
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
  SalesOrder,
  SalesOrderChannel,
  SalesOrderLine,
  SalesOrderStatus,
} from "./sales/domain/models.js";
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
  AuditEntryRepository,
  CreateAuditEntryRecord,
} from "./audit/repositories/audit-repositories.js";
