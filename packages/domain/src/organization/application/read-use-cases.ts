import { NotFoundError, ValidationApplicationError } from "../../errors.js";
import type { Branch, PosCounter, StockLocation } from "../domain/models.js";
import {
  normalizeBranchStatus,
  normalizeBranchType,
  normalizePosCounterStatus,
  normalizeStockLocationStatus,
  normalizeStockLocationType,
} from "../domain/value-objects.js";
import type {
  BranchListFilter,
  BranchRepository,
  CursorPageRequest,
  CursorPageResult,
  PosCounterListFilter,
  PosCounterRepository,
  StockLocationListFilter,
  StockLocationRepository,
} from "../repositories/organization-repositories.js";

const defaultPageSize = 25;
const maxPageSize = 100;
const maxSearchLength = 120;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GetBranchByIdInput = {
  branchId: string;
  organizationId: string;
};

export async function getBranchById(
  repository: BranchRepository,
  input: GetBranchByIdInput,
): Promise<Branch> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const branchId = assertEntityId(input.branchId, "branchId");
  const branch = await repository.findById(branchId, organizationId);
  if (!branch) {
    throw new NotFoundError("Branch was not found.");
  }
  return branch;
}

export type ListBranchesInput = CursorPageRequest & {
  organizationId: string;
  search?: string;
  status?: Branch["status"];
  type?: Branch["type"];
};

export async function listBranches(
  repository: BranchRepository,
  input: ListBranchesInput,
): Promise<CursorPageResult<Branch>> {
  return repository.list(normalizeBranchListFilter(input));
}

export type GetStockLocationByIdInput = {
  organizationId: string;
  stockLocationId: string;
};

export async function getStockLocationById(
  repository: StockLocationRepository,
  input: GetStockLocationByIdInput,
): Promise<StockLocation> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const stockLocationId = assertEntityId(
    input.stockLocationId,
    "stockLocationId",
  );
  const location = await repository.findById(stockLocationId, organizationId);
  if (!location) {
    throw new NotFoundError("Stock location was not found.");
  }
  return location;
}

export type ListStockLocationsInput = CursorPageRequest & {
  branchId?: string;
  isSellable?: boolean;
  organizationId: string;
  search?: string;
  status?: StockLocation["status"];
  type?: StockLocation["type"];
};

export async function listStockLocations(
  repository: StockLocationRepository,
  input: ListStockLocationsInput,
): Promise<CursorPageResult<StockLocation>> {
  return repository.list(normalizeStockLocationListFilter(input));
}

export type GetPosCounterByIdInput = {
  organizationId: string;
  posCounterId: string;
};

export async function getPosCounterById(
  repository: PosCounterRepository,
  input: GetPosCounterByIdInput,
): Promise<PosCounter> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const posCounterId = assertEntityId(input.posCounterId, "posCounterId");
  const counter = await repository.findById(posCounterId, organizationId);
  if (!counter) {
    throw new NotFoundError("POS counter was not found.");
  }
  return counter;
}

export type ListPosCountersInput = CursorPageRequest & {
  branchId?: string;
  organizationId: string;
  search?: string;
  status?: PosCounter["status"];
};

export async function listPosCounters(
  repository: PosCounterRepository,
  input: ListPosCountersInput,
): Promise<CursorPageResult<PosCounter>> {
  return repository.list(normalizePosCounterListFilter(input));
}

function normalizeBranchListFilter(input: ListBranchesInput): BranchListFilter {
  return {
    cursor: normalizeCursor(input.cursor),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    search: normalizeSearch(input.search),
    status:
      input.status === undefined
        ? undefined
        : normalizeBranchStatus(input.status),
    type:
      input.type === undefined ? undefined : normalizeBranchType(input.type),
  };
}

function normalizeStockLocationListFilter(
  input: ListStockLocationsInput,
): StockLocationListFilter {
  return {
    branchId:
      input.branchId === undefined
        ? undefined
        : assertEntityId(input.branchId, "branchId"),
    cursor: normalizeCursor(input.cursor),
    isSellable: input.isSellable,
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    search: normalizeSearch(input.search),
    status:
      input.status === undefined
        ? undefined
        : normalizeStockLocationStatus(input.status),
    type:
      input.type === undefined
        ? undefined
        : normalizeStockLocationType(input.type),
  };
}

function normalizePosCounterListFilter(
  input: ListPosCountersInput,
): PosCounterListFilter {
  return {
    branchId:
      input.branchId === undefined
        ? undefined
        : assertEntityId(input.branchId, "branchId"),
    cursor: normalizeCursor(input.cursor),
    organizationId: assertEntityId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    search: normalizeSearch(input.search),
    status:
      input.status === undefined
        ? undefined
        : normalizePosCounterStatus(input.status),
  };
}

function assertEntityId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
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

function normalizeSearch(search?: string): string | undefined {
  if (search === undefined) {
    return undefined;
  }
  const normalized = search.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > maxSearchLength) {
    throw new ValidationApplicationError(
      `search must be ${maxSearchLength} characters or fewer.`,
    );
  }
  return normalized;
}

function normalizeCursor(cursor?: string): string | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  parseCursor(cursor);
  return cursor;
}

export function encodeCursor(createdAt: Date, id: string): string {
  assertEntityId(id, "cursor id");
  return `v1|${encodeURIComponent(createdAt.toISOString())}|${id}`;
}

export function parseCursor(cursor: string): { createdAt: Date; id: string } {
  const [version, encodedCreatedAt, id, extra] = cursor.split("|");
  if (
    version !== "v1" ||
    !encodedCreatedAt ||
    !id ||
    extra !== undefined ||
    !uuidPattern.test(id)
  ) {
    throw new ValidationApplicationError("cursor is invalid.");
  }

  const decodedCreatedAt = decodeURIComponent(encodedCreatedAt);
  const createdAt = new Date(decodedCreatedAt);
  if (
    Number.isNaN(createdAt.getTime()) ||
    createdAt.toISOString() !== decodedCreatedAt
  ) {
    throw new ValidationApplicationError("cursor is invalid.");
  }

  return { createdAt, id };
}
