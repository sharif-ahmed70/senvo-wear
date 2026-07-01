import {
  ConflictError,
  type Category,
  type CategoryRepository,
  type Collection,
  type CollectionRepository,
  type Color,
  type ColorRepository,
  type CreateCategoryRecord,
  type CreateCollectionRecord,
  type CreateColorRecord,
  type CreateOrganizationRecord,
  type CreateProductRecord,
  type CreateProductVariantRecord,
  type CreateSizeRecord,
  type Organization,
  type OrganizationRepository,
  type Product,
  type ProductRepository,
  type ProductVariant,
  type ProductVariantRepository,
  type Size,
  type SizeRepository,
} from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

type CatalogPrismaClient = Pick<
  PrismaClient,
  | "category"
  | "collection"
  | "color"
  | "organization"
  | "product"
  | "productVariant"
  | "size"
>;

type KnownPrismaError = {
  code?: string;
};

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: CatalogPrismaClient) {}

  async create(record: CreateOrganizationRecord): Promise<Organization> {
    return mapOrganization(
      await createWithConflictMapping(() =>
        this.prisma.organization.create({ data: record }),
      ),
    );
  }

  async findByCode(code: string): Promise<Organization | null> {
    const record = await this.prisma.organization.findUnique({
      where: { code },
    });
    return record ? mapOrganization(record) : null;
  }

  async findById(id: string): Promise<Organization | null> {
    const record = await this.prisma.organization.findUnique({ where: { id } });
    return record ? mapOrganization(record) : null;
  }
}

export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: CatalogPrismaClient) {}

  async create(record: CreateCategoryRecord): Promise<Category> {
    return mapCategory(
      await createWithConflictMapping(() =>
        this.prisma.category.create({ data: record }),
      ),
    );
  }

  async findById(id: string): Promise<Category | null> {
    const record = await this.prisma.category.findUnique({ where: { id } });
    return record ? mapCategory(record) : null;
  }

  async findBySlug(
    organizationId: string,
    slug: string,
  ): Promise<Category | null> {
    const record = await this.prisma.category.findUnique({
      where: { organizationId_slug: { organizationId, slug } },
    });
    return record ? mapCategory(record) : null;
  }
}

export class PrismaCollectionRepository implements CollectionRepository {
  constructor(private readonly prisma: CatalogPrismaClient) {}

  async create(record: CreateCollectionRecord): Promise<Collection> {
    return mapCollection(
      await createWithConflictMapping(() =>
        this.prisma.collection.create({ data: record }),
      ),
    );
  }

  async findBySlug(
    organizationId: string,
    slug: string,
  ): Promise<Collection | null> {
    const record = await this.prisma.collection.findUnique({
      where: { organizationId_slug: { organizationId, slug } },
    });
    return record ? mapCollection(record) : null;
  }
}

export class PrismaColorRepository implements ColorRepository {
  constructor(private readonly prisma: CatalogPrismaClient) {}

  async create(record: CreateColorRecord): Promise<Color> {
    return mapColor(
      await createWithConflictMapping(() =>
        this.prisma.color.create({ data: record }),
      ),
    );
  }

  async findByCode(
    organizationId: string,
    code: string,
  ): Promise<Color | null> {
    const record = await this.prisma.color.findUnique({
      where: { organizationId_code: { code, organizationId } },
    });
    return record ? mapColor(record) : null;
  }

  async findById(id: string): Promise<Color | null> {
    const record = await this.prisma.color.findUnique({ where: { id } });
    return record ? mapColor(record) : null;
  }

  async findByNormalizedName(
    organizationId: string,
    normalizedName: string,
  ): Promise<Color | null> {
    const record = await this.prisma.color.findUnique({
      where: {
        organizationId_normalizedName: { normalizedName, organizationId },
      },
    });
    return record ? mapColor(record) : null;
  }
}

export class PrismaSizeRepository implements SizeRepository {
  constructor(private readonly prisma: CatalogPrismaClient) {}

  async create(record: CreateSizeRecord): Promise<Size> {
    return mapSize(
      await createWithConflictMapping(() =>
        this.prisma.size.create({ data: record }),
      ),
    );
  }

  async findByCode(organizationId: string, code: string): Promise<Size | null> {
    const record = await this.prisma.size.findUnique({
      where: { organizationId_code: { code, organizationId } },
    });
    return record ? mapSize(record) : null;
  }

  async findById(id: string): Promise<Size | null> {
    const record = await this.prisma.size.findUnique({ where: { id } });
    return record ? mapSize(record) : null;
  }
}

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: CatalogPrismaClient) {}

  async create(record: CreateProductRecord): Promise<Product> {
    return mapProduct(
      await createWithConflictMapping(() =>
        this.prisma.product.create({ data: record }),
      ),
    );
  }

  async findByCode(
    organizationId: string,
    productCode: string,
  ): Promise<Product | null> {
    const record = await this.prisma.product.findUnique({
      where: { organizationId_productCode: { organizationId, productCode } },
    });
    return record ? mapProduct(record) : null;
  }

  async findById(id: string): Promise<Product | null> {
    const record = await this.prisma.product.findUnique({ where: { id } });
    return record ? mapProduct(record) : null;
  }

  async findBySlug(
    organizationId: string,
    slug: string,
  ): Promise<Product | null> {
    const record = await this.prisma.product.findUnique({
      where: { organizationId_slug: { organizationId, slug } },
    });
    return record ? mapProduct(record) : null;
  }
}

export class PrismaProductVariantRepository implements ProductVariantRepository {
  constructor(private readonly prisma: CatalogPrismaClient) {}

  async create(record: CreateProductVariantRecord): Promise<ProductVariant> {
    return mapProductVariant(
      await createWithConflictMapping(() =>
        this.prisma.productVariant.create({ data: record }),
      ),
    );
  }

  async existsBySku(organizationId: string, sku: string): Promise<boolean> {
    const count = await this.prisma.productVariant.count({
      where: { organizationId, sku },
    });
    return count > 0;
  }

  async existsVariantCombination(
    productId: string,
    colorId: string,
    sizeId: string,
  ): Promise<boolean> {
    const count = await this.prisma.productVariant.count({
      where: { colorId, productId, sizeId },
    });
    return count > 0;
  }
}

async function createWithConflictMapping<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(
        "Catalog identity uniqueness constraint was violated.",
        error,
      );
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === "P2002"
  );
}

function mapOrganization(record: Organization): Organization {
  return record;
}

function mapCategory(record: Category): Category {
  return record;
}

function mapCollection(record: Collection): Collection {
  return record;
}

function mapColor(record: Color): Color {
  return record;
}

function mapSize(record: Size): Size {
  return record;
}

function mapProduct(record: Product): Product {
  return record;
}

function mapProductVariant(record: ProductVariant): ProductVariant {
  return record;
}
