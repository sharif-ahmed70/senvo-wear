import {
  BusinessRuleError,
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  type CursorPageResult,
  encodeAvailabilityCursor,
  encodeBalanceCursor,
  encodeCursor as encodePolicyCursor,
  encodeMovementCursor,
  encodeReservationCursor,
  type CreateInventoryReservationRecord,
  type AllocateInventoryReservationRecord,
  type AllocateInventoryReservationResult,
  type ChangeInventoryAllocationPolicyStatusRecord,
  type ConsumeInventoryReservationRecord,
  type ConsumeInventoryReservationResult,
  type CreateInventoryAllocationPolicyRecord,
  type CreateInventoryMovementRecord,
  type InventoryAvailability,
  type InventoryAvailabilityFilter,
  type InventoryAvailabilityQueryRepository,
  type InventoryBalanceFilter,
  type InventoryBalanceQueryRepository,
  type InventoryMovement,
  type InventoryMovementListFilter,
  type InventoryMovementPostingRepository,
  type InventoryMovementRepository,
  type InventoryAllocationPolicy,
  type InventoryAllocationPolicyListFilter,
  type InventoryAllocationPolicyRepository,
  type InventoryAllocationPreview,
  type InventoryAllocationQueryRepository,
  type InventoryReservation,
  type InventoryReservationListFilter,
  type InventoryReservationConsumptionRepository,
  type InventoryReservationRepository,
  type OnHandBalance,
  parseAvailabilityCursor,
  parseBalanceCursor,
  parseMovementCursor,
  parseCursor as parsePolicyCursor,
  parseReservationCursor,
  type PreviewInventoryAllocationRecord,
  type ReplaceInventoryAllocationPolicyLocationsRecord,
  type ReplaceInventoryMovementLinesRecord,
  type ReverseInventoryMovementRecord,
  type UpdateInventoryAllocationPolicyMetadataRecord,
} from "@senvo/domain";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";

type InventoryPrismaClient = Pick<
  PrismaClient,
  | "$executeRaw"
  | "$queryRaw"
  | "$transaction"
  | "inventoryMovement"
  | "inventoryMovementLine"
  | "inventoryReservation"
  | "inventoryReservationLine"
  | "inventoryAllocationPolicy"
  | "inventoryAllocationPolicyLocation"
  | "organization"
  | "branch"
  | "productVariant"
  | "stockLocation"
>;

export type InventoryTransactionClient = Omit<
  InventoryPrismaClient,
  "$transaction"
>;
type InventoryTransaction = InventoryTransactionClient;

type MovementWithLines = Prisma.InventoryMovementGetPayload<{
  include: {
    consumedReservation: { select: { id: true } };
    lines: { orderBy: { lineNumber: "asc" } };
    reversedByMovements: { select: { id: true }; take: 1 };
  };
}>;

type ReservationWithLines = Prisma.InventoryReservationGetPayload<{
  include: {
    lines: { orderBy: { lineNumber: "asc" } };
  };
}>;

type AllocationPolicyWithLocations =
  Prisma.InventoryAllocationPolicyGetPayload<{
    include: {
      locations: { orderBy: { priority: "asc" } };
    };
  }>;

type AllocationPolicyCandidate =
  Prisma.InventoryAllocationPolicyLocationGetPayload<{
    include: {
      stockLocation: { include: { branch: true } };
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
        await this.prisma.$transaction((transaction) =>
          postMovementWithinTransaction(transaction, record),
        ),
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
          if (current.referenceType === "SALES_ORDER") {
            throw new BusinessRuleError(
              "Sales-linked inventory reservations must be transitioned through sales order lifecycle.",
            );
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

export class PrismaInventoryReservationConsumptionRepository implements InventoryReservationConsumptionRepository {
  constructor(private readonly prisma: InventoryPrismaClient) {}

  async consume(
    record: ConsumeInventoryReservationRecord,
    payloadSignature: string,
  ): Promise<ConsumeInventoryReservationResult> {
    try {
      const result = await this.prisma.$transaction(async (transaction) => {
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
          if (existingSignature !== payloadSignature) {
            throw new ConflictError("Idempotency key was already used.");
          }
          const existingReservation =
            await transaction.inventoryReservation.findFirst({
              include: reservationInclude,
              where: {
                consumedByMovementId: existing.id,
                organizationId: record.organizationId,
              },
            });
          if (!existingReservation) {
            throw new ConflictError(
              "Idempotency key was already used by a non-consumption movement.",
            );
          }
          return {
            movement: existing,
            reservation: existingReservation,
          };
        }

        await lockReservationRow(transaction, record);
        const reservation = await transaction.inventoryReservation.findFirst({
          include: reservationInclude,
          where: {
            id: record.reservationId,
            organizationId: record.organizationId,
          },
        });
        if (!reservation) {
          throw new NotFoundError("Inventory reservation was not found.");
        }
        if (reservation.consumedByMovementId) {
          const existingConsumption =
            await transaction.inventoryMovement.findFirst({
              include: movementInclude,
              where: {
                id: reservation.consumedByMovementId,
                idempotencyKey: record.idempotencyKey,
                organizationId: record.organizationId,
              },
            });
          if (existingConsumption) {
            const existingSignature = await getPayloadSignatureInTransaction(
              transaction,
              existingConsumption.id,
              existingConsumption.organizationId,
            );
            if (existingSignature === payloadSignature) {
              return {
                movement: existingConsumption,
                reservation,
              };
            }
          }
          throw new ConflictError(
            "Inventory reservation has already been consumed.",
          );
        }
        if (reservation.referenceType === "SALES_ORDER") {
          throw new BusinessRuleError(
            "Sales-linked inventory reservations must be consumed through sales order fulfillment.",
          );
        }
        if (reservation.status !== "ACTIVE") {
          throw new BusinessRuleError(
            "Only active inventory reservations can be consumed.",
          );
        }
        if (reservation.version !== record.expectedReservationVersion) {
          throw new ConcurrencyError();
        }
        if (reservation.expiresAt && reservation.expiresAt <= new Date()) {
          throw new BusinessRuleError("Inventory reservation has expired.");
        }
        if (reservation.lines.length === 0) {
          throw new BusinessRuleError(
            "Inventory reservation requires at least one line.",
          );
        }

        await assertConsumptionEligibility(transaction, reservation);
        await lockReservationBalanceKeys(transaction, {
          lines: reservation.lines,
          organizationId: reservation.organizationId,
          stockLocationId: reservation.stockLocationId,
        });
        await assertSufficientConsumptionStock(transaction, reservation);

        const now = new Date();
        const movement = await transaction.inventoryMovement.create({
          data: {
            destinationLocationId: null,
            idempotencyKey: record.idempotencyKey,
            movementNumber: record.movementNumber,
            note: record.note,
            occurredAt: record.occurredAt,
            organizationId: record.organizationId,
            payloadSignature,
            postedAt: now,
            referenceId: record.referenceId,
            referenceType: record.referenceType,
            sourceLocationId: reservation.stockLocationId,
            status: "POSTED",
            type: "ISSUE",
            version: 2,
          },
        });
        await transaction.inventoryMovementLine.createMany({
          data: reservation.lines.map((line, index) => ({
            lineNumber: index + 1,
            movementId: movement.id,
            note: null,
            organizationId: record.organizationId,
            productVariantId: line.productVariantId,
            quantity: line.quantity,
          })),
        });
        const confirmedReservation =
          await transaction.inventoryReservation.update({
            data: {
              confirmedAt: now,
              consumedByMovementId: movement.id,
              expiredAt: null,
              releasedAt: null,
              status: "CONFIRMED",
              version: { increment: 1 },
            },
            include: reservationInclude,
            where: { id: reservation.id },
          });
        const postedMovement =
          await transaction.inventoryMovement.findUniqueOrThrow({
            include: movementInclude,
            where: { id: movement.id },
          });
        return {
          movement: postedMovement,
          reservation: confirmedReservation,
        };
      });
      return {
        movement: mapMovement(result.movement),
        reservation: mapReservation(result.reservation),
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await this.findConsumedMovementByIdempotencyKey(
          record.organizationId,
          record.idempotencyKey,
        );
        if (existing) {
          const existingSignature = await getPayloadSignatureInTransaction(
            this.prisma,
            existing.movement.id,
            existing.movement.organizationId,
          );
          if (existingSignature === payloadSignature) {
            return {
              movement: mapMovement(existing.movement),
              reservation: mapReservation(existing.reservation),
            };
          }
        }
        throw new ConflictError(
          "Inventory reservation consumption identity or idempotency key already exists.",
          error,
        );
      }
      mapInventoryReservationIntegrityError(error);
    }
  }

  private async findConsumedMovementByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<{
    movement: MovementWithLines;
    reservation: ReservationWithLines;
  } | null> {
    const movement = await this.prisma.inventoryMovement.findUnique({
      include: movementInclude,
      where: {
        organizationId_idempotencyKey: { idempotencyKey, organizationId },
      },
    });
    if (!movement) {
      return null;
    }
    const reservation = await this.prisma.inventoryReservation.findFirst({
      include: reservationInclude,
      where: { consumedByMovementId: movement.id, organizationId },
    });
    return reservation ? { movement, reservation } : null;
  }
}

export class PrismaInventoryAllocationPolicyRepository implements InventoryAllocationPolicyRepository {
  constructor(private readonly prisma: InventoryPrismaClient) {}

  async create(
    record: CreateInventoryAllocationPolicyRecord,
  ): Promise<InventoryAllocationPolicy> {
    try {
      return mapAllocationPolicy(
        await this.prisma.inventoryAllocationPolicy.create({
          data: record,
          include: allocationPolicyInclude,
        }),
      );
    } catch (error) {
      mapInventoryAllocationIntegrityError(error);
    }
  }

  async findByCode(
    organizationId: string,
    code: string,
  ): Promise<InventoryAllocationPolicy | null> {
    const record = await this.prisma.inventoryAllocationPolicy.findUnique({
      include: allocationPolicyInclude,
      where: { organizationId_code: { code, organizationId } },
    });
    return record ? mapAllocationPolicy(record) : null;
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<InventoryAllocationPolicy | null> {
    const record = await this.prisma.inventoryAllocationPolicy.findFirst({
      include: allocationPolicyInclude,
      where: { id, organizationId },
    });
    return record ? mapAllocationPolicy(record) : null;
  }

  async list(
    filter: InventoryAllocationPolicyListFilter,
  ): Promise<CursorPageResult<InventoryAllocationPolicy>> {
    const cursor = filter.cursor ? parsePolicyCursor(filter.cursor) : undefined;
    const records = await this.prisma.inventoryAllocationPolicy.findMany({
      include: allocationPolicyInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: filter.pageSize + 1,
      where: {
        organizationId: filter.organizationId,
        ...(filter.status
          ? { status: filter.status }
          : { status: { in: ["ACTIVE", "INACTIVE"] } }),
        ...allocationPolicyReadPredicates(filter.search, cursor),
      },
    });
    return toAllocationPolicyCursorPage(
      records.map(mapAllocationPolicy),
      filter.pageSize,
    );
  }

  async updateMetadata(
    record: UpdateInventoryAllocationPolicyMetadataRecord,
  ): Promise<InventoryAllocationPolicy> {
    try {
      const policy = await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.inventoryAllocationPolicy.findFirst({
          where: {
            id: record.policyId,
            organizationId: record.organizationId,
          },
        });
        if (!current) {
          return null;
        }
        if (current.status === "ARCHIVED") {
          throw new BusinessRuleError(
            "Archived allocation policies cannot change.",
          );
        }
        if (current.version !== record.expectedVersion) {
          throw new ConcurrencyError();
        }
        return transaction.inventoryAllocationPolicy.update({
          data: {
            name: record.metadata.name,
            requireSellableLocation: record.metadata.requireSellableLocation,
            version: { increment: 1 },
          },
          include: allocationPolicyInclude,
          where: { id: current.id },
        });
      });
      if (!policy) {
        throw new NotFoundError("Inventory allocation policy was not found.");
      }
      return mapAllocationPolicy(policy);
    } catch (error) {
      mapInventoryAllocationIntegrityError(error);
    }
  }

  async replaceLocations(
    record: ReplaceInventoryAllocationPolicyLocationsRecord,
  ): Promise<InventoryAllocationPolicy> {
    try {
      const policy = await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.inventoryAllocationPolicy.findFirst({
          where: {
            id: record.policyId,
            organizationId: record.organizationId,
          },
        });
        if (!current) {
          return null;
        }
        if (current.status === "ARCHIVED") {
          throw new BusinessRuleError(
            "Archived allocation policies cannot change.",
          );
        }
        if (current.version !== record.expectedVersion) {
          throw new ConcurrencyError();
        }
        await assertAllocationLocationsBelongToOrganization(
          transaction,
          record,
        );
        await transaction.inventoryAllocationPolicyLocation.deleteMany({
          where: {
            organizationId: record.organizationId,
            policyId: record.policyId,
          },
        });
        if (record.locations.length > 0) {
          await transaction.inventoryAllocationPolicyLocation.createMany({
            data: record.locations.map((location) => ({
              isEnabled: location.isEnabled,
              organizationId: record.organizationId,
              policyId: record.policyId,
              priority: location.priority,
              stockLocationId: location.stockLocationId,
            })),
          });
        }
        return transaction.inventoryAllocationPolicy.update({
          data: { version: { increment: 1 } },
          include: allocationPolicyInclude,
          where: { id: current.id },
        });
      });
      if (!policy) {
        throw new NotFoundError("Inventory allocation policy was not found.");
      }
      return mapAllocationPolicy(policy);
    } catch (error) {
      mapInventoryAllocationIntegrityError(error);
    }
  }

  async changeStatus(
    record: ChangeInventoryAllocationPolicyStatusRecord,
  ): Promise<InventoryAllocationPolicy> {
    try {
      const policy = await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.inventoryAllocationPolicy.findFirst({
          where: {
            id: record.policyId,
            organizationId: record.organizationId,
          },
        });
        if (!current) {
          return null;
        }
        if (current.status === "ARCHIVED") {
          throw new BusinessRuleError(
            "Archived allocation policies cannot transition.",
          );
        }
        if (current.version !== record.expectedVersion) {
          throw new ConcurrencyError();
        }
        return transaction.inventoryAllocationPolicy.update({
          data: {
            status: record.status,
            version: { increment: 1 },
          },
          include: allocationPolicyInclude,
          where: { id: current.id },
        });
      });
      if (!policy) {
        throw new NotFoundError("Inventory allocation policy was not found.");
      }
      return mapAllocationPolicy(policy);
    } catch (error) {
      mapInventoryAllocationIntegrityError(error);
    }
  }
}

export class PrismaInventoryAllocationQueryRepository implements InventoryAllocationQueryRepository {
  constructor(private readonly prisma: InventoryPrismaClient) {}

  async preview(
    record: PreviewInventoryAllocationRecord,
  ): Promise<InventoryAllocationPreview> {
    const evaluatedAt = new Date();
    const policy = await this.prisma.inventoryAllocationPolicy.findFirst({
      where: { id: record.policyId, organizationId: record.organizationId },
    });
    if (!policy) {
      throw new NotFoundError("Inventory allocation policy was not found.");
    }
    if (policy.status !== "ACTIVE") {
      throw new BusinessRuleError(
        "Only active allocation policies can allocate.",
      );
    }
    await assertAllocationVariantsActive(this.prisma, record);
    const candidates = orderAllocationCandidates(
      await loadAllocationCandidates(this.prisma, record),
      record,
    );
    const availability = await getAllocationAvailability(
      this.prisma,
      record.organizationId,
      candidates.map((candidate) => candidate.stockLocationId),
      record.lines,
    );
    const selected = selectFirstEligibleCandidate({
      availability,
      candidates,
      lines: record.lines,
      policy,
    });

    return {
      canFulfill: selected !== null,
      evaluatedAt,
      failureReason: selected
        ? null
        : "No eligible location can fulfill all allocation lines.",
      lines: record.lines,
      policyId: record.policyId,
      selectedBranchId: selected?.candidate.stockLocation.branchId ?? null,
      selectedLines: selected?.lineAvailability ?? [],
      selectedStockLocationId: selected?.candidate.stockLocationId ?? null,
    };
  }

  async allocateAndReserve(
    record: AllocateInventoryReservationRecord,
    payloadSignature: string,
  ): Promise<AllocateInventoryReservationResult> {
    try {
      const result = await this.prisma.$transaction(async (transaction) => {
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
            return {
              reservation: existing,
              selectedBranchId: await getLocationBranchId(transaction, {
                organizationId: existing.organizationId,
                stockLocationId: existing.stockLocationId,
              }),
              selectedStockLocationId: existing.stockLocationId,
            };
          }
          throw new ConflictError("Idempotency key was already used.");
        }

        const policy = await transaction.inventoryAllocationPolicy.findFirst({
          where: {
            id: record.policyId,
            organizationId: record.organizationId,
          },
        });
        if (!policy) {
          throw new NotFoundError("Inventory allocation policy was not found.");
        }
        if (policy.status !== "ACTIVE") {
          throw new BusinessRuleError(
            "Only active allocation policies can allocate.",
          );
        }

        await assertAllocationVariantsActive(transaction, record);
        const candidates = orderAllocationCandidates(
          await loadAllocationCandidates(transaction, record),
          record,
        );

        for (const candidate of candidates) {
          if (!isCandidateLocationEligible(candidate, policy)) {
            continue;
          }
          await lockAllocationBalanceKeys(transaction, {
            lines: record.lines,
            organizationId: record.organizationId,
            stockLocationId: candidate.stockLocationId,
          });
          const availability = await getAllocationAvailability(
            transaction,
            record.organizationId,
            [candidate.stockLocationId],
            record.lines,
          );
          const selected = selectFirstEligibleCandidate({
            availability,
            candidates: [candidate],
            lines: record.lines,
            policy,
          });
          if (!selected) {
            continue;
          }

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
              stockLocationId: candidate.stockLocationId,
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
          const fullReservation =
            await transaction.inventoryReservation.findUniqueOrThrow({
              include: reservationInclude,
              where: { id: reservation.id },
            });
          return {
            reservation: fullReservation,
            selectedBranchId: candidate.stockLocation.branchId,
            selectedStockLocationId: candidate.stockLocationId,
          };
        }

        throw new BusinessRuleError(
          "No eligible location can fulfill all allocation lines.",
        );
      });
      return {
        reservation: mapReservation(result.reservation),
        selectedBranchId: result.selectedBranchId,
        selectedStockLocationId: result.selectedStockLocationId,
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await this.prisma.inventoryReservation.findUnique({
          include: reservationInclude,
          where: {
            organizationId_idempotencyKey: {
              idempotencyKey: record.idempotencyKey,
              organizationId: record.organizationId,
            },
          },
        });
        const existingSignature = existing
          ? await this.prisma.$queryRaw<PayloadSignatureRow[]>`
              SELECT payload_signature
              FROM inventory_reservations
              WHERE id = ${existing.id}::uuid
                AND organization_id = ${existing.organizationId}::uuid
              LIMIT 1
            `
          : [];
        if (
          existing &&
          existingSignature.at(0)?.payload_signature === payloadSignature
        ) {
          return {
            reservation: mapReservation(existing),
            selectedBranchId: await getLocationBranchId(this.prisma, {
              organizationId: existing.organizationId,
              stockLocationId: existing.stockLocationId,
            }),
            selectedStockLocationId: existing.stockLocationId,
          };
        }
        throw new ConflictError(
          "Inventory allocation reservation identity or idempotency key already exists.",
          error,
        );
      }
      mapInventoryAllocationIntegrityError(error);
    }
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

export class PrismaTransactionalInventoryMovementPostingRepository implements InventoryMovementPostingRepository {
  constructor(private readonly transaction: InventoryTransactionClient) {}

  async createDraft(
    record: CreateInventoryMovementRecord,
    payloadSignature: string,
  ): Promise<InventoryMovement> {
    try {
      const movement = await this.transaction.inventoryMovement.create({
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
      await this.transaction.inventoryMovementLine.createMany({
        data: record.lines.map((line, index) => ({
          lineNumber: index + 1,
          movementId: movement.id,
          note: line.note,
          organizationId: record.organizationId,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
        })),
      });
      return mapMovement(
        await this.transaction.inventoryMovement.findUniqueOrThrow({
          include: movementInclude,
          where: { id: movement.id },
        }),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await this.findByIdempotencyKey(
          record.organizationId,
          record.idempotencyKey,
        );
        if (existing) {
          const existingSignature = await getPayloadSignatureInTransaction(
            this.transaction,
            existing.id,
            existing.organizationId,
          );
          if (existingSignature === payloadSignature) return existing;
          throw new ConflictError("Idempotency key was already used.");
        }
      }
      mapInventoryIntegrityError(error);
    }
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<InventoryMovement | null> {
    const record = await this.transaction.inventoryMovement.findUnique({
      include: movementInclude,
      where: {
        organizationId_idempotencyKey: { idempotencyKey, organizationId },
      },
    });
    return record ? mapMovement(record) : null;
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<InventoryMovement | null> {
    const record = await this.transaction.inventoryMovement.findFirst({
      include: movementInclude,
      where: { id, organizationId },
    });
    return record ? mapMovement(record) : null;
  }

  async post(record: {
    movementId: string;
    organizationId: string;
  }): Promise<InventoryMovement> {
    try {
      return mapMovement(
        await postMovementWithinTransaction(this.transaction, record),
      );
    } catch (error) {
      mapInventoryIntegrityError(error);
    }
  }
}

const movementInclude = {
  consumedReservation: { select: { id: true } },
  lines: { orderBy: { lineNumber: "asc" as const } },
  reversedByMovements: { select: { id: true }, take: 1 },
};

async function postMovementWithinTransaction(
  transaction: InventoryTransaction,
  record: { movementId: string; organizationId: string },
): Promise<MovementWithLines> {
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
}

const reservationInclude = {
  lines: { orderBy: { lineNumber: "asc" as const } },
};

const allocationPolicyInclude = {
  locations: { orderBy: { priority: "asc" as const } },
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
  record: Pick<
    CreateInventoryReservationRecord,
    "lines" | "organizationId" | "stockLocationId"
  >,
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

async function lockAllocationBalanceKeys(
  transaction: InventoryTransaction,
  record: {
    lines: Array<{ productVariantId: string }>;
    organizationId: string;
    stockLocationId: string;
  },
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

async function assertAllocationLocationsBelongToOrganization(
  transaction: InventoryTransaction,
  record: ReplaceInventoryAllocationPolicyLocationsRecord,
): Promise<void> {
  if (record.locations.length === 0) {
    return;
  }
  const locations = await transaction.stockLocation.findMany({
    where: {
      id: { in: record.locations.map((location) => location.stockLocationId) },
      organizationId: record.organizationId,
    },
  });
  if (locations.length !== record.locations.length) {
    throw new BusinessRuleError(
      "Allocation policy locations must belong to the same organization.",
    );
  }
}

async function assertAllocationVariantsActive(
  transaction: Pick<InventoryPrismaClient, "productVariant">,
  record: Pick<PreviewInventoryAllocationRecord, "lines" | "organizationId">,
): Promise<void> {
  const variantIds = record.lines.map((line) => line.productVariantId);
  const variants = await transaction.productVariant.findMany({
    where: {
      id: { in: variantIds },
      organizationId: record.organizationId,
      status: "ACTIVE",
    },
  });
  if (variants.length !== new Set(variantIds).size) {
    throw new BusinessRuleError(
      "Allocation variants must be active and in the same organization.",
    );
  }
}

async function loadAllocationCandidates(
  transaction: Pick<InventoryPrismaClient, "inventoryAllocationPolicyLocation">,
  record: Pick<PreviewInventoryAllocationRecord, "organizationId" | "policyId">,
): Promise<AllocationPolicyCandidate[]> {
  return transaction.inventoryAllocationPolicyLocation.findMany({
    include: { stockLocation: { include: { branch: true } } },
    orderBy: [{ priority: "asc" }, { stockLocationId: "asc" }],
    where: {
      isEnabled: true,
      organizationId: record.organizationId,
      policyId: record.policyId,
    },
  });
}

function orderAllocationCandidates(
  candidates: AllocationPolicyCandidate[],
  record: Pick<
    PreviewInventoryAllocationRecord,
    "preferredBranchId" | "preferredLocationId"
  >,
): AllocationPolicyCandidate[] {
  const ordered = [...candidates].sort(compareAllocationCandidate);
  const preferredLocation = record.preferredLocationId
    ? ordered.filter(
        (candidate) => candidate.stockLocationId === record.preferredLocationId,
      )
    : [];
  const preferredBranch = record.preferredBranchId
    ? ordered.filter(
        (candidate) =>
          candidate.stockLocationId !== record.preferredLocationId &&
          candidate.stockLocation.branchId === record.preferredBranchId,
      )
    : [];
  const remaining = ordered.filter(
    (candidate) =>
      candidate.stockLocationId !== record.preferredLocationId &&
      candidate.stockLocation.branchId !== record.preferredBranchId,
  );
  return [...preferredLocation, ...preferredBranch, ...remaining];
}

function compareAllocationCandidate(
  left: AllocationPolicyCandidate,
  right: AllocationPolicyCandidate,
): number {
  return (
    left.priority - right.priority ||
    left.stockLocationId.localeCompare(right.stockLocationId)
  );
}

function isCandidateLocationEligible(
  candidate: AllocationPolicyCandidate,
  policy: Pick<AllocationPolicyWithLocations, "requireSellableLocation">,
): boolean {
  if (candidate.stockLocation.status !== "ACTIVE") {
    return false;
  }
  if (candidate.stockLocation.branch.status !== "ACTIVE") {
    return false;
  }
  if (policy.requireSellableLocation && !candidate.stockLocation.isSellable) {
    return false;
  }
  return !["QC_HOLD", "DAMAGE_HOLD", "RETURN_HOLD", "TRANSIT"].includes(
    candidate.stockLocation.type,
  );
}

type AllocationAvailabilityKey = `${string}:${string}`;
type AllocationAvailabilityMap = Map<
  AllocationAvailabilityKey,
  {
    availableQuantity: number;
    onHandQuantity: number;
    reservedQuantity: number;
  }
>;

async function getAllocationAvailability(
  client: Pick<InventoryPrismaClient, "$queryRaw">,
  organizationId: string,
  stockLocationIds: string[],
  lines: Array<{ productVariantId: string }>,
): Promise<AllocationAvailabilityMap> {
  const uniqueLocationIds = [...new Set(stockLocationIds)];
  const uniqueVariantIds = [
    ...new Set(lines.map((line) => line.productVariantId)),
  ];
  if (uniqueLocationIds.length === 0 || uniqueVariantIds.length === 0) {
    return new Map();
  }
  const rows = await client.$queryRaw<
    Array<{
      available_quantity: bigint | number;
      on_hand_quantity: bigint | number;
      product_variant_id: string;
      reserved_quantity: bigint | number;
      stock_location_id: string;
    }>
  >`
    WITH requested_locations AS (
      SELECT unnest(ARRAY[${Prisma.join(uniqueLocationIds)}]::uuid[]) AS stock_location_id
    ),
    requested_variants AS (
      SELECT unnest(ARRAY[${Prisma.join(uniqueVariantIds)}]::uuid[]) AS product_variant_id
    ),
    requested_pairs AS (
      SELECT stock_location_id, product_variant_id
      FROM requested_locations
      CROSS JOIN requested_variants
    ),
    on_hand AS (
      SELECT stock_location_id, product_variant_id, SUM(quantity_delta)::bigint AS on_hand_quantity
      FROM (
        SELECT movement.destination_location_id AS stock_location_id, line.product_variant_id, line.quantity AS quantity_delta
        FROM inventory_movement_lines line
        INNER JOIN inventory_movements movement
          ON movement.id = line.movement_id
         AND movement.organization_id = line.organization_id
        WHERE movement.status = 'POSTED'
          AND line.organization_id = ${organizationId}::uuid
          AND movement.destination_location_id = ANY(ARRAY[${Prisma.join(uniqueLocationIds)}]::uuid[])
          AND line.product_variant_id = ANY(ARRAY[${Prisma.join(uniqueVariantIds)}]::uuid[])
        UNION ALL
        SELECT movement.source_location_id AS stock_location_id, line.product_variant_id, -line.quantity AS quantity_delta
        FROM inventory_movement_lines line
        INNER JOIN inventory_movements movement
          ON movement.id = line.movement_id
         AND movement.organization_id = line.organization_id
        WHERE movement.status = 'POSTED'
          AND line.organization_id = ${organizationId}::uuid
          AND movement.source_location_id = ANY(ARRAY[${Prisma.join(uniqueLocationIds)}]::uuid[])
          AND line.product_variant_id = ANY(ARRAY[${Prisma.join(uniqueVariantIds)}]::uuid[])
      ) balance
      GROUP BY stock_location_id, product_variant_id
    ),
    reserved AS (
      SELECT reservation.stock_location_id, line.product_variant_id, SUM(line.quantity)::bigint AS reserved_quantity
      FROM inventory_reservation_lines line
      INNER JOIN inventory_reservations reservation
        ON reservation.id = line.reservation_id
       AND reservation.organization_id = line.organization_id
      WHERE reservation.status = 'ACTIVE'
        AND line.organization_id = ${organizationId}::uuid
        AND reservation.stock_location_id = ANY(ARRAY[${Prisma.join(uniqueLocationIds)}]::uuid[])
        AND line.product_variant_id = ANY(ARRAY[${Prisma.join(uniqueVariantIds)}]::uuid[])
      GROUP BY reservation.stock_location_id, line.product_variant_id
    )
    SELECT
      requested_pairs.stock_location_id,
      requested_pairs.product_variant_id,
      COALESCE(on_hand.on_hand_quantity, 0)::bigint AS on_hand_quantity,
      COALESCE(reserved.reserved_quantity, 0)::bigint AS reserved_quantity,
      (COALESCE(on_hand.on_hand_quantity, 0) - COALESCE(reserved.reserved_quantity, 0))::bigint AS available_quantity
    FROM requested_pairs
    LEFT JOIN on_hand
      ON on_hand.stock_location_id = requested_pairs.stock_location_id
     AND on_hand.product_variant_id = requested_pairs.product_variant_id
    LEFT JOIN reserved
      ON reserved.stock_location_id = requested_pairs.stock_location_id
     AND reserved.product_variant_id = requested_pairs.product_variant_id
  `;
  return new Map(
    rows.map((row) => [
      allocationAvailabilityKey(row.stock_location_id, row.product_variant_id),
      {
        availableQuantity: Number(row.available_quantity),
        onHandQuantity: Number(row.on_hand_quantity),
        reservedQuantity: Number(row.reserved_quantity),
      },
    ]),
  );
}

function selectFirstEligibleCandidate(input: {
  availability: AllocationAvailabilityMap;
  candidates: AllocationPolicyCandidate[];
  lines: Array<{ productVariantId: string; quantity: number }>;
  policy: Pick<AllocationPolicyWithLocations, "requireSellableLocation">;
}): {
  candidate: AllocationPolicyCandidate;
  lineAvailability: Array<{
    availableQuantity: number;
    onHandQuantity: number;
    productVariantId: string;
    quantity: number;
    reservedQuantity: number;
  }>;
} | null {
  for (const candidate of input.candidates) {
    if (!isCandidateLocationEligible(candidate, input.policy)) {
      continue;
    }
    const lineAvailability = input.lines.map((line) => ({
      ...line,
      ...(input.availability.get(
        allocationAvailabilityKey(
          candidate.stockLocationId,
          line.productVariantId,
        ),
      ) ?? {
        availableQuantity: 0,
        onHandQuantity: 0,
        reservedQuantity: 0,
      }),
    }));
    if (
      lineAvailability.every((line) => line.availableQuantity >= line.quantity)
    ) {
      return { candidate, lineAvailability };
    }
  }
  return null;
}

function allocationAvailabilityKey(
  stockLocationId: string,
  productVariantId: string,
): AllocationAvailabilityKey {
  return `${stockLocationId}:${productVariantId}`;
}

async function getLocationBranchId(
  client: Pick<InventoryPrismaClient, "stockLocation">,
  input: { organizationId: string; stockLocationId: string },
): Promise<string> {
  const location = await client.stockLocation.findFirst({
    select: { branchId: true },
    where: {
      id: input.stockLocationId,
      organizationId: input.organizationId,
    },
  });
  if (!location) {
    throw new BusinessRuleError("Allocated stock location was not found.");
  }
  return location.branchId;
}

async function assertConsumptionEligibility(
  transaction: InventoryTransaction,
  reservation: ReservationWithLines,
): Promise<void> {
  const organization = await transaction.organization.findFirst({
    where: { id: reservation.organizationId, status: "ACTIVE" },
  });
  if (!organization) {
    throw new BusinessRuleError(
      "Inventory reservation organization must be active.",
    );
  }

  const location = await transaction.stockLocation.findFirst({
    where: {
      id: reservation.stockLocationId,
      organizationId: reservation.organizationId,
      status: "ACTIVE",
    },
  });
  if (!location) {
    throw new BusinessRuleError(
      "Inventory reservation location must be active and in the same organization.",
    );
  }

  const variantIds = reservation.lines.map((line) => line.productVariantId);
  const eligibleVariants = await transaction.productVariant.findMany({
    where: {
      id: { in: variantIds },
      organizationId: reservation.organizationId,
      status: { not: "ARCHIVED" },
    },
  });
  if (eligibleVariants.length !== new Set(variantIds).size) {
    throw new BusinessRuleError(
      "Inventory reservation variants must be in the same organization and not archived.",
    );
  }
}

async function assertSufficientConsumptionStock(
  transaction: InventoryTransaction,
  reservation: ReservationWithLines,
): Promise<void> {
  for (const line of reservation.lines) {
    const currentOnHand = await getBalance(transaction, {
      organizationId: reservation.organizationId,
      productVariantId: line.productVariantId,
      stockLocationId: reservation.stockLocationId,
    });
    if (currentOnHand < line.quantity) {
      throw new BusinessRuleError(
        `Insufficient physical stock for variant ${line.productVariantId} at location ${reservation.stockLocationId}: currentOnHand ${currentOnHand}, requiredQuantity ${line.quantity}.`,
      );
    }
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

function toAllocationPolicyCursorPage(
  records: InventoryAllocationPolicy[],
  pageSize: number,
): CursorPageResult<InventoryAllocationPolicy> {
  const items = records.slice(0, pageSize);
  const hasMore = records.length > pageSize;
  const lastItem = items.at(-1);
  return {
    hasMore,
    items,
    nextCursor:
      hasMore && lastItem
        ? encodePolicyCursor(lastItem.createdAt, lastItem.id)
        : null,
  };
}

function allocationPolicyReadPredicates(
  search?: string,
  cursor?: ReturnType<typeof parsePolicyCursor>,
): Record<string, unknown> {
  const predicates = [
    search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { code: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {},
    cursor
      ? {
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { gt: cursor.id } },
          ],
        }
      : {},
  ].filter((predicate) => Object.keys(predicate).length > 0);
  return predicates.length > 0 ? { AND: predicates } : {};
}

function mapAllocationPolicy(
  record: AllocationPolicyWithLocations,
): InventoryAllocationPolicy {
  return {
    code: record.code,
    createdAt: record.createdAt,
    id: record.id,
    locations: record.locations.map((location) => ({
      createdAt: location.createdAt,
      id: location.id,
      isEnabled: location.isEnabled,
      organizationId: location.organizationId,
      policyId: location.policyId,
      priority: location.priority,
      stockLocationId: location.stockLocationId,
      updatedAt: location.updatedAt,
    })),
    name: record.name,
    organizationId: record.organizationId,
    requireSellableLocation: record.requireSellableLocation,
    status: record.status,
    strategy: record.strategy,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

function mapMovement(record: MovementWithLines): InventoryMovement {
  return {
    consumesReservationId: record.consumedReservation?.id ?? null,
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
    isReservationConsumption: record.consumedReservation !== null,
    isReversal: record.reversesMovementId !== null,
    isReversed: record.reversedByMovements.length > 0,
  };
}

function mapReservation(record: ReservationWithLines): InventoryReservation {
  return {
    confirmedAt: record.confirmedAt,
    consumedByMovementId: record.consumedByMovementId,
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
    isConsumed: record.consumedByMovementId !== null,
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

function mapInventoryAllocationIntegrityError(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new ConflictError(
      "Inventory allocation policy uniqueness was violated.",
      error,
    );
  }
  if (isForeignKeyConstraintError(error)) {
    throw new BusinessRuleError(
      "Inventory allocation policy reference integrity was violated.",
      error,
    );
  }
  if (isCheckConstraintError(error)) {
    throw new BusinessRuleError(
      "Inventory allocation policy database rule was violated.",
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
