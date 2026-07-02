import {
  BusinessRuleError,
  ConflictError,
  type CursorPageResult,
  encodeBalanceCursor,
  encodeMovementCursor,
  type CreateInventoryMovementRecord,
  type InventoryBalanceFilter,
  type InventoryBalanceQueryRepository,
  type InventoryMovement,
  type InventoryMovementListFilter,
  type InventoryMovementRepository,
  type OnHandBalance,
  parseBalanceCursor,
  parseMovementCursor,
  type ReplaceInventoryMovementLinesRecord,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type InventoryPrismaClient = Pick<
  PrismaClient,
  | "$executeRaw"
  | "$queryRaw"
  | "$transaction"
  | "inventoryMovement"
  | "inventoryMovementLine"
  | "organization"
  | "productVariant"
  | "stockLocation"
>;

type InventoryTransaction = Omit<InventoryPrismaClient, "$transaction">;

type MovementWithLines = Prisma.InventoryMovementGetPayload<{
  include: { lines: { orderBy: { lineNumber: "asc" } } };
}>;

type KnownPrismaError = {
  code?: string;
};

type PayloadSignatureRow = {
  payload_signature: string;
};

type BalanceRow = {
  product_variant_id: string;
  quantity: bigint | number;
};

export class PrismaInventoryMovementRepository implements InventoryMovementRepository {
  constructor(private readonly prisma: InventoryPrismaClient) {}

  async createDraft(
    record: CreateInventoryMovementRecord,
    payloadSignature: string,
  ): Promise<InventoryMovement> {
    try {
      return mapMovement(
        await this.prisma.$transaction(async (transaction) => {
          const movement = await transaction.inventoryMovement.create({
            data: {
              destinationLocationId: record.destinationLocationId,
              idempotencyKey: record.idempotencyKey,
              movementNumber: record.movementNumber,
              note: record.note,
              occurredAt: record.occurredAt,
              organizationId: record.organizationId,
              payloadSignature,
              referenceId: record.referenceId,
              referenceType: record.referenceType,
              sourceLocationId: record.sourceLocationId,
              type: record.type,
            },
          });
          await transaction.inventoryMovementLine.createMany({
            data: record.lines.map((line, index) => ({
              lineNumber: index + 1,
              movementId: movement.id,
              note: line.note,
              organizationId: record.organizationId,
              productVariantId: line.productVariantId,
              quantity: line.quantity,
            })),
          });
          return transaction.inventoryMovement.findUniqueOrThrow({
            include: movementInclude,
            where: { id: movement.id },
          });
        }),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await this.findByIdempotencyKey(
          record.organizationId,
          record.idempotencyKey,
        );
        const existingSignature = existing
          ? await this.getPayloadSignature(existing.id, existing.organizationId)
          : null;
        if (existing && existingSignature === payloadSignature) {
          return existing;
        }
        throw new ConflictError(
          "Inventory movement identity or idempotency key already exists.",
          error,
        );
      }
      mapInventoryIntegrityError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<InventoryMovement | null> {
    const record = await this.prisma.inventoryMovement.findFirst({
      include: movementInclude,
      where: { id, organizationId },
    });
    return record ? mapMovement(record) : null;
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<InventoryMovement | null> {
    const record = await this.prisma.inventoryMovement.findUnique({
      include: movementInclude,
      where: {
        organizationId_idempotencyKey: { idempotencyKey, organizationId },
      },
    });
    return record ? mapMovement(record) : null;
  }

  async getPayloadSignature(
    movementId: string,
    organizationId: string,
  ): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<PayloadSignatureRow[]>`
      SELECT payload_signature
      FROM inventory_movements
      WHERE id = ${movementId}::uuid
        AND organization_id = ${organizationId}::uuid
      LIMIT 1
    `;
    return rows.at(0)?.payload_signature ?? null;
  }

  async replaceDraftLines(
    record: ReplaceInventoryMovementLinesRecord,
    payloadSignature: string,
  ): Promise<InventoryMovement> {
    try {
      const movement = await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.inventoryMovement.findFirst({
          where: {
            id: record.movementId,
            organizationId: record.organizationId,
          },
        });
        if (!current) {
          return null;
        }
        if (current.status !== "DRAFT") {
          throw new BusinessRuleError(
            "Posted inventory movement lines cannot change.",
          );
        }
        await transaction.inventoryMovementLine.deleteMany({
          where: {
            movementId: record.movementId,
            organizationId: record.organizationId,
          },
        });
        await transaction.inventoryMovementLine.createMany({
          data: record.lines.map((line, index) => ({
            lineNumber: index + 1,
            movementId: record.movementId,
            note: line.note,
            organizationId: record.organizationId,
            productVariantId: line.productVariantId,
            quantity: line.quantity,
          })),
        });
        return transaction.inventoryMovement.update({
          data: {
            payloadSignature,
            version: { increment: 1 },
          },
          include: movementInclude,
          where: { id: record.movementId },
        });
      });
      if (!movement) {
        throw new BusinessRuleError(
          "Inventory movement must belong to the same organization.",
        );
      }
      return mapMovement(movement);
    } catch (error) {
      mapInventoryIntegrityError(error);
    }
  }

  async post(record: {
    movementId: string;
    organizationId: string;
  }): Promise<InventoryMovement> {
    try {
      return mapMovement(
        await this.prisma.$transaction(async (transaction) => {
          await lockMovementRow(transaction, record);
          const movement = await transaction.inventoryMovement.findFirst({
            include: movementInclude,
            where: {
              id: record.movementId,
              organizationId: record.organizationId,
            },
          });
          if (!movement) {
            throw new BusinessRuleError(
              "Inventory movement must belong to the same organization.",
            );
          }
          if (movement.status === "POSTED") {
            return movement;
          }
          if (movement.lines.length === 0) {
            throw new BusinessRuleError(
              "Inventory movement requires at least one line.",
            );
          }

          await assertPostingEligibility(transaction, movement);
          await lockAffectedBalanceKeys(transaction, movement);
          await assertNonNegativeSourceBalances(transaction, movement);

          return transaction.inventoryMovement.update({
            data: {
              postedAt: new Date(),
              status: "POSTED",
              version: { increment: 1 },
            },
            include: movementInclude,
            where: { id: movement.id },
          });
        }),
      );
    } catch (error) {
      mapInventoryIntegrityError(error);
    }
  }

  async list(
    filter: InventoryMovementListFilter,
  ): Promise<CursorPageResult<InventoryMovement>> {
    const cursor = filter.cursor
      ? parseMovementCursor(filter.cursor)
      : undefined;
    const records = await this.prisma.inventoryMovement.findMany({
      include: movementInclude,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: filter.pageSize + 1,
      where: {
        organizationId: filter.organizationId,
        ...(filter.destinationLocationId
          ? { destinationLocationId: filter.destinationLocationId }
          : {}),
        ...occurredAtRange(filter),
        ...(filter.sourceLocationId
          ? { sourceLocationId: filter.sourceLocationId }
          : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.type ? { type: filter.type } : {}),
        ...afterMovementCursor(cursor),
      },
    });
    return toMovementCursorPage(records.map(mapMovement), filter.pageSize);
  }
}

export class PrismaInventoryBalanceQueryRepository implements InventoryBalanceQueryRepository {
  constructor(private readonly prisma: InventoryPrismaClient) {}

  async getOnHand(input: {
    organizationId: string;
    productVariantId: string;
    stockLocationId: string;
  }): Promise<OnHandBalance> {
    const quantity = await getBalance(this.prisma, {
      organizationId: input.organizationId,
      productVariantId: input.productVariantId,
      stockLocationId: input.stockLocationId,
    });
    return {
      organizationId: input.organizationId,
      productVariantId: input.productVariantId,
      quantity,
      stockLocationId: input.stockLocationId,
    };
  }

  async listByLocation(
    filter: InventoryBalanceFilter,
  ): Promise<CursorPageResult<OnHandBalance>> {
    const cursor = filter.cursor
      ? parseBalanceCursor(filter.cursor)
      : undefined;
    const rows = await this.prisma.$queryRaw<BalanceRow[]>`
      SELECT product_variant_id, SUM(quantity_delta)::bigint AS quantity
      FROM (
        SELECT line.product_variant_id, line.quantity AS quantity_delta
        FROM inventory_movement_lines line
        INNER JOIN inventory_movements movement
          ON movement.id = line.movement_id
         AND movement.organization_id = line.organization_id
        WHERE movement.status = 'POSTED'
          AND line.organization_id = ${filter.organizationId}::uuid
          AND movement.destination_location_id = ${filter.locationId}::uuid
        UNION ALL
        SELECT line.product_variant_id, -line.quantity AS quantity_delta
        FROM inventory_movement_lines line
        INNER JOIN inventory_movements movement
          ON movement.id = line.movement_id
         AND movement.organization_id = line.organization_id
        WHERE movement.status = 'POSTED'
          AND line.organization_id = ${filter.organizationId}::uuid
          AND movement.source_location_id = ${filter.locationId}::uuid
      ) balance
      WHERE (${filter.productVariantId ?? null}::uuid IS NULL OR product_variant_id = ${filter.productVariantId ?? null}::uuid)
        AND (${cursor?.productVariantId ?? null}::uuid IS NULL OR product_variant_id > ${cursor?.productVariantId ?? null}::uuid)
      GROUP BY product_variant_id
      HAVING (${filter.onlyPositive ?? false}::boolean = false OR SUM(quantity_delta) > 0)
      ORDER BY product_variant_id ASC
      LIMIT ${filter.pageSize + 1}
    `;
    const balances = rows.map((row) => ({
      organizationId: filter.organizationId,
      productVariantId: row.product_variant_id,
      quantity: Number(row.quantity),
      stockLocationId: filter.locationId,
    }));
    return toBalanceCursorPage(balances, filter.pageSize);
  }
}

const movementInclude = {
  lines: { orderBy: { lineNumber: "asc" as const } },
};

async function lockMovementRow(
  transaction: InventoryTransaction,
  record: { movementId: string; organizationId: string },
): Promise<void> {
  await transaction.$queryRaw`
    SELECT id
    FROM inventory_movements
    WHERE id = ${record.movementId}::uuid
      AND organization_id = ${record.organizationId}::uuid
    FOR UPDATE
  `;
}

async function assertPostingEligibility(
  transaction: InventoryTransaction,
  movement: MovementWithLines,
): Promise<void> {
  const organization = await transaction.organization.findFirst({
    where: { id: movement.organizationId, status: "ACTIVE" },
  });
  if (!organization) {
    throw new BusinessRuleError(
      "Inventory movement organization must be active.",
    );
  }

  const locationIds = [
    movement.sourceLocationId,
    movement.destinationLocationId,
  ].filter((id): id is string => Boolean(id));
  if (locationIds.length > 0) {
    const activeLocations = await transaction.stockLocation.findMany({
      where: {
        id: { in: locationIds },
        organizationId: movement.organizationId,
        status: "ACTIVE",
      },
    });
    if (activeLocations.length !== new Set(locationIds).size) {
      throw new BusinessRuleError(
        "Inventory movement locations must be active and in the same organization.",
      );
    }
  }

  const variantIds = movement.lines.map((line) => line.productVariantId);
  const eligibleVariants = await transaction.productVariant.findMany({
    where: {
      id: { in: variantIds },
      organizationId: movement.organizationId,
      status: { not: "ARCHIVED" },
    },
  });
  if (eligibleVariants.length !== new Set(variantIds).size) {
    throw new BusinessRuleError(
      "Inventory movement variants must be in the same organization and not archived.",
    );
  }
}

async function lockAffectedBalanceKeys(
  transaction: InventoryTransaction,
  movement: MovementWithLines,
): Promise<void> {
  const locationIds = [
    movement.sourceLocationId,
    movement.destinationLocationId,
  ].filter((id): id is string => Boolean(id));
  const keys = [
    ...new Set(
      movement.lines.flatMap((line) =>
        locationIds.map(
          (locationId) =>
            `${movement.organizationId}:${locationId}:${line.productVariantId}`,
        ),
      ),
    ),
  ].sort();

  for (const key of keys) {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
    `;
  }
}

async function assertNonNegativeSourceBalances(
  transaction: InventoryTransaction,
  movement: MovementWithLines,
): Promise<void> {
  if (!movement.sourceLocationId) {
    return;
  }
  for (const line of movement.lines) {
    const available = await getBalance(transaction, {
      organizationId: movement.organizationId,
      productVariantId: line.productVariantId,
      stockLocationId: movement.sourceLocationId,
    });
    if (available < line.quantity) {
      throw new BusinessRuleError(
        `Insufficient stock for variant ${line.productVariantId} at source location ${movement.sourceLocationId}: available ${available}, requested ${line.quantity}.`,
      );
    }
  }
}

async function getBalance(
  client: Pick<InventoryPrismaClient, "$queryRaw">,
  input: {
    organizationId: string;
    productVariantId: string;
    stockLocationId: string;
  },
): Promise<number> {
  const rows = await client.$queryRaw<Array<{ quantity: bigint | number }>>`
    SELECT COALESCE(SUM(quantity_delta), 0)::bigint AS quantity
    FROM (
      SELECT line.quantity AS quantity_delta
      FROM inventory_movement_lines line
      INNER JOIN inventory_movements movement
        ON movement.id = line.movement_id
       AND movement.organization_id = line.organization_id
      WHERE movement.status = 'POSTED'
        AND line.organization_id = ${input.organizationId}::uuid
        AND line.product_variant_id = ${input.productVariantId}::uuid
        AND movement.destination_location_id = ${input.stockLocationId}::uuid
      UNION ALL
      SELECT -line.quantity AS quantity_delta
      FROM inventory_movement_lines line
      INNER JOIN inventory_movements movement
        ON movement.id = line.movement_id
       AND movement.organization_id = line.organization_id
      WHERE movement.status = 'POSTED'
        AND line.organization_id = ${input.organizationId}::uuid
        AND line.product_variant_id = ${input.productVariantId}::uuid
        AND movement.source_location_id = ${input.stockLocationId}::uuid
    ) balance
  `;
  return Number(rows.at(0)?.quantity ?? 0);
}

function afterMovementCursor(
  cursor?: ReturnType<typeof parseMovementCursor>,
): Record<string, unknown> {
  if (!cursor) {
    return {};
  }
  return {
    OR: [
      { occurredAt: { lt: cursor.occurredAt } },
      { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
    ],
  };
}

function occurredAtRange(filter: InventoryMovementListFilter) {
  if (!filter.occurredFrom && !filter.occurredTo) {
    return {};
  }
  return {
    occurredAt: {
      ...(filter.occurredFrom ? { gte: filter.occurredFrom } : {}),
      ...(filter.occurredTo ? { lte: filter.occurredTo } : {}),
    },
  };
}

function toMovementCursorPage(
  records: InventoryMovement[],
  pageSize: number,
): CursorPageResult<InventoryMovement> {
  const items = records.slice(0, pageSize);
  const hasMore = records.length > pageSize;
  const lastItem = items.at(-1);
  return {
    hasMore,
    items,
    nextCursor:
      hasMore && lastItem
        ? encodeMovementCursor(lastItem.occurredAt, lastItem.id)
        : null,
  };
}

function toBalanceCursorPage(
  records: OnHandBalance[],
  pageSize: number,
): CursorPageResult<OnHandBalance> {
  const items = records.slice(0, pageSize);
  const hasMore = records.length > pageSize;
  const lastItem = items.at(-1);
  return {
    hasMore,
    items,
    nextCursor:
      hasMore && lastItem
        ? encodeBalanceCursor(lastItem.productVariantId)
        : null,
  };
}

function mapMovement(record: MovementWithLines): InventoryMovement {
  return {
    createdAt: record.createdAt,
    destinationLocationId: record.destinationLocationId,
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    lines: record.lines.map((line) => ({
      createdAt: line.createdAt,
      id: line.id,
      lineNumber: line.lineNumber,
      movementId: line.movementId,
      note: line.note,
      organizationId: line.organizationId,
      productVariantId: line.productVariantId,
      quantity: line.quantity,
    })),
    movementNumber: record.movementNumber,
    note: record.note,
    occurredAt: record.occurredAt,
    organizationId: record.organizationId,
    postedAt: record.postedAt,
    referenceId: record.referenceId,
    referenceType: record.referenceType,
    sourceLocationId: record.sourceLocationId,
    status: record.status,
    type: record.type,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

function mapInventoryIntegrityError(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new ConflictError(
      "Inventory movement uniqueness was violated.",
      error,
    );
  }
  if (isForeignKeyConstraintError(error)) {
    throw new BusinessRuleError(
      "Inventory movement reference integrity was violated.",
      error,
    );
  }
  if (isCheckConstraintError(error)) {
    throw new BusinessRuleError(
      "Inventory movement database rule was violated.",
      error,
    );
  }
  throw error;
}

function isUniqueConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2002");
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2003");
}

function isCheckConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2004");
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === code
  );
}
