import {
  ConflictError,
  type CreatePurchaseLineRecord,
  type CreatePurchaseRecord,
  type Purchase,
  type PurchaseListFilter,
  type PurchaseRepository,
  type PurchaseWithLines,
  type UpdatePurchaseRecord,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

export type PurchasePrismaClient = Pick<PrismaClient, "purchase" | "$queryRaw">;

type KnownPrismaError = {
  code?: string;
};

export class PrismaPurchaseRepository implements PurchaseRepository {
  constructor(private readonly prisma: PurchasePrismaClient) {}

  async setMemo(input: {
    contentType: string;
    organizationId: string;
    purchaseId: string;
    storageKey: string;
    uploadedAt: Date;
  }) {
    const existing = await this.prisma.purchase.findFirst({
      select: { memoStorageKey: true },
      where: { id: input.purchaseId, organizationId: input.organizationId },
    });
    if (!existing) return null;
    await this.prisma.purchase.update({
      data: {
        memoContentType: input.contentType,
        memoStorageKey: input.storageKey,
        memoUploadedAt: input.uploadedAt,
      },
      where: { id: input.purchaseId, organizationId: input.organizationId },
    });
    return { previousStorageKey: existing.memoStorageKey };
  }

  async findMemo(organizationId: string, purchaseId: string) {
    const record = await this.prisma.purchase.findFirst({
      select: {
        memoContentType: true,
        memoStorageKey: true,
        memoUploadedAt: true,
      },
      where: { id: purchaseId, organizationId },
    });
    if (
      !record?.memoStorageKey ||
      !record.memoContentType ||
      !record.memoUploadedAt
    )
      return null;
    return {
      contentType: record.memoContentType,
      storageKey: record.memoStorageKey,
      uploadedAt: record.memoUploadedAt,
    };
  }

  lastCostsForProduct(organizationId: string, productId: string) {
    return lastCostsForProductQuery(this.prisma, organizationId, productId);
  }

  async create(record: CreatePurchaseRecord): Promise<PurchaseWithLines> {
    try {
      const created = await this.prisma.purchase.create({
        data: {
          destinationLocationId: record.destinationLocationId,
          expectedDeliveryDate: record.expectedDeliveryDate ?? null,
          idempotencyKey: record.idempotencyKey ?? null,
          notes: record.notes ?? null,
          organizationId: record.organizationId,
          purchaseDate: record.purchaseDate,
          purchaseNumber: record.purchaseNumber,
          receiptMovementId: record.receiptMovementId ?? null,
          status: record.status ?? "DRAFT",
          supplierId: record.supplierId,
          totalCostMinor: record.totalCostMinor,
          lines:
            record.lines && record.lines.length > 0
              ? {
                  // organizationId is not set here: the line's purchase
                  // relation is the composite (purchaseId, organizationId)
                  // key, so Prisma fills both from the parent purchase and
                  // rejects an explicit organizationId on nested creates.
                  create: record.lines.map(
                    (line: CreatePurchaseLineRecord) => ({
                      lineNumber: line.lineNumber,
                      notes: line.notes ?? null,
                      productName: line.productName,
                      productVariantId: line.productVariantId,
                      quantity: line.quantity,
                      sku: line.sku,
                      totalCostMinor: line.totalCostMinor,
                      unitCostMinor: line.unitCostMinor,
                      supplierUnitCostMinor: line.supplierUnitCostMinor ?? null,
                      extraCostPerUnitMinor: line.extraCostPerUnitMinor ?? null,
                      variantName: line.variantName ?? null,
                    }),
                  ),
                }
              : undefined,
        },
        include: {
          lines: {
            orderBy: { lineNumber: "asc" },
          },
        },
      });

      return mapPurchaseWithLines(created);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError(
          "Purchase with this number or idempotency key already exists in this organization.",
        );
      }
      throw error;
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<PurchaseWithLines | null> {
    const record = await this.prisma.purchase.findFirst({
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
        },
      },
      where: { id, organizationId },
    });

    return record ? mapPurchaseWithLines(record) : null;
  }

  async findByPurchaseNumber(
    organizationId: string,
    purchaseNumber: string,
  ): Promise<PurchaseWithLines | null> {
    const record = await this.prisma.purchase.findUnique({
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
        },
      },
      where: {
        organizationId_purchaseNumber: {
          organizationId,
          purchaseNumber,
        },
      },
    });

    return record ? mapPurchaseWithLines(record) : null;
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<PurchaseWithLines | null> {
    const record = await this.prisma.purchase.findUnique({
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
        },
      },
      where: {
        organizationId_idempotencyKey: {
          idempotencyKey,
          organizationId,
        },
      },
    });

    return record ? mapPurchaseWithLines(record) : null;
  }

  async list(filter: PurchaseListFilter): Promise<Purchase[]> {
    const where: Prisma.PurchaseWhereInput = {
      organizationId: filter.organizationId,
    };

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.supplierId) {
      where.supplierId = filter.supplierId;
    }

    if (filter.destinationLocationId) {
      where.destinationLocationId = filter.destinationLocationId;
    }

    const records = await this.prisma.purchase.findMany({
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      skip: filter.offset,
      take: filter.limit,
      where,
    });

    return records.map(mapPurchase);
  }

  async update(record: UpdatePurchaseRecord): Promise<Purchase | null> {
    try {
      const updated = await this.prisma.purchase.update({
        data: {
          ...(record.status !== undefined ? { status: record.status } : {}),
          ...(record.expectedDeliveryDate !== undefined
            ? { expectedDeliveryDate: record.expectedDeliveryDate }
            : {}),
          ...(record.notes !== undefined ? { notes: record.notes } : {}),
          ...(record.receiptMovementId !== undefined
            ? { receiptMovementId: record.receiptMovementId }
            : {}),
          ...(record.totalCostMinor !== undefined
            ? { totalCostMinor: record.totalCostMinor }
            : {}),
        },
        where: {
          id_organizationId: {
            id: record.id,
            organizationId: record.organizationId,
          },
        },
      });

      return mapPurchase(updated);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return null;
      }
      if (isUniqueConstraintError(error)) {
        throw new ConflictError(
          "Unique constraint violation during purchase update.",
        );
      }
      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === "P2002"
  );
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === "P2025"
  );
}

function mapPurchase(
  record: Prisma.PurchaseGetPayload<Record<string, never>>,
): Purchase {
  return {
    createdAt: record.createdAt,
    destinationLocationId: record.destinationLocationId,
    expectedDeliveryDate: record.expectedDeliveryDate,
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    notes: record.notes,
    organizationId: record.organizationId,
    purchaseDate: record.purchaseDate,
    purchaseNumber: record.purchaseNumber,
    receiptMovementId: record.receiptMovementId,
    status: record.status,
    supplierId: record.supplierId,
    totalCostMinor: record.totalCostMinor,
    updatedAt: record.updatedAt,
  };
}

export async function lastCostsForProductQuery(
  prisma: { $queryRaw: PrismaClient["$queryRaw"] },
  organizationId: string,
  productId: string,
) {
  const rows = await prisma.$queryRaw<
    Array<{
      extra_cost_per_unit_minor: number | null;
      product_variant_id: string;
      purchase_date: Date;
      purchase_number: string;
      supplier_unit_cost_minor: number | null;
      unit_cost_minor: number;
    }>
  >`
    SELECT DISTINCT ON (line.product_variant_id)
      line.product_variant_id::text AS product_variant_id,
      line.unit_cost_minor,
      line.supplier_unit_cost_minor,
      line.extra_cost_per_unit_minor,
      purchase.purchase_date,
      purchase.purchase_number
    FROM purchase_lines line
    INNER JOIN purchases purchase
      ON purchase.id = line.purchase_id
     AND purchase.organization_id = line.organization_id
    INNER JOIN product_variants variant
      ON variant.id = line.product_variant_id
     AND variant.organization_id = line.organization_id
    WHERE line.organization_id = ${organizationId}::uuid
      AND variant.product_id = ${productId}::uuid
      AND purchase.status::text <> 'CANCELLED'
    ORDER BY line.product_variant_id, purchase.purchase_date DESC, purchase.created_at DESC`;
  return rows.map((row) => ({
    extraCostPerUnitMinor: row.extra_cost_per_unit_minor,
    productVariantId: row.product_variant_id,
    purchaseDate: row.purchase_date,
    purchaseNumber: row.purchase_number,
    supplierUnitCostMinor: row.supplier_unit_cost_minor,
    unitCostMinor: row.unit_cost_minor,
  }));
}

function mapPurchaseWithLines(
  record: Prisma.PurchaseGetPayload<{
    include: { lines: true };
  }>,
): PurchaseWithLines {
  return {
    ...mapPurchase(record),
    lines: record.lines.map((line) => ({
      createdAt: line.createdAt,
      id: line.id,
      lineNumber: line.lineNumber,
      notes: line.notes,
      organizationId: line.organizationId,
      productName: line.productName,
      productVariantId: line.productVariantId,
      purchaseId: line.purchaseId,
      quantity: line.quantity,
      sku: line.sku,
      totalCostMinor: line.totalCostMinor,
      unitCostMinor: line.unitCostMinor,
      supplierUnitCostMinor: line.supplierUnitCostMinor,
      extraCostPerUnitMinor: line.extraCostPerUnitMinor,
      updatedAt: line.updatedAt,
      variantName: line.variantName,
    })),
  };
}
