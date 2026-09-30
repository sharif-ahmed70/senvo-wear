import type {
  AuditMetadata,
  Category,
  ProductVariant,
  Size,
  StockIntakeRepository,
} from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

type StockIntakePrismaClient = Pick<
  PrismaClient,
  | "$executeRaw"
  | "auditEntry"
  | "category"
  | "product"
  | "productVariant"
  | "size"
  | "stockLocation"
  | "supplier"
>;

export class PrismaStockIntakeRepository implements StockIntakeRepository {
  constructor(private readonly prisma: StockIntakePrismaClient) {}

  async acquireIdempotencyLock(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.prisma
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${idempotencyKey}`}, 0))`;
  }

  async findCategoryByName(
    organizationId: string,
    parentId: string | null,
    name: string,
  ): Promise<Category | null> {
    return this.prisma.category.findFirst({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      where: {
        name: { equals: name, mode: "insensitive" },
        organizationId,
        parentId,
      },
    });
  }

  async findMaxSizeSortOrder(organizationId: string): Promise<number | null> {
    const result = await this.prisma.size.aggregate({
      _max: { sortOrder: true },
      where: { organizationId },
    });
    return result._max.sortOrder;
  }

  async findSizeByNameOrCode(
    organizationId: string,
    value: string,
  ): Promise<Size | null> {
    return this.prisma.size.findFirst({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      where: {
        OR: [
          { name: { equals: value, mode: "insensitive" } },
          { code: { equals: value, mode: "insensitive" } },
        ],
        organizationId,
      },
    });
  }

  async findStockIntakeAuditMetadata(
    organizationId: string,
    purchaseId: string,
  ): Promise<AuditMetadata | null> {
    const record = await this.prisma.auditEntry.findFirst({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { metadata: true },
      where: {
        action: "STOCK_INTAKE_RECORDED",
        organizationId,
        resource: "PURCHASE",
        resourceId: purchaseId,
      },
    });
    const metadata = record?.metadata;
    return metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as AuditMetadata)
      : null;
  }

  async findVariantByCombination(
    organizationId: string,
    productId: string,
    colorId: string,
    sizeId: string,
  ): Promise<ProductVariant | null> {
    return this.prisma.productVariant.findFirst({
      where: { colorId, organizationId, productId, sizeId },
    });
  }

  async findVariantById(
    organizationId: string,
    variantId: string,
  ): Promise<ProductVariant | null> {
    return this.prisma.productVariant.findFirst({
      where: { id: variantId, organizationId },
    });
  }

  async isActiveStockLocation(
    organizationId: string,
    stockLocationId: string,
  ): Promise<boolean> {
    return (
      (await this.prisma.stockLocation.count({
        where: { id: stockLocationId, organizationId, status: "ACTIVE" },
      })) > 0
    );
  }

  async listProductCodesWithPrefix(
    organizationId: string,
    prefix: string,
  ): Promise<string[]> {
    const records = await this.prisma.product.findMany({
      select: { productCode: true },
      where: {
        organizationId,
        productCode: { mode: "insensitive", startsWith: prefix },
      },
    });
    return records.map((record) => record.productCode);
  }

  async listSupplierCodesWithPrefix(
    organizationId: string,
    prefix: string,
  ): Promise<string[]> {
    const records = await this.prisma.supplier.findMany({
      select: { code: true },
      where: {
        code: { mode: "insensitive", startsWith: prefix },
        organizationId,
      },
    });
    return records.map((record) => record.code);
  }
}
