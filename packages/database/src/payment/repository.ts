import {
  calculateCumulativePaymentBalance,
  calculateCheckoutSettlement,
  type CreatePaymentBatchRecord,
  type CreatePaymentCollectionRecord,
  type PaymentAccount,
  type PaymentBatch,
  type PaymentCollection,
  type PaymentCollectionPreparation,
  type PaymentRepository,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type PaymentPrismaClient = Pick<
  PrismaClient,
  | "$queryRaw"
  | "paymentBatch"
  | "paymentCollection"
  | "paymentCollectionLine"
  | "posCheckoutRecord"
  | "user"
>;
const batchInclude = { lines: { orderBy: { lineNumber: "asc" } } } as const;
const collectionInclude = {
  acceptedBy: { select: { email: true, name: true } },
  lines: { orderBy: { lineNumber: "asc" } },
  receipt: { select: { id: true, receiptNumber: true } },
} as const;
const accountInclude = {
  organization: true,
  paymentBatch: { include: batchInclude },
  paymentCollections: {
    include: collectionInclude,
    orderBy: { createdAt: "asc" },
  },
  posSaleReturns: { select: { totalCreditMinor: true } },
  salesOrder: { select: { orderNumber: true } },
} as const;
type BatchRecord = Prisma.PaymentBatchGetPayload<{
  include: typeof batchInclude;
}>;
type CollectionRecord = Prisma.PaymentCollectionGetPayload<{
  include: typeof collectionInclude;
}>;
type AccountRecord = Prisma.PosCheckoutRecordGetPayload<{
  include: typeof accountInclude;
}>;

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PaymentPrismaClient) {}

  async create(record: CreatePaymentBatchRecord): Promise<PaymentBatch> {
    const { lines, ...batch } = record;
    return mapBatch(
      await this.prisma.paymentBatch.create({
        data: {
          ...batch,
          lines: {
            create: lines.map((line, index) => ({
              ...line,
              lineNumber: index + 1,
            })),
          },
        },
        include: batchInclude,
      }),
    );
  }

  async createCollection(
    record: CreatePaymentCollectionRecord,
  ): Promise<PaymentCollection> {
    const { acceptedByName, lines, receiptId, receiptNumber, ...collection } =
      record;
    void acceptedByName;
    const created = await this.prisma.paymentCollection.create({
      data: {
        ...collection,
      },
    });
    await this.prisma.paymentCollectionLine.createMany({
      data: lines.map((line, index) => ({
        ...line,
        collectionId: created.id,
        createdAt: record.createdAt,
        lineNumber: index + 1,
        organizationId: record.organizationId,
      })),
    });
    const persisted = await this.prisma.paymentCollection.findUniqueOrThrow({
      include: {
        acceptedBy: collectionInclude.acceptedBy,
        lines: collectionInclude.lines,
      },
      where: { id: created.id },
    });
    return mapCollection({
      ...persisted,
      receipt: { id: receiptId, receiptNumber },
    });
  }

  async findAccountByCheckoutId(checkoutId: string, organizationId: string) {
    const record = await this.prisma.posCheckoutRecord.findFirst({
      include: accountInclude,
      where: { id: checkoutId, organizationId },
    });
    return record ? mapAccount(record) : null;
  }

  async prepareCollection(
    checkoutId: string,
    organizationId: string,
    acceptedByUserId: string,
  ): Promise<PaymentCollectionPreparation | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "pos_checkout_records"
      WHERE "id" = ${checkoutId}::uuid AND "organization_id" = ${organizationId}::uuid
      FOR UPDATE
    `;
    const [record, acceptedBy] = await Promise.all([
      this.prisma.posCheckoutRecord.findFirst({
        include: accountInclude,
        where: { id: checkoutId, organizationId },
      }),
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
        "Trusted payment collector is not active in the organization.",
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
      returnCreditMinor: sumReturnCredit(record.posSaleReturns),
      salesOrderId: record.salesOrderId,
      totalMinor: record.totalMinor,
    };
  }
}

function mapBatch(record: BatchRecord): PaymentBatch {
  return {
    checkoutId: record.checkoutId,
    counterId: record.counterId,
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
    salesSessionId: record.salesSessionId,
    staffId: record.staffId,
    status: record.status,
  };
}

function mapCollection(record: CollectionRecord): PaymentCollection {
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

function mapAccount(record: AccountRecord): PaymentAccount {
  const returnCreditMinor = sumReturnCredit(record.posSaleReturns);
  if (!record.paymentBatch)
    return {
      adjustedPayableMinor: null,
      checkoutId: record.id,
      collections: [],
      cumulativePaidMinor: null,
      currencyCode: "BDT",
      initialPaidMinor: null,
      initialPayments: [],
      legacyPaymentRecorded: false,
      orderNumber: record.salesOrder.orderNumber,
      originalPayableMinor: record.totalMinor,
      organizationId: record.organizationId,
      outstandingMinor: null,
      refundableMinor: null,
      returnCreditMinor,
      settlementStatus: "UNRECORDED",
      status: "UNRECORDED",
      totalMinor: record.totalMinor,
    };
  const collections = record.paymentCollections.map(mapCollection);
  const balance = calculateCumulativePaymentBalance(
    record.paymentBatch.payableMinor,
    record.paymentBatch.paidMinor,
    collections.map((item) => item.amountMinor),
  );
  const settlement = calculateCheckoutSettlement(
    record.paymentBatch.payableMinor,
    balance.paidMinor,
    returnCreditMinor,
  );
  return {
    adjustedPayableMinor: settlement.adjustedPayableMinor,
    checkoutId: record.id,
    collections,
    cumulativePaidMinor: balance.paidMinor,
    currencyCode: "BDT",
    initialPaidMinor: record.paymentBatch.paidMinor,
    initialPayments: record.paymentBatch.lines.map((line) => ({
      amountMinor: line.amountMinor,
      method: line.method,
      reference: line.reference,
    })),
    legacyPaymentRecorded: true,
    orderNumber: record.salesOrder.orderNumber,
    originalPayableMinor: record.paymentBatch.payableMinor,
    organizationId: record.organizationId,
    outstandingMinor: settlement.outstandingMinor,
    refundableMinor: settlement.refundableMinor,
    returnCreditMinor,
    settlementStatus: settlement.status,
    status: settlement.status,
    totalMinor: record.paymentBatch.payableMinor,
  };
}

function sumReturnCredit(
  returns: readonly { totalCreditMinor: number }[],
): number {
  return returns.reduce((total, item) => total + item.totalCreditMinor, 0);
}
