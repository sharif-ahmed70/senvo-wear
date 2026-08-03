export type SalesCounterType = "STORE" | "EVENT_BOOTH";
export type SalesCounterStatus = "ACTIVE" | "INACTIVE";
export type SalesSessionStatus = "OPEN" | "CLOSED";

export type SalesCounter = {
  boothId: string | null;
  branchId: string | null;
  code: string;
  createdAt: Date;
  id: string;
  name: string;
  organizationId: string;
  status: SalesCounterStatus;
  type: SalesCounterType;
  updatedAt: Date;
  version: number;
};

export type SalesSession = {
  cartId: string;
  closedAt: Date | null;
  counterId: string;
  createdAt: Date;
  id: string;
  openedAt: Date;
  openedByUserId: string;
  organizationId: string;
  status: SalesSessionStatus;
  updatedAt: Date;
  version: number;
};

export type PosCartLine = {
  cartId: string;
  createdAt: Date;
  id: string;
  lineSubtotalMinor: number;
  organizationId: string;
  productVariantId: string;
  quantity: number;
  unitPriceMinor: number;
  updatedAt: Date;
};

export type PosCart = {
  createdAt: Date;
  id: string;
  lines: PosCartLine[];
  organizationId: string;
  salesSessionId: string;
  sessionStatus: SalesSessionStatus;
  updatedAt: Date;
};

export type SellableVariant = {
  id: string;
  organizationId: string;
  sellingPriceMinor: number;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

export type PosSaleLookup = {
  availabilityStatus: "AVAILABLE";
  availableQuantity: number;
  barcode: string;
  color: string;
  productName: string;
  sellingPriceMinor: number;
  size: string;
  sku: string;
  variantId: string;
};
