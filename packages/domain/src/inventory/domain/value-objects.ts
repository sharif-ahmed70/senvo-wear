import { ValidationApplicationError } from "../../errors.js";
import type {
  InventoryMovementStatus,
  InventoryMovementType,
} from "./models.js";

export const inventoryMovementTypes = [
  "OPENING",
  "RECEIPT",
  "ISSUE",
  "TRANSFER",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
] as const;

export const inventoryMovementStatuses = ["DRAFT", "POSTED"] as const;

const movementNumberPattern = /^[A-Z0-9-]+$/;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]+$/;

export function normalizeInventoryMovementType(
  value: InventoryMovementType,
): InventoryMovementType {
  return assertEnumValue(value, inventoryMovementTypes, "movement type");
}

export function normalizeInventoryMovementStatus(
  value: InventoryMovementStatus,
): InventoryMovementStatus {
  return assertEnumValue(value, inventoryMovementStatuses, "movement status");
}

export function normalizeMovementNumber(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    throw new ValidationApplicationError("movementNumber must not be blank.");
  }
  if (normalized.length > 64 || !movementNumberPattern.test(normalized)) {
    throw new ValidationApplicationError(
      "movementNumber may contain only A-Z, 0-9, and hyphen and must be 64 characters or fewer.",
    );
  }
  return normalized;
}

export function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128) {
    throw new ValidationApplicationError(
      "idempotencyKey must be between 8 and 128 characters.",
    );
  }
  if (!idempotencyKeyPattern.test(normalized)) {
    throw new ValidationApplicationError(
      "idempotencyKey may contain only letters, numbers, dot, underscore, colon, and hyphen.",
    );
  }
  return normalized;
}

export function normalizeOptionalInventoryText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }
  if (normalized.length > maxLength) {
    throw new ValidationApplicationError(
      `${field} must be ${maxLength} characters or fewer.`,
    );
  }
  return normalized;
}

export function normalizeLineQuantity(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationApplicationError(
      "quantity must be a positive integer.",
    );
  }
  return value;
}

export function normalizeOccurredAt(value?: Date | string): Date {
  const occurredAt = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new ValidationApplicationError(
      "occurredAt must be a valid timestamp.",
    );
  }
  return occurredAt;
}

function assertEnumValue<T extends string>(
  value: T,
  allowedValues: readonly T[],
  field: string,
): T {
  if (!allowedValues.includes(value)) {
    throw new ValidationApplicationError(`${field} is invalid.`);
  }
  return value;
}
