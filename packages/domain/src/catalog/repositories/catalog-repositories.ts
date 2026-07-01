import type {
  Category,
  Collection,
  Color,
  Organization,
  Product,
  ProductVariant,
  Size,
} from "../domain/models.js";

export type CreateOrganizationRecord = Pick<
  Organization,
  "code" | "name" | "status"
>;

export type CreateCategoryRecord = Pick<
  Category,
  | "description"
  | "name"
  | "organizationId"
  | "parentId"
  | "slug"
  | "sortOrder"
  | "status"
>;

export type CreateCollectionRecord = Pick<
  Collection,
  "description" | "name" | "organizationId" | "slug" | "status"
>;

export type CreateColorRecord = Pick<
  Color,
  "code" | "hexValue" | "name" | "normalizedName" | "organizationId" | "status"
>;

export type CreateSizeRecord = Pick<
  Size,
  "code" | "name" | "organizationId" | "sortOrder" | "status"
>;

export type CreateProductRecord = Pick<
  Product,
  | "categoryId"
  | "description"
  | "name"
  | "organizationId"
  | "productCode"
  | "slug"
  | "status"
>;

export type CreateProductVariantRecord = Pick<
  ProductVariant,
  "colorId" | "organizationId" | "productId" | "sizeId" | "sku" | "status"
>;

export type OrganizationRepository = {
  create(record: CreateOrganizationRecord): Promise<Organization>;
  findByCode(code: string): Promise<Organization | null>;
  findById(id: string): Promise<Organization | null>;
};

export type CategoryRepository = {
  create(record: CreateCategoryRecord): Promise<Category>;
  findById(id: string): Promise<Category | null>;
  findBySlug(organizationId: string, slug: string): Promise<Category | null>;
};

export type CollectionRepository = {
  create(record: CreateCollectionRecord): Promise<Collection>;
  findBySlug(organizationId: string, slug: string): Promise<Collection | null>;
};

export type ColorRepository = {
  create(record: CreateColorRecord): Promise<Color>;
  findByCode(organizationId: string, code: string): Promise<Color | null>;
  findById(id: string): Promise<Color | null>;
  findByNormalizedName(
    organizationId: string,
    normalizedName: string,
  ): Promise<Color | null>;
};

export type SizeRepository = {
  create(record: CreateSizeRecord): Promise<Size>;
  findByCode(organizationId: string, code: string): Promise<Size | null>;
  findById(id: string): Promise<Size | null>;
};

export type ProductRepository = {
  create(record: CreateProductRecord): Promise<Product>;
  findByCode(
    organizationId: string,
    productCode: string,
  ): Promise<Product | null>;
  findById(id: string): Promise<Product | null>;
  findBySlug(organizationId: string, slug: string): Promise<Product | null>;
};

export type ProductVariantRepository = {
  create(record: CreateProductVariantRecord): Promise<ProductVariant>;
  existsBySku(organizationId: string, sku: string): Promise<boolean>;
  existsVariantCombination(
    productId: string,
    colorId: string,
    sizeId: string,
  ): Promise<boolean>;
};
