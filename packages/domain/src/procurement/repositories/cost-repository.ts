import type {
  CostUnknownReason,
  CostingMethod,
  InventoryCostEntry,
  InventoryCostEventType,
  SaleLineCostSnapshot,
  VariantCostState,
} from "../domain/models.js";

export type UpsertVariantCostStateRecord = {
  averageCostMinor: number | null;
  costUnknownReason?: CostUnknownReason | null;
  expectedVersion?: number;
  inventoryValueMinor: bigint;
  isCostKnown: boolean;
  lastCostEventAt?: Date | null;
  organizationId: string;
  productVariantId: string;
};

export type CreateInventoryCostEntryRecord = {
  afterAverageCostMinor: number | null;
  afterQuantity: number;
  afterValueMinor: bigint;
  beforeAverageCostMinor: number | null;
  beforeQuantity: number;
  beforeValueMinor: bigint;
  eventType: InventoryCostEventType;
  organizationId: string;
  productVariantId: string;
  quantityChange: number;
  reference?: string | null;
  sourceMovementId?: string | null;
  sourcePurchaseId?: string | null;
  valueChangeMinor: bigint;
};

export type CreateSaleLineCostSnapshotRecord = {
  costUnknownReason?: CostUnknownReason | null;
  costingMethod?: CostingMethod;
  isCostKnown: boolean;
  organizationId: string;
  productVariantId: string;
  quantity: number;
  salesOrderLineId: string;
  totalCostMinor: bigint | null;
  unitCostMinor: number | null;
};

export type CostRepository = {
  getCostState(
    organizationId: string,
    productVariantId: string,
  ): Promise<VariantCostState | null>;
  getSaleLineCostSnapshot(
    organizationId: string,
    salesOrderLineId: string,
  ): Promise<SaleLineCostSnapshot | null>;
  getVariantOnHandQuantity(
    organizationId: string,
    productVariantId: string,
  ): Promise<number>;
  listCostEntries(
    organizationId: string,
    productVariantId: string,
    limit?: number,
  ): Promise<InventoryCostEntry[]>;
  recordCostEntry(
    record: CreateInventoryCostEntryRecord,
  ): Promise<InventoryCostEntry>;
  recordSaleLineCostSnapshot(
    record: CreateSaleLineCostSnapshotRecord,
  ): Promise<SaleLineCostSnapshot>;
  upsertCostState(
    record: UpsertVariantCostStateRecord,
  ): Promise<VariantCostState>;
};
