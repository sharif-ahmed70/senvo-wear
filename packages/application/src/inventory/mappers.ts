import type { InventoryMovement, InventoryMovementLine } from "@senvo/domain";
import type { InventoryMovementContract } from "@senvo/contracts";

export function mapInventoryMovement(
  movement: InventoryMovement,
): InventoryMovementContract {
  return {
    consumesReservationId: movement.consumesReservationId,
    createdAt: movement.createdAt.toISOString(),
    destinationLocationId: movement.destinationLocationId,
    id: movement.id,
    idempotencyKey: movement.idempotencyKey,
    isReservationConsumption: movement.isReservationConsumption,
    isReversal: movement.isReversal,
    isReversed: movement.isReversed,
    lines: movement.lines.map(mapInventoryMovementLine),
    movementNumber: movement.movementNumber,
    note: movement.note,
    occurredAt: movement.occurredAt.toISOString(),
    organizationId: movement.organizationId,
    postedAt: serializeNullableDate(movement.postedAt),
    referenceId: movement.referenceId,
    referenceType: movement.referenceType,
    reversalReason: movement.reversalReason,
    reversedByMovementId: movement.reversedByMovementId,
    reversesMovementId: movement.reversesMovementId,
    sourceLocationId: movement.sourceLocationId,
    status: movement.status,
    type: movement.type,
    updatedAt: movement.updatedAt.toISOString(),
    version: movement.version,
  };
}

function mapInventoryMovementLine(
  line: InventoryMovementLine,
): InventoryMovementContract["lines"][number] {
  return {
    createdAt: line.createdAt.toISOString(),
    id: line.id,
    lineNumber: line.lineNumber,
    movementId: line.movementId,
    note: line.note,
    organizationId: line.organizationId,
    productVariantId: line.productVariantId,
    quantity: line.quantity,
  };
}

function serializeNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
