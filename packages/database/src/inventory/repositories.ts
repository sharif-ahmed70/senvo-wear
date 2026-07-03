import {
  BusinessRuleError,
  ConcurrencyError,
  ConflictError,
  type CursorPageResult,
  encodeAvailabilityCursor,
  encodeBalanceCursor,
  encodeMovementCursor,
  encodeReservationCursor,
  type CreateInventoryReservationRecord,
  type CreateInventoryMovementRecord,
  type InventoryAvailability,
  type InventoryAvailabilityFilter,
  type InventoryAvailabilityQueryRepository,
  type InventoryBalanceFilter,
  type InventoryBalanceQueryRepository,
  type InventoryMovement,
  type InventoryMovementListFilter,
  type InventoryMovementRepository,
  type InventoryReservation,
  type InventoryReservationListFilter,
  type InventoryReservationRepository,
  type OnHandBalance,
  parseAvailabilityCursor,
  parseBalanceCursor,
  parseMovementCursor,
  parseReservationCursor,
  type ReplaceInventoryMovementLinesRecord,
  type ReverseInventoryMovementRecord,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type InventoryPrismaClient = Pick<
  PrismaClient,
  | "$executeRaw"
  | "$queryRaw"
  | "$transaction"
  | "inventoryMovement"
  | "inventoryMovementLine"
  | "inventoryReservation"
  | "inventoryReservationLine"
  | "organization"
  | "productVariant"
  | "stockLocation"
>;

type InventoryTransaction = Omit<InventoryPrismaClient, "$transaction">;

type MovementWithLines = Prisma.InventoryMovementGetPayload<{
  include: {
    lines: { orderBy: { lineNumber: "asc" } };
    reversedByMovements: { select: { id: true }; take: 1 };
  };
}>;

type ReservationWithLines = Prisma.InventoryReservationGetPayload<{
  include: {
    lines: { orderBy: { lineNumber: "asc" } };
  };
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

type AvailabilityRow = {
  available_quantity: bigint | number;
  on_hand_quantity: bigint | number;
  product_variant_id: string;
  reserved_quantity: bigint | number;
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

  async reversePostedMovement(
    record: ReverseInventoryMovementRecord,
    payloadSignature: string,
  ): Promise<InventoryMovement> {
    try {
      return mapMovement(
        await this.prisma.$transaction(async (transaction) => {
          await lockMovementRow(transaction, {
            movementId: record.reversesMovementId,
            organizationId: record.organizationId,
          });
          const original = await transaction.inventoryMovement.findFirst({
            include: movementInclude,
            where: {
              id: record.reversesMovementId,
              organizationId: record.organizationId,
            },
          });
          if (!original) {
            throw new BusinessRuleError(
              "Inventory movement must belong to the same organization.",
            );
          }
          if (original.status !== "POSTED") {
            throw new BusinessRuleError(
              "Only posted inventory movement can be reversed.",
            );
          }
          if (original.reversesMovementId) {
            throw new BusinessRuleError(
              "A reversal movement cannot be reversed.",
            );
          }

          const existing = await transaction.inventoryMovement.findUnique({
            include: movementInclude,
            where: {
              organizationId_idempotencyKey: {
                idempotencyKey: record.idempotencyKey,
                organizationId: record.organizationId,
              },
            },
          });
          if (existing) {
            const existingSignature = await getPayloadSignatureInTransaction(
              transaction,
              existing.id,
              existing.organizationId,
            );
            if (existingSignature === payloadSignature) {
              return existing;
            }
            throw new ConflictError("Idempotency key was already used.");
          }
          if (original.reversedByMovements.length > 0) {
            throw new ConflictError(
              "Inventory movement has already been reversed.",
            );
          }

          await assertPostingEligibility(transaction, {
            ...original,
            destinationLocationId: record.destinationLocationId,
            lines: record.lines.map((line, index) => ({
              createdAt: original.createdAt,
              id: original.lines.at(index)?.id ?? original.id,
              lineNumber: index + 1,
              movementId: original.id,
              note: line.note,
              organizationId: record.organizationId,
              productVariantId: line.productVariantId,
              quantity: line.quantity,
            })),
            sourceLocationId: record.sourceLocationId,
            type: record.type,
          });
          await lockAffectedBalanceKeys(transaction, {
            ...original,
            destinationLocationId: record.destinationLocationId,
            lines: original.lines.map((line) => ({
              ...line,
              movementId: original.id,
            })),
            sourceLocationId: record.sourceLocationId,
            type: record.type,
          });
          await assertNonNegativeSourceBalances(transaction, {
            ...original,
            destinationLocationId: record.destinationLocationId,
            lines: original.lines.map((line) => ({
              ...line,
              movementId: original.id,
            })),
            sourceLocationId: record.sourceLocationId,
            type: record.type,
          });

          const movement = await transaction.inventoryMovement.create({
            data: {
              destinationLocationId: record.destinationLocationId,
              idempotencyKey: record.idempotencyKey,
              movementNumber: record.movementNumber,
              note: null,
              occurredAt: record.occurredAt,
              organizationId: record.organizationId,
              payloadSignature,
              postedAt: new Date(),
              referenceId: record.referenceId,
              referenceType: record.referenceType,
              reversalReason: record.reversalReason,
              reversesMovementId: record.reversesMovementId,
              sourceLocationId: record.sourceLocationId,
              status: "POSTED",
              type: record.type,
              version: 2,
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
          "Inventory movement reversal already exists or idempotency key was already used.",
          error,
        );
      }
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
        ...(filter.isReversal === undefined
          ? {}
          : filter.isReversal
            ? { reversesMovementId: { not: null } }
            : { reversesMovementId: null }),
        ...(filter.isReversed === undefined
          ? {}
          : filter.isReversed
            ? { reversedByMovements: { some: {} } }
            : { reversedByMovements: { none: {} } }),
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

export class PrismaInventoryReservationRepository implements InventoryReservationRepository {
  constructor(private readonly prisma: InventoryPrismaClient) {}

  async changeStatus(record: {
    expectedVersion: number;
    organizationId: string;
    reservationId: string;
    status: "CONFIRMED" | "RELEASED" | "EXPIRED";
  }): Promise<InventoryReservation> {
    try {
      const reservation = await this.prisma.$transaction(
        async (transaction) => {
          await lockReservationRow(transaction, record);
          const current = await transaction.inventoryReservation.findFirst({
            include: reservationInclude,
            where: {
              id: record.reservationId,
              organizationId: record.organizationId,
            },
          });
          if (!current) {
            return null;
          }
          if (current.status !== "ACTIVE") {
            throw new BusinessRuleError(
              "Terminal inventory reservations cannot transition.",
            );
          }
          if (current.version !== record.expectedVersion) {
            throw new ConcurrencyError();
          }
          const now = new Date();
          return transaction.inventoryReservation.update({
            data: {
              confirmedAt: record.status === "CONFIRMED" ? now : null,
              expiredAt: record.status === "EXPIRED" ? now : null,
              releasedAt: record.status === "RELEASED" ? now : null,
              status: record.status,
              version: { increment: 1 },
            },
            include: reservationInclude,
            where: { id: current.id },
          });
        },
      );
      if (!reservation) {
        throw new BusinessRuleError(
          "Inventory reservation must belong to the same organization.",
        );
      }
      return mapReservation(reservation);
    } catch (error) {
      mapInventoryReservationIntegrityError(error);
    }
  }

  async createActive(
    record: CreateInventoryReservationRecord,
    payloadSignature: string,
  ): Promise<InventoryReservation> {
    try {
      return mapReservation(
        await this.prisma.$transaction(async (transaction) => {
          const existing = await transaction.inventoryReservation.findUnique({
            include: reservationInclude,
            where: {
              organizationId_idempotencyKey: {
                idempotencyKey: record.idempotencyKey,
                organizationId: record.organizationId,
              },
            },
          });
          if (existing) {
            const existingSignature =
              await getReservationPayloadSignatureInTransaction(
                transaction,
                existing.id,
                existing.organizationId,
              );
            if (existingSignature === payloadSignature) {
              return existing;
            }
            throw new ConflictError("Idempotency key was already used.");
          }

          await assertReservationEligibility(transaction, record);
          await lockReservationBalanceKeys(transaction, record);
          await assertAvailableToReserve(transaction, record);

          const reservation = await transaction.inventoryReservation.create({
            data: {
              expiresAt: record.expiresAt,
              idempotencyKey: record.idempotencyKey,
              note: record.note,
              organizationId: record.organizationId,
              payloadSignature,
              referenceId: record.referenceId,
              referenceType: record.referenceType,
              reservationNumber: record.reservationNumber,
              stockLocationId: record.stockLocationId,
            },
          });
          await transaction.inventoryReservationLine.createMany({
            data: record.lines.map((line, index) => ({
              lineNumber: index + 1,
              organizationId: record.organizationId,
              productVariantId: line.productVariantId,
              quantity: line.quantity,
              reservationId: reservation.id,
            })),
          });
          return transaction.inventoryReservation.findUniqueOrThrow({
            include: reservationInclude,
            where: { id: reservation.id },
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
          "Inventory reservation identity or idempotency key already exists.",
          error,
        );
      }
      mapInventoryReservationIntegrityError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<InventoryReservation | null> {
    const record = await this.prisma.inventoryReservation.findFirst({
      include: reservationInclude,
      where: { id, organizationId },
    });
    return record ? mapReservation(record) : null;
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<InventoryReservation | null> {
    const record = await this.prisma.inventoryReservation.findUnique({
      include: reservationInclude,
      where: {
        organizationId_idempotencyKey: { idempotencyKey, organizationId },
      },
    });
    return record ? mapReservation(record) : null;
  }

  async getPayloadSignature(
    reservationId: string,
    organizationId: string,
  ): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<PayloadSignatureRow[]>`
      SELECT payload_signature
      FROM inventory_reservations
      WHERE id = ${reservationId}::uuid
        AND organization_id = ${organizationId}::uuid
      LIMIT 1
    `;
    return rows.at(0)?.payload_signature ?? null;
  }

  async list(
    filter: InventoryReservationListFilter,
  ): Promise<CursorPageResult<InventoryReservation>> {
    const cursor = filter.cursor
      ? parseReservationCursor(filter.cursor)
      : undefined;
    const records = await this.prisma.inventoryReservation.findMany({
      include: reservationInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filter.pageSize + 1,
      where: {
        organizationId: filter.organizationId,
        ...(filter.expiresBefore
          ? { expiresAt: { lt: filter.expiresBefore } }
          : {}),
        ...(filter.productVariantId
          ? {
              lines: {
                some: {
                  organizationId: filter.organizationId,
                  productVariantId: filter.productVariantId,
                },
              },
            }
          : {}),
        ...(filter.referenceId ? { referenceId: filter.referenceId } : {}),
        ...(filter.referenceType
          ? { referenceType: filter.referenceType }
          : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.stockLocationId
          ? { stockLocationId: filter.stockLocationId }
          : {}),
        ...afterReservationCursor(cursor),
      },
    });
    return toReservationCursorPage(
      records.map(mapReservation),
      filter.pageSize,
    );
  }

  async sumActiveReserved(input: {
    organizationId: string;
    productVariantId: string;
    stockLocationId: string;
  }): Promise<number> {
    return getReservedQuantity(this.prisma, input);
  }
}

export class PrismaInventoryAvailabilityQueryRepository implements InventoryAvailabilityQueryRepository {
  constructor(private readonly prisma: InventoryPrismaClient) {}

  async getAvailability(input: {
    organizationId: string;
    productVariantId: string;
    stockLocationId: string;
  }): Promise<InventoryAvailability> {
    const [onHandQuantity, reservedQuantity] = await Promise.all([
      getBalance(this.prisma, input),
      getReservedQuantity(this.prisma, input),
    ]);
    return {
      ...input,
      availableQuantity: onHandQuantity - reservedQuantity,
      onHandQuantity,
      reservedQuantity,
    };
  }

  async listByLocation(
    filter: InventoryAvailabilityFilter,
  ): Promise<CursorPageResult<InventoryAvailability>> {
    const cursor = filter.cursor
      ? parseAvailabilityCursor(filter.cursor)
      : undefined;
    const rows = await this.prisma.$queryRaw<AvailabilityRow[]>`
      WITH on_hand AS (
        SELECT product_variant_id, SUM(quantity_delta)::bigint AS on_hand_quantity
        FROM (
          SELECT line.product_variant_id, line.quantity AS quantity_delta
          FROM inventory_movement_lines line
          INNER JOIN inventory_movements movement
            ON movement.id = line.movement_id
           AND movement.organization_id = line.organization_id
          WHERE movement.status = 'POSTED'
            AND line.organization_id = ${filter.organizationId}::uuid
            AND movement.destination_location_id = ${filter.stockLocationId}::uuid
          UNION ALL
          SELECT line.product_variant_id, -line.quantity AS quantity_delta
          FROM inventory_movement_lines line
          INNER JOIN inventory_movements movement
            ON movement.id = line.movement_id
           AND movement.organization_id = line.organization_id
          WHERE movement.status = 'POSTED'
            AND line.organization_id = ${filter.organizationId}::uuid
            AND movement.source_location_id = ${filter.stockLocationId}::uuid
        ) balance
        GROUP BY product_variant_id
      ),
      reserved AS (
        SELECT line.product_variant_id, SUM(line.quantity)::bigint AS reserved_quantity
        FROM inventory_reservation_lines line
        INNER JOIN inventory_reservations reservation
          ON reservation.id = line.reservation_id
         AND reservation.organization_id = line.organization_id
        WHERE reservation.status = 'ACTIVE'
          AND line.organization_id = ${filter.organizationId}::uuid
          AND reservation.stock_location_id = ${filter.stockLocationId}::uuid
        GROUP BY line.product_variant_id
      ),
      availability AS (
        SELECT
          COALESCE(on_hand.product_variant_id, reserved.product_variant_id) AS product_variant_id,
          COALESCE(on_hand.on_hand_quantity, 0)::bigint AS on_hand_quantity,
          COALESCE(reserved.reserved_quantity, 0)::bigint AS reserved_quantity,
          (COALESCE(on_hand.on_hand_quantity, 0) - COALESCE(reserved.reserved_quantity, 0))::bigint AS available_quantity
        FROM on_hand
        FULL OUTER JOIN reserved
          ON reserved.product_variant_id = on_hand.product_variant_id
      )
      SELECT product_variant_id, on_hand_quantity, reserved_quantity, available_quantity
      FROM availability
      WHERE (${filter.productVariantId ?? null}::uuid IS NULL OR product_variant_id = ${filter.productVariantId ?? null}::uuid)
        AND (${cursor?.productVariantId ?? null}::uuid IS NULL OR product_variant_id > ${cursor?.productVariantId ?? null}::uuid)
        AND (${filter.onlyAvailable ?? false}::boolean = false OR available_quantity > 0)
      ORDER BY product_variant_id ASC
      LIMIT ${filter.pageSize + 1}
    `;
    const items = rows.map((row) => ({
      availableQuantity: Number(row.available_quantity),
      onHandQuantity: Number(row.on_hand_quantity),
      organizationId: filter.organizationId,
      productVariantId: row.product_variant_id,
      reservedQuantity: Number(row.reserved_quantity),
      stockLocationId: filter.stockLocationId,
    }));
    return toAvailabilityCursorPage(items, filter.pageSize);
  }
}

const movementInclude = {
  lines: { orderBy: { lineNumber: "asc" as const } },
  reversedByMovements: { select: { id: true }, take: 1 },
};

const reservationInclude = {
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

async function lockReservationRow(
  transaction: InventoryTransaction,
  record: { reservationId: string; organizationId: string },
): Promise<void> {
  await transaction.$queryRaw`
    SELECT id
    FROM inventory_reservations
    WHERE id = ${record.reservationId}::uuid
      AND organization_id = ${record.organizationId}::uuid
    FOR UPDATE
  `;
}

async function getPayloadSignatureInTransaction(
  transaction: InventoryTransaction,
  movementId: string,
  organizationId: string,
): Promise<string | null> {
  const rows = await transaction.$queryRaw<PayloadSignatureRow[]>`
    SELECT payload_signature
    FROM inventory_movements
    WHERE id = ${movementId}::uuid
      AND organization_id = ${organizationId}::uuid
    LIMIT 1
  `;
  return rows.at(0)?.payload_signature ?? null;
}

async function getReservationPayloadSignatureInTransaction(
  transaction: InventoryTransaction,
  reservationId: string,
  organizationId: string,
): Promise<string | null> {
  const rows = await transaction.$queryRaw<PayloadSignatureRow[]>`
    SELECT payload_signature
    FROM inventory_reservations
    WHERE id = ${reservationId}::uuid
      AND organization_id = ${organizationId}::uuid
    LIMIT 1
  `;
  return rows.at(0)?.payload_signature ?? null;
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

async function assertReservationEligibility(
  transaction: InventoryTransaction,
  record: CreateInventoryReservationRecord,
): Promise<void> {
  const organization = await transaction.organization.findFirst({
    where: { id: record.organizationId, status: "ACTIVE" },
  });
  if (!organization) {
    throw new BusinessRuleError(
      "Inventory reservation organization must be active.",
    );
  }

  const location = await transaction.stockLocation.findFirst({
    where: {
      id: record.stockLocationId,
      isSellable: true,
      organizationId: record.organizationId,
      status: "ACTIVE",
    },
  });
  if (!location) {
    throw new BusinessRuleError(
      "Inventory reservation location must be active, sellable, and in the same organization.",
    );
  }

  const variantIds = record.lines.map((line) => line.productVariantId);
  const activeVariants = await transaction.productVariant.findMany({
    where: {
      id: { in: variantIds },
      organizationId: record.organizationId,
      status: "ACTIVE",
    },
  });
  if (activeVariants.length !== new Set(variantIds).size) {
    throw new BusinessRuleError(
      "Inventory reservation variants must be active and in the same organization.",
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
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
    `;
  }
}

async function lockReservationBalanceKeys(
  transaction: InventoryTransaction,
  record: CreateInventoryReservationRecord,
): Promise<void> {
  const keys = [
    ...new Set(
      record.lines.map(
        (line) =>
          `${record.organizationId}:${record.stockLocationId}:${line.productVariantId}`,
      ),
    ),
  ].sort();

  for (const key of keys) {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
    `;
  }
}

async function assertAvailableToReserve(
  transaction: InventoryTransaction,
  record: CreateInventoryReservationRecord,
): Promise<void> {
  for (const line of record.lines) {
    const [onHand, reserved] = await Promise.all([
      getBalance(transaction, {
        organizationId: record.organizationId,
        productVariantId: line.productVariantId,
        stockLocationId: record.stockLocationId,
      }),
      getReservedQuantity(transaction, {
        organizationId: record.organizationId,
        productVariantId: line.productVariantId,
        stockLocationId: record.stockLocationId,
      }),
    ]);
    const available = onHand - reserved;
    if (available < line.quantity) {
      throw new BusinessRuleError(
        `Insufficient available stock for variant ${line.productVariantId} at location ${record.stockLocationId}: onHand ${onHand}, reserved ${reserved}, available ${available}, requested ${line.quantity}.`,
      );
    }
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

async function getReservedQuantity(
  client: Pick<InventoryPrismaClient, "$queryRaw">,
  input: {
    organizationId: string;
    productVariantId: string;
    stockLocationId: string;
  },
): Promise<number> {
  const rows = await client.$queryRaw<Array<{ quantity: bigint | number }>>`
    SELECT COALESCE(SUM(line.quantity), 0)::bigint AS quantity
    FROM inventory_reservation_lines line
    INNER JOIN inventory_reservations reservation
      ON reservation.id = line.reservation_id
     AND reservation.organization_id = line.organization_id
    WHERE reservation.status = 'ACTIVE'
      AND line.organization_id = ${input.organizationId}::uuid
      AND line.product_variant_id = ${input.productVariantId}::uuid
      AND reservation.stock_location_id = ${input.stockLocationId}::uuid
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

function afterReservationCursor(
  cursor?: ReturnType<typeof parseReservationCursor>,
): Record<string, unknown> {
  if (!cursor) {
    return {};
  }
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
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

function toReservationCursorPage(
  records: InventoryReservation[],
  pageSize: number,
): CursorPageResult<InventoryReservation> {
  const items = records.slice(0, pageSize);
  const hasMore = records.length > pageSize;
  const lastItem = items.at(-1);
  return {
    hasMore,
    items,
    nextCursor:
      hasMore && lastItem
        ? encodeReservationCursor(lastItem.createdAt, lastItem.id)
        : null,
  };
}

function toAvailabilityCursorPage(
  records: InventoryAvailability[],
  pageSize: number,
): CursorPageResult<InventoryAvailability> {
  const items = records.slice(0, pageSize);
  const hasMore = records.length > pageSize;
  const lastItem = items.at(-1);
  return {
    hasMore,
    items,
    nextCursor:
      hasMore && lastItem
        ? encodeAvailabilityCursor(lastItem.productVariantId)
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
    reversedByMovementId: record.reversedByMovements.at(0)?.id ?? null,
    reversalReason: record.reversalReason,
    reversesMovementId: record.reversesMovementId,
    sourceLocationId: record.sourceLocationId,
    status: record.status,
    type: record.type,
    updatedAt: record.updatedAt,
    version: record.version,
    isReversal: record.reversesMovementId !== null,
    isReversed: record.reversedByMovements.length > 0,
  };
}

function mapReservation(record: ReservationWithLines): InventoryReservation {
  return {
    confirmedAt: record.confirmedAt,
    createdAt: record.createdAt,
    expiredAt: record.expiredAt,
    expiresAt: record.expiresAt,
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    lines: record.lines.map((line) => ({
      createdAt: line.createdAt,
      id: line.id,
      lineNumber: line.lineNumber,
      organizationId: line.organizationId,
      productVariantId: line.productVariantId,
      quantity: line.quantity,
      reservationId: line.reservationId,
    })),
    note: record.note,
    organizationId: record.organizationId,
    referenceId: record.referenceId,
    referenceType: record.referenceType,
    releasedAt: record.releasedAt,
    reservationNumber: record.reservationNumber,
    status: record.status,
    stockLocationId: record.stockLocationId,
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

function mapInventoryReservationIntegrityError(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new ConflictError(
      "Inventory reservation uniqueness was violated.",
      error,
    );
  }
  if (isForeignKeyConstraintError(error)) {
    throw new BusinessRuleError(
      "Inventory reservation reference integrity was violated.",
      error,
    );
  }
  if (isCheckConstraintError(error)) {
    throw new BusinessRuleError(
      "Inventory reservation database rule was violated.",
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
