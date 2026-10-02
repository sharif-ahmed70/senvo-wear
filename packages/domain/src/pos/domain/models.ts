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
  openedByName?: string;
  openingFloatMinor: number;
  organizationId: string;
  status: SalesSessionStatus;
  updatedAt: Date;
  version: number;
};

export type PosSettlementStatus = "BALANCED" | "SHORTAGE" | "OVERAGE";

export type PosRegisterSettlement = {
  actualBankTransferMinor: number;
  actualCardMinor: number;
  actualCashMinor: number;
  actualMobileBankingMinor: number;
  actualTotalMinor: number;
  approvedByUserId?: string | null;
  approvedByUserName?: string | null;
  bankTransferDiscrepancyMinor: number;
  cardDiscrepancyMinor: number;
  cashDiscrepancyMinor: number;
  closedAt: Date;
  closedByUserId: string;
  closedByUserName?: string;
  closingNotes?: string | null;
  counterId: string;
  counterName?: string;
  createdAt: Date;
  denominationBreakdown?: Record<string, number> | null;
  discrepancyReason?: string | null;
  expectedBankTransferMinor: number;
  expectedCardMinor: number;
  expectedCashMinor: number;
  expectedMobileBankingMinor: number;
  expectedTotalMinor: number;
  id: string;
  mobileBankingDiscrepancyMinor: number;
  openingFloatMinor: number;
  organizationId: string;
  salesSessionId: string;
  status: PosSettlementStatus;
  totalDiscrepancyMinor: number;
};

export type PosSessionReconciliationSummary = {
  bankTransferSalesMinor: number;
  cardSalesMinor: number;
  cashCollectionsMinor: number;
  cashRefundsMinor: number;
  cashSalesMinor: number;
  counterId: string;
  counterName: string;
  digitalRefundsMinor: number;
  expectedBankTransferMinor: number;
  expectedCardMinor: number;
  expectedCashMinor: number;
  expectedMobileBankingMinor: number;
  expectedTotalMinor: number;
  grossSalesMinor: number;
  mobileBankingSalesMinor: number;
  openedAt: Date;
  openingFloatMinor: number;
  salesCount: number;
  sessionId: string;
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

export type PosCartDetails = {
  checkoutId: string | null;
  createdAt: Date;
  id: string;
  lines: Array<
    PosCartLine & {
      color: string;
      productName: string;
      size: string;
      sku: string;
    }
  >;
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
  outstandingMinor: number | null;
  paidMinor: number | null;
  paymentBatchId: string | null;
  paymentRequestSignature: string | null;
  paymentStatus: CheckoutPaymentStatus;
  receiptId: string | null;
  receiptNumber: string | null;
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
  counterCode: string;
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
  organizationAddressLine1: string | null;
  organizationAddressLine2: string | null;
  organizationCity: string | null;
  organizationDistrict: string | null;
  organizationEmail: string | null;
  organizationName: string;
  organizationPhone: string | null;
  organizationPostalCode: string | null;
  salesSessionId: string;
  sessionStatus: SalesSessionStatus;
  staffId: string;
  staffName: string;
  staffStatus: "ACTIVE" | "INACTIVE" | "LOCKED";
  sourceName: string;
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
import type { CheckoutPaymentStatus } from "../../payment/domain/models.js";
