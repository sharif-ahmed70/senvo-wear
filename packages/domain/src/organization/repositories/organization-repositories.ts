import type { Organization } from "../../catalog/domain/models.js";
import type { Branch, PosCounter, StockLocation } from "../domain/models.js";

export type CreateBranchRecord = Omit<Branch, "createdAt" | "id" | "updatedAt">;

export type CreateStockLocationRecord = Omit<
  StockLocation,
  "createdAt" | "id" | "updatedAt"
>;

export type CreatePosCounterRecord = Omit<
  PosCounter,
  "createdAt" | "id" | "updatedAt"
>;

export type OrganizationLookupRepository = {
  findById(id: string): Promise<Organization | null>;
};

export type BranchRepository = {
  create(record: CreateBranchRecord): Promise<Branch>;
  findByCode(organizationId: string, code: string): Promise<Branch | null>;
  findById(id: string): Promise<Branch | null>;
};

export type StockLocationRepository = {
  create(record: CreateStockLocationRecord): Promise<StockLocation>;
  findByCode(
    organizationId: string,
    code: string,
  ): Promise<StockLocation | null>;
};

export type PosCounterRepository = {
  create(record: CreatePosCounterRecord): Promise<PosCounter>;
  findByCode(organizationId: string, code: string): Promise<PosCounter | null>;
};
