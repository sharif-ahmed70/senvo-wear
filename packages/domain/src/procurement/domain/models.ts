export type SupplierStatus = "ACTIVE" | "INACTIVE";

export type Supplier = {
  address: string | null;
  code: string;
  contactPerson: string | null;
  createdAt: Date;
  email: string | null;
  id: string;
  name: string;
  notes: string | null;
  organizationId: string;
  phone: string | null;
  status: SupplierStatus;
  updatedAt: Date;
};

export type PurchaseStatus = "DRAFT" | "POSTED" | "CANCELLED";

export type CostUnknownReason =
  | "OPENING_STOCK_UNKNOWN"
  | "PENDING_PURCHASE_RECEIPT"
  | "MANUAL_HOLD"
  | "LEGACY_UNSPECIFIED";

export type InventoryCostEventType =
  | "PURCHASE_RECEIPT"
  | "INVENTORY_ADJUSTMENT"
  | "OPENING_BALANCE"
  | "PURCHASE_REVERSAL"
  | "COST_CORRECTION";

export type CostingMethod = "MOVING_WEIGHTED_AVERAGE";

export type Purchase = {
  createdAt: Date;
  destinationLocationId: string;
  expectedDeliveryDate: Date | null;
  id: string;
  idempotencyKey: string | null;
  notes: string | null;
  organizationId: string;
  purchaseDate: Date;
  purchaseNumber: string;
  receiptMovementId: string | null;
  status: PurchaseStatus;
  supplierId: string;
  totalCostMinor: bigint;
  updatedAt: Date;
};

export type PurchaseLine = {
  createdAt: Date;
  id: string;
  lineNumber: number;
  notes: string | null;
  organizationId: string;
  productName: string;
  productVariantId: string;
  purchaseId: string;
  quantity: number;
  sku: string;
  totalCostMinor: bigint;
  unitCostMinor: number;
  updatedAt: Date;
  variantName: string | null;
};

export type PurchaseWithLines = Purchase & {
  lines: PurchaseLine[];
};

export type VariantCostState = {
  averageCostMinor: number | null;
  costUnknownReason: CostUnknownReason | null;
  createdAt: Date;
  id: string;
  inventoryValueMinor: bigint;
  isCostKnown: boolean;
  lastCostEventAt: Date | null;
  organizationId: string;
  productVariantId: string;
  updatedAt: Date;
  version: number;
};

export type InventoryCostEntry = {
  afterAverageCostMinor: number | null;
  afterQuantity: number;
  afterValueMinor: bigint;
  beforeAverageCostMinor: number | null;
  beforeQuantity: number;
  beforeValueMinor: bigint;
  createdAt: Date;
  eventType: InventoryCostEventType;
  id: string;
  organizationId: string;
  productVariantId: string;
  quantityChange: number;
  reference: string | null;
  sourceMovementId: string | null;
  sourcePurchaseId: string | null;
  valueChangeMinor: bigint;
};

export type SaleLineCostSnapshot = {
  costUnknownReason: CostUnknownReason | null;
  costingMethod: CostingMethod;
  createdAt: Date;
  id: string;
  isCostKnown: boolean;
  organizationId: string;
  productVariantId: string;
  quantity: number;
  salesOrderLineId: string;
  totalCostMinor: bigint | null;
  unitCostMinor: number | null;
};

export type SupplierPaymentMethod =
  "CASH" | "BANK_TRANSFER" | "CHEQUE" | "MOBILE_BANKING";

export type SupplierLedgerEntryType =
  "BILL" | "PAYMENT" | "RETURN_CREDIT" | "OPENING_BALANCE" | "ADJUSTMENT";

export type SupplierLedgerDirection = "DEBIT" | "CREDIT";

export type SupplierPayment = {
  amountMinor: bigint;
  createdAt: Date;
  id: string;
  idempotencyKey: string | null;
  notes: string | null;
  organizationId: string;
  paymentDate: Date;
  paymentMethod: SupplierPaymentMethod;
  purchaseId: string | null;
  reference: string | null;
  supplierId: string;
  updatedAt: Date;
};

export type SupplierLedgerEntry = {
  amountMinor: bigint;
  balanceAfterMinor: bigint;
  createdAt: Date;
  direction: SupplierLedgerDirection;
  entryDate: Date;
  entryType: SupplierLedgerEntryType;
  id: string;
  notes: string | null;
  organizationId: string;
  referenceId: string | null;
  referenceType: string | null;
  supplierId: string;
};

export type SupplierBalanceSummary = {
  lastBillDate: Date | null;
  lastPaymentDate: Date | null;
  organizationId: string;
  outstandingBalanceMinor: bigint;
  supplierId: string;
  totalAdjustedMinor: bigint;
  totalBilledMinor: bigint;
  totalPaidMinor: bigint;
};
