import { NotFoundError, ValidationApplicationError } from "../../errors.js";
import type {
  InventoryAvailabilityReadItem,
  InventoryMovementHistoryItem,
  InventoryReadPage,
  InventoryReadRepository,
  StockLocationReadItem,
  VariantInventoryAvailability,
} from "../repositories/inventory-read-repository.js";

const defaultPageSize = 25;
const maxPageSize = 100;
const maxSearchLength = 120;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InventoryReadPageInput = {
  cursor?: string;
  pageSize?: number;
};

export type ListInventoryAvailabilityInput = InventoryReadPageInput & {
  locationId?: string;
  organizationId: string;
  search?: string;
};

export type ListStockLocationsInput = InventoryReadPageInput & {
  organizationId: string;
};

export type ListInventoryMovementHistoryInput = InventoryReadPageInput & {
  locationId?: string;
  organizationId: string;
  status?: "DRAFT" | "POSTED";
  type?:
    | "OPENING"
    | "RECEIPT"
    | "ISSUE"
    | "TRANSFER"
    | "ADJUSTMENT_IN"
    | "ADJUSTMENT_OUT";
};

export type GetVariantAvailabilityInput = {
  organizationId: string;
  variantId: string;
};

export function listInventoryAvailability(
  repository: InventoryReadRepository,
  input: ListInventoryAvailabilityInput,
): Promise<InventoryReadPage<InventoryAvailabilityReadItem>> {
  return repository.listAvailability({
    cursor: normalizeCursor(input.cursor),
    locationId: normalizeOptionalId(input.locationId, "locationId"),
    organizationId: assertId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    search: normalizeSearch(input.search),
  });
}

export function listStockLocations(
  repository: InventoryReadRepository,
  input: ListStockLocationsInput,
): Promise<InventoryReadPage<StockLocationReadItem>> {
  return repository.listLocations({
    cursor: normalizeCursor(input.cursor),
    organizationId: assertId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
  });
}

export function listInventoryMovementHistory(
  repository: InventoryReadRepository,
  input: ListInventoryMovementHistoryInput,
): Promise<InventoryReadPage<InventoryMovementHistoryItem>> {
  return repository.listMovements({
    cursor: normalizeCursor(input.cursor),
    locationId: normalizeOptionalId(input.locationId, "locationId"),
    organizationId: assertId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    status: input.status,
    type: input.type,
  });
}

export async function getVariantAvailability(
  repository: InventoryReadRepository,
  input: GetVariantAvailabilityInput,
): Promise<VariantInventoryAvailability> {
  const result = await repository.getVariantAvailability({
    organizationId: assertId(input.organizationId, "organizationId"),
    variantId: assertId(input.variantId, "variantId"),
  });
  if (!result) {
    throw new NotFoundError("Product variant was not found.");
  }
  return result;
}

function normalizePageSize(value?: number): number {
  const pageSize = value ?? defaultPageSize;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maxPageSize) {
    throw new ValidationApplicationError(
      `pageSize must be between 1 and ${maxPageSize}.`,
    );
  }
  return pageSize;
}

function normalizeSearch(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const search = value.trim();
  if (!search) return undefined;
  if (search.length > maxSearchLength) {
    throw new ValidationApplicationError(
      `search must be at most ${maxSearchLength} characters.`,
    );
  }
  return search;
}

function normalizeCursor(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const cursor = value.trim();
  if (!cursor || cursor.length > 1000) {
    throw new ValidationApplicationError("cursor is invalid.");
  }
  return cursor;
}

function normalizeOptionalId(
  value: string | undefined,
  field: string,
): string | undefined {
  return value === undefined ? undefined : assertId(value, field);
}

function assertId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}
