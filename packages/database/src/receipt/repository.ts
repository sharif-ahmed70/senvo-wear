import type {
  CreateSalesReceiptRecord,
  ReceiptRepository,
  SalesReceipt,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type ReceiptPrismaClient = Pick<PrismaClient, "salesReceipt">;
const receiptInclude = {
  lines: { orderBy: { lineNumber: "asc" } },
  payments: { orderBy: { lineNumber: "asc" } },
} as const;
type ReceiptRecord = Prisma.SalesReceiptGetPayload<{
  include: typeof receiptInclude;
}>;

export class PrismaReceiptRepository implements ReceiptRepository {
  constructor(private readonly prisma: ReceiptPrismaClient) {}

  async create(record: CreateSalesReceiptRecord): Promise<SalesReceipt> {
    const { lines, payments, ...receipt } = record;
    return mapReceipt(
      await this.prisma.salesReceipt.create({
        data: {
          ...receipt,
          lines: { create: lines.map((line) => ({ ...line })) },
          payments: {
            create: payments.map((payment) => ({ ...payment })),
          },
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
