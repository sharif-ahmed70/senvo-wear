import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type {
  SalesOrder,
  SalesOrderChannel,
  SalesOrderStatus,
} from "../domain/models.js";
import type {
  ConfirmSalesOrderRecord,
  CreateDraftSalesOrderRecord,
  DraftSalesOrderMetadataChanges,
  CursorPageRequest,
  CursorPageResult,
  FulfillSalesOrderRecord,
  ReplaceSalesOrderLineRecord,
  ReserveSalesOrderRecord,
  SalesOrderListFilter,
  SalesOrderCreationRepository,
  SalesOrderRepository,
} from "../repositories/sales-order-repositories.js";

const defaultPageSize = 25;
const maxPageSize = 100;
const maxLines = 500;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const orderStatuses = [
  "DRAFT",
  "RESERVED",
  "CONFIRMED",
  "CANCELLED",
  "FULFILLED",
] as const;
const orderChannels = ["ONLINE", "POS", "MANUAL"] as const;
const maxIntegerMinorUnit = 2_147_483_647;

export type CreateSalesOrderInput = {
  allocationPolicyId?: string | null;
  channel: SalesOrderChannel;
  currencyCode: string;
  customerEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddressLine1?: string | null;
  deliveryAddressLine2?: string | null;
  deliveryCity?: string | null;
  deliveryDistrict?: string | null;
  deliveryMinor?: number;
  deliveryPostalCode?: string | null;
  idempotencyKey: string;
  lines: readonly {
    discountMinor?: number;
    productVariantId: string;
    quantity: number;
    unitPriceMinor: number;
  }[];
  note?: string | null;
  orderDiscountMinor?: number;
  orderNumber: string;
  organizationId: string;
};

export async function createSalesOrder(
  repository: SalesOrderCreationRepository,
  input: CreateSalesOrderInput,
): Promise<SalesOrder> {
  const record = normalizeCreateOrderInput(input);
  const payloadSignature = createOrderPayloadSignature(record);
  const existing = await repository.findByIdempotencyKey(
    record.organizationId,
    record.idempotencyKey,
  );
  if (existing) {
    assertIdempotentOrderPayload(existing, payloadSignature);
    return existing;
  }
  return repository.createDraft(record, payloadSignature);
}

export type UpdateDraftSalesOrderMetadataInput = {
  allocationPolicyId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddressLine1?: string | null;
  deliveryAddressLine2?: string | null;
  deliveryCity?: string | null;
  deliveryDistrict?: string | null;
  deliveryMinor?: number;
  deliveryPostalCode?: string | null;
  expectedVersion: number;
  note?: string | null;
  orderDiscountMinor?: number;
  organizationId: string;
  salesOrderId: string;
};

export async function updateDraftSalesOrderMetadata(
  repository: SalesOrderRepository,
  input: UpdateDraftSalesOrderMetadataInput,
): Promise<SalesOrder> {
  return repository.amendDraft({
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    metadata: normalizeMetadataChanges(input),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    salesOrderId: assertEntityId(input.salesOrderId, "salesOrderId"),
  });
}

export type ReplaceDraftSalesOrderLinesInput = {
  expectedVersion: number;
  lines: CreateSalesOrderInput["lines"];
  organizationId: string;
  salesOrderId: string;
};

export async function replaceDraftSalesOrderLines(
  repository: SalesOrderRepository,
  input: ReplaceDraftSalesOrderLinesInput,
): Promise<SalesOrder> {
  return repository.amendDraft({
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    lines: normalizeCreateLines(input.lines),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    salesOrderId: assertEntityId(input.salesOrderId, "salesOrderId"),
  });
}

export type AmendDraftSalesOrderInput = {
  expectedVersion: number;
  lines?: CreateSalesOrderInput["lines"];
  metadata?: Omit<
    UpdateDraftSalesOrderMetadataInput,
    "expectedVersion" | "organizationId" | "salesOrderId"
  >;
  organizationId: string;
  salesOrderId: string;
};

export async function amendDraftSalesOrder(
  repository: SalesOrderRepository,
  input: AmendDraftSalesOrderInput,
): Promise<SalesOrder> {
  const metadata =
    input.metadata === undefined
      ? undefined
      : normalizeMetadataChanges(input.metadata);
  const lines =
    input.lines === undefined ? undefined : normalizeCreateLines(input.lines);
  if (!metadata && !lines) {
    throw new ValidationApplicationError(
      "Draft sales order amendment requires at least one change.",
    );
  }
  return repository.amendDraft({
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    lines,
    metadata,
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    salesOrderId: assertEntityId(input.salesOrderId, "salesOrderId"),
  });
}

export type ReserveSalesOrderInput = {
  expectedVersion: number;
  expiresAt?: Date | string | null;
  organizationId: string;
  preferredBranchId?: string | null;
  preferredLocationId?: string | null;
  reservationIdempotencyKey: string;
  reservationNumber: string;
  salesOrderId: string;
};

export async function reserveSalesOrder(
  repository: SalesOrderRepository,
  input: ReserveSalesOrderInput,
): Promise<SalesOrder> {
  const record: ReserveSalesOrderRecord = {
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    expiresAt: normalizeFutureTimestamp(input.expiresAt, "expiresAt"),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    preferredBranchId:
      normalizeOptionalId(input.preferredBranchId, "preferredBranchId") ?? null,
    preferredLocationId:
      normalizeOptionalId(input.preferredLocationId, "preferredLocationId") ??
      null,
    reservationIdempotencyKey: normalizeRequiredText(
      input.reservationIdempotencyKey,
      "reservationIdempotencyKey",
      128,
    ),
    reservationNumber: normalizeCode(input.reservationNumber),
    salesOrderId: assertEntityId(input.salesOrderId, "salesOrderId"),
  };
  return repository.reserve(record, createReservePayloadSignature(record));
}

export type ConfirmSalesOrderInput = {
  expectedVersion: number;
  organizationId: string;
  salesOrderId: string;
};

export async function confirmSalesOrder(
  repository: SalesOrderRepository,
  input: ConfirmSalesOrderInput,
): Promise<SalesOrder> {
  return repository.confirm(normalizeVersionedOrderInput(input));
}

export async function cancelSalesOrder(
  repository: SalesOrderRepository,
  input: ConfirmSalesOrderInput,
): Promise<SalesOrder> {
  return repository.cancel(normalizeVersionedOrderInput(input));
}

export type FulfillSalesOrderInput = ConfirmSalesOrderInput & {
  consumptionIdempotencyKey: string;
  movementNumber: string;
  note?: string | null;
  occurredAt: Date | string;
};

export async function fulfillSalesOrder(
  repository: SalesOrderRepository,
  input: FulfillSalesOrderInput,
): Promise<SalesOrder> {
  const record: FulfillSalesOrderRecord = {
    consumptionIdempotencyKey: normalizeRequiredText(
      input.consumptionIdempotencyKey,
      "consumptionIdempotencyKey",
      128,
    ),
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    movementNumber: normalizeCode(input.movementNumber),
    note: normalizeOptionalText(input.note, "note", 1000),
    occurredAt: normalizeTimestamp(input.occurredAt, "occurredAt"),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    salesOrderId: assertEntityId(input.salesOrderId, "salesOrderId"),
  };
  return repository.fulfill(record, createFulfillPayloadSignature(record));
}

export type GetSalesOrderByIdInput = {
  organizationId: string;
  salesOrderId: string;
};

export async function getSalesOrderById(
  repository: SalesOrderRepository,
  input: GetSalesOrderByIdInput,
): Promise<SalesOrder> {
  const order = await repository.findById(
    assertEntityId(input.salesOrderId, "salesOrderId"),
    assertEntityId(input.organizationId, "organizationId"),
  );
  if (!order) {
    throw new NotFoundError("Sales order was not found.");
  }
  return order;
}

export type ListSalesOrdersInput = CursorPageRequest & {
  channel?: SalesOrderChannel;
  createdFrom?: Date | string;
  createdTo?: Date | string;
  customerPhone?: string;
  organizationId: string;
  status?: SalesOrderStatus;
};

export async function listSalesOrders(
  repository: SalesOrderRepository,
  input: ListSalesOrdersInput,
): Promise<CursorPageResult<SalesOrder>> {
  return repository.list(normalizeListInput(input));
}

function normalizeCreateOrderInput(
  input: CreateSalesOrderInput,
): CreateDraftSalesOrderRecord {
  const lines = normalizeCreateLines(input.lines);
  const discountMinor = normalizeMinorUnit(
    input.orderDiscountMinor ?? 0,
    "orderDiscountMinor",
  );
  const deliveryMinor = normalizeMinorUnit(
    input.deliveryMinor ?? 0,
    "deliveryMinor",
  );
  const totals = calculateSalesOrderTotals({
    deliveryMinor,
    discountMinor,
    lines,
  });
  return {
    allocationPolicyId:
      normalizeOptionalId(input.allocationPolicyId, "allocationPolicyId") ??
      null,
    channel: normalizeChannel(input.channel),
    currencyCode: normalizeCurrencyCode(input.currencyCode),
    customerEmail: normalizeOptionalEmail(input.customerEmail),
    customerName: normalizeOptionalText(
      input.customerName,
      "customerName",
      160,
    ),
    customerPhone: normalizeOptionalText(
      input.customerPhone,
      "customerPhone",
      40,
    ),
    deliveryAddressLine1: normalizeOptionalText(
      input.deliveryAddressLine1,
      "deliveryAddressLine1",
      240,
    ),
    deliveryAddressLine2: normalizeOptionalText(
      input.deliveryAddressLine2,
      "deliveryAddressLine2",
      240,
    ),
    deliveryCity: normalizeOptionalText(
      input.deliveryCity,
      "deliveryCity",
      120,
    ),
    deliveryDistrict: normalizeOptionalText(
      input.deliveryDistrict,
      "deliveryDistrict",
      120,
    ),
    deliveryMinor,
    deliveryPostalCode: normalizeOptionalText(
      input.deliveryPostalCode,
      "deliveryPostalCode",
      120,
    ),
    discountMinor,
    idempotencyKey: normalizeRequiredText(
      input.idempotencyKey,
      "idempotencyKey",
      128,
    ),
    lines,
    note: normalizeOptionalText(input.note, "note", 1000),
    orderNumber: normalizeCode(input.orderNumber),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    subtotalMinor: totals.subtotalMinor,
    totalMinor: totals.totalMinor,
  };
}

function normalizeCreateLines(
  lines: CreateSalesOrderInput["lines"],
): ReplaceSalesOrderLineRecord[] {
  if (lines.length === 0) {
    throw new BusinessRuleError("Sales order requires at least one line.");
  }
  if (lines.length > maxLines) {
    throw new ValidationApplicationError(
      `Sales order may contain at most ${maxLines} lines.`,
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
        "A product variant may appear only once per sales order.",
      );
    }
    seen.add(productVariantId);
    const quantity = normalizePositiveInteger(line.quantity, "quantity");
    const unitPriceMinor = normalizeMinorUnit(
      line.unitPriceMinor,
      "unitPriceMinor",
    );
    const discountMinor = normalizeMinorUnit(
      line.discountMinor ?? 0,
      "discountMinor",
    );
    const gross = multiplyMinorUnit(quantity, unitPriceMinor, "line gross");
    const lineTotalMinor = gross - discountMinor;
    if (lineTotalMinor < 0) {
      throw new BusinessRuleError(
        "Sales order line total must not be negative.",
      );
    }
    return {
      discountMinor,
      lineTotalMinor,
      productVariantId,
      quantity,
      unitPriceMinor,
    };
  });
}

function normalizeMetadataChanges(
  input:
    | UpdateDraftSalesOrderMetadataInput
    | NonNullable<AmendDraftSalesOrderInput["metadata"]>,
): DraftSalesOrderMetadataChanges {
  const changes: DraftSalesOrderMetadataChanges = {};
  copyOptionalIdChange(
    input,
    changes,
    "allocationPolicyId",
    "allocationPolicyId",
  );
  copyOptionalEmailChange(input, changes, "customerEmail");
  copyOptionalTextChange(input, changes, "customerName", 160);
  copyOptionalTextChange(input, changes, "customerPhone", 40);
  copyOptionalTextChange(input, changes, "deliveryAddressLine1", 240);
  copyOptionalTextChange(input, changes, "deliveryAddressLine2", 240);
  copyOptionalTextChange(input, changes, "deliveryCity", 120);
  copyOptionalTextChange(input, changes, "deliveryDistrict", 120);
  copyOptionalTextChange(input, changes, "deliveryPostalCode", 120);
  copyOptionalTextChange(input, changes, "note", 1000);
  if (Object.hasOwn(input, "deliveryMinor")) {
    changes.deliveryMinor = normalizeMinorUnit(
      input.deliveryMinor ?? 0,
      "deliveryMinor",
    );
  }
  if (Object.hasOwn(input, "orderDiscountMinor")) {
    changes.discountMinor = normalizeMinorUnit(
      input.orderDiscountMinor ?? 0,
      "orderDiscountMinor",
    );
  }
  if (Object.keys(changes).length === 0) {
    throw new ValidationApplicationError(
      "Draft sales order metadata update requires at least one change.",
    );
  }
  return changes;
}

function copyOptionalTextChange<
  T extends object,
  K extends keyof DraftSalesOrderMetadataChanges,
>(input: T, changes: DraftSalesOrderMetadataChanges, field: K, max: number) {
  if (Object.hasOwn(input, field)) {
    changes[field] = normalizeOptionalText(
      (input as Record<string, string | null | undefined>)[field as string],
      field,
      max,
    ) as DraftSalesOrderMetadataChanges[K];
  }
}

function copyOptionalEmailChange<T extends object>(
  input: T,
  changes: DraftSalesOrderMetadataChanges,
  field: "customerEmail",
) {
  if (Object.hasOwn(input, field)) {
    changes[field] = normalizeOptionalEmail(
      (input as Record<string, string | null | undefined>)[field],
    );
  }
}

function copyOptionalIdChange<T extends object>(
  input: T,
  changes: DraftSalesOrderMetadataChanges,
  field: "allocationPolicyId",
  label: string,
) {
  if (Object.hasOwn(input, field)) {
    changes[field] = normalizeOptionalId(
      (input as Record<string, string | null | undefined>)[field],
      label,
    );
  }
}

export function calculateSalesOrderTotals(input: {
  deliveryMinor: number;
  discountMinor: number;
  lines: readonly { lineTotalMinor: number }[];
}): { subtotalMinor: number; totalMinor: number } {
  const subtotalMinor = input.lines.reduce(
    (sum, line) => addMinorUnit(sum, line.lineTotalMinor, "subtotalMinor"),
    0,
  );
  if (input.discountMinor > subtotalMinor + input.deliveryMinor) {
    throw new BusinessRuleError(
      "Sales order discount cannot make the total negative.",
    );
  }
  const totalMinor = addMinorUnit(
    subtotalMinor - input.discountMinor,
    input.deliveryMinor,
    "totalMinor",
  );
  if (totalMinor < 0) {
    throw new BusinessRuleError("Sales order total must not be negative.");
  }
  return { subtotalMinor, totalMinor };
}

function normalizeVersionedOrderInput(
  input: ConfirmSalesOrderInput,
): ConfirmSalesOrderRecord {
  return {
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    salesOrderId: assertEntityId(input.salesOrderId, "salesOrderId"),
  };
}

function normalizeListInput(input: ListSalesOrdersInput): SalesOrderListFilter {
  return {
    channel:
      input.channel === undefined ? undefined : normalizeChannel(input.channel),
    createdFrom:
      input.createdFrom === undefined
        ? undefined
        : normalizeTimestamp(input.createdFrom, "createdFrom"),
    createdTo:
      input.createdTo === undefined
        ? undefined
        : normalizeTimestamp(input.createdTo, "createdTo"),
    cursor:
      input.cursor === undefined
        ? undefined
        : parseSalesOrderCursor(input.cursor) && input.cursor,
    customerPhone:
      normalizeOptionalText(input.customerPhone, "customerPhone", 40) ??
      undefined,
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    status:
      input.status === undefined ? undefined : normalizeStatus(input.status),
  };
}

function createOrderPayloadSignature(
  record: CreateDraftSalesOrderRecord,
): string {
  return JSON.stringify({
    ...record,
    lines: [...record.lines].sort((left, right) =>
      left.productVariantId.localeCompare(right.productVariantId),
    ),
  });
}

function createReservePayloadSignature(
  record: ReserveSalesOrderRecord,
): string {
  return JSON.stringify({
    expiresAt: record.expiresAt?.toISOString() ?? null,
    organizationId: record.organizationId,
    preferredBranchId: record.preferredBranchId,
    preferredLocationId: record.preferredLocationId,
    reservationIdempotencyKey: record.reservationIdempotencyKey,
    reservationNumber: record.reservationNumber,
    salesOrderId: record.salesOrderId,
  });
}

function createFulfillPayloadSignature(
  record: FulfillSalesOrderRecord,
): string {
  return JSON.stringify({
    consumptionIdempotencyKey: record.consumptionIdempotencyKey,
    movementNumber: record.movementNumber,
    note: record.note,
    occurredAt: record.occurredAt.toISOString(),
    organizationId: record.organizationId,
    salesOrderId: record.salesOrderId,
  });
}

function assertIdempotentOrderPayload(
  order: SalesOrder,
  payloadSignature: string,
): void {
  if (order.payloadSignature !== payloadSignature) {
    throw new ConflictError("Idempotency key was already used.");
  }
}

function normalizeCurrencyCode(value: string): string {
  const normalized = normalizeRequiredText(
    value,
    "currencyCode",
    3,
  ).toUpperCase();
  if (!/^[A-Z]{3}$/u.test(normalized)) {
    throw new ValidationApplicationError(
      "currencyCode must use an uppercase three-letter code.",
    );
  }
  if (normalized !== "BDT") {
    throw new ValidationApplicationError("Only BDT is supported.");
  }
  return normalized;
}

function normalizeChannel(value: SalesOrderChannel): SalesOrderChannel {
  if (!orderChannels.includes(value)) {
    throw new ValidationApplicationError("sales order channel is invalid.");
  }
  return value;
}

function normalizeStatus(value: SalesOrderStatus): SalesOrderStatus {
  if (!orderStatuses.includes(value)) {
    throw new ValidationApplicationError("sales order status is invalid.");
  }
  return value;
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

function normalizeMinorUnit(value: number, field: string): number {
  if (
    !Number.isSafeInteger(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > maxIntegerMinorUnit
  ) {
    throw new ValidationApplicationError(
      `${field} must be a non-negative integer minor-unit amount.`,
    );
  }
  return value;
}

function addMinorUnit(left: number, right: number, field: string): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum) || sum > maxIntegerMinorUnit) {
    throw new ValidationApplicationError(`${field} exceeds supported range.`);
  }
  return sum;
}

function multiplyMinorUnit(left: number, right: number, field: string): number {
  const product = left * right;
  if (!Number.isSafeInteger(product) || product > maxIntegerMinorUnit) {
    throw new ValidationApplicationError(`${field} exceeds supported range.`);
  }
  return product;
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

function normalizeFutureTimestamp(
  value: Date | string | null | undefined,
  field: string,
): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  const timestamp = normalizeTimestamp(value, field);
  if (timestamp <= new Date()) {
    throw new ValidationApplicationError(`${field} must be in the future.`);
  }
  return timestamp;
}

function normalizeTimestamp(value: Date | string, field: string): Date {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new ValidationApplicationError(`${field} must be a valid timestamp.`);
  }
  return timestamp;
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

function normalizeOptionalEmail(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalText(value, "customerEmail", 254);
  if (normalized && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(normalized)) {
    throw new ValidationApplicationError("customerEmail must be valid.");
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

export function encodeSalesOrderCursor(createdAt: Date, id: string): string {
  assertEntityId(id, "cursor id");
  return `sales-order-v1|${encodeURIComponent(createdAt.toISOString())}|${id}`;
}

export function parseSalesOrderCursor(cursor: string): {
  createdAt: Date;
  id: string;
} {
  const [version, encodedCreatedAt, id, extra] = cursor.split("|");
  if (
    version !== "sales-order-v1" ||
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
