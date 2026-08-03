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
  checkoutId?: string | null;
  createdAt: Date;
  id: string;
  lines: PosCartLine[];
  organizationId: string;
  salesSessionId: string;
  sessionStatus: SalesSessionStatus;
  updatedAt: Date;
};

export type PosCheckoutStatus = "COMPLETED";

export type PosCheckout = {
  cartId: string;
  completedAt: Date;
  counterId: string;
  counterName: string;
  createdAt: Date;
  id: string;
  idempotencyKey: string;
  orderNumber: string;
  organizationId: string;
  salesOrderId: string;
  salesSessionId: string;
  staffName: string;
  status: PosCheckoutStatus;
  subtotalMinor: number;
  totalMinor: number;
  updatedAt: Date;
};

export type PosCheckoutPreparation = {
  allocationPolicyId: string | null;
  boothId: string | null;
  branchId: string | null;
  cartId: string;
  checkout: PosCheckout | null;
  counterId: string;
  counterName: string;
  counterStatus: SalesCounterStatus;
  counterType: SalesCounterType;
  lines: {
    hasActiveBarcode: boolean;
    productVariantId: string;
    quantity: number;
    sellingPriceMinor: number;
    variantStatus: SellableVariant["status"];
  }[];
  membershipStatus: "ACTIVE" | "INACTIVE";
  organizationId: string;
  salesSessionId: string;
  sessionStatus: SalesSessionStatus;
  staffId: string;
  staffName: string;
  staffStatus: "ACTIVE" | "INACTIVE" | "LOCKED";
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
