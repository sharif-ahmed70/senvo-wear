import { describe, expect, it } from "vitest";
import {
  normalizedCheckoutSignature,
  paymentTotal,
  prepareCheckoutAttempt,
  remainingPayment,
  validatePayments,
  type PaymentDraft,
} from "./checkout-attempt";

const cash: PaymentDraft = {
  amount: "10.00",
  id: "cash",
  method: "CASH",
  reference: "",
};

describe("cashier payment preparation", () => {
  it("calculates entered and remaining amounts", () => {
    expect(
      paymentTotal([cash, { ...cash, amount: "2.50", id: "cash-2" }]),
    ).toBe(1250);
    expect(remainingPayment(1500, 1250)).toBe(250);
  });

  it("normalizes split payment and safe references", () => {
    const result = validatePayments(
      [
        cash,
        {
          amount: "5",
          id: "mobile",
          method: "MOBILE_BANKING",
          reference: "  TX  42 ",
        },
      ],
      1500,
      false,
    );
    expect(result).toEqual({
      ok: true,
      paidMinor: 1500,
      payments: [
        { amountMinor: 1000, method: "CASH" },
        { amountMinor: 500, method: "MOBILE_BANKING", reference: "TX 42" },
      ],
      remainingMinor: 0,
    });
  });

  it("requires non-cash references and blocks overpayment", () => {
    expect(
      validatePayments([{ ...cash, method: "CARD" }], 1000, false),
    ).toMatchObject({
      errors: { "0.reference": "Enter the transaction reference." },
      ok: false,
    });
    expect(
      validatePayments([{ ...cash, method: "MOBILE_BANKING" }], 1000, false),
    ).toMatchObject({
      errors: { "0.reference": "Enter the bKash/Nagad TrxID." },
      ok: false,
    });
    expect(
      validatePayments([{ ...cash, amount: "11" }], 1000, false),
    ).toMatchObject({
      errors: {
        payments: "Entered payments cannot be greater than the order total.",
      },
      ok: false,
    });
  });

  it("permits explicit partial and zero-payment sales only when enabled", () => {
    expect(validatePayments([cash], 1500, true)).toMatchObject({
      ok: true,
      remainingMinor: 500,
    });
    expect(validatePayments([], 1500, true)).toEqual({
      ok: true,
      paidMinor: 0,
      payments: [],
      remainingMinor: 1500,
    });
    expect(validatePayments([], 1500, false)).toMatchObject({ ok: false });
  });

  it("keeps an idempotency key for identical retry content", () => {
    const payload = {
      allowOutstanding: false,
      payments: [{ amountMinor: 1000, method: "CASH" as const }],
    };
    const first = prepareCheckoutAttempt(null, payload, () => "first");
    const retry = prepareCheckoutAttempt(first, payload, () => "second");
    const changed = prepareCheckoutAttempt(
      first,
      { ...payload, payments: [{ amountMinor: 900, method: "CASH" }] },
      () => "changed",
    );
    expect(retry).toBe(first);
    expect(changed.idempotencyKey).toBe("pos-changed");
  });

  it("creates a stable ordered normalized payload signature", () => {
    const input = {
      allowOutstanding: false,
      payments: [
        { amountMinor: 1000, method: "CARD" as const, reference: " A  1 " },
      ],
    };
    expect(normalizedCheckoutSignature(input)).toBe(
      normalizedCheckoutSignature(input),
    );
    expect(normalizedCheckoutSignature(input)).toContain('"reference":"A 1"');
  });

  it("changes idempotency key when customer info changes", () => {
    const payload = {
      allowOutstanding: false,
      customer: {
        addressLine1: "12/A Dhanmondi",
        name: "Rahim Uddin",
        phone: "+8801700000000",
      },
      payments: [{ amountMinor: 1000, method: "CASH" as const }],
    };
    const first = prepareCheckoutAttempt(null, payload, () => "first");
    const retry = prepareCheckoutAttempt(first, payload, () => "second");
    const changed = prepareCheckoutAttempt(
      first,
      {
        ...payload,
        customer: { ...payload.customer, name: "Karim Mia" },
      },
      () => "changed",
    );
    expect(retry).toBe(first);
    expect(changed.idempotencyKey).toBe("pos-changed");
  });
});
