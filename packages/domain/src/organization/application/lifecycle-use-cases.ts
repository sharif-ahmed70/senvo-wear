import {
  BusinessRuleError,
  ConcurrencyError,
  NotFoundError,
} from "../../errors.js";
import type { Branch, PosCounter, StockLocation } from "../domain/models.js";
import {
  assertPositiveVersion,
  assertSameOrganization,
  assertValidStatusTransition,
  normalizeBranchStatus,
  normalizeBranchType,
  normalizeCountryCode,
  normalizeDisplayName,
  normalizeOptionalCityLike,
  normalizeOptionalEmail,
  normalizeOptionalPhone,
  normalizeOptionalText,
  normalizePosCounterStatus,
  normalizeStockLocationStatus,
  normalizeStockLocationType,
  normalizeTimezone,
  normalizeUpdatedStockLocationSellable,
} from "../domain/value-objects.js";
import type {
  BranchMetadataPatch,
  BranchRepository,
  PosCounterMetadataPatch,
  PosCounterRepository,
  StockLocationMetadataPatch,
  StockLocationRepository,
} from "../repositories/organization-repositories.js";

type NullableField<T> = T | null | undefined;

export type UpdateBranchMetadataInput = {
  addressLine1?: NullableField<string>;
  addressLine2?: NullableField<string>;
  branchId: string;
  city?: NullableField<string>;
  countryCode?: string;
  district?: NullableField<string>;
  email?: NullableField<string>;
  expectedVersion: number;
  name?: string;
  organizationId: string;
  phone?: NullableField<string>;
  postalCode?: NullableField<string>;
  timezone?: string;
  type?: Branch["type"];
};

export async function updateBranchMetadata(
  repository: BranchRepository,
  input: UpdateBranchMetadataInput,
): Promise<Branch> {
  const branch = await requireBranch(repository, input.branchId);
  assertSameOrganization(input.organizationId, branch.organizationId, "branch");
  const expectedVersion = assertPositiveVersion(input.expectedVersion);

  const metadata: BranchMetadataPatch = {
    addressLine1:
      input.addressLine1 === undefined
        ? branch.addressLine1
        : normalizeOptionalText(input.addressLine1, "addressLine1"),
    addressLine2:
      input.addressLine2 === undefined
        ? branch.addressLine2
        : normalizeOptionalText(input.addressLine2, "addressLine2"),
    city:
      input.city === undefined
        ? branch.city
        : normalizeOptionalCityLike(input.city, "city"),
    countryCode:
      input.countryCode === undefined
        ? branch.countryCode
        : normalizeCountryCode(input.countryCode),
    district:
      input.district === undefined
        ? branch.district
        : normalizeOptionalCityLike(input.district, "district"),
    email:
      input.email === undefined
        ? branch.email
        : normalizeOptionalEmail(input.email),
    name:
      input.name === undefined
        ? branch.name
        : normalizeDisplayName(input.name, "branch name"),
    phone:
      input.phone === undefined
        ? branch.phone
        : normalizeOptionalPhone(input.phone),
    postalCode:
      input.postalCode === undefined
        ? branch.postalCode
        : normalizeOptionalCityLike(input.postalCode, "postalCode"),
    timezone:
      input.timezone === undefined
        ? branch.timezone
        : normalizeTimezone(input.timezone),
    type:
      input.type === undefined ? branch.type : normalizeBranchType(input.type),
  };

  return requireUpdated(
    await repository.updateMetadata({
      expectedVersion,
      id: input.branchId,
      metadata,
      organizationId: input.organizationId,
    }),
  );
}

export type ChangeBranchStatusInput = {
  branchId: string;
  expectedVersion: number;
  organizationId: string;
  status: Branch["status"];
};

export async function changeBranchStatus(
  repository: BranchRepository,
  input: ChangeBranchStatusInput,
): Promise<Branch> {
  const branch = await requireBranch(repository, input.branchId);
  assertSameOrganization(input.organizationId, branch.organizationId, "branch");
  const status = normalizeBranchStatus(input.status);
  assertValidStatusTransition(branch.status, status, "branch");
  const expectedVersion = assertPositiveVersion(input.expectedVersion);
  const blockedChildStatuses = branchBlockedChildStatuses(status);

  if (blockedChildStatuses.length > 0) {
    await assertBranchHasNoChildrenWithStatuses(repository, input, [
      ...blockedChildStatuses,
    ]);
  }

  return requireUpdated(
    await repository.changeStatus({
      blockedChildStatuses,
      expectedVersion,
      id: input.branchId,
      organizationId: input.organizationId,
      status,
    }),
  );
}

export type UpdateStockLocationMetadataInput = {
  expectedVersion: number;
  isSellable?: boolean;
  name?: string;
  organizationId: string;
  stockLocationId: string;
  type?: StockLocation["type"];
};

export async function updateStockLocationMetadata(
  repository: StockLocationRepository,
  input: UpdateStockLocationMetadataInput,
): Promise<StockLocation> {
  const location = await requireStockLocation(
    repository,
    input.stockLocationId,
  );
  assertSameOrganization(
    input.organizationId,
    location.organizationId,
    "stock location",
  );
  const expectedVersion = assertPositiveVersion(input.expectedVersion);
  const type =
    input.type === undefined
      ? location.type
      : normalizeStockLocationType(input.type);
  const requestedSellable =
    input.isSellable === undefined ? location.isSellable : input.isSellable;

  const metadata: StockLocationMetadataPatch = {
    isSellable: normalizeUpdatedStockLocationSellable(
      type,
      location.status,
      requestedSellable,
    ),
    name:
      input.name === undefined
        ? location.name
        : normalizeDisplayName(input.name, "stock location name"),
    type,
  };

  return requireUpdated(
    await repository.updateMetadata({
      expectedVersion,
      id: input.stockLocationId,
      metadata,
      organizationId: input.organizationId,
    }),
  );
}

export type ChangeStockLocationStatusInput = {
  expectedVersion: number;
  organizationId: string;
  status: StockLocation["status"];
  stockLocationId: string;
};

export async function changeStockLocationStatus(
  repository: StockLocationRepository,
  input: ChangeStockLocationStatusInput,
): Promise<StockLocation> {
  const location = await requireStockLocation(
    repository,
    input.stockLocationId,
  );
  assertSameOrganization(
    input.organizationId,
    location.organizationId,
    "stock location",
  );
  const status = normalizeStockLocationStatus(input.status);
  assertValidStatusTransition(location.status, status, "stock location");
  const expectedVersion = assertPositiveVersion(input.expectedVersion);

  return requireUpdated(
    await repository.changeStatus({
      expectedVersion,
      id: input.stockLocationId,
      isSellable: status === "ACTIVE" ? location.isSellable : false,
      organizationId: input.organizationId,
      status,
    }),
  );
}

export type UpdatePosCounterMetadataInput = {
  expectedVersion: number;
  name?: string;
  organizationId: string;
  posCounterId: string;
};

export async function updatePosCounterMetadata(
  repository: PosCounterRepository,
  input: UpdatePosCounterMetadataInput,
): Promise<PosCounter> {
  const counter = await requirePosCounter(repository, input.posCounterId);
  assertSameOrganization(
    input.organizationId,
    counter.organizationId,
    "POS counter",
  );
  const expectedVersion = assertPositiveVersion(input.expectedVersion);

  const metadata: PosCounterMetadataPatch = {
    name:
      input.name === undefined
        ? counter.name
        : normalizeDisplayName(input.name, "POS counter name"),
  };

  return requireUpdated(
    await repository.updateMetadata({
      expectedVersion,
      id: input.posCounterId,
      metadata,
      organizationId: input.organizationId,
    }),
  );
}

export type ChangePosCounterStatusInput = {
  expectedVersion: number;
  organizationId: string;
  posCounterId: string;
  status: PosCounter["status"];
};

export async function changePosCounterStatus(
  repository: PosCounterRepository,
  input: ChangePosCounterStatusInput,
): Promise<PosCounter> {
  const counter = await requirePosCounter(repository, input.posCounterId);
  assertSameOrganization(
    input.organizationId,
    counter.organizationId,
    "POS counter",
  );
  const status = normalizePosCounterStatus(input.status);
  assertValidStatusTransition(counter.status, status, "POS counter");
  const expectedVersion = assertPositiveVersion(input.expectedVersion);

  return requireUpdated(
    await repository.changeStatus({
      expectedVersion,
      id: input.posCounterId,
      organizationId: input.organizationId,
      status,
    }),
  );
}

function branchBlockedChildStatuses(
  status: Branch["status"],
): readonly Branch["status"][] {
  if (status === "INACTIVE") {
    return ["ACTIVE"];
  }
  if (status === "ARCHIVED") {
    return ["ACTIVE", "INACTIVE"];
  }
  return [];
}

async function assertBranchHasNoChildrenWithStatuses(
  repository: BranchRepository,
  input: Pick<ChangeBranchStatusInput, "branchId" | "organizationId">,
  statuses: readonly Branch["status"][],
): Promise<void> {
  const blockers = await repository.countChildrenByStatuses(
    input.organizationId,
    input.branchId,
    statuses,
  );
  const blockingCategories = [
    blockers.stockLocations > 0 ? "stock locations" : null,
    blockers.posCounters > 0 ? "POS counters" : null,
  ].filter(Boolean);

  if (blockingCategories.length > 0) {
    throw new BusinessRuleError(
      `Branch status change is blocked by ${blockingCategories.join(" and ")}.`,
    );
  }
}

async function requireBranch(
  repository: BranchRepository,
  branchId: string,
): Promise<Branch> {
  const branch = await repository.findById(branchId);
  if (!branch) {
    throw new NotFoundError("Branch was not found.");
  }
  return branch;
}

async function requireStockLocation(
  repository: StockLocationRepository,
  stockLocationId: string,
): Promise<StockLocation> {
  const location = await repository.findById(stockLocationId);
  if (!location) {
    throw new NotFoundError("Stock location was not found.");
  }
  return location;
}

async function requirePosCounter(
  repository: PosCounterRepository,
  posCounterId: string,
): Promise<PosCounter> {
  const counter = await repository.findById(posCounterId);
  if (!counter) {
    throw new NotFoundError("POS counter was not found.");
  }
  return counter;
}

function requireUpdated<T>(record: T | null): T {
  if (!record) {
    throw new ConcurrencyError("Expected version does not match.");
  }
  return record;
}
