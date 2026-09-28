import {
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type {
  PosRegisterSettlement,
  PosSessionReconciliationSummary,
  SalesSession,
} from "../domain/models.js";
import {
  calculateExpectedRegisterTotals,
  calculateSessionChannelTotals,
  calculateSettlementDiscrepancies,
  validateSettlementSubmission,
} from "../domain/reconciliation-rules.js";
import type { PosSettlementRepository } from "../repositories/pos-settlement-repository.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function assertId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

function normalizeVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationApplicationError(
      "expectedVersion must be a positive integer.",
    );
  }
  return value;
}

export async function getSalesSessionReconciliationSummary(
  repository: PosSettlementRepository,
  input: {
    organizationId: string;
    sessionId: string;
  },
): Promise<PosSessionReconciliationSummary> {
  const organizationId = assertId(input.organizationId, "organizationId");
  const sessionId = assertId(input.sessionId, "sessionId");

  const source = await repository.findSessionReconciliationSource(
    sessionId,
    organizationId,
  );
  if (!source) {
    throw new NotFoundError("Sales session was not found.");
  }

  const channelTotals = calculateSessionChannelTotals({
    collections: source.collections,
    payments: source.payments,
    refunds: source.refunds,
  });

  const expected = calculateExpectedRegisterTotals({
    channelTotals,
    openingFloatMinor: source.session.openingFloatMinor,
  });

  return {
    bankTransferSalesMinor: Number(channelTotals.bankTransferSalesMinor),
    cardSalesMinor: Number(channelTotals.cardSalesMinor),
    cashCollectionsMinor: Number(channelTotals.cashCollectionsMinor),
    cashRefundsMinor: Number(channelTotals.cashRefundsMinor),
    cashSalesMinor: Number(channelTotals.cashSalesMinor),
    counterId: source.counter.id,
    counterName: source.counter.name,
    digitalRefundsMinor: Number(channelTotals.digitalRefundsMinor),
    expectedBankTransferMinor: Number(expected.expectedBankTransferMinor),
    expectedCardMinor: Number(expected.expectedCardMinor),
    expectedCashMinor: Number(expected.expectedCashMinor),
    expectedMobileBankingMinor: Number(expected.expectedMobileBankingMinor),
    expectedTotalMinor: Number(expected.expectedTotalMinor),
    grossSalesMinor: Number(channelTotals.grossSalesMinor),
    mobileBankingSalesMinor: Number(channelTotals.mobileBankingSalesMinor),
    openedAt: source.session.openedAt,
    openingFloatMinor: source.session.openingFloatMinor,
    salesCount: source.salesCount,
    sessionId: source.session.id,
  };
}

export async function closeSalesSessionWithSettlement(
  repository: PosSettlementRepository,
  input: {
    actualBankTransferMinor: number;
    actualCardMinor: number;
    actualCashMinor: number;
    actualMobileBankingMinor: number;
    approvedByUserId?: string | null;
    closedAt: Date;
    closedByUserId: string;
    closingNotes?: string | null;
    denominationBreakdown?: Record<string, number> | null;
    discrepancyReason?: string | null;
    expectedVersion: number;
    organizationId: string;
    sessionId: string;
    settlementId: string;
  },
): Promise<{
  session: SalesSession;
  settlement: PosRegisterSettlement;
}> {
  const organizationId = assertId(input.organizationId, "organizationId");
  const sessionId = assertId(input.sessionId, "sessionId");
  const settlementId = assertId(input.settlementId, "settlementId");
  const closedByUserId = assertId(input.closedByUserId, "closedByUserId");
  const approvedByUserId = input.approvedByUserId
    ? assertId(input.approvedByUserId, "approvedByUserId")
    : null;
  const expectedVersion = normalizeVersion(input.expectedVersion);

  const source = await repository.findSessionReconciliationSource(
    sessionId,
    organizationId,
  );
  if (!source) {
    throw new NotFoundError("Sales session was not found.");
  }

  if (source.session.status !== "OPEN") {
    throw new BusinessRuleError("The sales session is already closed.");
  }

  const existingSettlement = await repository.findSettlementBySessionId(
    sessionId,
    organizationId,
  );
  if (existingSettlement) {
    throw new ConflictError(
      "This sales session already has a register settlement.",
    );
  }

  const channelTotals = calculateSessionChannelTotals({
    collections: source.collections,
    payments: source.payments,
    refunds: source.refunds,
  });

  const expected = calculateExpectedRegisterTotals({
    channelTotals,
    openingFloatMinor: source.session.openingFloatMinor,
  });

  const discrepancies = calculateSettlementDiscrepancies({
    actual: {
      actualBankTransferMinor: input.actualBankTransferMinor,
      actualCardMinor: input.actualCardMinor,
      actualCashMinor: input.actualCashMinor,
      actualMobileBankingMinor: input.actualMobileBankingMinor,
    },
    expected,
  });

  validateSettlementSubmission({
    actualCashMinor: input.actualCashMinor,
    denominationBreakdown: input.denominationBreakdown,
    discrepancyReason: input.discrepancyReason,
    status: discrepancies.status,
    totalDiscrepancyMinor: discrepancies.totalDiscrepancyMinor,
  });

  const settlement: PosRegisterSettlement = {
    actualBankTransferMinor: Number(discrepancies.actualBankTransferMinor),
    actualCardMinor: Number(discrepancies.actualCardMinor),
    actualCashMinor: Number(discrepancies.actualCashMinor),
    actualMobileBankingMinor: Number(discrepancies.actualMobileBankingMinor),
    actualTotalMinor: Number(discrepancies.actualTotalMinor),
    approvedByUserId,
    bankTransferDiscrepancyMinor: Number(
      discrepancies.bankTransferDiscrepancyMinor,
    ),
    cardDiscrepancyMinor: Number(discrepancies.cardDiscrepancyMinor),
    cashDiscrepancyMinor: Number(discrepancies.cashDiscrepancyMinor),
    closedAt: input.closedAt,
    closedByUserId,
    closingNotes: input.closingNotes?.trim() || null,
    counterId: source.counter.id,
    counterName: source.counter.name,
    createdAt: input.closedAt,
    denominationBreakdown: input.denominationBreakdown ?? null,
    discrepancyReason: input.discrepancyReason?.trim() || null,
    expectedBankTransferMinor: Number(expected.expectedBankTransferMinor),
    expectedCardMinor: Number(expected.expectedCardMinor),
    expectedCashMinor: Number(expected.expectedCashMinor),
    expectedMobileBankingMinor: Number(expected.expectedMobileBankingMinor),
    expectedTotalMinor: Number(expected.expectedTotalMinor),
    id: settlementId,
    mobileBankingDiscrepancyMinor: Number(
      discrepancies.mobileBankingDiscrepancyMinor,
    ),
    openingFloatMinor: source.session.openingFloatMinor,
    organizationId,
    salesSessionId: sessionId,
    status: discrepancies.status,
    totalDiscrepancyMinor: Number(discrepancies.totalDiscrepancyMinor),
  };

  const updatedSession: SalesSession = {
    ...source.session,
    closedAt: input.closedAt,
    status: "CLOSED",
    version: source.session.version + 1,
  };

  const saved = await repository.saveSettlementAndCloseSession({
    expectedVersion,
    session: updatedSession,
    settlement,
  });

  if (!saved) {
    throw new ConcurrencyError(
      "Open sales session was not found or changed.",
    );
  }

  return saved;
}
