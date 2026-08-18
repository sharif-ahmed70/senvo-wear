import {
  ConflictError,
  NotFoundError,
  type OnlinePaymentAttempt,
  type OnlinePaymentOrderFacts,
  type OnlinePaymentProjection,
  type OnlinePaymentRepository,
  type PaymentReconciliation,
  type ProviderRefund,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type OnlinePaymentClient = Pick<
  PrismaClient,
  | "$executeRaw"
  | "$queryRaw"
  | "onlinePaymentAttempt"
  | "paymentBatch"
  | "paymentReconciliation"
  | "paymentRefund"
  | "paymentRefundLine"
  | "providerNotification"
  | "providerRefund"
  | "salesOrder"
>;

const attemptInclude = {
  reconciliations: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
  refunds: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
} satisfies Prisma.OnlinePaymentAttemptInclude;

type AttemptRecord = Prisma.OnlinePaymentAttemptGetPayload<{
  include: typeof attemptInclude;
}>;

export class PrismaOnlinePaymentRepository implements OnlinePaymentRepository {
  constructor(private readonly prisma: OnlinePaymentClient) {}

  async createAttempt(
    record: Parameters<OnlinePaymentRepository["createAttempt"]>[0],
  ) {
    try {
      return mapAttempt(
        await this.prisma.onlinePaymentAttempt.create({
          data: {
            ...record,
            provider: "SSLCOMMERZ",
            resolutionStatus: "NORMAL",
            status: "CREATED",
            updatedAt: record.createdAt,
          },
          include: attemptInclude,
        }),
      );
    } catch (error) {
      mapUniqueConflict(error, "Payment attempt already exists.");
    }
  }

  async createProviderRefund(
    record: Parameters<OnlinePaymentRepository["createProviderRefund"]>[0],
  ) {
    try {
      return mapRefund(
        await this.prisma.providerRefund.create({
          data: { ...record, status: "CREATED", updatedAt: record.createdAt },
        }),
      );
    } catch (error) {
      mapUniqueConflict(error, "Provider refund already exists.");
    }
  }

  async createReconciliation(
    record: Parameters<OnlinePaymentRepository["createReconciliation"]>[0],
  ) {
    return mapReconciliation(
      await this.prisma.paymentReconciliation.create({ data: record }),
    );
  }

  async findAttemptById(id: string, organizationId: string) {
    const record = await this.prisma.onlinePaymentAttempt.findFirst({
      include: attemptInclude,
      where: { id, organizationId },
    });
    return record ? mapAttempt(record) : null;
  }

  async findAttemptByIdempotencyKey(
    organizationId: string,
    salesOrderId: string,
    idempotencyKey: string,
  ) {
    const record = await this.prisma.onlinePaymentAttempt.findUnique({
      include: attemptInclude,
      where: {
        organizationId_salesOrderId_idempotencyKey: {
          idempotencyKey,
          organizationId,
          salesOrderId,
        },
      },
    });
    return record ? mapAttempt(record) : null;
  }

  async findAttemptByProviderTransactionId(providerTransactionId: string) {
    const record = await this.prisma.onlinePaymentAttempt.findFirst({
      include: attemptInclude,
      where: { provider: "SSLCOMMERZ", providerTransactionId },
    });
    return record ? mapAttempt(record) : null;
  }

  async findAttemptByPublicToken(publicToken: string) {
    const record = await this.prisma.onlinePaymentAttempt.findUnique({
      include: attemptInclude,
      where: { publicToken },
    });
    return record ? mapAttempt(record) : null;
  }

  async findLatestAttemptForOrder(
    organizationId: string,
    salesOrderId: string,
  ) {
    const record = await this.prisma.onlinePaymentAttempt.findFirst({
      include: attemptInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      where: { organizationId, salesOrderId },
    });
    return record ? mapAttempt(record) : null;
  }

  async findProviderRefundById(id: string, organizationId: string) {
    const record = await this.prisma.providerRefund.findFirst({
      where: { id, organizationId },
    });
    return record ? mapRefund(record) : null;
  }

  async findProviderRefundByIdempotencyKey(
    organizationId: string,
    paymentAttemptId: string,
    idempotencyKey: string,
  ) {
    const record = await this.prisma.providerRefund.findUnique({
      where: {
        organizationId_paymentAttemptId_idempotencyKey: {
          idempotencyKey,
          organizationId,
          paymentAttemptId,
        },
      },
    });
    return record ? mapRefund(record) : null;
  }

  async getOrderFacts(
    organizationId: string,
    salesOrderId: string,
  ): Promise<OnlinePaymentOrderFacts | null> {
    const order = await this.prisma.salesOrder.findFirst({
      include: { commerceProfile: true, inventoryReservation: true },
      where: { id: salesOrderId, organizationId },
    });
    if (
      !order ||
      order.commerceProfile?.paymentPreference !== "ONLINE_PAYMENT"
    ) {
      return null;
    }
    if (
      order.status !== "RESERVED" &&
      order.status !== "CONFIRMED" &&
      order.status !== "CANCELLED" &&
      order.status !== "FULFILLED"
    ) {
      return null;
    }
    const reservation = order.inventoryReservation;
    if (!reservation) return null;
    return {
      currencyCode: "BDT",
      customerEmail: order.customerEmail,
      customerName: order.customerName ?? "SENVO customer",
      customerPhone: order.customerPhone ?? "",
      orderNumber: order.orderNumber,
      paymentPreference: "ONLINE_PAYMENT",
      reservationExpiresAt: reservation.expiresAt,
      reservationStatus: reservation.status,
      salesOrderId: order.id,
      salesOrderStatus: order.status,
      salesOrderVersion: order.version,
      totalMinor: order.totalMinor,
    };
  }

  async getProjection(
    organizationId: string,
    salesOrderId: string,
  ): Promise<OnlinePaymentProjection | null> {
    const record = await this.prisma.onlinePaymentAttempt.findFirst({
      include: attemptInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      where: { organizationId, salesOrderId },
    });
    if (!record) return null;
    return {
      attempt: mapAttempt(record),
      reconciliations: record.reconciliations.map(mapReconciliation),
      refunds: record.refunds.map(mapRefund),
    };
  }

  async lockAttempt(id: string, organizationId: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "online_payment_attempts"
      WHERE "id" = ${id}::uuid AND "organization_id" = ${organizationId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0)
      throw new NotFoundError("Payment attempt was not found.");
  }

  async recordNotification(
    record: Parameters<OnlinePaymentRepository["recordNotification"]>[0],
  ) {
    try {
      const created = await this.prisma.providerNotification.create({
        data: {
          ...record,
          processingStatus: "RECEIVED",
          provider: "SSLCOMMERZ",
        },
      });
      return {
        id: created.id,
        replayed: false,
        status: created.processingStatus,
      };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const existing = await this.prisma.providerNotification.findUnique({
        where: {
          organizationId_provider_dedupeKey: {
            dedupeKey: record.dedupeKey,
            organizationId: record.organizationId,
            provider: "SSLCOMMERZ",
          },
        },
      });
      if (!existing) throw error;
      return {
        id: existing.id,
        replayed: true,
        status: existing.processingStatus,
      };
    }
  }

  async settleConfirmedPayment(
    record: Parameters<OnlinePaymentRepository["settleConfirmedPayment"]>[0],
  ) {
    const attempt = await this.prisma.onlinePaymentAttempt.findFirst({
      include: attemptInclude,
      where: {
        id: record.paymentAttemptId,
        organizationId: record.organizationId,
      },
    });
    if (!attempt) throw new NotFoundError("Payment attempt was not found.");
    if (attempt.status === "SUCCEEDED") return mapAttempt(attempt);
    await this.prisma.paymentBatch.create({
      data: {
        checkoutId: null,
        counterId: null,
        currencyCode: attempt.currencyCode,
        id: record.paymentBatchId,
        idempotencyKey: `provider:${attempt.idempotencyKey}`.slice(0, 64),
        lines: {
          create: {
            amountMinor: attempt.amountMinor,
            createdAt: record.confirmedAt,
            id: record.paymentLineId,
            lineNumber: 1,
            method: "ONLINE_GATEWAY",
            organizationId: attempt.organizationId,
            reference: record.bankTransactionId,
          },
        },
        organizationId: attempt.organizationId,
        outstandingMinor: 0,
        paidMinor: attempt.amountMinor,
        payableMinor: attempt.amountMinor,
        paymentAttemptId: attempt.id,
        requestSignature: record.requestSignature,
        salesOrderId: attempt.salesOrderId,
        salesSessionId: null,
        staffId: null,
        status: "PAID",
      },
    });
    return mapAttempt(
      await this.prisma.onlinePaymentAttempt.update({
        data: {
          bankTransactionId: record.bankTransactionId,
          confirmedAt: record.confirmedAt,
          failureCode: null,
          resolutionStatus: record.resolutionStatus,
          status: "SUCCEEDED",
          validationId: record.validationId,
          version: { increment: 1 },
        },
        include: attemptInclude,
        where: { id: attempt.id },
      }),
    );
  }

  async updateAttemptSession(
    record: Parameters<OnlinePaymentRepository["updateAttemptSession"]>[0],
  ) {
    return mapAttempt(
      await this.prisma.onlinePaymentAttempt.update({
        data: {
          expiresAt: record.expiresAt,
          failureCode: null,
          providerSessionId: record.sessionId,
          redirectUrl: record.redirectUrl,
          status: "SESSION_READY",
          version: { increment: 1 },
        },
        include: attemptInclude,
        where: { id: record.id, organizationId: record.organizationId },
      }),
    );
  }

  async updateAttemptStatus(
    record: Parameters<OnlinePaymentRepository["updateAttemptStatus"]>[0],
  ) {
    return mapAttempt(
      await this.prisma.onlinePaymentAttempt.update({
        data: {
          failureCode: record.failureCode,
          status: record.status,
          version: { increment: 1 },
        },
        include: attemptInclude,
        where: { id: record.id, organizationId: record.organizationId },
      }),
    );
  }

  async updateNotification(
    record: Parameters<OnlinePaymentRepository["updateNotification"]>[0],
  ): Promise<void> {
    await this.prisma.providerNotification.update({
      data: {
        errorCode: record.errorCode,
        processedAt: record.processedAt,
        processingStatus: record.status,
      },
      where: { id: record.id },
    });
  }

  async updateProviderRefund(
    record: Parameters<OnlinePaymentRepository["updateProviderRefund"]>[0],
  ) {
    return mapRefund(
      await this.prisma.providerRefund.update({
        data: {
          confirmedAt: record.confirmedAt,
          failureCode: record.failureCode,
          providerRefundReference: record.providerRefundReference,
          status: record.status,
        },
        where: { id: record.id, organizationId: record.organizationId },
      }),
    );
  }

  async appendConfirmedProviderRefund(
    record: Parameters<
      OnlinePaymentRepository["appendConfirmedProviderRefund"]
    >[0],
  ) {
    const refund = await this.prisma.providerRefund.findFirst({
      include: { paymentAttempt: true, paymentRefund: true },
      where: {
        id: record.providerRefundId,
        organizationId: record.organizationId,
      },
    });
    if (!refund) throw new NotFoundError("Provider refund was not found.");
    if (!refund.paymentRefund) {
      await this.prisma.paymentRefund.create({
        data: {
          acceptedByUserId: refund.requestedByUserId,
          amountMinor: refund.amountMinor,
          checkoutId: null,
          createdAt: record.confirmedAt,
          id: record.paymentRefundId,
          idempotencyKey: refund.idempotencyKey,
          issuedAt: record.confirmedAt,
          lines: {
            create: {
              amountMinor: refund.amountMinor,
              createdAt: record.confirmedAt,
              id: record.paymentRefundLineId,
              lineNumber: 1,
              method: "ONLINE_GATEWAY",
              organizationId: refund.organizationId,
              reference: refund.providerRefundReference,
            },
          },
          organizationId: refund.organizationId,
          providerRefundId: refund.id,
          requestSignature: refund.requestSignature,
          salesOrderId: refund.salesOrderId,
        },
      });
    }
    return mapRefund(
      await this.prisma.providerRefund.update({
        data: {
          confirmedAt: record.confirmedAt,
          failureCode: null,
          status: "CONFIRMED",
        },
        where: { id: refund.id },
      }),
    );
  }

  async totalReservedRefundMinor(
    organizationId: string,
    paymentAttemptId: string,
  ): Promise<number> {
    const result = await this.prisma.providerRefund.aggregate({
      _sum: { amountMinor: true },
      where: {
        organizationId,
        paymentAttemptId,
        status: { in: ["CREATED", "PENDING", "CONFIRMED"] },
      },
    });
    return result._sum.amountMinor ?? 0;
  }
}

function mapAttempt(record: AttemptRecord): OnlinePaymentAttempt {
  return {
    amountMinor: record.amountMinor,
    bankTransactionId: record.bankTransactionId,
    confirmedAt: record.confirmedAt,
    createdAt: record.createdAt,
    currencyCode: "BDT",
    expiresAt: record.expiresAt,
    failureCode: record.failureCode,
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    organizationId: record.organizationId,
    provider: record.provider,
    providerSessionId: record.providerSessionId,
    providerTransactionId: record.providerTransactionId,
    publicToken: record.publicToken,
    redirectUrl: record.redirectUrl,
    requestSignature: record.requestSignature,
    resolutionStatus: record.resolutionStatus,
    salesOrderId: record.salesOrderId,
    status: record.status,
    updatedAt: record.updatedAt,
    validationId: record.validationId,
    version: record.version,
  };
}

function mapRefund(record: {
  amountMinor: number;
  confirmedAt: Date | null;
  createdAt: Date;
  currencyCode: string;
  failureCode: string | null;
  id: string;
  idempotencyKey: string;
  organizationId: string;
  paymentAttemptId: string;
  providerRefundReference: string | null;
  providerRefundTransactionId: string;
  requestSignature: string;
  requestedByUserId: string;
  salesOrderId: string;
  status: ProviderRefund["status"];
  updatedAt: Date;
}): ProviderRefund {
  return { ...record, currencyCode: "BDT" };
}

function mapReconciliation(record: {
  createdAt: Date;
  expectedAmountMinor: number;
  expectedCurrencyCode: string;
  expectedStatus: PaymentReconciliation["expectedStatus"];
  id: string;
  observedAmountMinor: number | null;
  observedCurrencyCode: string | null;
  observedStatus: string;
  organizationId: string;
  outcome: PaymentReconciliation["outcome"];
  paymentAttemptId: string;
  providerReference: string | null;
  reasonCode: string | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
}): PaymentReconciliation {
  return { ...record, expectedCurrencyCode: "BDT" };
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function mapUniqueConflict(error: unknown, message: string): never {
  if (isUniqueConflict(error)) throw new ConflictError(message);
  throw error;
}
