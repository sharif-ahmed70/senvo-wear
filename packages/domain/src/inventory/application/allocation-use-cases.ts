import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type {
  InventoryAllocationLine,
  InventoryAllocationPolicy,
  InventoryAllocationPolicyStatus,
  InventoryAllocationPreview,
} from "../domain/models.js";
import type {
  AllocateInventoryReservationRecord,
  AllocateInventoryReservationResult,
  CreateInventoryAllocationPolicyRecord,
  CursorPageRequest,
  CursorPageResult,
  InventoryAllocationPolicyListFilter,
  InventoryAllocationPolicyLocationInput,
  InventoryAllocationPolicyRepository,
  InventoryAllocationQueryRepository,
  PreviewInventoryAllocationRecord,
} from "../repositories/inventory-repositories.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const defaultPageSize = 25;
const maxPageSize = 100;
const maxLines = 500;
const maxPolicyLocations = 100;
const allocationPolicyStatuses = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

export type CreateInventoryAllocationPolicyInput = {
  code: string;
  name: string;
  organizationId: string;
  requireSellableLocation?: boolean;
};

export type UpdateInventoryAllocationPolicyMetadataInput = {
  expectedVersion: number;
  name: string;
  organizationId: string;
  policyId: string;
  requireSellableLocation?: boolean;
};

export type ReplaceInventoryAllocationPolicyLocationsInput = {
  expectedVersion: number;
  locations: Array<{
    isEnabled?: boolean;
    priority: number;
    stockLocationId: string;
  }>;
  organizationId: string;
  policyId: string;
};

export type ChangeInventoryAllocationPolicyStatusInput = {
  expectedVersion: number;
  organizationId: string;
  policyId: string;
  status: InventoryAllocationPolicyStatus;
};

export type GetInventoryAllocationPolicyByIdInput = {
  organizationId: string;
  policyId: string;
};

export type ListInventoryAllocationPoliciesInput = CursorPageRequest & {
  organizationId: string;
  search?: string;
  status?: InventoryAllocationPolicyStatus;
};

export type PreviewInventoryAllocationInput = {
  lines: InventoryAllocationLine[];
  organizationId: string;
  policyId: string;
  preferredBranchId?: string | null;
  preferredLocationId?: string | null;
};

export type AllocateAndCreateInventoryReservationInput =
  PreviewInventoryAllocationInput & {
    expiresAt?: Date | string | null;
    idempotencyKey: string;
    note?: string | null;
    referenceId?: string | null;
    referenceType?: string | null;
    reservationNumber: string;
  };

export async function createInventoryAllocationPolicy(
  repository: InventoryAllocationPolicyRepository,
  input: CreateInventoryAllocationPolicyInput,
): Promise<InventoryAllocationPolicy> {
  const record = normalizeCreatePolicyInput(input);
  const existing = await repository.findByCode(
    record.organizationId,
    record.code,
  );
  if (existing) {
    throw new ConflictError("Inventory allocation policy code already exists.");
  }
  return repository.create(record);
}

export async function updateInventoryAllocationPolicyMetadata(
  repository: InventoryAllocationPolicyRepository,
  input: UpdateInventoryAllocationPolicyMetadataInput,
): Promise<InventoryAllocationPolicy> {
  return repository.updateMetadata({
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    metadata: {
      name: normalizeRequiredText(input.name, "name", 160),
      requireSellableLocation: input.requireSellableLocation,
    },
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    policyId: assertEntityId(input.policyId, "policyId"),
  });
}

export async function replaceInventoryAllocationPolicyLocations(
  repository: InventoryAllocationPolicyRepository,
  input: ReplaceInventoryAllocationPolicyLocationsInput,
): Promise<InventoryAllocationPolicy> {
  return repository.replaceLocations({
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    locations: normalizePolicyLocations(input.locations),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    policyId: assertEntityId(input.policyId, "policyId"),
  });
}

export async function changeInventoryAllocationPolicyStatus(
  repository: InventoryAllocationPolicyRepository,
  input: ChangeInventoryAllocationPolicyStatusInput,
): Promise<InventoryAllocationPolicy> {
  return repository.changeStatus({
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    policyId: assertEntityId(input.policyId, "policyId"),
    status: normalizePolicyStatus(input.status),
  });
}

export async function getInventoryAllocationPolicyById(
  repository: InventoryAllocationPolicyRepository,
  input: GetInventoryAllocationPolicyByIdInput,
): Promise<InventoryAllocationPolicy> {
  const policy = await repository.findById(
    assertEntityId(input.policyId, "policyId"),
    assertEntityId(input.organizationId, "organizationId"),
  );
  if (!policy) {
    throw new NotFoundError("Inventory allocation policy was not found.");
  }
  return policy;
}

export async function listInventoryAllocationPolicies(
  repository: InventoryAllocationPolicyRepository,
  input: ListInventoryAllocationPoliciesInput,
): Promise<CursorPageResult<InventoryAllocationPolicy>> {
  return repository.list(normalizePolicyListFilter(input));
}

export async function previewInventoryAllocation(
  repository: InventoryAllocationQueryRepository,
  input: PreviewInventoryAllocationInput,
): Promise<InventoryAllocationPreview> {
  return repository.preview(normalizePreviewInput(input));
}

export async function allocateAndCreateInventoryReservation(
  repository: InventoryAllocationQueryRepository,
  input: AllocateAndCreateInventoryReservationInput,
): Promise<AllocateInventoryReservationResult> {
  const record = normalizeAllocateInput(input);
  return repository.allocateAndReserve(
    record,
    createAllocationPayloadSignature(record),
  );
}

function normalizeCreatePolicyInput(
  input: CreateInventoryAllocationPolicyInput,
): CreateInventoryAllocationPolicyRecord {
  return {
    code: normalizeCode(input.code),
    name: normalizeRequiredText(input.name, "name", 160),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    requireSellableLocation: input.requireSellableLocation ?? true,
    strategy: "PRIORITY_ORDER",
  };
}

function normalizePreviewInput(
  input: PreviewInventoryAllocationInput,
): PreviewInventoryAllocationRecord {
  return {
    lines: normalizeAllocationLines(input.lines),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    policyId: assertEntityId(input.policyId, "policyId"),
    preferredBranchId:
      normalizeOptionalId(input.preferredBranchId, "preferredBranchId") ?? null,
    preferredLocationId:
      normalizeOptionalId(input.preferredLocationId, "preferredLocationId") ??
      null,
  };
}

function normalizeAllocateInput(
  input: AllocateAndCreateInventoryReservationInput,
): AllocateInventoryReservationRecord {
  const preview = normalizePreviewInput(input);
  const referencePair = normalizeReferencePair(
    input.referenceType,
    input.referenceId,
  );
  return {
    ...preview,
    expiresAt: normalizeExpiresAt(input.expiresAt),
    idempotencyKey: normalizeRequiredText(
      input.idempotencyKey,
      "idempotencyKey",
      128,
    ),
    note: normalizeOptionalText(input.note, "note", 1000),
    referenceId: referencePair.referenceId,
    referenceType: referencePair.referenceType,
    reservationNumber: normalizeCode(input.reservationNumber),
  };
}

function normalizeAllocationLines(lines: InventoryAllocationLine[]) {
  if (lines.length === 0) {
    throw new BusinessRuleError(
      "Inventory allocation requires at least one line.",
    );
  }
  if (lines.length > maxLines) {
    throw new ValidationApplicationError(
      `Inventory allocation may contain at most ${maxLines} lines.`,
    );
  }
  const seen = new Set<string>();
  return lines.map((line) => {
    const productVariantId = assertEntityId(
      line.productVariantId,
      "productVariantId",
    );
    if (seen.has(productVariantId)) {
      throw new BusinessRuleError(
        "A product variant may appear only once per allocation.",
      );
    }
    seen.add(productVariantId);
    return {
      productVariantId,
      quantity: normalizePositiveInteger(line.quantity, "quantity"),
    };
  });
}

function normalizePolicyLocations(
  locations: ReplaceInventoryAllocationPolicyLocationsInput["locations"],
): InventoryAllocationPolicyLocationInput[] {
  if (locations.length > maxPolicyLocations) {
    throw new ValidationApplicationError(
      `Inventory allocation policy may contain at most ${maxPolicyLocations} locations.`,
    );
  }
  const seenLocations = new Set<string>();
  const seenPriorities = new Set<number>();
  return locations.map((location) => {
    const stockLocationId = assertEntityId(
      location.stockLocationId,
      "stockLocationId",
    );
    const priority = normalizePositiveInteger(location.priority, "priority");
    if (seenLocations.has(stockLocationId)) {
      throw new BusinessRuleError(
        "A stock location may appear only once per allocation policy.",
      );
    }
    if (seenPriorities.has(priority)) {
      throw new BusinessRuleError(
        "A priority may appear only once per allocation policy.",
      );
    }
    seenLocations.add(stockLocationId);
    seenPriorities.add(priority);
    return {
      isEnabled: location.isEnabled ?? true,
      priority,
      stockLocationId,
    };
  });
}

function normalizePolicyListFilter(
  input: ListInventoryAllocationPoliciesInput,
): InventoryAllocationPolicyListFilter {
  return {
    cursor: input.cursor,
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    search: normalizeOptionalText(input.search, "search", 160) ?? undefined,
    status:
      input.status === undefined
        ? undefined
        : normalizePolicyStatus(input.status),
  };
}

function normalizePolicyStatus(
  status: InventoryAllocationPolicyStatus,
): InventoryAllocationPolicyStatus {
  if (!allocationPolicyStatuses.includes(status)) {
    throw new ValidationApplicationError(
      "inventory allocation policy status is invalid.",
    );
  }
  return status;
}

function createAllocationPayloadSignature(
  record: AllocateInventoryReservationRecord,
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
    policyId: record.policyId,
    preferredBranchId: record.preferredBranchId,
    preferredLocationId: record.preferredLocationId,
    referenceId: record.referenceId,
    referenceType: record.referenceType,
    reservationNumber: record.reservationNumber,
  });
}

function normalizeReferencePair(
  referenceType?: string | null,
  referenceId?: string | null,
): { referenceId: string | null; referenceType: string | null } {
  const normalizedReferenceType = normalizeOptionalText(
    referenceType,
    "referenceType",
    80,
  );
  const normalizedReferenceId = normalizeOptionalText(
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
  return normalizePositiveInteger(value, "expectedVersion");
}

function normalizePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationApplicationError(
      `${field} must be a positive integer.`,
    );
  }
  return value;
}

function normalizePageSize(pageSize?: number): number {
  if (pageSize === undefined) {
    return defaultPageSize;
  }
  const normalized = normalizePositiveInteger(pageSize, "pageSize");
  if (normalized > maxPageSize) {
    throw new ValidationApplicationError(
      `pageSize must be ${maxPageSize} or fewer.`,
    );
  }
  return normalized;
}

function assertEntityId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

function normalizeOptionalId(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }
  return assertEntityId(value.trim(), field);
}

function normalizeCode(value: string): string {
  const normalized = normalizeRequiredText(value, "code", 64)
    .toUpperCase()
    .replaceAll(/\s+/gu, "-");
  if (!/^[A-Z0-9][A-Z0-9_-]*$/u.test(normalized)) {
    throw new ValidationApplicationError(
      "code may contain only letters, numbers, underscores, and hyphens.",
    );
  }
  return normalized;
}

function normalizeRequiredText(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized = normalizeOptionalText(value, field, maxLength);
  if (!normalized) {
    throw new ValidationApplicationError(`${field} must not be blank.`);
  }
  return normalized;
}

function normalizeOptionalText(
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
