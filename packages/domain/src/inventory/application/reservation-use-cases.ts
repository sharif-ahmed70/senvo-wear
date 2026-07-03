import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type {
  InventoryAvailability,
  InventoryReservation,
  InventoryReservationStatus,
} from "../domain/models.js";
import {
  normalizeIdempotencyKey,
  normalizeLineQuantity,
  normalizeMovementNumber,
  normalizeOptionalInventoryText,
} from "../domain/value-objects.js";
import type {
  CreateInventoryReservationRecord,
  CursorPageRequest,
  CursorPageResult,
  InventoryAvailabilityFilter,
  InventoryAvailabilityQueryRepository,
  InventoryReservationLineInput,
  InventoryReservationListFilter,
  InventoryReservationRepository,
} from "../repositories/inventory-repositories.js";

const defaultPageSize = 25;
const maxPageSize = 100;
const maxLinesPerReservation = 500;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reservationStatuses = [
  "ACTIVE",
  "CONFIRMED",
  "RELEASED",
  "EXPIRED",
] as const;

export type CreateInventoryReservationInput = {
  expiresAt?: Date | string | null;
  idempotencyKey: string;
  lines: readonly {
    productVariantId: string;
    quantity: number;
  }[];
  note?: string | null;
  organizationId: string;
  referenceId?: string | null;
  referenceType?: string | null;
  reservationNumber: string;
  stockLocationId: string;
};

export async function createInventoryReservation(
  repository: InventoryReservationRepository,
  input: CreateInventoryReservationInput,
): Promise<InventoryReservation> {
  const record = normalizeCreateReservationInput(input);
  const payloadSignature = createReservationPayloadSignature(record);
  const existing = await repository.findByIdempotencyKey(
    record.organizationId,
    record.idempotencyKey,
  );
  if (existing) {
    assertIdempotentReservationPayload(existing, payloadSignature);
    return existing;
  }
  return repository.createActive(record, payloadSignature);
}

export type ChangeInventoryReservationStatusInput = {
  expectedVersion: number;
  organizationId: string;
  reservationId: string;
};

export async function confirmInventoryReservation(
  repository: InventoryReservationRepository,
  input: ChangeInventoryReservationStatusInput,
): Promise<InventoryReservation> {
  return changeReservationStatus(repository, input, "CONFIRMED");
}

export async function releaseInventoryReservation(
  repository: InventoryReservationRepository,
  input: ChangeInventoryReservationStatusInput,
): Promise<InventoryReservation> {
  return changeReservationStatus(repository, input, "RELEASED");
}

export async function expireInventoryReservation(
  repository: InventoryReservationRepository,
  input: ChangeInventoryReservationStatusInput,
): Promise<InventoryReservation> {
  return changeReservationStatus(repository, input, "EXPIRED");
}

export type GetInventoryReservationByIdInput = {
  organizationId: string;
  reservationId: string;
};

export async function getInventoryReservationById(
  repository: InventoryReservationRepository,
  input: GetInventoryReservationByIdInput,
): Promise<InventoryReservation> {
  const reservation = await repository.findById(
    assertEntityId(input.reservationId, "reservationId"),
    assertEntityId(input.organizationId, "organizationId"),
  );
  if (!reservation) {
    throw new NotFoundError("Inventory reservation was not found.");
  }
  return reservation;
}

export type ListInventoryReservationsInput = CursorPageRequest & {
  expiresBefore?: Date | string;
  organizationId: string;
  productVariantId?: string;
  referenceId?: string;
  referenceType?: string;
  status?: InventoryReservationStatus;
  stockLocationId?: string;
};

export async function listInventoryReservations(
  repository: InventoryReservationRepository,
  input: ListInventoryReservationsInput,
): Promise<CursorPageResult<InventoryReservation>> {
  return repository.list(normalizeReservationListFilter(input));
}

export type GetReservedQuantityInput = {
  organizationId: string;
  productVariantId: string;
  stockLocationId: string;
};

export async function getReservedQuantity(
  repository: InventoryReservationRepository,
  input: GetReservedQuantityInput,
): Promise<number> {
  return repository.sumActiveReserved({
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    productVariantId: assertEntityId(
      input.productVariantId,
      "productVariantId",
    ),
    stockLocationId: assertEntityId(input.stockLocationId, "stockLocationId"),
  });
}

export type GetAvailableToSellInput = {
  organizationId: string;
  productVariantId: string;
  stockLocationId: string;
};

export async function getAvailableToSell(
  repository: InventoryAvailabilityQueryRepository,
  input: GetAvailableToSellInput,
): Promise<InventoryAvailability> {
  return repository.getAvailability({
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    productVariantId: assertEntityId(
      input.productVariantId,
      "productVariantId",
    ),
    stockLocationId: assertEntityId(input.stockLocationId, "stockLocationId"),
  });
}

export type ListLocationAvailabilityInput = CursorPageRequest & {
  onlyAvailable?: boolean;
  organizationId: string;
  productVariantId?: string;
  stockLocationId: string;
};

export async function listLocationAvailability(
  repository: InventoryAvailabilityQueryRepository,
  input: ListLocationAvailabilityInput,
): Promise<CursorPageResult<InventoryAvailability>> {
  return repository.listByLocation(normalizeAvailabilityFilter(input));
}

function changeReservationStatus(
  repository: InventoryReservationRepository,
  input: ChangeInventoryReservationStatusInput,
  status: Exclude<InventoryReservationStatus, "ACTIVE">,
): Promise<InventoryReservation> {
  return repository.changeStatus({
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    reservationId: assertEntityId(input.reservationId, "reservationId"),
    status,
  });
}

function normalizeCreateReservationInput(
  input: CreateInventoryReservationInput,
): CreateInventoryReservationRecord {
  const referencePair = normalizeReferencePair(
    input.referenceType,
    input.referenceId,
  );
  return {
    expiresAt: normalizeExpiresAt(input.expiresAt),
    idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
    lines: normalizeReservationLines(input.lines),
    note: normalizeOptionalInventoryText(input.note, "note", 1000),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    referenceId: referencePair.referenceId,
    referenceType: referencePair.referenceType,
    reservationNumber: normalizeMovementNumber(input.reservationNumber),
    stockLocationId: assertEntityId(input.stockLocationId, "stockLocationId"),
  };
}

function normalizeReservationLines(
  input: CreateInventoryReservationInput["lines"],
): InventoryReservationLineInput[] {
  if (input.length === 0) {
    throw new BusinessRuleError(
      "Inventory reservation requires at least one line.",
    );
  }
  if (input.length > maxLinesPerReservation) {
    throw new ValidationApplicationError(
      `Inventory reservation may contain at most ${maxLinesPerReservation} lines.`,
    );
  }
  const seenVariants = new Set<string>();
  return input.map((line) => {
    const productVariantId = assertEntityId(
      line.productVariantId,
      "productVariantId",
    );
    if (seenVariants.has(productVariantId)) {
      throw new BusinessRuleError(
        "A product variant may appear only once per reservation.",
      );
    }
    seenVariants.add(productVariantId);
    return {
      productVariantId,
      quantity: normalizeLineQuantity(line.quantity),
    };
  });
}

function normalizeReservationListFilter(
  input: ListInventoryReservationsInput,
): InventoryReservationListFilter {
  return {
    cursor: normalizeReservationCursor(input.cursor),
    expiresBefore:
      input.expiresBefore === undefined
        ? undefined
        : normalizeTimestamp(input.expiresBefore, "expiresBefore"),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    productVariantId:
      input.productVariantId === undefined
        ? undefined
        : assertEntityId(input.productVariantId, "productVariantId"),
    referenceId:
      normalizeOptionalInventoryText(input.referenceId, "referenceId", 120) ??
      undefined,
    referenceType:
      normalizeOptionalInventoryText(
        input.referenceType,
        "referenceType",
        80,
      ) ?? undefined,
    status:
      input.status === undefined
        ? undefined
        : normalizeReservationStatus(input.status),
    stockLocationId:
      input.stockLocationId === undefined
        ? undefined
        : assertEntityId(input.stockLocationId, "stockLocationId"),
  };
}

function normalizeAvailabilityFilter(
  input: ListLocationAvailabilityInput,
): InventoryAvailabilityFilter {
  return {
    cursor: normalizeAvailabilityCursor(input.cursor),
    onlyAvailable: input.onlyAvailable,
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    productVariantId:
      input.productVariantId === undefined
        ? undefined
        : assertEntityId(input.productVariantId, "productVariantId"),
    stockLocationId: assertEntityId(input.stockLocationId, "stockLocationId"),
  };
}

function normalizeExpiresAt(value?: Date | string | null): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  const expiresAt = normalizeTimestamp(value, "expiresAt");
  if (expiresAt <= new Date()) {
    throw new ValidationApplicationError("expiresAt must be in the future.");
  }
  return expiresAt;
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
      "expectedVersion must be a positive integer.",
    );
  }
  return value;
}

function normalizeReservationStatus(
  value: InventoryReservationStatus,
): InventoryReservationStatus {
  if (!reservationStatuses.includes(value)) {
    throw new ValidationApplicationError("reservation status is invalid.");
  }
  return value;
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

function createReservationPayloadSignature(
  record: CreateInventoryReservationRecord,
): string {
  return JSON.stringify({
    expiresAt: record.expiresAt?.toISOString() ?? null,
    idempotencyKey: record.idempotencyKey,
    lines: [...record.lines]
      .map((line) => ({
        productVariantId: line.productVariantId,
        quantity: line.quantity,
      }))
      .sort((left, right) =>
        left.productVariantId.localeCompare(right.productVariantId),
      ),
    note: record.note,
    organizationId: record.organizationId,
    referenceId: record.referenceId,
    referenceType: record.referenceType,
    reservationNumber: record.reservationNumber,
    stockLocationId: record.stockLocationId,
  });
}

function assertIdempotentReservationPayload(
  reservation: InventoryReservation,
  payloadSignature: string,
): void {
  const existingSignature = createReservationPayloadSignature({
    expiresAt: reservation.expiresAt,
    idempotencyKey: reservation.idempotencyKey,
    lines: reservation.lines,
    note: reservation.note,
    organizationId: reservation.organizationId,
    referenceId: reservation.referenceId,
    referenceType: reservation.referenceType,
    reservationNumber: reservation.reservationNumber,
    stockLocationId: reservation.stockLocationId,
  });
  if (existingSignature !== payloadSignature) {
    throw new ConflictError("Idempotency key was already used.");
  }
}

function normalizePageSize(pageSize?: number): number {
  if (pageSize === undefined) {
    return defaultPageSize;
  }
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new ValidationApplicationError(
      "pageSize must be a positive integer.",
    );
  }
  if (pageSize > maxPageSize) {
    throw new ValidationApplicationError(
      `pageSize must be ${maxPageSize} or fewer.`,
    );
  }
  return pageSize;
}

function assertEntityId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

function normalizeReservationCursor(cursor?: string): string | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  parseReservationCursor(cursor);
  return cursor;
}

function normalizeAvailabilityCursor(cursor?: string): string | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  parseAvailabilityCursor(cursor);
  return cursor;
}

export function encodeReservationCursor(createdAt: Date, id: string): string {
  assertEntityId(id, "cursor id");
  return `reservation-v1|${encodeURIComponent(createdAt.toISOString())}|${id}`;
}

export function parseReservationCursor(cursor: string): {
  createdAt: Date;
  id: string;
} {
  const [version, encodedCreatedAt, id, extra] = cursor.split("|");
  if (
    version !== "reservation-v1" ||
    !encodedCreatedAt ||
    !id ||
    extra !== undefined ||
    !uuidPattern.test(id)
  ) {
    throw new ValidationApplicationError("cursor is invalid.");
  }
  const decoded = decodeURIComponent(encodedCreatedAt);
  const createdAt = new Date(decoded);
  if (
    Number.isNaN(createdAt.getTime()) ||
    createdAt.toISOString() !== decoded
  ) {
    throw new ValidationApplicationError("cursor is invalid.");
  }
  return { createdAt, id };
}

export function encodeAvailabilityCursor(productVariantId: string): string {
  assertEntityId(productVariantId, "cursor productVariantId");
  return `availability-v1|${productVariantId}`;
}

export function parseAvailabilityCursor(cursor: string): {
  productVariantId: string;
} {
  const [version, productVariantId, extra] = cursor.split("|");
  if (
    version !== "availability-v1" ||
    !productVariantId ||
    extra !== undefined ||
    !uuidPattern.test(productVariantId)
  ) {
    throw new ValidationApplicationError("cursor is invalid.");
  }
  return { productVariantId };
}
