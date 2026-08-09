import {
  calculateCheckoutSettlement,
  type CreatePosSaleReturnRecord,
  type PosReturnAccount,
  type PosReturnPreparation,
  type PosReturnRepository,
  type PosSaleReturn,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type ReturnPrismaClient = Pick<
  PrismaClient,
  "$queryRaw" | "posCheckoutRecord" | "posSaleReturn" | "stockLocation" | "user"
>;

const returnInclude = {
  acceptedBy: { select: { email: true, name: true } },
  destinationLocation: { select: { name: true } },
  lines: { orderBy: { lineNumber: "asc" } },
  receipt: { select: { id: true, receiptNumber: true } },
} as const;

const checkoutInclude = {
  organization: true,
  paymentBatch: { select: { paidMinor: true, payableMinor: true } },
  paymentCollections: { select: { amountMinor: true } },
  posSaleReturns: {
    include: returnInclude,
    orderBy: { returnedAt: "asc" },
  },
  receipt: { select: { receiptNumber: true } },
  salesOrder: {
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  },
} as const;

type ReturnRecord = Prisma.PosSaleReturnGetPayload<{
  include: typeof returnInclude;
}>;
type CheckoutRecord = Prisma.PosCheckoutRecordGetPayload<{
  include: typeof checkoutInclude;
}>;

export class PrismaPosReturnRepository implements PosReturnRepository {
  constructor(private readonly prisma: ReturnPrismaClient) {}

  async create(record: CreatePosSaleReturnRecord): Promise<PosSaleReturn> {
    const { lines, receiptId, receiptNumber, ...saleReturn } = record;
    const created = await this.prisma.posSaleReturn.create({
      data: {
        ...saleReturn,
        lines: {
          create: lines.map((line, index) => ({
            ...line,
            createdAt: record.createdAt,
            lineNumber: index + 1,
            organizationId: record.organizationId,
          })),
        },
      },
      include: {
        acceptedBy: returnInclude.acceptedBy,
        destinationLocation: returnInclude.destinationLocation,
        lines: returnInclude.lines,
      },
    });
    return mapReturn({
      ...created,
      receipt: { id: receiptId, receiptNumber },
    });
  }

  async findAccount(
    checkoutId: string,
    organizationId: string,
  ): Promise<PosReturnAccount | null> {
    const record = await this.findCheckout(checkoutId, organizationId);
    return record ? mapAccount(record) : null;
  }

  async prepare(input: {
    acceptedByUserId: string;
    checkoutId: string;
    destinationLocationId: string;
    organizationId: string;
  }): Promise<PosReturnPreparation | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "pos_checkout_records"
      WHERE "id" = ${input.checkoutId}::uuid
        AND "organization_id" = ${input.organizationId}::uuid
      FOR UPDATE
    `;
    const [record, acceptedBy, destination] = await Promise.all([
      this.findCheckout(input.checkoutId, input.organizationId),
      this.prisma.user.findFirst({
        select: { email: true, name: true },
        where: {
          id: input.acceptedByUserId,
          status: "ACTIVE",
          memberships: {
            some: { organizationId: input.organizationId, status: "ACTIVE" },
          },
        },
      }),
      this.prisma.stockLocation.findFirst({
        select: {
          id: true,
          isSellable: true,
          name: true,
          status: true,
          type: true,
        },
        where: {
          id: input.destinationLocationId,
          organizationId: input.organizationId,
        },
      }),
    ]);
    if (!record) return null;
    if (!acceptedBy) {
      throw new Error(
        "Trusted return staff is not active in the organization.",
      );
    }
    return {
      acceptedByName: acceptedBy.name ?? acceptedBy.email,
      checkoutId: record.id,
      collections: record.paymentCollections,
      destination,
      initialPayment: record.paymentBatch,
      order: {
        fulfillmentMovementId: record.salesOrder.fulfillmentMovementId,
        id: record.salesOrder.id,
        lines: record.salesOrder.lines.map((line) => ({
          colorSnapshot: line.colorSnapshot,
          id: line.id,
          lineTotalMinor: line.lineTotalMinor,
          productNameSnapshot: line.productNameSnapshot,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          sizeSnapshot: line.sizeSnapshot,
          skuSnapshot: line.skuSnapshot,
          unitPriceMinor: line.unitPriceMinor,
        })),
        orderNumber: record.salesOrder.orderNumber,
        status: record.salesOrder.status,
        totalMinor: record.salesOrder.totalMinor,
      },
      organization: {
        addressLine1: record.organization.addressLine1,
        addressLine2: record.organization.addressLine2,
        city: record.organization.city,
        district: record.organization.district,
        email: record.organization.email,
        name: record.organization.name,
        phone: record.organization.phone,
        postalCode: record.organization.postalCode,
      },
      organizationId: record.organizationId,
      originalReceiptNumber: record.receipt?.receiptNumber ?? null,
      returns: record.posSaleReturns.map(mapReturn),
    };
  }

  private findCheckout(checkoutId: string, organizationId: string) {
    return this.prisma.posCheckoutRecord.findFirst({
      include: checkoutInclude,
      where: { id: checkoutId, organizationId },
    });
  }
}

function mapReturn(record: ReturnRecord): PosSaleReturn {
  return {
    acceptedByName: record.acceptedBy.name ?? record.acceptedBy.email,
    acceptedByUserId: record.acceptedByUserId,
    checkoutId: record.checkoutId,
    createdAt: record.createdAt,
    destinationLocationId: record.destinationLocationId,
    destinationLocationName: record.destinationLocation.name,
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    inventoryMovementId: record.inventoryMovementId,
    lines: record.lines.map((line) => ({
      colorSnapshot: line.colorSnapshot,
      id: line.id,
      lineCreditMinor: line.lineCreditMinor,
      lineNumber: line.lineNumber,
      organizationId: line.organizationId,
      productNameSnapshot: line.productNameSnapshot,
      productVariantId: line.productVariantId,
      quantity: line.quantity,
      salesOrderLineId: line.salesOrderLineId,
      sizeSnapshot: line.sizeSnapshot,
      skuSnapshot: line.skuSnapshot,
      unitPriceMinor: line.unitPriceMinor,
    })),
    organizationId: record.organizationId,
    reasonCode: record.reasonCode,
    reasonNote: record.reasonNote,
    receiptId: record.receipt?.id ?? "",
    receiptNumber: record.receipt?.receiptNumber ?? "",
    requestSignature: record.requestSignature,
    returnedAt: record.returnedAt,
    salesOrderId: record.salesOrderId,
    totalCreditMinor: record.totalCreditMinor,
  };
}

function mapAccount(record: CheckoutRecord): PosReturnAccount {
  const returns = record.posSaleReturns.map(mapReturn);
  const returnCreditMinor = returns.reduce(
    (total, item) => total + item.totalCreditMinor,
    0,
  );
  const returnedByLine = new Map<string, number>();
  for (const saleReturn of returns) {
    for (const line of saleReturn.lines) {
      returnedByLine.set(
        line.salesOrderLineId,
        (returnedByLine.get(line.salesOrderLineId) ?? 0) + line.quantity,
      );
    }
  }
  const cumulativeReceivedMinor = record.paymentBatch
    ? record.paymentBatch.paidMinor +
      record.paymentCollections.reduce(
        (total, collection) => total + collection.amountMinor,
        0,
      )
    : null;
  const settlement =
    cumulativeReceivedMinor === null
      ? null
      : calculateCheckoutSettlement(
          record.salesOrder.totalMinor,
          cumulativeReceivedMinor,
          returnCreditMinor,
        );
  return {
    adjustedPayableMinor: settlement?.adjustedPayableMinor ?? null,
    checkoutId: record.id,
    cumulativeReceivedMinor,
    legacyPaymentRecorded: record.paymentBatch !== null,
    lines: record.salesOrder.lines.map((line) => {
      const returnedQuantity = returnedByLine.get(line.id) ?? 0;
      return {
        colorSnapshot: line.colorSnapshot,
        originalLineTotalMinor: line.lineTotalMinor,
        productNameSnapshot: line.productNameSnapshot,
        productVariantId: line.productVariantId,
        returnableQuantity: line.quantity - returnedQuantity,
        returnedQuantity,
        salesOrderLineId: line.id,
        sizeSnapshot: line.sizeSnapshot,
        skuSnapshot: line.skuSnapshot,
        soldQuantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
      };
    }),
    orderNumber: record.salesOrder.orderNumber,
    organizationId: record.organizationId,
    originalTotalMinor: record.salesOrder.totalMinor,
    outstandingMinor: settlement?.outstandingMinor ?? null,
    refundableMinor: settlement?.refundableMinor ?? null,
    returnCreditMinor,
    returns,
    settlementStatus: settlement?.status ?? "UNRECORDED",
  };
}
