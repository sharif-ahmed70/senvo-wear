import type {
  PosReturnAccount,
  PosReturnReasonCode,
  PosSaleReturn,
} from "../domain/return-models.js";

export type PosReturnPreparation = {
  acceptedByName: string;
  checkoutId: string;
  collections: readonly { amountMinor: number }[];
  destination: {
    id: string;
    isSellable: boolean;
    name: string;
    status: "ACTIVE" | "ARCHIVED" | "INACTIVE";
    type: string;
  } | null;
  initialPayment: { paidMinor: number; payableMinor: number } | null;
  order: {
    fulfillmentMovementId: string | null;
    id: string;
    lines: Array<{
      colorSnapshot: string | null;
      id: string;
      lineTotalMinor: number;
      productNameSnapshot: string;
      productVariantId: string;
      quantity: number;
      sizeSnapshot: string | null;
      skuSnapshot: string;
      unitPriceMinor: number;
    }>;
    orderNumber: string;
    status: string;
    totalMinor: number;
  };
  organization: {
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    district: string | null;
    email: string | null;
    name: string;
    phone: string | null;
    postalCode: string | null;
  };
  organizationId: string;
  originalReceiptNumber: string | null;
  returns: PosSaleReturn[];
};

export type CreatePosSaleReturnRecord = {
  acceptedByUserId: string;
  checkoutId: string;
  createdAt: Date;
  destinationLocationId: string;
  id: string;
  idempotencyKey: string;
  inventoryMovementId: string;
  lines: Array<{
    colorSnapshot: string | null;
    lineCreditMinor: number;
    productNameSnapshot: string;
    productVariantId: string;
    quantity: number;
    salesOrderLineId: string;
    sizeSnapshot: string | null;
    skuSnapshot: string;
    unitPriceMinor: number;
  }>;
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

export type PosReturnRepository = {
  create(record: CreatePosSaleReturnRecord): Promise<PosSaleReturn>;
  findAccount(
    checkoutId: string,
    organizationId: string,
  ): Promise<PosReturnAccount | null>;
  prepare(input: {
    acceptedByUserId: string;
    checkoutId: string;
    destinationLocationId: string;
    organizationId: string;
  }): Promise<PosReturnPreparation | null>;
};
