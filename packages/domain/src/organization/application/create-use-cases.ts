import { ConflictError, NotFoundError } from "../../errors.js";
import type { Branch, PosCounter, StockLocation } from "../domain/models.js";
import {
  assertSameOrganization,
  normalizeBranchStatus,
  normalizeBranchType,
  normalizeCountryCode,
  normalizeDisplayName,
  normalizeOperationCode,
  normalizeOptionalCityLike,
  normalizeOptionalEmail,
  normalizeOptionalPhone,
  normalizeOptionalText,
  normalizePosCounterStatus,
  normalizeStockLocationSellable,
  normalizeStockLocationStatus,
  normalizeStockLocationType,
  normalizeTimezone,
} from "../domain/value-objects.js";
import type {
  BranchRepository,
  OrganizationLookupRepository,
  PosCounterRepository,
  StockLocationRepository,
} from "../repositories/organization-repositories.js";

export type CreateBranchInput = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  code: string;
  countryCode?: string;
  district?: string | null;
  email?: string | null;
  name: string;
  organizationId: string;
  phone?: string | null;
  postalCode?: string | null;
  status?: Branch["status"];
  timezone?: string;
  type?: Branch["type"];
};

export async function createBranch(
  repositories: {
    branches: BranchRepository;
    organizations: OrganizationLookupRepository;
  },
  input: CreateBranchInput,
): Promise<Branch> {
  await requireOrganization(repositories.organizations, input.organizationId);

  const code = normalizeOperationCode(input.code, "branch code");
  if (await repositories.branches.findByCode(input.organizationId, code)) {
    throw new ConflictError("Branch code already exists in this organization.");
  }

  return repositories.branches.create({
    addressLine1: normalizeOptionalText(input.addressLine1, "addressLine1"),
    addressLine2: normalizeOptionalText(input.addressLine2, "addressLine2"),
    city: normalizeOptionalCityLike(input.city, "city"),
    code,
    countryCode: normalizeCountryCode(input.countryCode),
    district: normalizeOptionalCityLike(input.district, "district"),
    email: normalizeOptionalEmail(input.email),
    name: normalizeDisplayName(input.name, "branch name"),
    organizationId: input.organizationId,
    phone: normalizeOptionalPhone(input.phone),
    postalCode: normalizeOptionalCityLike(input.postalCode, "postalCode"),
    status: normalizeBranchStatus(input.status),
    timezone: normalizeTimezone(input.timezone),
    type: normalizeBranchType(input.type),
  });
}

export type CreateStockLocationInput = {
  branchId: string;
  code: string;
  isSellable?: boolean;
  name: string;
  organizationId: string;
  status?: StockLocation["status"];
  type?: StockLocation["type"];
};

export async function createStockLocation(
  repositories: {
    branches: BranchRepository;
    organizations: OrganizationLookupRepository;
    stockLocations: StockLocationRepository;
  },
  input: CreateStockLocationInput,
): Promise<StockLocation> {
  await requireOrganization(repositories.organizations, input.organizationId);

  const branch = await requireBranch(repositories.branches, input.branchId);
  assertSameOrganization(input.organizationId, branch.organizationId, "branch");

  const code = normalizeOperationCode(input.code, "stock location code");
  if (
    await repositories.stockLocations.findByCode(input.organizationId, code)
  ) {
    throw new ConflictError(
      "Stock location code already exists in this organization.",
    );
  }

  const type = normalizeStockLocationType(input.type);

  return repositories.stockLocations.create({
    branchId: input.branchId,
    code,
    isSellable: normalizeStockLocationSellable(type, input.isSellable),
    name: normalizeDisplayName(input.name, "stock location name"),
    organizationId: input.organizationId,
    status: normalizeStockLocationStatus(input.status),
    type,
  });
}

export type CreatePosCounterInput = {
  branchId: string;
  code: string;
  name: string;
  organizationId: string;
  status?: PosCounter["status"];
};

export async function createPosCounter(
  repositories: {
    branches: BranchRepository;
    organizations: OrganizationLookupRepository;
    posCounters: PosCounterRepository;
  },
  input: CreatePosCounterInput,
): Promise<PosCounter> {
  await requireOrganization(repositories.organizations, input.organizationId);

  const branch = await requireBranch(repositories.branches, input.branchId);
  assertSameOrganization(input.organizationId, branch.organizationId, "branch");

  const code = normalizeOperationCode(input.code, "POS counter code");
  if (await repositories.posCounters.findByCode(input.organizationId, code)) {
    throw new ConflictError(
      "POS counter code already exists in this organization.",
    );
  }

  return repositories.posCounters.create({
    branchId: input.branchId,
    code,
    name: normalizeDisplayName(input.name, "POS counter name"),
    organizationId: input.organizationId,
    status: normalizePosCounterStatus(input.status),
  });
}

async function requireOrganization(
  repository: OrganizationLookupRepository,
  organizationId: string,
): Promise<void> {
  if (!(await repository.findById(organizationId))) {
    throw new NotFoundError("Organization was not found.");
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
