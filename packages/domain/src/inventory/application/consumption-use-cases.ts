import { ValidationApplicationError } from "../../errors.js";
import type {
  ConsumeInventoryReservationRecord,
  ConsumeInventoryReservationResult,
  InventoryReservationConsumptionRepository,
} from "../repositories/inventory-repositories.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const maxMovementNumberLength = 64;
const maxIdempotencyKeyLength = 128;

export type ConsumeInventoryReservationInput = {
  expectedReservationVersion: number;
  idempotencyKey: string;
  movementNumber: string;
  note?: string | null;
  occurredAt: Date | string;
  organizationId: string;
  referenceId?: string | null;
  referenceType?: string | null;
  reservationId: string;
};

export async function consumeInventoryReservation(
  repository: InventoryReservationConsumptionRepository,
  input: ConsumeInventoryReservationInput,
): Promise<ConsumeInventoryReservationResult> {
  const record = normalizeConsumeInventoryReservationInput(input);
  return repository.consume(record, createConsumptionPayloadSignature(record));
}

function normalizeConsumeInventoryReservationInput(
  input: ConsumeInventoryReservationInput,
): ConsumeInventoryReservationRecord {
  const referencePair = normalizeReferencePair(
    input.referenceType,
    input.referenceId,
  );
  return {
    expectedReservationVersion: normalizeExpectedVersion(
      input.expectedReservationVersion,
    ),
    idempotencyKey: normalizeBoundedText(
      input.idempotencyKey,
      "idempotencyKey",
      maxIdempotencyKeyLength,
    ),
    movementNumber: normalizeBoundedText(
      input.movementNumber,
      "movementNumber",
      maxMovementNumberLength,
    ),
    note: normalizeOptionalInventoryText(input.note, "note", 1000),
    occurredAt: normalizeTimestamp(input.occurredAt, "occurredAt"),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    referenceId: referencePair.referenceId,
    referenceType: referencePair.referenceType,
    reservationId: assertEntityId(input.reservationId, "reservationId"),
  };
}

function createConsumptionPayloadSignature(
  record: ConsumeInventoryReservationRecord,
): string {
  return JSON.stringify({
    expectedReservationVersion: record.expectedReservationVersion,
    idempotencyKey: record.idempotencyKey,
    movementNumber: record.movementNumber,
    note: record.note,
    occurredAt: record.occurredAt.toISOString(),
    organizationId: record.organizationId,
    referenceId: record.referenceId,
    referenceType: record.referenceType,
    reservationId: record.reservationId,
  });
}

function normalizeReferencePair(
  referenceType?: string | null,
  referenceId?: string | null,
): { referenceId: string | null; referenceType: string | null } {
  const normalizedReferenceType = normalizeOptionalInventoryText(
    referenceType,
    "referenceType",
    80,
  );
  const normalizedReferenceId = normalizeOptionalInventoryText(
    referenceId,
    "referenceId",
    120,
  );
  if (
    (normalizedReferenceType && !normalizedReferenceId) ||
    (!normalizedReferenceType && normalizedReferenceId)
  ) {
    throw new ValidationApplicationError(
      "referenceType and referenceId must be provided together.",
    );
  }
  return {
    referenceId: normalizedReferenceId,
    referenceType: normalizedReferenceType,
  };
}

function normalizeTimestamp(value: Date | string, field: string): Date {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new ValidationApplicationError(`${field} must be a valid timestamp.`);
  }
  return timestamp;
}

function normalizeExpectedVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationApplicationError(
      "expectedReservationVersion must be a positive integer.",
    );
  }
  return value;
}

function assertEntityId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

function normalizeBoundedText(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized = normalizeOptionalInventoryText(value, field, maxLength);
  if (!normalized) {
    throw new ValidationApplicationError(`${field} must not be blank.`);
  }
  return normalized;
}

function normalizeOptionalInventoryText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > maxLength) {
    throw new ValidationApplicationError(
      `${field} must be ${maxLength} characters or fewer.`,
    );
  }
  return normalized;
}
