import { assertEmptyActiveCart, lockSession } from "./cart-lock.js";
import {
  ConflictError,
  type PosRegisterSettlement,
  type PosSettlementRepository,
  type SalesSession,
  type SessionCollectionLineData,
  type SessionPaymentLineData,
  type SessionReconciliationSource,
  type SessionRefundLineData,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type SessionRecord = Prisma.SalesSessionGetPayload<{
  include: {
    carts: { include: { _count: { select: { lines: true } } } };
    counter: { select: { id: true; name: true } };
  };
}>;

type SettlementRecord = Prisma.PosRegisterSettlementGetPayload<object>;

type PosSettlementPrismaClient = Pick<
  PrismaClient,
  | "$transaction"
  | "$queryRaw"
  | "posCart"
  | "paymentBatch"
  | "paymentCollection"
  | "paymentRefund"
  | "posCheckoutRecord"
  | "posRegisterSettlement"
  | "salesSession"
>;

export class PrismaPosSettlementRepository implements PosSettlementRepository {
  constructor(private readonly prisma: PosSettlementPrismaClient) {}

  async findSessionReconciliationSource(
    sessionId: string,
    organizationId: string,
  ): Promise<SessionReconciliationSource | null> {
    await lockSession(this.prisma, sessionId, organizationId);
    const sessionRecord = await this.prisma.salesSession.findFirst({
      include: {
        carts: {
          include: { _count: { select: { lines: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
        counter: { select: { id: true, name: true } },
      },
      where: { id: sessionId, organizationId },
    });

    if (!sessionRecord || sessionRecord.carts.length === 0) {
      return null;
    }

    const checkoutRecords = await this.prisma.posCheckoutRecord.findMany({
      select: {
        id: true,
        staffId: true,
        totalMinor: true,
        staff: { select: { name: true, email: true } },
        posSaleReturns: { select: { totalCreditMinor: true } },
      },
      where: { organizationId, salesSessionId: sessionId },
    });

    const staffByCheckout = new Map(
      checkoutRecords.map((c) => [c.id, c.staffId]),
    );
    const checkoutIds = checkoutRecords.map((c) => c.id);

    const paymentBatches = await this.prisma.paymentBatch.findMany({
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
          select: { amountMinor: true, method: true },
        },
      },
      where: {
        OR: [
          { salesSessionId: sessionId },
          ...(checkoutIds.length > 0
            ? [{ checkoutId: { in: checkoutIds } }]
            : []),
        ],
        organizationId,
      },
    });

    const collections = await this.prisma.paymentCollection.findMany({
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
          select: { amountMinor: true, method: true },
        },
      },
      where: {
        OR: [
          ...(checkoutIds.length > 0
            ? [{ checkoutId: { in: checkoutIds } }]
            : []),
          { paymentBatch: { salesSessionId: sessionId } },
        ],
        organizationId,
      },
    });

    const refunds =
      checkoutIds.length > 0
        ? await this.prisma.paymentRefund.findMany({
            include: {
              lines: {
                orderBy: { lineNumber: "asc" },
                select: { amountMinor: true, method: true },
              },
            },
            where: {
              checkoutId: { in: checkoutIds },
              organizationId,
            },
          })
        : [];

    const payments: SessionPaymentLineData[] = paymentBatches.flatMap((batch) =>
      batch.lines.map((line) => ({
        staffId: batch.checkoutId
          ? staffByCheckout.get(batch.checkoutId)
          : (batch.staffId ?? undefined),
        amountMinor: line.amountMinor,
        method: line.method,
      })),
    );

    const collectionLines: SessionCollectionLineData[] = collections.flatMap(
      (collection) =>
        collection.lines.map((line) => ({
          staffId: staffByCheckout.get(collection.checkoutId),
          amountMinor: line.amountMinor,
          method: line.method,
        })),
    );

    const refundLines: SessionRefundLineData[] = refunds.flatMap((refund) =>
      refund.lines.map((line) => ({
        staffId: refund.checkoutId
          ? staffByCheckout.get(refund.checkoutId)
          : undefined,
        amountMinor: line.amountMinor,
        method: line.method,
      })),
    );

    const salesCount = Math.max(checkoutRecords.length, paymentBatches.length);

    return {
      hasActiveNonEmptyCart: sessionRecord.carts.some(
        (cart) => cart.status === "ACTIVE" && cart._count.lines > 0,
      ),
      sales: checkoutRecords.map((c) => ({
        staffId: c.staffId,
        staffName: c.staff.name ?? c.staff.email,
        totalMinor: c.totalMinor,
      })),
      returns: checkoutRecords.flatMap((c) =>
        c.posSaleReturns.map((r) => ({
          staffId: c.staffId,
          amountMinor: r.totalCreditMinor,
        })),
      ),
      collections: collectionLines,
      counter: {
        id: sessionRecord.counter.id,
        name: sessionRecord.counter.name,
      },
      payments,
      refunds: refundLines,
      salesCount,
      session: mapSession(sessionRecord),
    };
  }

  async findSettlementBySessionId(
    sessionId: string,
    organizationId: string,
  ): Promise<PosRegisterSettlement | null> {
    const record = await this.prisma.posRegisterSettlement.findFirst({
      where: { organizationId, salesSessionId: sessionId },
    });
    return record ? mapSettlement(record) : null;
  }

  async saveSettlementAndCloseSession(params: {
    expectedVersion: number;
    session: SalesSession;
    settlement: PosRegisterSettlement;
  }): Promise<{
    session: SalesSession;
    settlement: PosRegisterSettlement;
  } | null> {
    const executeOperation = async (tx: PosSettlementPrismaClient) => {
      await lockSession(tx, params.session.id, params.session.organizationId);
      await assertEmptyActiveCart(
        tx,
        params.session.id,
        params.session.organizationId,
      );
      const updateResult = await tx.salesSession.updateMany({
        data: {
          closedAt: params.settlement.closedAt,
          status: "CLOSED",
          version: { increment: 1 },
        },
        where: {
          id: params.session.id,
          organizationId: params.session.organizationId,
          status: "OPEN",
          version: params.expectedVersion,
        },
      });

      if (updateResult.count === 0) {
        return null;
      }

      await tx.posCart.updateMany({
        where: {
          salesSessionId: params.session.id,
          organizationId: params.session.organizationId,
          status: "ACTIVE",
        },
        data: { status: "ABANDONED", version: { increment: 1 } },
      });
      try {
        const created = await tx.posRegisterSettlement.create({
          data: {
            actualBankTransferMinor: params.settlement.actualBankTransferMinor,
            actualCardMinor: params.settlement.actualCardMinor,
            actualCashMinor: params.settlement.actualCashMinor,
            actualMobileBankingMinor:
              params.settlement.actualMobileBankingMinor,
            actualTotalMinor: params.settlement.actualTotalMinor,
            approvedByUserId: params.settlement.approvedByUserId,
            bankTransferDiscrepancyMinor:
              params.settlement.bankTransferDiscrepancyMinor,
            cardDiscrepancyMinor: params.settlement.cardDiscrepancyMinor,
            cashDiscrepancyMinor: params.settlement.cashDiscrepancyMinor,
            closedAt: params.settlement.closedAt,
            closedByUserId: params.settlement.closedByUserId,
            closingNotes: params.settlement.closingNotes,
            counterId: params.settlement.counterId,
            denominationBreakdown:
              (params.settlement
                .denominationBreakdown as Prisma.InputJsonValue) ?? undefined,
            discrepancyReason: params.settlement.discrepancyReason,
            expectedBankTransferMinor:
              params.settlement.expectedBankTransferMinor,
            expectedCardMinor: params.settlement.expectedCardMinor,
            expectedCashMinor: params.settlement.expectedCashMinor,
            expectedMobileBankingMinor:
              params.settlement.expectedMobileBankingMinor,
            expectedTotalMinor: params.settlement.expectedTotalMinor,
            id: params.settlement.id,
            mobileBankingDiscrepancyMinor:
              params.settlement.mobileBankingDiscrepancyMinor,
            openingFloatMinor: params.settlement.openingFloatMinor,
            organizationId: params.settlement.organizationId,
            salesSessionId: params.settlement.salesSessionId,
            status: params.settlement.status,
            totalDiscrepancyMinor: params.settlement.totalDiscrepancyMinor,
          },
        });

        const updatedSession = await tx.salesSession.findUniqueOrThrow({
          include: {
            carts: {
              include: { _count: { select: { lines: true } } },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            },
            counter: { select: { id: true, name: true } },
          },
          where: { id: params.session.id },
        });

        return {
          session: mapSession(updatedSession),
          settlement: mapSettlement(created),
        };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          (error as { code?: string }).code === "P2002"
        ) {
          throw new ConflictError(
            "Settlement has already been recorded for this session.",
            error,
          );
        }
        throw error;
      }
    };

    if (
      "$transaction" in this.prisma &&
      typeof this.prisma.$transaction === "function"
    ) {
      return (this.prisma as PrismaClient).$transaction(async (tx) =>
        executeOperation(tx as PosSettlementPrismaClient),
      );
    }

    return executeOperation(this.prisma);
  }
}

function mapSession(record: SessionRecord): SalesSession {
  const cart =
    record.carts.find((cart) => cart.status === "ACTIVE") ?? record.carts[0];
  if (!cart) throw new Error("Sales session cart is missing.");
  return {
    cartId: cart.id,
    closedAt: record.closedAt,
    counterId: record.counterId,
    createdAt: record.createdAt,
    id: record.id,
    openedAt: record.openedAt,
    openedByUserId: record.openedByUserId,
    openingFloatMinor: record.openingFloatMinor ?? 0,
    organizationId: record.organizationId,
    status: record.status,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

function mapSettlement(record: SettlementRecord): PosRegisterSettlement {
  return {
    actualBankTransferMinor: record.actualBankTransferMinor,
    actualCardMinor: record.actualCardMinor,
    actualCashMinor: record.actualCashMinor,
    actualMobileBankingMinor: record.actualMobileBankingMinor,
    actualTotalMinor: record.actualTotalMinor,
    approvedByUserId: record.approvedByUserId,
    bankTransferDiscrepancyMinor: record.bankTransferDiscrepancyMinor,
    cardDiscrepancyMinor: record.cardDiscrepancyMinor,
    cashDiscrepancyMinor: record.cashDiscrepancyMinor,
    closedAt: record.closedAt,
    closedByUserId: record.closedByUserId,
    closingNotes: record.closingNotes,
    counterId: record.counterId,
    createdAt: record.createdAt,
    denominationBreakdown: record.denominationBreakdown as Record<
      string,
      number
    > | null,
    discrepancyReason: record.discrepancyReason,
    expectedBankTransferMinor: record.expectedBankTransferMinor,
    expectedCardMinor: record.expectedCardMinor,
    expectedCashMinor: record.expectedCashMinor,
    expectedMobileBankingMinor: record.expectedMobileBankingMinor,
    expectedTotalMinor: record.expectedTotalMinor,
    id: record.id,
    mobileBankingDiscrepancyMinor: record.mobileBankingDiscrepancyMinor,
    openingFloatMinor: record.openingFloatMinor,
    organizationId: record.organizationId,
    salesSessionId: record.salesSessionId,
    status: record.status,
    totalDiscrepancyMinor: record.totalDiscrepancyMinor,
  };
}
