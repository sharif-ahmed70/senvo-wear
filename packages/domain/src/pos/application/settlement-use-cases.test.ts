import { describe, expect, it } from "vitest";
import {
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  NotFoundError,
} from "../../errors.js";
import type { PosRegisterSettlement, SalesSession } from "../domain/models.js";
import type {
  PosSettlementRepository,
  SessionReconciliationSource,
} from "../repositories/pos-settlement-repository.js";
import {
  closeSalesSessionWithSettlement,
  getSalesSessionReconciliationSummary,
} from "./settlement-use-cases.js";

const orgId = "10000000-0000-4000-8000-000000000001";
const sessionId = "20000000-0000-4000-8000-000000000002";
const counterId = "30000000-0000-4000-8000-000000000003";
const userId = "40000000-0000-4000-8000-000000000004";
const settlementId = "50000000-0000-4000-8000-000000000005";
const managerId = "60000000-0000-4000-8000-000000000006";

class FakeSettlementRepository implements PosSettlementRepository {
  source: SessionReconciliationSource | null = null;
  existingSettlement: PosRegisterSettlement | null = null;
  savedSettlement: PosRegisterSettlement | null = null;
  savedSession: SalesSession | null = null;
  failConcurrency = false;

  findSessionReconciliationSource(
    id: string,
    org: string,
  ): Promise<SessionReconciliationSource | null> {
    if (
      this.source &&
      this.source.session.id === id &&
      this.source.session.organizationId === org
    ) {
      return Promise.resolve(this.source);
    }
    return Promise.resolve(null);
  }

  findSettlementBySessionId(
    id: string,
    org: string,
  ): Promise<PosRegisterSettlement | null> {
    if (
      this.existingSettlement &&
      this.existingSettlement.salesSessionId === id &&
      this.existingSettlement.organizationId === org
    ) {
      return Promise.resolve(this.existingSettlement);
    }
    return Promise.resolve(null);
  }

  saveSettlementAndCloseSession(params: {
    expectedVersion: number;
    session: SalesSession;
    settlement: PosRegisterSettlement;
  }): Promise<{
    session: SalesSession;
    settlement: PosRegisterSettlement;
  } | null> {
    if (this.failConcurrency) {
      return Promise.resolve(null);
    }
    if (this.source && this.source.session.version !== params.expectedVersion) {
      return Promise.resolve(null);
    }
    this.savedSession = params.session;
    this.savedSettlement = params.settlement;
    return Promise.resolve({
      session: params.session,
      settlement: params.settlement,
    });
  }
}

function createSource(
  overrides: Partial<SalesSession> = {},
): SessionReconciliationSource {
  const openedAt = new Date("2026-09-28T09:00:00.000Z");
  return {
    collections: [{ amountMinor: 50000, method: "CASH" }],
    counter: { id: counterId, name: "Mirpur Branch Counter 1" },
    payments: [
      { amountMinor: 300000, method: "CASH" },
      { amountMinor: 250000, method: "MOBILE_BANKING" },
      { amountMinor: 150000, method: "CARD" },
      { amountMinor: 50000, method: "BANK_TRANSFER" },
    ],
    refunds: [
      { amountMinor: 20000, method: "CASH" },
      { amountMinor: 10000, method: "MOBILE_BANKING" },
    ],
    salesCount: 15,
    session: {
      cartId: "70000000-0000-4000-8000-000000000007",
      closedAt: null,
      counterId,
      createdAt: openedAt,
      id: sessionId,
      openedAt,
      openedByUserId: userId,
      openingFloatMinor: 100000, // ৳1,000 float
      organizationId: orgId,
      status: "OPEN",
      updatedAt: openedAt,
      version: 1,
      ...overrides,
    },
  };
}

describe("POS register settlement use cases", () => {
  describe("getSalesSessionReconciliationSummary", () => {
    it("returns expected reconciliation summary with float, collections, and refund deductions", async () => {
      const repo = new FakeSettlementRepository();
      repo.source = createSource();

      const summary = await getSalesSessionReconciliationSummary(repo, {
        organizationId: orgId,
        sessionId,
      });

      expect(summary.counterName).toBe("Mirpur Branch Counter 1");
      expect(summary.openingFloatMinor).toBe(100000);
      expect(summary.salesCount).toBe(15);
      expect(summary.grossSalesMinor).toBe(750000);
      expect(summary.cashSalesMinor).toBe(300000);
      expect(summary.mobileBankingSalesMinor).toBe(250000);
      expect(summary.cardSalesMinor).toBe(150000);
      expect(summary.bankTransferSalesMinor).toBe(50000);
      expect(summary.cashCollectionsMinor).toBe(50000);
      expect(summary.cashRefundsMinor).toBe(20000);
      expect(summary.digitalRefundsMinor).toBe(10000);

      // Expected Cash = 100,000 (float) + 300,000 (cash sales) + 50,000 (collections) - 20,000 (cash refunds) = 430,000
      expect(summary.expectedCashMinor).toBe(430000);
      expect(summary.expectedMobileBankingMinor).toBe(250000);
      expect(summary.expectedCardMinor).toBe(150000);
      expect(summary.expectedBankTransferMinor).toBe(50000);
      expect(summary.expectedTotalMinor).toBe(880000);
    });

    it("throws NotFoundError when session reconciliation source does not exist", async () => {
      const repo = new FakeSettlementRepository();
      await expect(
        getSalesSessionReconciliationSummary(repo, {
          organizationId: orgId,
          sessionId,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("closeSalesSessionWithSettlement", () => {
    it("performs a balanced register settlement and closes session cleanly", async () => {
      const repo = new FakeSettlementRepository();
      repo.source = createSource();
      const closedAt = new Date("2026-09-28T21:00:00.000Z");

      const result = await closeSalesSessionWithSettlement(repo, {
        actualBankTransferMinor: 50000,
        actualCardMinor: 150000,
        actualCashMinor: 430000,
        actualMobileBankingMinor: 250000,
        closedAt,
        closedByUserId: userId,
        closingNotes: "Smooth evening closing",
        expectedVersion: 1,
        organizationId: orgId,
        sessionId,
        settlementId,
      });

      expect(result.session.status).toBe("CLOSED");
      expect(result.session.closedAt).toEqual(closedAt);
      expect(result.settlement.status).toBe("BALANCED");
      expect(result.settlement.totalDiscrepancyMinor).toBe(0);
      expect(result.settlement.cashDiscrepancyMinor).toBe(0);
      expect(result.settlement.closingNotes).toBe("Smooth evening closing");
      expect(repo.savedSettlement).toBeDefined();
    });

    it("records a SHORTAGE settlement when physical cash is less than expected", async () => {
      const repo = new FakeSettlementRepository();
      repo.source = createSource();
      const closedAt = new Date("2026-09-28T21:00:00.000Z");

      const result = await closeSalesSessionWithSettlement(repo, {
        actualBankTransferMinor: 50000,
        actualCardMinor: 150000,
        actualCashMinor: 425000, // ৳50 short (5,000 minor)
        actualMobileBankingMinor: 250000,
        approvedByUserId: managerId,
        closedAt,
        closedByUserId: userId,
        discrepancyReason: "Shortage of 50 BDT due to loose change rounding",
        expectedVersion: 1,
        organizationId: orgId,
        sessionId,
        settlementId,
      });

      expect(result.settlement.status).toBe("SHORTAGE");
      expect(result.settlement.cashDiscrepancyMinor).toBe(-5000);
      expect(result.settlement.totalDiscrepancyMinor).toBe(-5000);
      expect(result.settlement.discrepancyReason).toBe(
        "Shortage of 50 BDT due to loose change rounding",
      );
      expect(result.settlement.approvedByUserId).toBe(managerId);
    });

    it("records an OVERAGE settlement when physical cash exceeds expected", async () => {
      const repo = new FakeSettlementRepository();
      repo.source = createSource();
      const closedAt = new Date("2026-09-28T21:00:00.000Z");

      const result = await closeSalesSessionWithSettlement(repo, {
        actualBankTransferMinor: 50000,
        actualCardMinor: 150000,
        actualCashMinor: 440000, // ৳100 over (10,000 minor)
        actualMobileBankingMinor: 250000,
        closedAt,
        closedByUserId: userId,
        discrepancyReason: "Customer left 100 BDT tip in drawer",
        expectedVersion: 1,
        organizationId: orgId,
        sessionId,
        settlementId,
      });

      expect(result.settlement.status).toBe("OVERAGE");
      expect(result.settlement.cashDiscrepancyMinor).toBe(10000);
      expect(result.settlement.totalDiscrepancyMinor).toBe(10000);
      expect(result.settlement.discrepancyReason).toBe(
        "Customer left 100 BDT tip in drawer",
      );
    });

    it("rejects non-balanced closing if no discrepancy reason is given", async () => {
      const repo = new FakeSettlementRepository();
      repo.source = createSource();

      await expect(
        closeSalesSessionWithSettlement(repo, {
          actualBankTransferMinor: 50000,
          actualCardMinor: 150000,
          actualCashMinor: 425000, // Shortage without reason
          actualMobileBankingMinor: 250000,
          closedAt: new Date(),
          closedByUserId: userId,
          expectedVersion: 1,
          organizationId: orgId,
          sessionId,
          settlementId,
        }),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it("validates denomination breakdown matches entered actual cash", async () => {
      const repo = new FakeSettlementRepository();
      repo.source = createSource();

      // Breakdown total = 4*1000 + 3*100 = 4300 BDT = 430,000 minor. Matches actual cash 430,000.
      const result = await closeSalesSessionWithSettlement(repo, {
        actualBankTransferMinor: 50000,
        actualCardMinor: 150000,
        actualCashMinor: 430000,
        actualMobileBankingMinor: 250000,
        closedAt: new Date(),
        closedByUserId: userId,
        denominationBreakdown: { "100": 3, "1000": 4 }, // 4*1000 + 3*100 = 4300 BDT = 430,000 minor
        expectedVersion: 1,
        organizationId: orgId,
        sessionId,
        settlementId,
      });
      expect(result.settlement.status).toBe("BALANCED");

      // Mismatched breakdown
      await expect(
        closeSalesSessionWithSettlement(repo, {
          actualBankTransferMinor: 50000,
          actualCardMinor: 150000,
          actualCashMinor: 430000,
          actualMobileBankingMinor: 250000,
          closedAt: new Date(),
          closedByUserId: userId,
          denominationBreakdown: { "1000": 1 }, // Only ৳1,000 vs ৳4,300 entered
          expectedVersion: 1,
          organizationId: orgId,
          sessionId,
          settlementId,
        }),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it("prevents settling an already closed session", async () => {
      const repo = new FakeSettlementRepository();
      repo.source = createSource({ status: "CLOSED" });

      await expect(
        closeSalesSessionWithSettlement(repo, {
          actualBankTransferMinor: 50000,
          actualCardMinor: 150000,
          actualCashMinor: 430000,
          actualMobileBankingMinor: 250000,
          closedAt: new Date(),
          closedByUserId: userId,
          expectedVersion: 1,
          organizationId: orgId,
          sessionId,
          settlementId,
        }),
      ).rejects.toThrow("The sales session is already closed.");
    });

    it("prevents duplicate settlement records for the same session", async () => {
      const repo = new FakeSettlementRepository();
      repo.source = createSource();
      repo.existingSettlement = {
        actualBankTransferMinor: 50000,
        actualCardMinor: 150000,
        actualCashMinor: 430000,
        actualMobileBankingMinor: 250000,
        actualTotalMinor: 880000,
        bankTransferDiscrepancyMinor: 0,
        cardDiscrepancyMinor: 0,
        cashDiscrepancyMinor: 0,
        closedAt: new Date(),
        closedByUserId: userId,
        counterId,
        createdAt: new Date(),
        expectedBankTransferMinor: 50000,
        expectedCardMinor: 150000,
        expectedCashMinor: 430000,
        expectedMobileBankingMinor: 250000,
        expectedTotalMinor: 880000,
        id: settlementId,
        mobileBankingDiscrepancyMinor: 0,
        openingFloatMinor: 100000,
        organizationId: orgId,
        salesSessionId: sessionId,
        status: "BALANCED",
        totalDiscrepancyMinor: 0,
      };

      await expect(
        closeSalesSessionWithSettlement(repo, {
          actualBankTransferMinor: 50000,
          actualCardMinor: 150000,
          actualCashMinor: 430000,
          actualMobileBankingMinor: 250000,
          closedAt: new Date(),
          closedByUserId: userId,
          expectedVersion: 1,
          organizationId: orgId,
          sessionId,
          settlementId,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("handles optimistic concurrency version conflicts", async () => {
      const repo = new FakeSettlementRepository();
      repo.source = createSource({ version: 2 }); // DB is version 2

      await expect(
        closeSalesSessionWithSettlement(repo, {
          actualBankTransferMinor: 50000,
          actualCardMinor: 150000,
          actualCashMinor: 430000,
          actualMobileBankingMinor: 250000,
          closedAt: new Date(),
          closedByUserId: userId,
          expectedVersion: 1, // Client expects version 1
          organizationId: orgId,
          sessionId,
          settlementId,
        }),
      ).rejects.toBeInstanceOf(ConcurrencyError);
    });
  });
});
