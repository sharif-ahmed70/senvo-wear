import {
  ConcurrencyError,
  ConflictError,
  type CostRepository,
  type CreateInventoryCostEntryRecord,
  type CreateSaleLineCostSnapshotRecord,
  type InventoryCostEntry,
  type SaleLineCostSnapshot,
  type UpsertVariantCostStateRecord,
  type VariantCostState,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

export type CostPrismaClient = Pick<
  PrismaClient,
  | "$queryRaw"
  | "variantCostState"
  | "inventoryCostEntry"
  | "saleLineCostSnapshot"
>;

type KnownPrismaError = {
  code?: string;
};

export class PrismaCostRepository implements CostRepository {
  constructor(private readonly prisma: CostPrismaClient) {}

  async getCostState(
    organizationId: string,
    productVariantId: string,
  ): Promise<VariantCostState | null> {
    const record = await this.prisma.variantCostState.findUnique({
      where: {
        productVariantId_organizationId: {
          organizationId,
          productVariantId,
        },
      },
    });

    return record ? mapVariantCostState(record) : null;
  }

  async getVariantOnHandQuantity(
    organizationId: string,
    productVariantId: string,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<
      Array<{ quantity: bigint | number }>
    >`
      SELECT COALESCE(SUM(quantity_delta), 0)::bigint AS quantity
      FROM (
        SELECT line.quantity AS quantity_delta
        FROM inventory_movement_lines line
        INNER JOIN inventory_movements movement
          ON movement.id = line.movement_id
         AND movement.organization_id = line.organization_id
        WHERE movement.status = 'POSTED'
          AND line.organization_id = ${organizationId}::uuid
          AND line.product_variant_id = ${productVariantId}::uuid
          AND movement.destination_location_id IS NOT NULL
        UNION ALL
        SELECT -line.quantity AS quantity_delta
        FROM inventory_movement_lines line
        INNER JOIN inventory_movements movement
          ON movement.id = line.movement_id
         AND movement.organization_id = line.organization_id
        WHERE movement.status = 'POSTED'
          AND line.organization_id = ${organizationId}::uuid
          AND line.product_variant_id = ${productVariantId}::uuid
          AND movement.source_location_id IS NOT NULL
      ) balance
    `;

    return Math.max(0, Number(rows[0]?.quantity ?? 0));
  }

  async upsertCostState(
    record: UpsertVariantCostStateRecord,
  ): Promise<VariantCostState> {
    if (record.expectedVersion !== undefined) {
      // Optimistic concurrency check
      const existing = await this.prisma.variantCostState.findUnique({
        where: {
          productVariantId_organizationId: {
            organizationId: record.organizationId,
            productVariantId: record.productVariantId,
          },
        },
      });

      if (!existing) {
        // Create initial record
        const created = await this.prisma.variantCostState.create({
          data: {
            averageCostMinor: record.averageCostMinor,
            costUnknownReason: record.costUnknownReason ?? null,
            inventoryValueMinor: record.inventoryValueMinor,
            isCostKnown: record.isCostKnown,
            lastCostEventAt: record.lastCostEventAt ?? null,
            organizationId: record.organizationId,
            productVariantId: record.productVariantId,
            version: 1,
          },
        });
        return mapVariantCostState(created);
      }

      if (existing.version !== record.expectedVersion) {
        throw new ConcurrencyError(
          `Variant cost state version mismatch: expected ${record.expectedVersion}, found ${existing.version}`,
        );
      }

      const updated = await this.prisma.variantCostState.update({
        data: {
          averageCostMinor: record.averageCostMinor,
          costUnknownReason: record.costUnknownReason ?? null,
          inventoryValueMinor: record.inventoryValueMinor,
          isCostKnown: record.isCostKnown,
          lastCostEventAt: record.lastCostEventAt ?? null,
          version: existing.version + 1,
        },
        where: {
          productVariantId_organizationId: {
            organizationId: record.organizationId,
            productVariantId: record.productVariantId,
          },
        },
      });

      return mapVariantCostState(updated);
    }

    const state = await this.prisma.variantCostState.upsert({
      create: {
        averageCostMinor: record.averageCostMinor,
        costUnknownReason: record.costUnknownReason ?? null,
        inventoryValueMinor: record.inventoryValueMinor,
        isCostKnown: record.isCostKnown,
        lastCostEventAt: record.lastCostEventAt ?? null,
        organizationId: record.organizationId,
        productVariantId: record.productVariantId,
        version: 1,
      },
      update: {
        averageCostMinor: record.averageCostMinor,
        costUnknownReason: record.costUnknownReason ?? null,
        inventoryValueMinor: record.inventoryValueMinor,
        isCostKnown: record.isCostKnown,
        lastCostEventAt: record.lastCostEventAt ?? null,
        version: { increment: 1 },
      },
      where: {
        productVariantId_organizationId: {
          organizationId: record.organizationId,
          productVariantId: record.productVariantId,
        },
      },
    });

    return mapVariantCostState(state);
  }

  async recordCostEntry(
    record: CreateInventoryCostEntryRecord,
  ): Promise<InventoryCostEntry> {
    const created = await this.prisma.inventoryCostEntry.create({
      data: {
        afterAverageCostMinor: record.afterAverageCostMinor,
        afterQuantity: record.afterQuantity,
        afterValueMinor: record.afterValueMinor,
        beforeAverageCostMinor: record.beforeAverageCostMinor,
        beforeQuantity: record.beforeQuantity,
        beforeValueMinor: record.beforeValueMinor,
        eventType: record.eventType,
        organizationId: record.organizationId,
        productVariantId: record.productVariantId,
        quantityChange: record.quantityChange,
        reference: record.reference ?? null,
        sourceMovementId: record.sourceMovementId ?? null,
        sourcePurchaseId: record.sourcePurchaseId ?? null,
        valueChangeMinor: record.valueChangeMinor,
      },
    });

    return mapCostEntry(created);
  }

  async listCostEntries(
    organizationId: string,
    productVariantId: string,
    limit?: number,
  ): Promise<InventoryCostEntry[]> {
    const records = await this.prisma.inventoryCostEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      where: {
        organizationId,
        productVariantId,
      },
    });

    return records.map(mapCostEntry);
  }

  async recordSaleLineCostSnapshot(
    record: CreateSaleLineCostSnapshotRecord,
  ): Promise<SaleLineCostSnapshot> {
    try {
      const created = await this.prisma.saleLineCostSnapshot.create({
        data: {
          costUnknownReason: record.costUnknownReason ?? null,
          costingMethod: record.costingMethod ?? "MOVING_WEIGHTED_AVERAGE",
          isCostKnown: record.isCostKnown,
          organizationId: record.organizationId,
          productVariantId: record.productVariantId,
          quantity: record.quantity,
          salesOrderLineId: record.salesOrderLineId,
          totalCostMinor: record.totalCostMinor ?? null,
          unitCostMinor: record.unitCostMinor ?? null,
        },
      });

      return mapSaleLineCostSnapshot(created);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError(
          "Sale line cost snapshot already exists for this order line.",
        );
      }
      throw error;
    }
  }

  async getSaleLineCostSnapshot(
    organizationId: string,
    salesOrderLineId: string,
  ): Promise<SaleLineCostSnapshot | null> {
    const record = await this.prisma.saleLineCostSnapshot.findUnique({
      where: {
        salesOrderLineId_organizationId: {
          organizationId,
          salesOrderLineId,
        },
      },
    });

    return record ? mapSaleLineCostSnapshot(record) : null;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === "P2002"
  );
}

function mapVariantCostState(
  record: Prisma.VariantCostStateGetPayload<Record<string, never>>,
): VariantCostState {
  return {
    averageCostMinor: record.averageCostMinor,
    costUnknownReason: record.costUnknownReason,
    createdAt: record.createdAt,
    id: record.id,
    inventoryValueMinor: record.inventoryValueMinor,
    isCostKnown: record.isCostKnown,
    lastCostEventAt: record.lastCostEventAt,
    organizationId: record.organizationId,
    productVariantId: record.productVariantId,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

function mapCostEntry(
  record: Prisma.InventoryCostEntryGetPayload<Record<string, never>>,
): InventoryCostEntry {
  return {
    afterAverageCostMinor: record.afterAverageCostMinor,
    afterQuantity: record.afterQuantity,
    afterValueMinor: record.afterValueMinor,
    beforeAverageCostMinor: record.beforeAverageCostMinor,
    beforeQuantity: record.beforeQuantity,
    beforeValueMinor: record.beforeValueMinor,
    createdAt: record.createdAt,
    eventType: record.eventType,
    id: record.id,
    organizationId: record.organizationId,
    productVariantId: record.productVariantId,
    quantityChange: record.quantityChange,
    reference: record.reference,
    sourceMovementId: record.sourceMovementId,
    sourcePurchaseId: record.sourcePurchaseId,
    valueChangeMinor: record.valueChangeMinor,
  };
}

function mapSaleLineCostSnapshot(
  record: Prisma.SaleLineCostSnapshotGetPayload<Record<string, never>>,
): SaleLineCostSnapshot {
  return {
    costUnknownReason: record.costUnknownReason,
    costingMethod: record.costingMethod,
    createdAt: record.createdAt,
    id: record.id,
    isCostKnown: record.isCostKnown,
    organizationId: record.organizationId,
    productVariantId: record.productVariantId,
    quantity: record.quantity,
    salesOrderLineId: record.salesOrderLineId,
    totalCostMinor: record.totalCostMinor,
    unitCostMinor: record.unitCostMinor,
  };
}
