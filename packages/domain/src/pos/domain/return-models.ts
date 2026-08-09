import type { CheckoutSettlementStatus } from "../../payment/domain/models.js";

export type PosReturnReasonCode =
  "CHANGED_MIND" | "DEFECTIVE" | "OTHER" | "SIZE_OR_FIT" | "WRONG_ITEM";

export type PosSaleReturnLine = {
  colorSnapshot: string | null;
  id: string;
  lineCreditMinor: number;
  lineNumber: number;
  organizationId: string;
  productNameSnapshot: string;
  productVariantId: string;
  quantity: number;
  salesOrderLineId: string;
  sizeSnapshot: string | null;
  skuSnapshot: string;
  unitPriceMinor: number;
};

export type PosSaleReturn = {
  acceptedByName: string;
  acceptedByUserId: string;
  checkoutId: string;
  createdAt: Date;
  destinationLocationId: string;
  destinationLocationName: string;
  id: string;
  idempotencyKey: string;
  inventoryMovementId: string;
  lines: PosSaleReturnLine[];
  organizationId: string;
  reasonCode: PosReturnReasonCode;
  reasonNote: string | null;
  receiptId: string;
  receiptNumber: string;
  requestSignature: string;
  returnedAt: Date;
  salesOrderId: string;
  totalCreditMinor: number;
};

export type PosReturnableLine = {
  colorSnapshot: string | null;
  originalLineTotalMinor: number;
  productNameSnapshot: string;
  productVariantId: string;
  returnableQuantity: number;
  returnedQuantity: number;
  salesOrderLineId: string;
  sizeSnapshot: string | null;
  skuSnapshot: string;
  soldQuantity: number;
  unitPriceMinor: number;
};

export type PosReturnAccount = {
  adjustedPayableMinor: number | null;
  checkoutId: string;
  cumulativeReceivedMinor: number | null;
  cumulativeRefundedMinor: number | null;
  netReceivedMinor: number | null;
  legacyPaymentRecorded: boolean;
  lines: PosReturnableLine[];
  orderNumber: string;
  organizationId: string;
  originalTotalMinor: number;
  outstandingMinor: number | null;
  refundableMinor: number | null;
  returnCreditMinor: number;
  returns: PosSaleReturn[];
  settlementStatus: CheckoutSettlementStatus;
};

export type PosReturnReceipt = {
  acceptedByName: string;
  adjustedPayableMinor: number;
  collectedReceiptNumber: string | null;
  cumulativeReceivedMinor: number;
  cumulativeRefundedMinor: number;
  cumulativeReturnCreditMinor: number;
  destinationLocationName: string;
  id: string;
  netReceivedMinor: number;
  lines: Array<{
    colorSnapshot: string | null;
    lineCreditMinor: number;
    lineNumber: number;
    productNameSnapshot: string;
    quantity: number;
    sizeSnapshot: string | null;
    skuSnapshot: string;
  }>;
  orderNumber: string;
  organizationAddressLine1: string | null;
  organizationAddressLine2: string | null;
  organizationCity: string | null;
  organizationDistrict: string | null;
  organizationEmail: string | null;
  organizationName: string;
  organizationPhone: string | null;
  organizationPostalCode: string | null;
  originalTotalMinor: number;
  outstandingMinor: number;
  reasonCode: PosReturnReasonCode;
  reasonNote: string | null;
  receiptNumber: string;
  refundableMinor: number;
  returnId: string;
  returnedAt: Date;
  settlementStatus: Exclude<CheckoutSettlementStatus, "UNRECORDED">;
  totalCreditMinor: number;
};
