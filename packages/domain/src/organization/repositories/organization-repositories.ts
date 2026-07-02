import type { Organization } from "../../catalog/domain/models.js";
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

export type OrganizationLookupRepository = {
  findById(id: string): Promise<Organization | null>;
};

export type BranchRepository = {
  create(record: CreateBranchRecord): Promise<Branch>;
  countChildrenByStatuses(
    organizationId: string,
    branchId: string,
    statuses: readonly Branch["status"][],
  ): Promise<BranchChildStatusCounts>;
  findByCode(organizationId: string, code: string): Promise<Branch | null>;
  findById(id: string): Promise<Branch | null>;
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
  findById(id: string): Promise<StockLocation | null>;
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
  findById(id: string): Promise<PosCounter | null>;
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
