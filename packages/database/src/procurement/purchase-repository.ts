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

export type PurchasePrismaClient = Pick<PrismaClient, "purchase">;

type KnownPrismaError = {
  code?: string;
};

export class PrismaPurchaseRepository implements PurchaseRepository {
  constructor(private readonly prisma: PurchasePrismaClient) {}

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
                  create: record.lines.map(
                    (line: CreatePurchaseLineRecord) => ({
                      lineNumber: line.lineNumber,
                      notes: line.notes ?? null,
                      organizationId: record.organizationId,
                      productName: line.productName,
                      productVariantId: line.productVariantId,
                      quantity: line.quantity,
                      sku: line.sku,
                      totalCostMinor: line.totalCostMinor,
                      unitCostMinor: line.unitCostMinor,
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
      updatedAt: line.updatedAt,
      variantName: line.variantName,
    })),
  };
}
