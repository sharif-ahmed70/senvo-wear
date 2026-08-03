import {
  BusinessRuleError,
  ConcurrencyError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type { SalesBoothStatus, SalesChannel } from "../domain/models.js";
import type {
  SalesSourceRepository,
  SalesSourceSummary,
} from "../repositories/sales-order-repositories.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const canonicalChannels = ["ONLINE", "OFFLINE_STORE", "EVENT_BOOTH"] as const;

export async function createSalesBooth(
  repository: SalesSourceRepository,
  input: {
    endDate: Date | string;
    location: string;
    name: string;
    organizationId: string;
    responsibleStaffId: string;
    startDate: Date | string;
  },
) {
  const startDate = normalizeDate(input.startDate, "startDate");
  const endDate = normalizeDate(input.endDate, "endDate");
  if (endDate < startDate) {
    throw new BusinessRuleError("Booth end date cannot be before start date.");
  }
  return repository.createBooth({
    endDate,
    location: normalizeText(input.location, "location", 240),
    name: normalizeText(input.name, "name", 160),
    organizationId: assertId(input.organizationId, "organizationId"),
    responsibleStaffId: assertId(
      input.responsibleStaffId,
      "responsibleStaffId",
    ),
    startDate,
  });
}

export function listSalesBooths(
  repository: SalesSourceRepository,
  organizationId: string,
) {
  return repository.listBooths(assertId(organizationId, "organizationId"));
}

export async function changeSalesBoothStatus(
  repository: SalesSourceRepository,
  input: {
    boothId: string;
    expectedVersion: number;
    organizationId: string;
    status: SalesBoothStatus;
  },
) {
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new ValidationApplicationError(
      "expectedVersion must be a positive integer.",
    );
  }
  if (!(["ACTIVE", "INACTIVE"] as const).includes(input.status)) {
    throw new ValidationApplicationError("Booth status is invalid.");
  }
  const boothId = assertId(input.boothId, "boothId");
  const organizationId = assertId(input.organizationId, "organizationId");
  const existing = await repository.findBoothById(boothId, organizationId);
  if (!existing) {
    throw new NotFoundError("Sales booth was not found.");
  }
  const booth = await repository.updateBoothStatus({
    expectedVersion: input.expectedVersion,
    id: boothId,
    organizationId,
    status: input.status,
  });
  if (!booth) {
    throw new ConcurrencyError("Sales booth changed before it was updated.");
  }
  return booth;
}

export function getSalesSourceSummary(
  repository: SalesSourceRepository,
  organizationId: string,
): Promise<SalesSourceSummary> {
  return repository.getSummary(assertId(organizationId, "organizationId"));
}

export async function validateOrderSalesSource(
  repository: SalesSourceRepository,
  input: {
    boothId?: string | null;
    organizationId: string;
    salesChannel: SalesChannel;
  },
): Promise<string | null> {
  if (!canonicalChannels.includes(input.salesChannel)) {
    throw new ValidationApplicationError("Sales source is invalid.");
  }
  if (input.salesChannel !== "EVENT_BOOTH") {
    if (input.boothId) {
      throw new BusinessRuleError(
        "A booth can only be selected for an event booth sale.",
      );
    }
    return null;
  }
  const boothId = assertId(input.boothId ?? "", "boothId");
  const booth = await repository.findBoothById(
    boothId,
    assertId(input.organizationId, "organizationId"),
  );
  if (!booth) {
    throw new NotFoundError("Sales booth was not found.");
  }
  if (booth.status !== "ACTIVE") {
    throw new BusinessRuleError("The selected sales booth is inactive.");
  }
  return booth.id;
}

function assertId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

function normalizeText(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new ValidationApplicationError(`${field} is invalid.`);
  }
  return normalized;
}

function normalizeDate(value: Date | string, field: string): Date {
  const date =
    value instanceof Date
      ? new Date(value)
      : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationApplicationError(`${field} must be a valid date.`);
  }
  return date;
}
