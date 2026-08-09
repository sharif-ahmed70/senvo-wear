import type {
  CreatePaymentCollectionReceiptRecord,
  CreatePosReturnReceiptRecord,
  CreateSalesReceiptRecord,
  PaymentCollectionReceipt,
  PaymentRefundReceipt,
  PaymentRefundReceiptRepository,
  PosReturnReceipt,
  ReceiptRepository,
  SalesReceipt,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type ReceiptPrismaClient = Pick<
  PrismaClient,
  | "paymentCollectionReceipt"
  | "paymentRefundReceipt"
  | "posReturnReceipt"
  | "salesReceipt"
>;
const receiptInclude = {
  lines: { orderBy: { lineNumber: "asc" } },
  payments: { orderBy: { lineNumber: "asc" } },
} as const;
const collectionReceiptInclude = {
  collection: { include: { lines: { orderBy: { lineNumber: "asc" } } } },
} as const;
const returnReceiptInclude = {
  saleReturn: { include: { lines: { orderBy: { lineNumber: "asc" } } } },
} as const;
const refundReceiptInclude = {
  refund: { include: { lines: { orderBy: { lineNumber: "asc" } } } },
} as const;
type ReceiptRecord = Prisma.SalesReceiptGetPayload<{
  include: typeof receiptInclude;
}>;
type CollectionReceiptRecord = Prisma.PaymentCollectionReceiptGetPayload<{
  include: typeof collectionReceiptInclude;
}>;
type ReturnReceiptRecord = Prisma.PosReturnReceiptGetPayload<{
  include: typeof returnReceiptInclude;
}>;
type RefundReceiptRecord = Prisma.PaymentRefundReceiptGetPayload<{
  include: typeof refundReceiptInclude;
}>;

export class PrismaReceiptRepository
  implements ReceiptRepository, PaymentRefundReceiptRepository
{
  constructor(private readonly prisma: ReceiptPrismaClient) {}
  async create(record: CreateSalesReceiptRecord): Promise<SalesReceipt> {
    const { lines, payments, ...receipt } = record;
    return mapReceipt(
      await this.prisma.salesReceipt.create({
        data: {
          ...receipt,
          lines: { create: lines.map((line) => ({ ...line })) },
          payments: { create: payments.map((payment) => ({ ...payment })) },
        },
        include: receiptInclude,
      }),
    );
  }
  async findByCheckoutId(checkoutId: string, organizationId: string) {
    const record = await this.prisma.salesReceipt.findFirst({
      include: receiptInclude,
      where: { checkoutId, organizationId },
    });
    return record ? mapReceipt(record) : null;
  }
  async createPaymentCollectionReceipt(
    record: CreatePaymentCollectionReceiptRecord,
  ) {
    const { payments, ...receipt } = record;
    void payments;
    return mapCollectionReceipt(
      await this.prisma.paymentCollectionReceipt.create({
        data: receipt,
        include: collectionReceiptInclude,
      }),
    );
  }
  async findPaymentCollectionReceiptById(
    collectionId: string,
    organizationId: string,
  ) {
    const record = await this.prisma.paymentCollectionReceipt.findFirst({
      include: collectionReceiptInclude,
      where: { collectionId, organizationId },
    });
    return record ? mapCollectionReceipt(record) : null;
  }
  async createPosReturnReceipt(record: CreatePosReturnReceiptRecord) {
    const { collectedReceiptNumber, lines, ...receipt } = record;
    void lines;
    return mapReturnReceipt(
      await this.prisma.posReturnReceipt.create({
        data: {
          ...receipt,
          originalReceiptNumber: collectedReceiptNumber,
        },
        include: returnReceiptInclude,
      }),
    );
  }
  async findPosReturnReceiptById(returnId: string, organizationId: string) {
    const record = await this.prisma.posReturnReceipt.findFirst({
      include: returnReceiptInclude,
      where: { organizationId, returnId },
    });
    return record ? mapReturnReceipt(record) : null;
  }
  async createPaymentRefundReceipt(
    record: PaymentRefundReceipt & {
      organizationId: string;
      salesOrderId: string;
    },
  ) {
    const { lines, ...receipt } = record;
    void lines;
    return mapRefundReceipt(
      await this.prisma.paymentRefundReceipt.create({
        data: receipt,
        include: refundReceiptInclude,
      }),
    );
  }
  async findByRefundId(refundId: string, organizationId: string) {
    const record = await this.prisma.paymentRefundReceipt.findFirst({
      include: refundReceiptInclude,
      where: { organizationId, refundId },
    });
    return record ? mapRefundReceipt(record) : null;
  }
}

function mapReceipt(record: ReceiptRecord): SalesReceipt {
  return {
    checkoutId: record.checkoutId,
    counterCode: record.counterCode,
    counterName: record.counterName,
    currencyCode: "BDT",
    customerEmail: record.customerEmail,
    customerName: record.customerName,
    customerPhone: record.customerPhone,
    deliveryMinor: record.deliveryMinor,
    discountMinor: record.discountMinor,
    id: record.id,
    issuedAt: record.issuedAt,
    lines: record.lines.map((line) => ({
      color: line.color,
      discountMinor: line.discountMinor,
      lineNumber: line.lineNumber,
      lineTotalMinor: line.lineTotalMinor,
      productName: line.productName,
      quantity: line.quantity,
      size: line.size,
      sku: line.sku,
      unitPriceMinor: line.unitPriceMinor,
    })),
    orderNumber: record.orderNumber,
    organizationAddressLine1: record.organizationAddressLine1,
    organizationAddressLine2: record.organizationAddressLine2,
    organizationCity: record.organizationCity,
    organizationDistrict: record.organizationDistrict,
    organizationEmail: record.organizationEmail,
    organizationId: record.organizationId,
    organizationName: record.organizationName,
    organizationPhone: record.organizationPhone,
    organizationPostalCode: record.organizationPostalCode,
    outstandingMinor: record.outstandingMinor,
    paidMinor: record.paidMinor,
    paymentBatchId: record.paymentBatchId,
    paymentStatus: record.paymentStatus,
    payments: record.payments.map((payment) => ({
      amountMinor: payment.amountMinor,
      lineNumber: payment.lineNumber,
      method: payment.method,
      reference: payment.reference,
    })),
    receiptNumber: record.receiptNumber,
    salesChannel:
      record.salesChannel === "EVENT_BOOTH" ? "EVENT_BOOTH" : "OFFLINE_STORE",
    salesOrderId: record.salesOrderId,
    sourceName: record.sourceName,
    staffName: record.staffName,
    subtotalMinor: record.subtotalMinor,
    totalMinor: record.totalMinor,
  };
}

function mapCollectionReceipt(
  record: CollectionReceiptRecord,
): PaymentCollectionReceipt {
  return {
    acceptedByName: record.acceptedByName,
    amountMinor: record.amountMinor,
    checkoutId: record.checkoutId,
    collectedAt: record.collectedAt,
    collectionId: record.collectionId,
    cumulativePaidMinor: record.cumulativePaidMinor,
    currencyCode: "BDT",
    id: record.id,
    orderNumber: record.orderNumber,
    organizationAddressLine1: record.organizationAddressLine1,
    organizationAddressLine2: record.organizationAddressLine2,
    organizationCity: record.organizationCity,
    organizationDistrict: record.organizationDistrict,
    organizationEmail: record.organizationEmail,
    organizationId: record.organizationId,
    organizationName: record.organizationName,
    organizationPhone: record.organizationPhone,
    organizationPostalCode: record.organizationPostalCode,
    outstandingMinor: record.outstandingMinor,
    paymentStatus: record.paymentStatus,
    payments: record.collection.lines.map((line) => ({
      amountMinor: line.amountMinor,
      lineNumber: line.lineNumber,
      method: line.method,
      reference: line.reference,
    })),
    receiptNumber: record.receiptNumber,
    salesOrderId: record.salesOrderId,
    totalMinor: record.totalMinor,
  };
}

function mapReturnReceipt(record: ReturnReceiptRecord): PosReturnReceipt {
  return {
    acceptedByName: record.acceptedByName,
    adjustedPayableMinor: record.adjustedPayableMinor,
    collectedReceiptNumber: record.originalReceiptNumber,
    cumulativeReceivedMinor: record.cumulativeReceivedMinor,
    cumulativeRefundedMinor: record.cumulativeRefundedMinor,
    cumulativeReturnCreditMinor: record.cumulativeReturnCreditMinor,
    destinationLocationName: record.destinationLocationName,
    id: record.id,
    netReceivedMinor: record.netReceivedMinor,
    lines: record.saleReturn.lines.map((line) => ({
      colorSnapshot: line.colorSnapshot,
      lineCreditMinor: line.lineCreditMinor,
      lineNumber: line.lineNumber,
      productNameSnapshot: line.productNameSnapshot,
      quantity: line.quantity,
      sizeSnapshot: line.sizeSnapshot,
      skuSnapshot: line.skuSnapshot,
    })),
    orderNumber: record.orderNumber,
    organizationAddressLine1: record.organizationAddressLine1,
    organizationAddressLine2: record.organizationAddressLine2,
    organizationCity: record.organizationCity,
    organizationDistrict: record.organizationDistrict,
    organizationEmail: record.organizationEmail,
    organizationName: record.organizationName,
    organizationPhone: record.organizationPhone,
    organizationPostalCode: record.organizationPostalCode,
    originalTotalMinor: record.originalTotalMinor,
    outstandingMinor: record.outstandingMinor,
    reasonCode: record.reasonCode,
    reasonNote: record.reasonNote,
    receiptNumber: record.receiptNumber,
    refundableMinor: record.refundableMinor,
    returnId: record.returnId,
    returnedAt: record.returnedAt,
    settlementStatus: mapReturnSettlementStatus(record.settlementStatus),
    totalCreditMinor: record.totalCreditMinor,
  };
}

function mapRefundReceipt(record: RefundReceiptRecord): PaymentRefundReceipt {
  if (record.settlementStatus === "UNRECORDED")
    throw new Error("A refund receipt cannot have unrecorded settlement.");
  return {
    acceptedByName: record.acceptedByName,
    adjustedPayableMinor: record.adjustedPayableMinor,
    amountMinor: record.amountMinor,
    checkoutId: record.checkoutId,
    cumulativeRefundedMinor: record.cumulativeRefundedMinor,
    grossReceivedMinor: record.grossReceivedMinor,
    id: record.id,
    issuedAt: record.issuedAt,
    lines: record.refund.lines.map((line) => ({
      amountMinor: line.amountMinor,
      lineNumber: line.lineNumber,
      method: line.method,
      reference: line.reference,
    })),
    netReceivedMinor: record.netReceivedMinor,
    orderNumber: record.orderNumber,
    organizationAddressLine1: record.organizationAddressLine1,
    organizationAddressLine2: record.organizationAddressLine2,
    organizationCity: record.organizationCity,
    organizationDistrict: record.organizationDistrict,
    organizationEmail: record.organizationEmail,
    organizationName: record.organizationName,
    organizationPhone: record.organizationPhone,
    organizationPostalCode: record.organizationPostalCode,
    originalPayableMinor: record.originalPayableMinor,
    originalReceiptNumber: record.originalReceiptNumber,
    outstandingMinor: record.outstandingMinor,
    receiptNumber: record.receiptNumber,
    refundableMinor: record.refundableMinor,
    refundId: record.refundId,
    returnCreditMinor: record.returnCreditMinor,
    settlementStatus: record.settlementStatus,
  };
}

function mapReturnSettlementStatus(
  status: ReturnReceiptRecord["settlementStatus"],
): PosReturnReceipt["settlementStatus"] {
  if (status === "UNRECORDED")
    throw new Error("A return receipt cannot have an unrecorded settlement.");
  return status;
}
