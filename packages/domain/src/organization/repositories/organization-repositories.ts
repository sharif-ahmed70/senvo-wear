import type { Organization } from "../../catalog/domain/models.js";
import type {
  OrganizationMembership,
  Role,
  UserStatus,
} from "../../identity/domain/models.js";
import type { Branch, PosCounter, StockLocation } from "../domain/models.js";

export type CreateBranchRecord = Omit<
  Branch,
  "createdAt" | "id" | "updatedAt" | "version"
>;

export type CreateStockLocationRecord = Omit<
  StockLocation,
  "createdAt" | "id" | "updatedAt" | "version"
>;

export type CreatePosCounterRecord = Omit<
  PosCounter,
  "createdAt" | "id" | "updatedAt" | "version"
>;

export type BranchMetadataPatch = Pick<
  Branch,
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "countryCode"
  | "district"
  | "email"
  | "name"
  | "phone"
  | "postalCode"
  | "timezone"
  | "type"
>;

export type StockLocationMetadataPatch = Pick<
  StockLocation,
  "isSellable" | "name" | "type"
>;

export type PosCounterMetadataPatch = Pick<PosCounter, "name">;

export type BranchChildStatusCounts = {
  posCounters: number;
  stockLocations: number;
};

export type CursorPageRequest = {
  cursor?: string;
  pageSize?: number;
};

export type CursorPageResult<T> = {
  hasMore: boolean;
  items: T[];
  nextCursor: string | null;
};

export type BranchListFilter = {
  cursor?: string;
  organizationId: string;
  pageSize: number;
  search?: string;
  status?: Branch["status"];
  type?: Branch["type"];
};

export type StockLocationListFilter = {
  branchId?: string;
  cursor?: string;
  isSellable?: boolean;
  organizationId: string;
  pageSize: number;
  search?: string;
  status?: StockLocation["status"];
  type?: StockLocation["type"];
};

export type PosCounterListFilter = {
  branchId?: string;
  cursor?: string;
  organizationId: string;
  pageSize: number;
  search?: string;
  status?: PosCounter["status"];
};

export type OrganizationLookupRepository = {
  findById(id: string): Promise<Organization | null>;
};

export type OrganizationProfilePatch = Pick<
  Organization,
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "countryCode"
  | "district"
  | "email"
  | "name"
  | "phone"
  | "postalCode"
  | "timezone"
>;

export type OrganizationProfileRepository = OrganizationLookupRepository & {
  updateProfile(record: {
    expectedVersion: number;
    id: string;
    profile: OrganizationProfilePatch;
  }): Promise<Organization | null>;
};

export type OrganizationTeamMember = {
  createdAt: Date;
  email: string;
  id: string;
  name: string | null;
  organizationId: string;
  role: Role;
  status: OrganizationMembership["status"];
  updatedAt: Date;
  userId: string;
  userStatus: UserStatus;
  version: number;
};

export type OrganizationTeamReadRepository = {
  listByOrganization(organizationId: string): Promise<OrganizationTeamMember[]>;
};

export type BranchRepository = {
  create(record: CreateBranchRecord): Promise<Branch>;
  countChildrenByStatuses(
    organizationId: string,
    branchId: string,
    statuses: readonly Branch["status"][],
  ): Promise<BranchChildStatusCounts>;
  findByCode(organizationId: string, code: string): Promise<Branch | null>;
  findById(id: string, organizationId?: string): Promise<Branch | null>;
  list(filter: BranchListFilter): Promise<CursorPageResult<Branch>>;
  changeStatus(record: {
    blockedChildStatuses?: readonly Branch["status"][];
    expectedVersion: number;
    id: string;
    organizationId: string;
    status: Branch["status"];
  }): Promise<Branch | null>;
  updateMetadata(record: {
    expectedVersion: number;
    id: string;
    metadata: BranchMetadataPatch;
    organizationId: string;
  }): Promise<Branch | null>;
};

export type StockLocationRepository = {
  create(record: CreateStockLocationRecord): Promise<StockLocation>;
  findByCode(
    organizationId: string,
    code: string,
  ): Promise<StockLocation | null>;
  findById(id: string, organizationId?: string): Promise<StockLocation | null>;
  list(
    filter: StockLocationListFilter,
  ): Promise<CursorPageResult<StockLocation>>;
  changeStatus(record: {
    expectedVersion: number;
    id: string;
    isSellable: boolean;
    organizationId: string;
    status: StockLocation["status"];
  }): Promise<StockLocation | null>;
  updateMetadata(record: {
    expectedVersion: number;
    id: string;
    metadata: StockLocationMetadataPatch;
    organizationId: string;
  }): Promise<StockLocation | null>;
};

export type PosCounterRepository = {
  create(record: CreatePosCounterRecord): Promise<PosCounter>;
  findByCode(organizationId: string, code: string): Promise<PosCounter | null>;
  findById(id: string, organizationId?: string): Promise<PosCounter | null>;
  list(filter: PosCounterListFilter): Promise<CursorPageResult<PosCounter>>;
  changeStatus(record: {
    expectedVersion: number;
    id: string;
    organizationId: string;
    status: PosCounter["status"];
  }): Promise<PosCounter | null>;
  updateMetadata(record: {
    expectedVersion: number;
    id: string;
    metadata: PosCounterMetadataPatch;
    organizationId: string;
  }): Promise<PosCounter | null>;
};
