import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";
import type {
  PaymentBalance,
  CheckoutSettlementStatus,
  PaymentInstruction,
  PaymentMethod,
} from "../domain/models.js";

const maxIntegerMinorUnit = 2_147_483_647;
const maxPaymentLines = 8;
const methods = [
  "CASH",
  "CARD",
  "MOBILE_BANKING",
  "BANK_TRANSFER",
] as const satisfies readonly PaymentMethod[];

export type CheckoutSettlement = {
  adjustedPayableMinor: number;
  cumulativeRefundedMinor: number;
  cumulativeReceivedMinor: number;
  grossReceivedMinor: number;
  netReceivedMinor: number;
  originalPayableMinor: number;
  outstandingMinor: number;
  refundableMinor: number;
  returnCreditMinor: number;
  status: Exclude<CheckoutSettlementStatus, "UNRECORDED">;
};

export function calculateCheckoutSettlement(
  originalPayableMinor: number,
  cumulativeReceivedMinor: number,
  returnCreditMinor: number,
  cumulativeRefundedMinor = 0,
): CheckoutSettlement {
  assertMinorUnit(originalPayableMinor, "original payable", true);
  assertMinorUnit(cumulativeReceivedMinor, "cumulative received", true);
  assertMinorUnit(returnCreditMinor, "return credit", true);
  assertMinorUnit(cumulativeRefundedMinor, "cumulative refunded", true);
  if (returnCreditMinor > originalPayableMinor) {
    throw new BusinessRuleError(
      "Return credit exceeds the original payable amount.",
    );
  }
  if (cumulativeRefundedMinor > cumulativeReceivedMinor) {
    throw new BusinessRuleError(
      "Cumulative refunds exceed gross received payment.",
    );
  }
  const adjustedPayableMinor = originalPayableMinor - returnCreditMinor;
  const netReceivedMinor = cumulativeReceivedMinor - cumulativeRefundedMinor;
  const outstandingMinor = Math.max(adjustedPayableMinor - netReceivedMinor, 0);
  const refundableMinor = Math.max(netReceivedMinor - adjustedPayableMinor, 0);
  const status: CheckoutSettlement["status"] =
    refundableMinor > 0
      ? "REFUND_DUE"
      : adjustedPayableMinor === 0 && netReceivedMinor === 0
        ? "SETTLED"
        : netReceivedMinor === adjustedPayableMinor
          ? "PAID"
          : netReceivedMinor === 0
            ? "UNPAID"
            : "PARTIALLY_PAID";
  return {
    adjustedPayableMinor,
    cumulativeRefundedMinor,
    cumulativeReceivedMinor,
    grossReceivedMinor: cumulativeReceivedMinor,
    netReceivedMinor,
    originalPayableMinor,
    outstandingMinor,
    refundableMinor,
    returnCreditMinor,
    status,
  };
}

export function normalizePaymentInstructions(
  values: readonly {
    amountMinor: number;
    method: PaymentMethod;
    reference?: string | null;
  }[],
  allowOutstanding: boolean,
): PaymentInstruction[] {
  if (values.length > maxPaymentLines) {
    throw new ValidationApplicationError(
      `payments must contain no more than ${maxPaymentLines} lines.`,
    );
  }
  if (values.length === 0 && !allowOutstanding) {
    throw new BusinessRuleError(
      "At least one payment is required unless outstanding payment is approved.",
    );
  }
  return values.map((value) => {
    if (!methods.includes(value.method)) {
      throw new ValidationApplicationError("payment method is invalid.");
    }
    if (
      !Number.isInteger(value.amountMinor) ||
      !Number.isSafeInteger(value.amountMinor) ||
      value.amountMinor <= 0 ||
      value.amountMinor > maxIntegerMinorUnit
    ) {
      throw new ValidationApplicationError(
        "payment amount must be a positive PostgreSQL integer minor-unit value.",
      );
    }
    const reference = normalizeReference(value.reference);
    if (value.method !== "CASH" && reference === null) {
      throw new ValidationApplicationError(
        "non-cash payments require a transaction reference.",
      );
    }
    return { amountMinor: value.amountMinor, method: value.method, reference };
  });
}

export function normalizePaymentRefundInstructions(
  values: readonly {
    amountMinor: number;
    method: PaymentMethod;
    reference?: string | null;
  }[],
): PaymentInstruction[] {
  return normalizePaymentInstructions(
    values.map((value) =>
      value.method === "CASH" ? { ...value, reference: null } : value,
    ),
    false,
  );
}

export function calculatePaymentBalance(
  payableMinor: number,
  payments: readonly PaymentInstruction[],
  allowOutstanding: boolean,
): PaymentBalance {
  if (
    !Number.isInteger(payableMinor) ||
    !Number.isSafeInteger(payableMinor) ||
    payableMinor < 0 ||
    payableMinor > maxIntegerMinorUnit
  ) {
    throw new ValidationApplicationError("checkout total is invalid.");
  }
  let paidMinor = 0;
  for (const payment of payments) {
    const next = paidMinor + payment.amountMinor;
    if (!Number.isSafeInteger(next) || next > maxIntegerMinorUnit) {
      throw new ValidationApplicationError(
        "payment total exceeds the supported range.",
      );
    }
    paidMinor = next;
  }
  if (paidMinor > payableMinor) {
    throw new BusinessRuleError("Payment cannot exceed the checkout total.");
  }
  const outstandingMinor = payableMinor - paidMinor;
  if (outstandingMinor > 0 && !allowOutstanding) {
    throw new BusinessRuleError("The checkout payment is incomplete.");
  }
  return {
    outstandingMinor,
    paidMinor,
    status:
      paidMinor === payableMinor
        ? "PAID"
        : paidMinor === 0
          ? "UNPAID"
          : "PARTIALLY_PAID",
  };
}

export function createPaymentRequestSignature(
  payments: readonly PaymentInstruction[],
  allowOutstanding: boolean,
): string {
  return JSON.stringify({ allowOutstanding, payments });
}

export function createPaymentCollectionRequestSignature(
  payments: readonly PaymentInstruction[],
): string {
  return JSON.stringify({ payments });
}

export function createPaymentRefundRequestSignature(
  refunds: readonly PaymentInstruction[],
): string {
  const normalized = [...refunds].sort((left, right) =>
    [left.method, left.reference ?? "", left.amountMinor]
      .join("|")
      .localeCompare(
        [right.method, right.reference ?? "", right.amountMinor].join("|"),
      ),
  );
  return JSON.stringify({ refunds: normalized });
}

export function calculatePaymentRefund(
  refundableMinor: number,
  refunds: readonly PaymentInstruction[],
): number {
  assertMinorUnit(refundableMinor, "refund due", true);
  let amountMinor = 0;
  for (const refund of refunds) {
    const next = amountMinor + refund.amountMinor;
    if (!Number.isSafeInteger(next) || next > maxIntegerMinorUnit)
      throw new ValidationApplicationError(
        "refund total exceeds the supported range.",
      );
    amountMinor = next;
  }
  if (amountMinor <= 0)
    throw new ValidationApplicationError(
      "refund amount must be greater than zero.",
    );
  if (refundableMinor === 0)
    throw new BusinessRuleError("This checkout has no refund due.");
  if (amountMinor > refundableMinor)
    throw new BusinessRuleError("The refund exceeds the current refund due.");
  return amountMinor;
}

export function calculateCumulativePaymentBalance(
  payableMinor: number,
  initialPaidMinor: number,
  collectionAmounts: readonly number[],
): PaymentBalance {
  assertMinorUnit(payableMinor, "checkout total", true);
  assertMinorUnit(initialPaidMinor, "initial payment", true);
  let paidMinor = initialPaidMinor;
  for (const amount of collectionAmounts) {
    assertMinorUnit(amount, "collection amount", false);
    const next = paidMinor + amount;
    if (!Number.isSafeInteger(next) || next > maxIntegerMinorUnit) {
      throw new ValidationApplicationError(
        "cumulative payment exceeds the supported range.",
      );
    }
    paidMinor = next;
  }
  if (paidMinor > payableMinor) {
    throw new BusinessRuleError(
      "Cumulative payment exceeds the checkout total.",
    );
  }
  const outstandingMinor = payableMinor - paidMinor;
  return {
    outstandingMinor,
    paidMinor,
    status:
      paidMinor === payableMinor
        ? "PAID"
        : paidMinor === 0
          ? "UNPAID"
          : "PARTIALLY_PAID",
  };
}

export function calculatePaymentCollection(
  payableMinor: number,
  currentPaidMinor: number,
  payments: readonly PaymentInstruction[],
): PaymentBalance & { amountMinor: number; balanceBeforeMinor: number } {
  const current = calculateCumulativePaymentBalance(
    payableMinor,
    currentPaidMinor,
    [],
  );
  if (current.outstandingMinor === 0) {
    throw new BusinessRuleError("The checkout is already paid in full.");
  }
  let amountMinor = 0;
  for (const payment of payments) {
    const next = amountMinor + payment.amountMinor;
    if (!Number.isSafeInteger(next) || next > maxIntegerMinorUnit) {
      throw new ValidationApplicationError(
        "collection total exceeds the supported range.",
      );
    }
    amountMinor = next;
  }
  if (amountMinor <= 0) {
    throw new ValidationApplicationError(
      "collection amount must be greater than zero.",
    );
  }
  if (amountMinor > current.outstandingMinor) {
    throw new BusinessRuleError(
      "The collection exceeds the current outstanding balance.",
    );
  }
  const next = calculateCumulativePaymentBalance(
    payableMinor,
    currentPaidMinor,
    [amountMinor],
  );
  return {
    ...next,
    amountMinor,
    balanceBeforeMinor: current.outstandingMinor,
  };
}

function assertMinorUnit(
  value: number,
  field: string,
  allowZero: boolean,
): void {
  if (
    !Number.isInteger(value) ||
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1) ||
    value > maxIntegerMinorUnit
  ) {
    throw new ValidationApplicationError(`${field} is invalid.`);
  }
}

function normalizeReference(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length === 0) return null;
  if (normalized.length > 120) {
    throw new ValidationApplicationError(
      "payment reference must not exceed 120 characters.",
    );
  }
  return normalized;
}
