import type {
  CreatePaymentBatchRecord,
  PaymentBatch,
  PaymentRepository,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type PaymentPrismaClient = Pick<PrismaClient, "paymentBatch">;
const paymentInclude = { lines: { orderBy: { lineNumber: "asc" } } } as const;
type PaymentRecord = Prisma.PaymentBatchGetPayload<{
  include: typeof paymentInclude;
}>;

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PaymentPrismaClient) {}

  async create(record: CreatePaymentBatchRecord): Promise<PaymentBatch> {
    const { lines, ...batch } = record;
    return mapPayment(
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
        include: paymentInclude,
      }),
    );
  }
}

function mapPayment(record: PaymentRecord): PaymentBatch {
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
