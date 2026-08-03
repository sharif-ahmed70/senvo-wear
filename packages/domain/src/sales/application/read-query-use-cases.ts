import { NotFoundError, ValidationApplicationError } from "../../errors.js";
import type { SalesOrderStatus } from "../domain/models.js";
import type {
  SalesOrderDateOrder,
  SalesOrderDetailsReadItem,
  SalesOrderReadPage,
  SalesOrderReadRepository,
} from "../repositories/sales-order-read-repository.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type ListSalesOrderReadInput = {
  cursor?: string;
  order?: SalesOrderDateOrder;
  organizationId: string;
  pageSize?: number;
  search?: string;
  status?: SalesOrderStatus;
};

export function listSalesOrderReadModel(
  repository: SalesOrderReadRepository,
  input: ListSalesOrderReadInput,
): Promise<SalesOrderReadPage> {
  return repository.list({
    cursor: normalizeCursor(input.cursor),
    order: input.order ?? "NEWEST",
    organizationId: assertId(input.organizationId, "organizationId"),
    pageSize: normalizePageSize(input.pageSize),
    search: normalizeSearch(input.search),
    status: input.status,
  });
}

export async function getSalesOrderDetails(
  repository: SalesOrderReadRepository,
  input: { organizationId: string; salesOrderId: string },
): Promise<SalesOrderDetailsReadItem> {
  const details = await repository.getDetails({
    organizationId: assertId(input.organizationId, "organizationId"),
    salesOrderId: assertId(input.salesOrderId, "salesOrderId"),
  });
  if (!details) throw new NotFoundError("Sales order was not found.");
  return details;
}

function normalizePageSize(value?: number): number {
  const pageSize = value ?? 25;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ValidationApplicationError("pageSize must be between 1 and 100.");
  }
  return pageSize;
}

function normalizeSearch(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const search = value.trim();
  if (!search) return undefined;
  if (search.length > 64) {
    throw new ValidationApplicationError(
      "search must be at most 64 characters.",
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

function assertId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}
