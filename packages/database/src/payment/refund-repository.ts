import {
  calculateCheckoutSettlement,
  type CreatePaymentRefundRecord,
  type PaymentBatch,
  type PaymentCollection,
  type PaymentRefund,
  type PaymentRefundAccount,
  type PaymentRefundPreparation,
  type PaymentRefundRepository,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type RefundPrismaClient = Pick<
  PrismaClient,
  | "$queryRaw"
  | "paymentRefund"
  | "paymentRefundLine"
  | "posCheckoutRecord"
  | "user"
>;
const refundInclude = {
  acceptedBy: { select: { email: true, name: true } },
  lines: { orderBy: { lineNumber: "asc" } },
  receipt: { select: { id: true, receiptNumber: true } },
} as const;
const checkoutInclude = {
  organization: true,
  paymentBatch: { include: { lines: { orderBy: { lineNumber: "asc" } } } },
  paymentCollections: {
    include: {
      acceptedBy: { select: { email: true, name: true } },
      lines: { orderBy: { lineNumber: "asc" } },
      receipt: { select: { id: true, receiptNumber: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  paymentRefunds: { include: refundInclude, orderBy: { issuedAt: "asc" } },
  posSaleReturns: { select: { totalCreditMinor: true } },
  receipt: { select: { receiptNumber: true } },
  salesOrder: { select: { orderNumber: true } },
} as const;
type RefundRecord = Prisma.PaymentRefundGetPayload<{
  include: typeof refundInclude;
}>;
type CheckoutRecord = Prisma.PosCheckoutRecordGetPayload<{
  include: typeof checkoutInclude;
}>;

export class PrismaPaymentRefundRepository implements PaymentRefundRepository {
  constructor(private readonly prisma: RefundPrismaClient) {}

  async create(record: CreatePaymentRefundRecord): Promise<PaymentRefund> {
    const { lines, receiptId, receiptNumber, ...refund } = record;
    const created = await this.prisma.paymentRefund.create({ data: refund });
    await this.prisma.paymentRefundLine.createMany({
      data: lines.map((line, index) => ({
        ...line,
        createdAt: record.createdAt,
        lineNumber: index + 1,
        organizationId: record.organizationId,
        refundId: created.id,
      })),
    });
    const persisted = await this.prisma.paymentRefund.findUniqueOrThrow({
      include: {
        acceptedBy: refundInclude.acceptedBy,
        lines: refundInclude.lines,
      },
      where: { id: created.id },
    });
    return mapRefund({
      ...persisted,
      receipt: { id: receiptId, receiptNumber },
    });
  }

  async findAccountByCheckoutId(checkoutId: string, organizationId: string) {
    const record = await this.findCheckout(checkoutId, organizationId);
    return record ? mapAccount(record) : null;
  }

  async prepare(
    checkoutId: string,
    organizationId: string,
    acceptedByUserId: string,
  ): Promise<PaymentRefundPreparation | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "pos_checkout_records"
      WHERE "id" = ${checkoutId}::uuid
        AND "organization_id" = ${organizationId}::uuid
      FOR UPDATE
    `;
    const [record, acceptedBy] = await Promise.all([
      this.findCheckout(checkoutId, organizationId),
      this.prisma.user.findFirst({
        select: { email: true, name: true },
        where: {
          id: acceptedByUserId,
          status: "ACTIVE",
          memberships: { some: { organizationId, status: "ACTIVE" } },
        },
      }),
    ]);
    if (!record) return null;
    if (!acceptedBy)
      throw new Error(
        "Trusted refund staff is not active in the organization.",
      );
    return {
      acceptedByName: acceptedBy.name ?? acceptedBy.email,
      checkoutId: record.id,
      collections: record.paymentCollections.map(mapCollection),
      initialPayment: record.paymentBatch
        ? mapBatch(record.paymentBatch)
        : null,
      orderNumber: record.salesOrder.orderNumber,
      organizationAddressLine1: record.organization.addressLine1,
      organizationAddressLine2: record.organization.addressLine2,
      organizationCity: record.organization.city,
      organizationDistrict: record.organization.district,
      organizationEmail: record.organization.email,
      organizationId,
      organizationName: record.organization.name,
      organizationPhone: record.organization.phone,
      organizationPostalCode: record.organization.postalCode,
      originalReceiptNumber: record.receipt?.receiptNumber ?? null,
      refunds: record.paymentRefunds.map(mapRefund),
      returnCreditMinor: record.posSaleReturns.reduce(
        (sum, item) => sum + item.totalCreditMinor,
        0,
      ),
      salesOrderId: record.salesOrderId,
      totalMinor: record.totalMinor,
    };
  }

  private findCheckout(checkoutId: string, organizationId: string) {
    return this.prisma.posCheckoutRecord.findFirst({
      include: checkoutInclude,
      where: { id: checkoutId, organizationId },
    });
  }
}

function mapRefund(record: RefundRecord): PaymentRefund {
  return {
    acceptedByName: record.acceptedBy.name ?? record.acceptedBy.email,
    acceptedByUserId: record.acceptedByUserId,
    amountMinor: record.amountMinor,
    checkoutId: requirePosContext(record.checkoutId, "checkout"),
    createdAt: record.createdAt,
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    issuedAt: record.issuedAt,
    lines: record.lines.map((line) => ({
      amountMinor: line.amountMinor,
      createdAt: line.createdAt,
      id: line.id,
      lineNumber: line.lineNumber,
      method: line.method,
      organizationId: line.organizationId,
      reference: line.reference,
      refundId: line.refundId,
    })),
    organizationId: record.organizationId,
    receiptId: record.receipt?.id ?? "",
    receiptNumber: record.receipt?.receiptNumber ?? "",
    requestSignature: record.requestSignature,
    salesOrderId: record.salesOrderId,
  };
}

function mapBatch(record: CheckoutRecord["paymentBatch"] & {}): PaymentBatch {
  return {
    checkoutId: requirePosContext(record.checkoutId, "checkout"),
    counterId: requirePosContext(record.counterId, "counter"),
    createdAt: record.createdAt,
    currencyCode: "BDT",
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    lines: record.lines.map((line) => ({
      amountMinor: line.amountMinor,
      createdAt: line.createdAt,
      id: line.id,
      lineNumber: line.lineNumber,
      method: line.method,
      organizationId: line.organizationId,
      paymentBatchId: line.paymentBatchId,
      reference: line.reference,
    })),
    organizationId: record.organizationId,
    outstandingMinor: record.outstandingMinor,
    paidMinor: record.paidMinor,
    payableMinor: record.payableMinor,
    requestSignature: record.requestSignature,
    salesOrderId: record.salesOrderId,
    salesSessionId: requirePosContext(record.salesSessionId, "sales session"),
    staffId: requirePosContext(record.staffId, "staff"),
    status: record.status,
  };
}

function requirePosContext(value: string | null, field: string): string {
  if (value === null) {
    throw new Error(`POS settlement is missing its ${field} context.`);
  }
  return value;
}

function mapCollection(
  record: CheckoutRecord["paymentCollections"][number],
): PaymentCollection {
  return {
    acceptedByName: record.acceptedBy.name ?? record.acceptedBy.email,
    acceptedByUserId: record.acceptedByUserId,
    amountMinor: record.amountMinor,
    balanceAfterMinor: record.balanceAfterMinor,
    balanceBeforeMinor: record.balanceBeforeMinor,
    checkoutId: record.checkoutId,
    createdAt: record.createdAt,
    currencyCode: "BDT",
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    lines: record.lines.map((line) => ({
      amountMinor: line.amountMinor,
      collectionId: line.collectionId,
      createdAt: line.createdAt,
      id: line.id,
      lineNumber: line.lineNumber,
      method: line.method,
      organizationId: line.organizationId,
      reference: line.reference,
    })),
    organizationId: record.organizationId,
    receiptId: record.receipt?.id ?? "",
    receiptNumber: record.receipt?.receiptNumber ?? "",
    requestSignature: record.requestSignature,
    salesOrderId: record.salesOrderId,
  };
}

function mapAccount(record: CheckoutRecord): PaymentRefundAccount {
  const refunds = record.paymentRefunds.map(mapRefund);
  const returnCreditMinor = record.posSaleReturns.reduce(
    (sum, item) => sum + item.totalCreditMinor,
    0,
  );
  if (!record.paymentBatch)
    return {
      adjustedPayableMinor: null,
      checkoutId: record.id,
      cumulativeRefundedMinor: null,
      grossReceivedMinor: null,
      legacyPaymentRecorded: false,
      netReceivedMinor: null,
      orderNumber: record.salesOrder.orderNumber,
      organizationId: record.organizationId,
      originalPayableMinor: record.totalMinor,
      outstandingMinor: null,
      refundableMinor: null,
      refunds,
      returnCreditMinor,
      settlementStatus: "UNRECORDED",
    };
  const grossReceivedMinor =
    record.paymentBatch.paidMinor +
    record.paymentCollections.reduce((sum, item) => sum + item.amountMinor, 0);
  const cumulativeRefundedMinor = refunds.reduce(
    (sum, item) => sum + item.amountMinor,
    0,
  );
  const settlement = calculateCheckoutSettlement(
    record.paymentBatch.payableMinor,
    grossReceivedMinor,
    returnCreditMinor,
    cumulativeRefundedMinor,
  );
  return {
    adjustedPayableMinor: settlement.adjustedPayableMinor,
    checkoutId: record.id,
    cumulativeRefundedMinor,
    grossReceivedMinor,
    legacyPaymentRecorded: true,
    netReceivedMinor: settlement.netReceivedMinor,
    orderNumber: record.salesOrder.orderNumber,
    organizationId: record.organizationId,
    originalPayableMinor: record.paymentBatch.payableMinor,
    outstandingMinor: settlement.outstandingMinor,
    refundableMinor: settlement.refundableMinor,
    refunds,
    returnCreditMinor,
    settlementStatus: settlement.status,
  };
}
