import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type {
  InventoryMovement,
  InventoryMovementStatus,
  InventoryMovementType,
  OnHandBalance,
} from "../domain/models.js";
import {
  normalizeIdempotencyKey,
  normalizeInventoryMovementStatus,
  normalizeInventoryMovementType,
  normalizeLineQuantity,
  normalizeMovementNumber,
  normalizeOccurredAt,
  normalizeOptionalInventoryText,
} from "../domain/value-objects.js";
import type {
  CursorPageRequest,
  CursorPageResult,
  InventoryBalanceFilter,
  InventoryBalanceQueryRepository,
  InventoryMovementLineInput,
  InventoryMovementListFilter,
  InventoryMovementPostingRepository,
  InventoryMovementRepository,
  ReverseInventoryMovementRecord,
} from "../repositories/inventory-repositories.js";

const defaultPageSize = 25;
const maxPageSize = 100;
const maxLinesPerMovement = 500;
const maxReversalReasonLength = 1000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateInventoryMovementInput = {
  destinationLocationId?: string | null;
  idempotencyKey: string;
  lines: readonly {
    note?: string | null;
    productVariantId: string;
    quantity: number;
  }[];
  movementNumber: string;
  note?: string | null;
  occurredAt?: Date | string;
  organizationId: string;
  referenceId?: string | null;
  referenceType?: string | null;
  sourceLocationId?: string | null;
  type: InventoryMovementType;
};

export async function createInventoryMovement(
  repository: Pick<
    InventoryMovementRepository,
    "createDraft" | "findByIdempotencyKey"
  >,
  input: CreateInventoryMovementInput,
): Promise<InventoryMovement> {
  const record = normalizeCreateMovementInput(input);
  const payloadSignature = createPayloadSignature(record);
  const existing = await repository.findByIdempotencyKey(
    record.organizationId,
    record.idempotencyKey,
  );
  if (existing) {
    assertIdempotentPayload(existing, payloadSignature);
    return existing;
  }
  return repository.createDraft(record, payloadSignature);
}

export type ReplaceDraftMovementLinesInput = {
  lines: CreateInventoryMovementInput["lines"];
  movementId: string;
  organizationId: string;
};

export async function replaceDraftMovementLines(
  repository: InventoryMovementRepository,
  input: ReplaceDraftMovementLinesInput,
): Promise<InventoryMovement> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const movementId = assertEntityId(input.movementId, "movementId");
  const movement = await repository.findById(movementId, organizationId);
  if (!movement) {
    throw new NotFoundError("Inventory movement was not found.");
  }
  if (movement.status !== "DRAFT") {
    throw new BusinessRuleError(
      "Posted inventory movement lines cannot change.",
    );
  }

  const lines = normalizeLines(input.lines);
  const payloadSignature = createPayloadSignature({
    destinationLocationId: movement.destinationLocationId,
    idempotencyKey: movement.idempotencyKey,
    lines,
    movementNumber: movement.movementNumber,
    note: movement.note,
    occurredAt: movement.occurredAt,
    organizationId: movement.organizationId,
    referenceId: movement.referenceId,
    referenceType: movement.referenceType,
    sourceLocationId: movement.sourceLocationId,
    type: movement.type,
  });

  return repository.replaceDraftLines(
    { lines, movementId, organizationId },
    payloadSignature,
  );
}

export type PostInventoryMovementInput = {
  movementId: string;
  organizationId: string;
};

export async function postInventoryMovement(
  repository: InventoryMovementPostingRepository,
  input: PostInventoryMovementInput,
): Promise<InventoryMovement> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const movementId = assertEntityId(input.movementId, "movementId");
  const movement = await repository.findById(movementId, organizationId);
  if (!movement) {
    throw new NotFoundError("Inventory movement was not found.");
  }
  if (movement.status === "POSTED") {
    return movement;
  }
  if (movement.lines.length === 0) {
    throw new BusinessRuleError(
      "Inventory movement requires at least one line.",
    );
  }
  return repository.post({ movementId, organizationId });
}

export type ReverseInventoryMovementInput = {
  idempotencyKey: string;
  occurredAt?: Date | string;
  organizationId: string;
  originalMovementId: string;
  reason: string;
  referenceId?: string | null;
  referenceType?: string | null;
  reversalMovementNumber: string;
};

export async function reverseInventoryMovement(
  repository: InventoryMovementRepository,
  input: ReverseInventoryMovementInput,
): Promise<InventoryMovement> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const originalMovementId = assertEntityId(
    input.originalMovementId,
    "originalMovementId",
  );
  const original = await repository.findById(
    originalMovementId,
    organizationId,
  );
  if (!original) {
    throw new NotFoundError("Inventory movement was not found.");
  }
  if (original.status !== "POSTED") {
    throw new BusinessRuleError(
      "Only posted inventory movement can be reversed.",
    );
  }
  if (original.reversesMovementId) {
    throw new BusinessRuleError("A reversal movement cannot be reversed.");
  }

  const record = normalizeReverseMovementInput(input, original);
  const payloadSignature = createPayloadSignature(record);
  const existing = await repository.findByIdempotencyKey(
    record.organizationId,
    record.idempotencyKey,
  );
  if (existing) {
    assertIdempotentPayload(existing, payloadSignature);
    return existing;
  }
  if (original.reversedByMovementId) {
    throw new ConflictError("Inventory movement has already been reversed.");
  }
  return repository.reversePostedMovement(record, payloadSignature);
}

export type GetInventoryMovementByIdInput = {
  movementId: string;
  organizationId: string;
};

export async function getInventoryMovementById(
  repository: InventoryMovementRepository,
  input: GetInventoryMovementByIdInput,
): Promise<InventoryMovement> {
  const movement = await repository.findById(
    assertEntityId(input.movementId, "movementId"),
    assertEntityId(input.organizationId, "organizationId"),
  );
  if (!movement) {
    throw new NotFoundError("Inventory movement was not found.");
  }
  return movement;
}

export type ListInventoryMovementsInput = CursorPageRequest & {
  destinationLocationId?: string;
  occurredFrom?: Date | string;
  occurredTo?: Date | string;
  organizationId: string;
  sourceLocationId?: string;
  status?: InventoryMovementStatus;
  type?: InventoryMovementType;
  isReversal?: boolean;
  isReversed?: boolean;
};

export async function listInventoryMovements(
  repository: InventoryMovementRepository,
  input: ListInventoryMovementsInput,
): Promise<CursorPageResult<InventoryMovement>> {
  return repository.list(normalizeMovementListFilter(input));
}

export type GetOnHandBalanceInput = {
  organizationId: string;
  productVariantId: string;
  stockLocationId: string;
};

export async function getOnHandBalance(
  repository: InventoryBalanceQueryRepository,
  input: GetOnHandBalanceInput,
): Promise<OnHandBalance> {
  return repository.getOnHand({
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    productVariantId: assertEntityId(
      input.productVariantId,
      "productVariantId",
    ),
    stockLocationId: assertEntityId(input.stockLocationId, "stockLocationId"),
  });
}

export type ListLocationBalancesInput = CursorPageRequest & {
  locationId: string;
  onlyPositive?: boolean;
  organizationId: string;
  productVariantId?: string;
};

export async function listLocationBalances(
  repository: InventoryBalanceQueryRepository,
  input: ListLocationBalancesInput,
): Promise<CursorPageResult<OnHandBalance>> {
  return repository.listByLocation(normalizeBalanceFilter(input));
}

function normalizeCreateMovementInput(input: CreateInventoryMovementInput) {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const type = normalizeInventoryMovementType(input.type);
  const sourceLocationId = normalizeOptionalId(
    input.sourceLocationId,
    "sourceLocationId",
  );
  const destinationLocationId = normalizeOptionalId(
    input.destinationLocationId,
    "destinationLocationId",
  );
  assertMovementShape(
    type,
    sourceLocationId ?? null,
    destinationLocationId ?? null,
  );
  const referencePair = normalizeReferencePair(
    input.referenceType,
    input.referenceId,
  );

  return {
    destinationLocationId: destinationLocationId ?? null,
    idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
    lines: normalizeLines(input.lines),
    movementNumber: normalizeMovementNumber(input.movementNumber),
    note: normalizeOptionalInventoryText(input.note, "note", 1000),
    occurredAt: normalizeOccurredAt(input.occurredAt),
    organizationId,
    referenceId: referencePair.referenceId,
    referenceType: referencePair.referenceType,
    sourceLocationId: sourceLocationId ?? null,
    type,
  };
}

function normalizeLines(
  input: CreateInventoryMovementInput["lines"],
): InventoryMovementLineInput[] {
  if (input.length === 0) {
    throw new BusinessRuleError(
      "Inventory movement requires at least one line.",
    );
  }
  if (input.length > maxLinesPerMovement) {
    throw new ValidationApplicationError(
      `Inventory movement may contain at most ${maxLinesPerMovement} lines.`,
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
        "A product variant may appear only once per movement.",
      );
    }
    seenVariants.add(productVariantId);
    return {
      note: normalizeOptionalInventoryText(line.note, "line note", 500),
      productVariantId,
      quantity: normalizeLineQuantity(line.quantity),
    };
  });
}

function normalizeReverseMovementInput(
  input: ReverseInventoryMovementInput,
  original: InventoryMovement,
): ReverseInventoryMovementRecord {
  const referencePair = normalizeReferencePair(
    input.referenceType,
    input.referenceId,
  );
  const compensating = deriveCompensatingMovement(original);
  return {
    ...compensating,
    idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
    lines: original.lines.map((line) => ({
      note: line.note,
      productVariantId: line.productVariantId,
      quantity: normalizeLineQuantity(line.quantity),
    })),
    movementNumber: normalizeMovementNumber(input.reversalMovementNumber),
    note: null,
    occurredAt: normalizeOccurredAt(input.occurredAt),
    organizationId: original.organizationId,
    referenceId: referencePair.referenceId,
    referenceType: referencePair.referenceType,
    reversalReason: normalizeRequiredInventoryText(
      input.reason,
      "reason",
      maxReversalReasonLength,
    ),
    reversesMovementId: original.id,
  };
}

export function deriveCompensatingMovement(
  original: InventoryMovement,
): Pick<
  ReverseInventoryMovementRecord,
  "destinationLocationId" | "sourceLocationId" | "type"
> {
  switch (original.type) {
    case "OPENING":
    case "RECEIPT":
    case "ADJUSTMENT_IN":
      return {
        destinationLocationId: null,
        sourceLocationId: requireLocation(
          original.destinationLocationId,
          original.type,
          "destination",
        ),
        type: "ADJUSTMENT_OUT",
      };
    case "ISSUE":
    case "ADJUSTMENT_OUT":
      return {
        destinationLocationId: requireLocation(
          original.sourceLocationId,
          original.type,
          "source",
        ),
        sourceLocationId: null,
        type: "ADJUSTMENT_IN",
      };
    case "TRANSFER":
      return {
        destinationLocationId: requireLocation(
          original.sourceLocationId,
          original.type,
          "source",
        ),
        sourceLocationId: requireLocation(
          original.destinationLocationId,
          original.type,
          "destination",
        ),
        type: "TRANSFER",
      };
  }
}

function requireLocation(
  locationId: string | null,
  type: InventoryMovementType,
  field: string,
): string {
  if (!locationId) {
    throw new BusinessRuleError(
      `${type} cannot be reversed because its ${field} location is missing.`,
    );
  }
  return locationId;
}

function normalizeMovementListFilter(
  input: ListInventoryMovementsInput,
): InventoryMovementListFilter {
  const occurredFrom =
    input.occurredFrom === undefined
      ? undefined
      : normalizeOccurredAt(input.occurredFrom);
  const occurredTo =
    input.occurredTo === undefined
      ? undefined
      : normalizeOccurredAt(input.occurredTo);
  if (occurredFrom && occurredTo && occurredFrom > occurredTo) {
    throw new ValidationApplicationError(
      "occurredFrom must be before occurredTo.",
    );
  }
  return {
    cursor: normalizeMovementCursor(input.cursor),
    destinationLocationId:
      normalizeOptionalId(
        input.destinationLocationId,
        "destinationLocationId",
      ) ?? undefined,
    occurredFrom,
    occurredTo,
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    isReversal: input.isReversal,
    isReversed: input.isReversed,
    sourceLocationId:
      normalizeOptionalId(input.sourceLocationId, "sourceLocationId") ??
      undefined,
    status:
      input.status === undefined
        ? undefined
        : normalizeInventoryMovementStatus(input.status),
    type:
      input.type === undefined
        ? undefined
        : normalizeInventoryMovementType(input.type),
  };
}

function normalizeBalanceFilter(
  input: ListLocationBalancesInput,
): InventoryBalanceFilter {
  return {
    cursor: normalizeBalanceCursor(input.cursor),
    locationId: assertEntityId(input.locationId, "locationId"),
    onlyPositive: input.onlyPositive,
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    productVariantId:
      input.productVariantId === undefined
        ? undefined
        : assertEntityId(input.productVariantId, "productVariantId"),
  };
}

function assertMovementShape(
  type: InventoryMovementType,
  sourceLocationId: string | null,
  destinationLocationId: string | null,
): void {
  const needsDestination = ["OPENING", "RECEIPT", "ADJUSTMENT_IN"].includes(
    type,
  );
  const needsSource = ["ISSUE", "ADJUSTMENT_OUT"].includes(type);
  if (needsDestination && (sourceLocationId || !destinationLocationId)) {
    throw new BusinessRuleError(
      `${type} requires only a destination location.`,
    );
  }
  if (needsSource && (!sourceLocationId || destinationLocationId)) {
    throw new BusinessRuleError(`${type} requires only a source location.`);
  }
  if (type === "TRANSFER") {
    if (!sourceLocationId || !destinationLocationId) {
      throw new BusinessRuleError(
        "TRANSFER requires source and destination locations.",
      );
    }
    if (sourceLocationId === destinationLocationId) {
      throw new BusinessRuleError(
        "Source and destination locations must be different.",
      );
    }
  }
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

function createPayloadSignature(record: {
  destinationLocationId: string | null;
  idempotencyKey: string;
  lines: readonly InventoryMovementLineInput[];
  movementNumber: string;
  note: string | null;
  occurredAt: Date;
  organizationId: string;
  referenceId: string | null;
  referenceType: string | null;
  reversalReason?: string | null;
  reversesMovementId?: string | null;
  sourceLocationId: string | null;
  type: InventoryMovementType;
}): string {
  return JSON.stringify({
    destinationLocationId: record.destinationLocationId,
    idempotencyKey: record.idempotencyKey,
    lines: [...record.lines]
      .map((line) => ({
        note: line.note,
        productVariantId: line.productVariantId,
        quantity: line.quantity,
      }))
      .sort((left, right) =>
        left.productVariantId.localeCompare(right.productVariantId),
      ),
    movementNumber: record.movementNumber,
    note: record.note,
    occurredAt: record.occurredAt.toISOString(),
    organizationId: record.organizationId,
    referenceId: record.referenceId,
    referenceType: record.referenceType,
    reversalReason: record.reversalReason ?? null,
    reversesMovementId: record.reversesMovementId ?? null,
    sourceLocationId: record.sourceLocationId,
    type: record.type,
  });
}

function assertIdempotentPayload(
  movement: InventoryMovement,
  payloadSignature: string,
): void {
  const existingSignature = createPayloadSignature({
    destinationLocationId: movement.destinationLocationId,
    idempotencyKey: movement.idempotencyKey,
    lines: movement.lines,
    movementNumber: movement.movementNumber,
    note: movement.note,
    occurredAt: movement.occurredAt,
    organizationId: movement.organizationId,
    referenceId: movement.referenceId,
    referenceType: movement.referenceType,
    reversalReason: movement.reversalReason,
    reversesMovementId: movement.reversesMovementId,
    sourceLocationId: movement.sourceLocationId,
    type: movement.type,
  });
  if (existingSignature !== payloadSignature) {
    throw new ConflictError("Idempotency key was already used.");
  }
}

function normalizeRequiredInventoryText(
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

function normalizeOptionalId(
  value: string | null | undefined,
  field: string,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return assertEntityId(value, field);
}

function assertEntityId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

function normalizeMovementCursor(cursor?: string): string | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  parseMovementCursor(cursor);
  return cursor;
}

function normalizeBalanceCursor(cursor?: string): string | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  parseBalanceCursor(cursor);
  return cursor;
}

export function encodeMovementCursor(occurredAt: Date, id: string): string {
  assertEntityId(id, "cursor id");
  return `movement-v1|${encodeURIComponent(occurredAt.toISOString())}|${id}`;
}

export function parseMovementCursor(cursor: string): {
  id: string;
  occurredAt: Date;
} {
  const [version, encodedOccurredAt, id, extra] = cursor.split("|");
  if (
    version !== "movement-v1" ||
    !encodedOccurredAt ||
    !id ||
    extra !== undefined ||
    !uuidPattern.test(id)
  ) {
    throw new ValidationApplicationError("cursor is invalid.");
  }
  const decoded = decodeURIComponent(encodedOccurredAt);
  const occurredAt = new Date(decoded);
  if (
    Number.isNaN(occurredAt.getTime()) ||
    occurredAt.toISOString() !== decoded
  ) {
    throw new ValidationApplicationError("cursor is invalid.");
  }
  return { id, occurredAt };
}

export function encodeBalanceCursor(productVariantId: string): string {
  assertEntityId(productVariantId, "cursor productVariantId");
  return `balance-v1|${productVariantId}`;
}

export function parseBalanceCursor(cursor: string): {
  productVariantId: string;
} {
  const [version, productVariantId, extra] = cursor.split("|");
  if (
    version !== "balance-v1" ||
    !productVariantId ||
    extra !== undefined ||
    !uuidPattern.test(productVariantId)
  ) {
    throw new ValidationApplicationError("cursor is invalid.");
  }
  return { productVariantId };
}
