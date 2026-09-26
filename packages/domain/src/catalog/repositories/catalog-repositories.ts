import type {
  BarcodeLookupResult,
  Category,
  Collection,
  Color,
  Organization,
  Product,
  ProductVariant,
  Size,
  VariantBarcode,
} from "../domain/models.js";

export type CreateVariantBarcodeRecord = Pick<
  VariantBarcode,
  "organizationId" | "productVariantId" | "status" | "type" | "value"
>;

export type BarcodeRepository = {
  create(record: CreateVariantBarcodeRecord): Promise<VariantBarcode>;
  existsByValue(value: string): Promise<boolean>;
  findActiveByVariant(
    organizationId: string,
    productVariantId: string,
  ): Promise<VariantBarcode | null>;
  findById(id: string, organizationId: string): Promise<VariantBarcode | null>;
  listByVariant(
    organizationId: string,
    productVariantId: string,
  ): Promise<VariantBarcode[]>;
  lookupActive(
    organizationId: string,
    value: string,
  ): Promise<BarcodeLookupResult | null>;
  updateStatus(record: {
    id: string;
    organizationId: string;
    status: VariantBarcode["status"];
  }): Promise<VariantBarcode | null>;
  variantExists(
    organizationId: string,
    productVariantId: string,
  ): Promise<boolean>;
};

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
> & { sellingPriceMinor?: number };

export type CatalogListFilter = {
  organizationId: string;
};

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

export type CatalogCategoryManagementRepository = CategoryRepository & {
  findById(id: string, organizationId?: string): Promise<Category | null>;
  list(filter: CatalogListFilter): Promise<Category[]>;
  updateStatus(record: {
    id: string;
    organizationId: string;
    status: Category["status"];
  }): Promise<Category | null>;
};

export type CatalogCollectionManagementRepository = CollectionRepository & {
  findById(id: string, organizationId?: string): Promise<Collection | null>;
  list(filter: CatalogListFilter): Promise<Collection[]>;
};

export type CatalogColorManagementRepository = ColorRepository & {
  findById(id: string, organizationId?: string): Promise<Color | null>;
  list(filter: CatalogListFilter): Promise<Color[]>;
  updateStatus(record: {
    id: string;
    organizationId: string;
    status: Color["status"];
  }): Promise<Color | null>;
};

export type CatalogSizeManagementRepository = SizeRepository & {
  findById(id: string, organizationId?: string): Promise<Size | null>;
  list(filter: CatalogListFilter): Promise<Size[]>;
  updateStatus(record: {
    id: string;
    organizationId: string;
    status: Size["status"];
  }): Promise<Size | null>;
};

export type CatalogProductManagementRepository = ProductRepository & {
  assignCollection(record: {
    collectionId: string;
    organizationId: string;
    productId: string;
  }): Promise<void>;
  listCollectionProductOrder(
    organizationId: string,
    collectionId: string,
  ): Promise<string[]>;
  findById(id: string, organizationId?: string): Promise<Product | null>;
  list(filter: CatalogListFilter): Promise<Product[]>;
  listCollectionIds(
    organizationId: string,
    productId: string,
  ): Promise<string[]>;
  reorderCollectionProducts(record: {
    collectionId: string;
    organizationId: string;
    productIds: readonly string[];
  }): Promise<void>;
};

export type CatalogProductVariantManagementRepository =
  ProductVariantRepository & {
    updatePrice(input: {
      organizationId: string;
      variantId: string;
      sellingPriceMinor: number;
      expectedSellingPriceMinor: number;
    }): Promise<ProductVariant | null>;
    listByProduct(
      organizationId: string,
      productId: string,
    ): Promise<ProductVariant[]>;
  };
