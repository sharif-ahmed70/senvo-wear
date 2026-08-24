import {
  ConflictError,
  type Category,
  type CategoryRepository,
  type Collection,
  type CollectionRepository,
  type CatalogColorManagementRepository,
  type CatalogSizeManagementRepository,
  type Color,
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
} from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

type CatalogPrismaClient = Pick<
  PrismaClient,
  | "$executeRaw"
  | "category"
  | "collection"
  | "color"
  | "organization"
  | "product"
  | "productCollection"
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

  async updateProfile(record: {
    expectedVersion: number;
    id: string;
    profile: Omit<
      Organization,
      "code" | "createdAt" | "id" | "status" | "updatedAt" | "version"
    >;
  }): Promise<Organization | null> {
    const updated = await this.prisma.organization.updateMany({
      data: { ...record.profile, version: { increment: 1 } },
      where: { id: record.id, version: record.expectedVersion },
    });
    return updated.count === 0 ? null : this.findById(record.id);
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

  async findById(
    id: string,
    organizationId?: string,
  ): Promise<Category | null> {
    const record = await this.prisma.category.findFirst({
      where: { id, organizationId },
    });
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

  async list(filter: { organizationId: string }): Promise<Category[]> {
    const records = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 100,
      where: { organizationId: filter.organizationId },
    });
    return records.map(mapCategory);
  }

  async updateStatus(record: {
    id: string;
    organizationId: string;
    status: Category["status"];
  }): Promise<Category | null> {
    const result = await this.prisma.category.updateMany({
      data: { status: record.status },
      where: { id: record.id, organizationId: record.organizationId },
    });
    return result.count === 0
      ? null
      : this.findById(record.id, record.organizationId);
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

  async findById(
    id: string,
    organizationId?: string,
  ): Promise<Collection | null> {
    const record = await this.prisma.collection.findFirst({
      where: { id, organizationId },
    });
    return record ? mapCollection(record) : null;
  }

  async list(filter: { organizationId: string }): Promise<Collection[]> {
    const records = await this.prisma.collection.findMany({
      orderBy: [{ name: "asc" }],
      take: 100,
      where: { organizationId: filter.organizationId },
    });
    return records.map(mapCollection);
  }
}

export class PrismaColorRepository implements CatalogColorManagementRepository {
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

  async findById(id: string, organizationId?: string): Promise<Color | null> {
    const record = await this.prisma.color.findFirst({
      where: { id, organizationId },
    });
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

  async list(filter: { organizationId: string }): Promise<Color[]> {
    const records = await this.prisma.color.findMany({
      orderBy: [{ name: "asc" }, { code: "asc" }],
      take: 100,
      where: { organizationId: filter.organizationId },
    });
    return records.map(mapColor);
  }

  async updateStatus(record: {
    id: string;
    organizationId: string;
    status: Color["status"];
  }): Promise<Color | null> {
    const result = await this.prisma.color.updateMany({
      data: { status: record.status },
      where: { id: record.id, organizationId: record.organizationId },
    });
    return result.count === 0
      ? null
      : this.findById(record.id, record.organizationId);
  }
}

export class PrismaSizeRepository implements CatalogSizeManagementRepository {
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

  async findById(id: string, organizationId?: string): Promise<Size | null> {
    const record = await this.prisma.size.findFirst({
      where: { id, organizationId },
    });
    return record ? mapSize(record) : null;
  }

  async list(filter: { organizationId: string }): Promise<Size[]> {
    const records = await this.prisma.size.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 100,
      where: { organizationId: filter.organizationId },
    });
    return records.map(mapSize);
  }

  async updateStatus(record: {
    id: string;
    organizationId: string;
    status: Size["status"];
  }): Promise<Size | null> {
    const result = await this.prisma.size.updateMany({
      data: { status: record.status },
      where: { id: record.id, organizationId: record.organizationId },
    });
    return result.count === 0
      ? null
      : this.findById(record.id, record.organizationId);
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

  async assignCollection(record: {
    collectionId: string;
    organizationId: string;
    productId: string;
  }): Promise<void> {
    const last = await this.prisma.productCollection.findFirst({
      orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
      select: { sortOrder: true },
      where: {
        collectionId: record.collectionId,
        organizationId: record.organizationId,
      },
    });
    await createWithConflictMapping(() =>
      this.prisma.productCollection.create({
        data: { ...record, sortOrder: (last?.sortOrder ?? -1) + 1 },
      }),
    );
  }

  async listCollectionProductOrder(
    organizationId: string,
    collectionId: string,
  ): Promise<string[]> {
    const records = await this.prisma.productCollection.findMany({
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "asc" },
        { productId: "asc" },
      ],
      select: { productId: true },
      where: { collectionId, organizationId },
    });
    return records.map((record) => record.productId);
  }

  async reorderCollectionProducts(record: {
    collectionId: string;
    organizationId: string;
    productIds: readonly string[];
  }): Promise<void> {
    await this.prisma
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${record.organizationId}:${record.collectionId}:collection-order`}, 0))`;
    const current = await this.listCollectionProductOrder(
      record.organizationId,
      record.collectionId,
    );
    if (
      current.length !== record.productIds.length ||
      current.some((id) => !record.productIds.includes(id))
    ) {
      throw new ConflictError(
        "The collection order must include every assigned product exactly once.",
      );
    }
    await Promise.all(
      record.productIds.map((productId, sortOrder) =>
        this.prisma.productCollection.updateMany({
          data: { sortOrder },
          where: {
            collectionId: record.collectionId,
            organizationId: record.organizationId,
            productId,
          },
        }),
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

  async findById(id: string, organizationId?: string): Promise<Product | null> {
    const record = await this.prisma.product.findFirst({
      where: { id, organizationId },
    });
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

  async list(filter: { organizationId: string }): Promise<Product[]> {
    const records = await this.prisma.product.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      where: { organizationId: filter.organizationId },
    });
    return records.map(mapProduct);
  }

  async listCollectionIds(
    organizationId: string,
    productId: string,
  ): Promise<string[]> {
    const records = await this.prisma.productCollection.findMany({
      orderBy: { collectionId: "asc" },
      select: { collectionId: true },
      where: { organizationId, productId },
    });
    return records.map((record) => record.collectionId);
  }

  async update(record: {
    brand: string | null;
    categoryId: string;
    description: string | null;
    id: string;
    name: string;
    organizationId: string;
    status: Product["status"];
  }): Promise<Product | null> {
    const { id, organizationId, ...data } = record;
    const result = await this.prisma.product.updateMany({
      data,
      where: { id, organizationId },
    });
    return result.count ? this.findById(id, organizationId) : null;
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

  async listByProduct(
    organizationId: string,
    productId: string,
  ): Promise<ProductVariant[]> {
    const records = await this.prisma.productVariant.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      where: { organizationId, productId },
    });
    return records.map(mapProductVariant);
  }

  async update(record: {
    costPriceMinor: number;
    id: string;
    organizationId: string;
    sellingPriceMinor: number;
    status: ProductVariant["status"];
  }): Promise<ProductVariant | null> {
    const { id, organizationId, ...data } = record;
    const result = await this.prisma.productVariant.updateMany({
      data,
      where: { id, organizationId },
    });
    if (!result.count) return null;
    const updated = await this.prisma.productVariant.findFirst({
      where: { id, organizationId },
    });
    return updated ? mapProductVariant(updated) : null;
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
