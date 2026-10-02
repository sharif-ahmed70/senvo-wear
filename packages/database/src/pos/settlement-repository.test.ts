import { ConflictError } from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import { PrismaPosSettlementRepository } from "./settlement-repository.js";

describe("PrismaPosSettlementRepository", () => {
  const organizationId = "10000000-0000-4000-8000-000000000001";
  const sessionId = "10000000-0000-4000-8000-000000000010";
  const counterId = "10000000-0000-4000-8000-000000000020";
  const userId = "10000000-0000-4000-8000-000000000030";

  it("returns null when session is not found", async () => {
    const mockPrisma = {
      posCheckoutRecord: { findMany: vi.fn() },
      salesSession: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    const repo = new PrismaPosSettlementRepository(mockPrisma as never);
    const result = await repo.findSessionReconciliationSource(
      sessionId,
      organizationId,
    );
    expect(result).toBeNull();
  });

  it("aggregates session payment batches, collections, and refunds", async () => {
    const mockPrisma = {
      paymentBatch: {
        findMany: vi.fn().mockResolvedValue([
          {
            lines: [
              { amountMinor: 25000, method: "CASH" },
              { amountMinor: 10000, method: "CARD" },
            ],
          },
        ]),
      },
      paymentCollection: {
        findMany: vi.fn().mockResolvedValue([
          {
            lines: [{ amountMinor: 5000, method: "CASH" }],
          },
        ]),
      },
      paymentRefund: {
        findMany: vi.fn().mockResolvedValue([
          {
            lines: [{ amountMinor: 3000, method: "CASH" }],
          },
        ]),
      },
      posCheckoutRecord: {
        findMany: vi.fn().mockResolvedValue([{ id: "checkout-1" }]),
      },
      salesSession: {
        findFirst: vi.fn().mockResolvedValue({
          cart: { id: "cart-1" },
          closedAt: null,
          counter: { id: counterId, name: "Main Counter" },
          counterId,
          createdAt: new Date("2026-09-28T09:00:00Z"),
          id: sessionId,
          openedAt: new Date("2026-09-28T09:00:00Z"),
          openedByUserId: userId,
          openingFloatMinor: 5000,
          organizationId,
          status: "OPEN",
          updatedAt: new Date("2026-09-28T09:00:00Z"),
          version: 1,
        }),
      },
    };

    const repo = new PrismaPosSettlementRepository(mockPrisma as never);
    const result = await repo.findSessionReconciliationSource(
      sessionId,
      organizationId,
    );

    expect(result).not.toBeNull();
    expect(result?.counter.name).toBe("Main Counter");
    expect(result?.session.openingFloatMinor).toBe(5000);
    expect(result?.payments).toHaveLength(2);
    expect(result?.collections).toHaveLength(1);
    expect(result?.refunds).toHaveLength(1);
    expect(result?.salesCount).toBe(1);
  });

  it("returns settlement by sessionId", async () => {
    const mockPrisma = {
      posRegisterSettlement: {
        findFirst: vi.fn().mockResolvedValue({
          actualBankTransferMinor: 0,
          actualCardMinor: 10000,
          actualCashMinor: 27000,
          actualMobileBankingMinor: 0,
          actualTotalMinor: 37000,
          approvedByUserId: null,
          bankTransferDiscrepancyMinor: 0,
          cardDiscrepancyMinor: 0,
          cashDiscrepancyMinor: 0,
          closedAt: new Date("2026-09-28T21:00:00Z"),
          closedByUserId: userId,
          closingNotes: null,
          counterId,
          createdAt: new Date("2026-09-28T21:00:00Z"),
          denominationBreakdown: null,
          discrepancyReason: null,
          expectedBankTransferMinor: 0,
          expectedCardMinor: 10000,
          expectedCashMinor: 27000,
          expectedMobileBankingMinor: 0,
          expectedTotalMinor: 37000,
          id: "settle-1",
          mobileBankingDiscrepancyMinor: 0,
          openingFloatMinor: 5000,
          organizationId,
          salesSessionId: sessionId,
          status: "BALANCED",
          totalDiscrepancyMinor: 0,
        }),
      },
    };

    const repo = new PrismaPosSettlementRepository(mockPrisma as never);
    const result = await repo.findSettlementBySessionId(
      sessionId,
      organizationId,
    );
    expect(result?.status).toBe("BALANCED");
    expect(result?.actualTotalMinor).toBe(37000);
  });

  it("handles version conflict returning null when updateMany affects 0 rows", async () => {
    const mockPrisma = {
      salesSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const repo = new PrismaPosSettlementRepository(mockPrisma as never);
    const result = await repo.saveSettlementAndCloseSession({
      expectedVersion: 1,
      session: {
        cartId: "cart-1",
        closedAt: null,
        counterId,
        createdAt: new Date(),
        id: sessionId,
        openedAt: new Date(),
        openedByUserId: userId,
        openingFloatMinor: 5000,
        organizationId,
        status: "OPEN",
        updatedAt: new Date(),
        version: 1,
      },
      settlement: {
        actualBankTransferMinor: 0,
        actualCardMinor: 0,
        actualCashMinor: 5000,
        actualMobileBankingMinor: 0,
        actualTotalMinor: 5000,
        approvedByUserId: null,
        bankTransferDiscrepancyMinor: 0,
        cardDiscrepancyMinor: 0,
        cashDiscrepancyMinor: 0,
        closedAt: new Date(),
        closedByUserId: userId,
        closingNotes: null,
        counterId,
        createdAt: new Date(),
        denominationBreakdown: null,
        discrepancyReason: null,
        expectedBankTransferMinor: 0,
        expectedCardMinor: 0,
        expectedCashMinor: 5000,
        expectedMobileBankingMinor: 0,
        expectedTotalMinor: 5000,
        id: "settle-1",
        mobileBankingDiscrepancyMinor: 0,
        openingFloatMinor: 5000,
        organizationId,
        salesSessionId: sessionId,
        status: "BALANCED",
        totalDiscrepancyMinor: 0,
      },
    });

    expect(result).toBeNull();
  });

  it("maps P2002 duplicate settlement error to ConflictError", async () => {
    const p2002Error = new Error("Unique constraint failed");
    (p2002Error as unknown as { code: string }).code = "P2002";

    const mockPrisma = {
      posRegisterSettlement: {
        create: vi.fn().mockRejectedValue(p2002Error),
      },
      salesSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const repo = new PrismaPosSettlementRepository(mockPrisma as never);
    await expect(
      repo.saveSettlementAndCloseSession({
        expectedVersion: 1,
        session: {
          cartId: "cart-1",
          closedAt: null,
          counterId,
          createdAt: new Date(),
          id: sessionId,
          openedAt: new Date(),
          openedByUserId: userId,
          openingFloatMinor: 5000,
          organizationId,
          status: "OPEN",
          updatedAt: new Date(),
          version: 1,
        },
        settlement: {
          actualBankTransferMinor: 0,
          actualCardMinor: 0,
          actualCashMinor: 5000,
          actualMobileBankingMinor: 0,
          actualTotalMinor: 5000,
          approvedByUserId: null,
          bankTransferDiscrepancyMinor: 0,
          cardDiscrepancyMinor: 0,
          cashDiscrepancyMinor: 0,
          closedAt: new Date(),
          closedByUserId: userId,
          closingNotes: null,
          counterId,
          createdAt: new Date(),
          denominationBreakdown: null,
          discrepancyReason: null,
          expectedBankTransferMinor: 0,
          expectedCardMinor: 0,
          expectedCashMinor: 5000,
          expectedMobileBankingMinor: 0,
          expectedTotalMinor: 5000,
          id: "settle-1",
          mobileBankingDiscrepancyMinor: 0,
          openingFloatMinor: 5000,
          organizationId,
          salesSessionId: sessionId,
          status: "BALANCED",
          totalDiscrepancyMinor: 0,
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
