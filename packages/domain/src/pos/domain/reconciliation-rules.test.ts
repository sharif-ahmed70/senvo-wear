import { describe, expect, it } from "vitest";
import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";
import {
  calculateDenominationTotalMinor,
  calculateExpectedRegisterTotals,
  calculateSessionChannelTotals,
  calculateSettlementDiscrepancies,
  determineSettlementStatus,
  validateSettlementSubmission,
} from "./reconciliation-rules.js";

describe("POS register reconciliation domain rules", () => {
  it("calculates session channel totals with cash, digital, collections, and refunds", () => {
    const totals = calculateSessionChannelTotals({
      collections: [
        { amountMinor: 50000, method: "CASH" },
        { amountMinor: 20000, method: "MOBILE_BANKING" },
      ],
      payments: [
        { amountMinor: 100000, method: "CASH" },
        { amountMinor: 150000, method: "MOBILE_BANKING" },
        { amountMinor: 200000, method: "CARD" },
        { amountMinor: 50000, method: "BANK_TRANSFER" },
        { amountMinor: 10000, method: "ONLINE_GATEWAY" },
      ],
      refunds: [
        { amountMinor: 15000, method: "CASH" },
        { amountMinor: 25000, method: "MOBILE_BANKING" },
      ],
    });

    expect(totals.cashSalesMinor).toBe(100000n);
    expect(totals.mobileBankingSalesMinor).toBe(150000n);
    expect(totals.cardSalesMinor).toBe(200000n);
    expect(totals.bankTransferSalesMinor).toBe(50000n);
    expect(totals.onlineGatewaySalesMinor).toBe(10000n);
    expect(totals.grossSalesMinor).toBe(510000n);
    expect(totals.cashCollectionsMinor).toBe(50000n);
    expect(totals.cashRefundsMinor).toBe(15000n);
    expect(totals.digitalRefundsMinor).toBe(25000n);
    expect(totals.totalRefundsMinor).toBe(40000n);
  });

  it("calculates expected register amounts including opening float and deductions", () => {
    const channelTotals = calculateSessionChannelTotals({
      collections: [{ amountMinor: 50000, method: "CASH" }],
      payments: [
        { amountMinor: 300000, method: "CASH" },
        { amountMinor: 150000, method: "MOBILE_BANKING" },
        { amountMinor: 200000, method: "CARD" },
        { amountMinor: 100000, method: "BANK_TRANSFER" },
      ],
      refunds: [{ amountMinor: 20000, method: "CASH" }],
    });

    const expected = calculateExpectedRegisterTotals({
      channelTotals,
      openingFloatMinor: 100000, // ৳1,000 float
    });

    // Expected cash = 100,000 (float) + 300,000 (sales) + 50,000 (collection) - 20,000 (refund) = 430,000
    expect(expected.expectedCashMinor).toBe(430000n);
    expect(expected.expectedMobileBankingMinor).toBe(150000n);
    expect(expected.expectedCardMinor).toBe(200000n);
    expect(expected.expectedBankTransferMinor).toBe(100000n);
    expect(expected.expectedTotalMinor).toBe(880000n);
  });

  it("determines BALANCED status when physical count matches expected amounts", () => {
    const expected = {
      expectedBankTransferMinor: 100000n,
      expectedCardMinor: 200000n,
      expectedCashMinor: 430000n,
      expectedMobileBankingMinor: 150000n,
      expectedTotalMinor: 880000n,
    };

    const discrepancies = calculateSettlementDiscrepancies({
      actual: {
        actualBankTransferMinor: 100000,
        actualCardMinor: 200000,
        actualCashMinor: 430000,
        actualMobileBankingMinor: 150000,
      },
      expected,
    });

    expect(discrepancies.cashDiscrepancyMinor).toBe(0n);
    expect(discrepancies.mobileBankingDiscrepancyMinor).toBe(0n);
    expect(discrepancies.cardDiscrepancyMinor).toBe(0n);
    expect(discrepancies.bankTransferDiscrepancyMinor).toBe(0n);
    expect(discrepancies.totalDiscrepancyMinor).toBe(0n);
    expect(discrepancies.status).toBe("BALANCED");
    expect(determineSettlementStatus(0n)).toBe("BALANCED");
  });

  it("calculates SHORTAGE when physical cash in drawer is missing", () => {
    const expected = {
      expectedBankTransferMinor: 0n,
      expectedCardMinor: 200000n,
      expectedCashMinor: 430000n,
      expectedMobileBankingMinor: 150000n,
      expectedTotalMinor: 780000n,
    };

    const discrepancies = calculateSettlementDiscrepancies({
      actual: {
        actualBankTransferMinor: 0,
        actualCardMinor: 200000,
        actualCashMinor: 425000, // ৳50 short (5,000 minor)
        actualMobileBankingMinor: 150000,
      },
      expected,
    });

    expect(discrepancies.cashDiscrepancyMinor).toBe(-5000n);
    expect(discrepancies.totalDiscrepancyMinor).toBe(-5000n);
    expect(discrepancies.status).toBe("SHORTAGE");
    expect(determineSettlementStatus(-5000n)).toBe("SHORTAGE");
  });

  it("calculates OVERAGE when register has surplus cash or tips", () => {
    const expected = {
      expectedBankTransferMinor: 0n,
      expectedCardMinor: 200000n,
      expectedCashMinor: 430000n,
      expectedMobileBankingMinor: 150000n,
      expectedTotalMinor: 780000n,
    };

    const discrepancies = calculateSettlementDiscrepancies({
      actual: {
        actualBankTransferMinor: 0,
        actualCardMinor: 200000,
        actualCashMinor: 440000, // ৳100 surplus (10,000 minor)
        actualMobileBankingMinor: 150000,
      },
      expected,
    });

    expect(discrepancies.cashDiscrepancyMinor).toBe(10000n);
    expect(discrepancies.totalDiscrepancyMinor).toBe(10000n);
    expect(discrepancies.status).toBe("OVERAGE");
    expect(determineSettlementStatus(10000n)).toBe("OVERAGE");
  });

  it("validates denomination note breakdown math against actual cash", () => {
    // 4 notes of 1000 BDT + 2 notes of 500 BDT + 5 notes of 100 BDT
    // 4000 + 1000 + 500 = 5500 BDT = 550,000 Minor
    const breakdown = { "100": 5, "1000": 4, "500": 2 };
    const totalMinor = calculateDenominationTotalMinor(breakdown);
    expect(totalMinor).toBe(550000n);

    // Matching validation should succeed
    expect(() =>
      validateSettlementSubmission({
        actualCashMinor: 550000,
        denominationBreakdown: breakdown,
        status: "BALANCED",
        totalDiscrepancyMinor: 0n,
      }),
    ).not.toThrow();

    // Mismatched entered cash vs denomination breakdown throws BusinessRuleError
    expect(() =>
      validateSettlementSubmission({
        actualCashMinor: 540000,
        denominationBreakdown: breakdown,
        status: "SHORTAGE",
        totalDiscrepancyMinor: -10000n,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("rejects invalid denomination keys and counts", () => {
    expect(() =>
      calculateDenominationTotalMinor({ invalid: 1 } as never),
    ).toThrow(ValidationApplicationError);
    expect(() =>
      calculateDenominationTotalMinor({ "500": -1 } as never),
    ).toThrow(ValidationApplicationError);
  });

  it("requires a discrepancy reason when status is not BALANCED", () => {
    expect(() =>
      validateSettlementSubmission({
        actualCashMinor: 425000,
        discrepancyReason: "",
        status: "SHORTAGE",
        totalDiscrepancyMinor: -5000n,
      }),
    ).toThrow(BusinessRuleError);

    expect(() =>
      validateSettlementSubmission({
        actualCashMinor: 425000,
        discrepancyReason: "Cashier gave wrong change to customer",
        status: "SHORTAGE",
        totalDiscrepancyMinor: -5000n,
      }),
    ).not.toThrow();
  });
});
