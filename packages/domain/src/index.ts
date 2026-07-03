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
  InventoryAvailability,
  InventoryReservation,
  InventoryReservationLine,
  InventoryReservationStatus,
  OnHandBalance,
} from "./inventory/domain/models.js";
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
  CategoryRepository,
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
  PosCounterListFilter,
  PosCounterMetadataPatch,
  PosCounterRepository,
  StockLocationListFilter,
  StockLocationMetadataPatch,
  StockLocationRepository,
} from "./organization/repositories/organization-repositories.js";
export type {
  CreateInventoryMovementRecord,
  CursorPageRequest as InventoryCursorPageRequest,
  CursorPageResult as InventoryCursorPageResult,
  InventoryBalanceFilter,
  InventoryAvailabilityFilter,
  InventoryAvailabilityQueryRepository,
  InventoryReservationLineInput,
  InventoryReservationListFilter,
  InventoryReservationRepository,
  InventoryBalanceQueryRepository,
  InventoryMovementLineDraft,
  InventoryMovementLineInput,
  InventoryMovementListFilter,
  InventoryMovementRepository,
  ReplaceInventoryMovementLinesRecord,
  ReverseInventoryMovementRecord,
  ChangeInventoryReservationStatusRecord,
  CreateInventoryReservationRecord,
} from "./inventory/repositories/inventory-repositories.js";
