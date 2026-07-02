export type BranchStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type BranchType =
  "SHOWROOM" | "WAREHOUSE" | "OFFICE" | "FULFILMENT" | "HYBRID";
export type StockLocationStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type StockLocationType =
  | "WAREHOUSE"
  | "SHOWROOM"
  | "QC_HOLD"
  | "DAMAGE_HOLD"
  | "RETURN_HOLD"
  | "TRANSIT"
  | "OTHER";
export type PosCounterStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type Branch = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  code: string;
  countryCode: string;
  createdAt: Date;
  district: string | null;
  email: string | null;
  id: string;
  name: string;
  organizationId: string;
  phone: string | null;
  postalCode: string | null;
  status: BranchStatus;
  timezone: string;
  type: BranchType;
  updatedAt: Date;
  version: number;
};

export type StockLocation = {
  branchId: string;
  code: string;
  createdAt: Date;
  id: string;
  isSellable: boolean;
  name: string;
  organizationId: string;
  status: StockLocationStatus;
  type: StockLocationType;
  updatedAt: Date;
  version: number;
};

export type PosCounter = {
  branchId: string;
  code: string;
  createdAt: Date;
  id: string;
  name: string;
  organizationId: string;
  status: PosCounterStatus;
  updatedAt: Date;
  version: number;
};
