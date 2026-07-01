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
