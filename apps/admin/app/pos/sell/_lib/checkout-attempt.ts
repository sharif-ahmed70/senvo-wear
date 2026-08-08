import type {
  CheckoutPosCartServiceInputContract,
  PaymentMethodContract,
} from "@senvo/contracts";
import { parseTaka } from "./money";

export type PaymentDraft = {
  amount: string;
  id: string;
  method: PaymentMethodContract;
  reference: string;
};

export type PaymentValidation =
  | { ok: false; errors: Record<string, string> }
  | {
      ok: true;
      paidMinor: number;
      payments: CheckoutPosCartServiceInputContract["payments"];
      remainingMinor: number;
    };

export type CheckoutAttempt = {
  idempotencyKey: string;
  signature: string;
};

export function validatePayments(
  drafts: readonly PaymentDraft[],
  totalMinor: number,
  allowOutstanding: boolean,
): PaymentValidation {
  const errors: Record<string, string> = {};
  if (drafts.length === 0 && !allowOutstanding) {
    errors.payments = "Add a payment before completing the sale.";
  }
  if (drafts.length > 8) errors.payments = "Use no more than 8 payments.";
  const payments = drafts.flatMap((draft, index) => {
    const amountMinor = parseTaka(draft.amount);
    if (amountMinor === null || amountMinor <= 0) {
      errors[`${index}.amount`] = "Enter a valid amount greater than zero.";
      return [];
    }
    const reference = draft.reference.trim().replace(/\s+/gu, " ");
    if (draft.method !== "CASH" && !reference) {
      errors[`${index}.reference`] = "Enter the transaction reference.";
    }
    if (reference.length > 120) {
      errors[`${index}.reference`] = "Use 120 characters or fewer.";
    }
    return [
      {
        amountMinor,
        method: draft.method,
        ...(reference ? { reference } : {}),
      },
    ];
  });
  const paidMinor = payments.reduce(
    (sum, payment) => sum + payment.amountMinor,
    0,
  );
  if (paidMinor > totalMinor) {
    errors.payments =
      "Entered payments cannot be greater than the order total.";
  }
  if (paidMinor < totalMinor && !allowOutstanding) {
    errors.payments = "Enter the full amount or remove the remaining balance.";
  }
  return Object.keys(errors).length > 0
    ? { errors, ok: false }
    : {
        ok: true,
        paidMinor,
        payments,
        remainingMinor: totalMinor - paidMinor,
      };
}

export function paymentTotal(drafts: readonly PaymentDraft[]): number {
  return drafts.reduce((sum, draft) => sum + (parseTaka(draft.amount) ?? 0), 0);
}

export function remainingPayment(
  totalMinor: number,
  paidMinor: number,
): number {
  return Math.max(0, totalMinor - paidMinor);
}

export function normalizedCheckoutSignature(input: {
  allowOutstanding: boolean;
  payments: CheckoutPosCartServiceInputContract["payments"];
}): string {
  return JSON.stringify({
    allowOutstanding: input.allowOutstanding,
    payments: input.payments.map((payment) => ({
      amountMinor: payment.amountMinor,
      method: payment.method,
      reference: payment.reference?.trim().replace(/\s+/gu, " ") ?? null,
    })),
  });
}

export function prepareCheckoutAttempt(
  previous: CheckoutAttempt | null,
  input: {
    allowOutstanding: boolean;
    payments: CheckoutPosCartServiceInputContract["payments"];
  },
  createKey: () => string = () => crypto.randomUUID(),
): CheckoutAttempt {
  const signature = normalizedCheckoutSignature(input);
  return previous?.signature === signature
    ? previous
    : { idempotencyKey: `pos-${createKey()}`, signature };
}
