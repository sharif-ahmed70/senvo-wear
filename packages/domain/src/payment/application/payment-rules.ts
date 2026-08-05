import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";
import type {
  PaymentBalance,
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
