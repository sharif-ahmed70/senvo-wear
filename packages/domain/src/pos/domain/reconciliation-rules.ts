import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";
import type { PosSettlementStatus } from "./models.js";

export type PaymentMethodType =
  | "CASH"
  | "CARD"
  | "MOBILE_BANKING"
  | "BANK_TRANSFER"
  | "ONLINE_GATEWAY";

export type SessionPaymentLine = {
  amountMinor: number | bigint;
  method: PaymentMethodType;
};

export type SessionCollectionLine = {
  amountMinor: number | bigint;
  method: PaymentMethodType;
};

export type SessionRefundLine = {
  amountMinor: number | bigint;
  method: PaymentMethodType;
};

export type SessionChannelTotals = {
  bankTransferSalesMinor: bigint;
  cardSalesMinor: bigint;
  cashCollectionsMinor: bigint;
  cashRefundsMinor: bigint;
  cashSalesMinor: bigint;
  digitalRefundsMinor: bigint;
  grossSalesMinor: bigint;
  mobileBankingSalesMinor: bigint;
  onlineGatewaySalesMinor: bigint;
  totalRefundsMinor: bigint;
};

export type ExpectedRegisterTotals = {
  expectedBankTransferMinor: bigint;
  expectedCardMinor: bigint;
  expectedCashMinor: bigint;
  expectedMobileBankingMinor: bigint;
  expectedTotalMinor: bigint;
};

export type SettlementDiscrepancies = {
  actualBankTransferMinor: bigint;
  actualCardMinor: bigint;
  actualCashMinor: bigint;
  actualMobileBankingMinor: bigint;
  actualTotalMinor: bigint;
  bankTransferDiscrepancyMinor: bigint;
  cardDiscrepancyMinor: bigint;
  cashDiscrepancyMinor: bigint;
  mobileBankingDiscrepancyMinor: bigint;
  status: PosSettlementStatus;
  totalDiscrepancyMinor: bigint;
};

function toBigIntAmount(amount: number | bigint, fieldName = "amount"): bigint {
  const value = typeof amount === "bigint" ? amount : BigInt(Math.trunc(amount));
  if (value < 0n) {
    throw new ValidationApplicationError(`${fieldName} cannot be negative.`);
  }
  return value;
}

export function calculateSessionChannelTotals(params: {
  collections?: readonly SessionCollectionLine[];
  payments: readonly SessionPaymentLine[];
  refunds?: readonly SessionRefundLine[];
}): SessionChannelTotals {
  let cashSales = 0n;
  let mobileBankingSales = 0n;
  let cardSales = 0n;
  let bankTransferSales = 0n;
  let onlineGatewaySales = 0n;
  let grossSales = 0n;

  for (const payment of params.payments) {
    const amount = toBigIntAmount(payment.amountMinor, "Payment amount");
    grossSales += amount;
    switch (payment.method) {
      case "CASH":
        cashSales += amount;
        break;
      case "MOBILE_BANKING":
        mobileBankingSales += amount;
        break;
      case "CARD":
        cardSales += amount;
        break;
      case "BANK_TRANSFER":
        bankTransferSales += amount;
        break;
      case "ONLINE_GATEWAY":
        onlineGatewaySales += amount;
        break;
    }
  }

  let cashCollections = 0n;
  if (params.collections) {
    for (const collection of params.collections) {
      const amount = toBigIntAmount(collection.amountMinor, "Collection amount");
      if (collection.method === "CASH") {
        cashCollections += amount;
      }
    }
  }

  let cashRefunds = 0n;
  let digitalRefunds = 0n;
  if (params.refunds) {
    for (const refund of params.refunds) {
      const amount = toBigIntAmount(refund.amountMinor, "Refund amount");
      if (refund.method === "CASH") {
        cashRefunds += amount;
      } else {
        digitalRefunds += amount;
      }
    }
  }

  return {
    bankTransferSalesMinor: bankTransferSales,
    cardSalesMinor: cardSales,
    cashCollectionsMinor: cashCollections,
    cashRefundsMinor: cashRefunds,
    cashSalesMinor: cashSales,
    digitalRefundsMinor: digitalRefunds,
    grossSalesMinor: grossSales,
    mobileBankingSalesMinor: mobileBankingSales,
    onlineGatewaySalesMinor: onlineGatewaySales,
    totalRefundsMinor: cashRefunds + digitalRefunds,
  };
}

export function calculateExpectedRegisterTotals(params: {
  channelTotals: SessionChannelTotals;
  openingFloatMinor: number | bigint;
}): ExpectedRegisterTotals {
  const openingFloat = toBigIntAmount(
    params.openingFloatMinor,
    "Opening float",
  );

  const expectedCash =
    openingFloat +
    params.channelTotals.cashSalesMinor +
    params.channelTotals.cashCollectionsMinor -
    params.channelTotals.cashRefundsMinor;

  const expectedMobileBanking = params.channelTotals.mobileBankingSalesMinor;
  const expectedCard = params.channelTotals.cardSalesMinor;
  const expectedBankTransfer = params.channelTotals.bankTransferSalesMinor;

  const expectedTotal =
    expectedCash +
    expectedMobileBanking +
    expectedCard +
    expectedBankTransfer;

  return {
    expectedBankTransferMinor: expectedBankTransfer,
    expectedCardMinor: expectedCard,
    expectedCashMinor: expectedCash,
    expectedMobileBankingMinor: expectedMobileBanking,
    expectedTotalMinor: expectedTotal,
  };
}

export function determineSettlementStatus(
  totalDiscrepancyMinor: bigint,
): PosSettlementStatus {
  if (totalDiscrepancyMinor === 0n) {
    return "BALANCED";
  }
  return totalDiscrepancyMinor < 0n ? "SHORTAGE" : "OVERAGE";
}

export function calculateSettlementDiscrepancies(params: {
  actual: {
    actualBankTransferMinor: number | bigint;
    actualCardMinor: number | bigint;
    actualCashMinor: number | bigint;
    actualMobileBankingMinor: number | bigint;
  };
  expected: ExpectedRegisterTotals;
}): SettlementDiscrepancies {
  const actualCash = toBigIntAmount(
    params.actual.actualCashMinor,
    "Actual cash",
  );
  const actualMobileBanking = toBigIntAmount(
    params.actual.actualMobileBankingMinor,
    "Actual mobile banking",
  );
  const actualCard = toBigIntAmount(
    params.actual.actualCardMinor,
    "Actual card",
  );
  const actualBankTransfer = toBigIntAmount(
    params.actual.actualBankTransferMinor,
    "Actual bank transfer",
  );

  const cashDiscrepancy =
    actualCash - params.expected.expectedCashMinor;
  const mobileBankingDiscrepancy =
    actualMobileBanking - params.expected.expectedMobileBankingMinor;
  const cardDiscrepancy =
    actualCard - params.expected.expectedCardMinor;
  const bankTransferDiscrepancy =
    actualBankTransfer - params.expected.expectedBankTransferMinor;

  const actualTotal =
    actualCash + actualMobileBanking + actualCard + actualBankTransfer;
  const totalDiscrepancy =
    actualTotal - params.expected.expectedTotalMinor;

  return {
    actualBankTransferMinor: actualBankTransfer,
    actualCardMinor: actualCard,
    actualCashMinor: actualCash,
    actualMobileBankingMinor: actualMobileBanking,
    actualTotalMinor: actualTotal,
    bankTransferDiscrepancyMinor: bankTransferDiscrepancy,
    cardDiscrepancyMinor: cardDiscrepancy,
    cashDiscrepancyMinor: cashDiscrepancy,
    mobileBankingDiscrepancyMinor: mobileBankingDiscrepancy,
    status: determineSettlementStatus(totalDiscrepancy),
    totalDiscrepancyMinor: totalDiscrepancy,
  };
}

export function calculateDenominationTotalMinor(
  breakdown: Record<string, number>,
): bigint {
  let total = 0n;
  for (const [denominationStr, count] of Object.entries(breakdown)) {
    const denom = Number(denominationStr);
    if (!Number.isInteger(denom) || denom <= 0) {
      throw new ValidationApplicationError(
        `Invalid denomination: ${denominationStr}`,
      );
    }
    if (!Number.isInteger(count) || count < 0) {
      throw new ValidationApplicationError(
        `Invalid count for denomination ${denominationStr}: ${count}`,
      );
    }
    // 1 BDT = 100 Minor
    total += BigInt(denom) * 100n * BigInt(count);
  }
  return total;
}

export function validateSettlementSubmission(params: {
  actualCashMinor: number | bigint;
  denominationBreakdown?: Record<string, number> | null;
  discrepancyReason?: string | null;
  status: PosSettlementStatus;
  totalDiscrepancyMinor: bigint;
}): void {
  if (params.denominationBreakdown) {
    const denomTotal = calculateDenominationTotalMinor(
      params.denominationBreakdown,
    );
    const countedCash = toBigIntAmount(
      params.actualCashMinor,
      "Actual cash",
    );
    if (denomTotal !== countedCash) {
      throw new BusinessRuleError(
        `Denomination breakdown total (৳${denomTotal / 100n}) does not match entered cash amount (৳${countedCash / 100n}).`,
      );
    }
  }

  if (params.status !== "BALANCED") {
    const reason = params.discrepancyReason?.trim();
    if (!reason) {
      throw new BusinessRuleError(
        "A discrepancy reason is required when register closing is not balanced.",
      );
    }
  }
}
