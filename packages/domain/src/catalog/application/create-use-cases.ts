import {
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type {
  Category,
  Collection,
  Color,
  Organization,
  Product,
  ProductVariant,
  Size,
} from "../domain/models.js";
import {
  assertCategoryParentIsNotSelf,
  assertNonNegativeSortOrder,
  assertSameOrganization,
  assertVariantCombinationAvailable,
  normalizeCode,
  normalizeComparableName,
  normalizeDisplayName,
  normalizeHexValue,
  normalizeOptionalDescription,
  normalizeSku,
  normalizeSlug,
} from "../domain/value-objects.js";
import type {
  CategoryRepository,
  CollectionRepository,
  ColorRepository,
  OrganizationRepository,
  ProductRepository,
  ProductVariantRepository,
  SizeRepository,
} from "../repositories/catalog-repositories.js";

export type CreateOrganizationInput = {
  code: string;
  name: string;
  status?: "ACTIVE" | "INACTIVE";
};

export async function createOrganization(
  repository: OrganizationRepository,
  input: CreateOrganizationInput,
): Promise<Organization> {
  const code = normalizeCode(input.code, "organization code");
  if (await repository.findByCode(code)) {
    throw new ConflictError("Organization code already exists.");
  }

  return repository.create({
    code,
    name: normalizeDisplayName(input.name, "organization name"),
    status: input.status ?? "ACTIVE",
  });
}

export type CreateCategoryInput = {
  description?: string | null;
  name: string;
  organizationId: string;
  parentId?: string | null;
  slug: string;
  sortOrder?: number;
  status?: "ACTIVE" | "INACTIVE";
};

export async function createCategory(
  repositories: {
    categories: CategoryRepository;
    organizations: OrganizationRepository;
  },
  input: CreateCategoryInput,
): Promise<Category> {
  await requireOrganization(repositories.organizations, input.organizationId);

  const slug = normalizeSlug(input.slug);
  if (await repositories.categories.findBySlug(input.organizationId, slug)) {
    throw new ConflictError(
      "Category slug already exists in this organization.",
    );
  }

  const parentId = input.parentId ?? null;
  assertCategoryParentIsNotSelf(undefined, parentId);
  if (parentId) {
    const parent = await requireCategory(repositories.categories, parentId);
    assertSameOrganization(
      input.organizationId,
      parent.organizationId,
      "parent category",
    );
  }

  return repositories.categories.create({
    description: normalizeOptionalDescription(input.description),
    name: normalizeDisplayName(input.name, "category name"),
    organizationId: input.organizationId,
    parentId,
    slug,
    sortOrder: assertNonNegativeSortOrder(input.sortOrder ?? 0),
    status: input.status ?? "ACTIVE",
  });
}

export type CreateCollectionInput = {
  description?: string | null;
  name: string;
  organizationId: string;
  slug: string;
  status?: "ACTIVE" | "INACTIVE";
};

export async function createCollection(
  repositories: {
    collections: CollectionRepository;
    organizations: OrganizationRepository;
  },
  input: CreateCollectionInput,
): Promise<Collection> {
  await requireOrganization(repositories.organizations, input.organizationId);

  const slug = normalizeSlug(input.slug);
  if (await repositories.collections.findBySlug(input.organizationId, slug)) {
    throw new ConflictError(
      "Collection slug already exists in this organization.",
    );
  }

  return repositories.collections.create({
    description: normalizeOptionalDescription(input.description),
    name: normalizeDisplayName(input.name, "collection name"),
    organizationId: input.organizationId,
    slug,
    status: input.status ?? "ACTIVE",
  });
}

export type CreateColorInput = {
  code: string;
  hexValue: string;
  name: string;
  organizationId: string;
  status?: "ACTIVE" | "INACTIVE";
};

export async function createColor(
  repositories: {
    colors: ColorRepository;
    organizations: OrganizationRepository;
  },
  input: CreateColorInput,
): Promise<Color> {
  await requireOrganization(repositories.organizations, input.organizationId);

  const code = normalizeCode(input.code, "color code");
  if (await repositories.colors.findByCode(input.organizationId, code)) {
    throw new ConflictError("Color code already exists in this organization.");
  }

  const name = normalizeDisplayName(input.name, "color name");
  const hexValue = normalizeHexValue(input.hexValue);
  if (hexValue === null) {
    throw new ValidationApplicationError("hexValue is required.");
  }
  const normalizedName = normalizeComparableName(name);
  if (
    await repositories.colors.findByNormalizedName(
      input.organizationId,
      normalizedName,
    )
  ) {
    throw new ConflictError("Color name already exists in this organization.");
  }

  return repositories.colors.create({
    code,
    hexValue,
    name,
    normalizedName,
    organizationId: input.organizationId,
    status: input.status ?? "ACTIVE",
  });
}

export type CreateSizeInput = {
  code: string;
  name: string;
  organizationId: string;
  sortOrder: number;
  status?: "ACTIVE" | "INACTIVE";
};

export async function createSize(
  repositories: {
    organizations: OrganizationRepository;
    sizes: SizeRepository;
  },
  input: CreateSizeInput,
): Promise<Size> {
  await requireOrganization(repositories.organizations, input.organizationId);

  const code = normalizeCode(input.code, "size code");
  if (await repositories.sizes.findByCode(input.organizationId, code)) {
    throw new ConflictError("Size code already exists in this organization.");
  }

  return repositories.sizes.create({
    code,
    name: normalizeDisplayName(input.name, "size name"),
    organizationId: input.organizationId,
    sortOrder: assertNonNegativeSortOrder(input.sortOrder),
    status: input.status ?? "ACTIVE",
  });
}

export type CreateProductInput = {
  brand?: string | null;
  categoryId: string;
  description?: string | null;
  name: string;
  organizationId: string;
  productCode: string;
  slug: string;
  status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

export async function createProduct(
  repositories: {
    categories: CategoryRepository;
    organizations: OrganizationRepository;
    products: ProductRepository;
  },
  input: CreateProductInput,
): Promise<Product> {
  await requireOrganization(repositories.organizations, input.organizationId);

  const category = await requireCategory(
    repositories.categories,
    input.categoryId,
  );
  assertSameOrganization(
    input.organizationId,
    category.organizationId,
    "category",
  );

  const productCode = normalizeCode(input.productCode, "product code");
  if (
    await repositories.products.findByCode(input.organizationId, productCode)
  ) {
    throw new ConflictError(
      "Product code already exists in this organization.",
    );
  }

  const slug = normalizeSlug(input.slug);
  if (await repositories.products.findBySlug(input.organizationId, slug)) {
    throw new ConflictError(
      "Product slug already exists in this organization.",
    );
  }

  return repositories.products.create({
    brand: normalizeOptionalText(input.brand, "brand", 160),
    categoryId: input.categoryId,
    description: normalizeOptionalDescription(input.description),
    name: normalizeDisplayName(input.name, "product name"),
    organizationId: input.organizationId,
    productCode,
    slug,
    status: input.status ?? "DRAFT",
  });
}

export type CreateProductVariantInput = {
  colorId: string;
  costPriceMinor?: number;
  organizationId: string;
  productId: string;
  sizeId: string;
  sku: string;
  sellingPriceMinor?: number;
  status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

export async function createProductVariant(
  repositories: {
    colors: ColorRepository;
    products: ProductRepository;
    productVariants: ProductVariantRepository;
    sizes: SizeRepository;
  },
  input: CreateProductVariantInput,
): Promise<ProductVariant> {
  const product = await requireProduct(repositories.products, input.productId);
  const color = await requireColor(repositories.colors, input.colorId);
  const size = await requireSize(repositories.sizes, input.sizeId);

  assertSameOrganization(
    input.organizationId,
    product.organizationId,
    "product",
  );
  assertSameOrganization(input.organizationId, color.organizationId, "color");
  assertSameOrganization(input.organizationId, size.organizationId, "size");

  const sku = normalizeSku(input.sku);
  if (
    await repositories.productVariants.existsBySku(input.organizationId, sku)
  ) {
    throw new ConflictError("Variant SKU already exists in this organization.");
  }

  assertVariantCombinationAvailable(
    await repositories.productVariants.existsVariantCombination(
      input.productId,
      input.colorId,
      input.sizeId,
    ),
  );

  return repositories.productVariants.create({
    colorId: input.colorId,
    costPriceMinor: normalizeMinor(input.costPriceMinor, "cost price"),
    organizationId: input.organizationId,
    productId: input.productId,
    sizeId: input.sizeId,
    sku,
    sellingPriceMinor: normalizeMinor(input.sellingPriceMinor, "selling price"),
    status: input.status ?? "ACTIVE",
  });
}

function normalizeMinor(value: number | undefined, field: string): number {
  const normalized = value ?? 0;
  if (!Number.isSafeInteger(normalized) || normalized < 0)
    throw new ValidationApplicationError(
      `${field} must be a non-negative minor-unit amount.`,
    );
  return normalized;
}

function normalizeOptionalText(
  value: string | null | undefined,
  field: string,
  maximum: number,
): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const normalized = value.trim();
  if (normalized.length > maximum)
    throw new ValidationApplicationError(`${field} is too long.`);
  return normalized;
}

async function requireOrganization(
  repository: OrganizationRepository,
  organizationId: string,
): Promise<Organization> {
  const organization = await repository.findById(organizationId);
  if (!organization) {
    throw new NotFoundError("Organization was not found.");
  }
  return organization;
}

async function requireCategory(
  repository: CategoryRepository,
  categoryId: string,
): Promise<Category> {
  const category = await repository.findById(categoryId);
  if (!category) {
    throw new NotFoundError("Category was not found.");
  }
  return category;
}

async function requireProduct(
  repository: ProductRepository,
  productId: string,
): Promise<Product> {
  const product = await repository.findById(productId);
  if (!product) {
    throw new NotFoundError("Product was not found.");
  }
  return product;
}

async function requireColor(
  repository: ColorRepository,
  colorId: string,
): Promise<Color> {
  const color = await repository.findById(colorId);
  if (!color) {
    throw new NotFoundError("Color was not found.");
  }
  return color;
}

async function requireSize(
  repository: SizeRepository,
  sizeId: string,
): Promise<Size> {
  const size = await repository.findById(sizeId);
  if (!size) {
    throw new NotFoundError("Size was not found.");
  }
  return size;
}
