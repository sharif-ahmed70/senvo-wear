import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";
import {
  calculateCumulativePaymentBalance,
  calculatePaymentCollection,
  calculatePaymentBalance,
  createPaymentRequestSignature,
  normalizePaymentInstructions,
} from "./payment-rules.js";
import { describe, expect, it } from "vitest";

describe("checkout payment rules", () => {
  it("accepts fully paid cash, non-cash, and split tenders", () => {
    expect(balance([{ amountMinor: 5000, method: "CASH" }], 5000)).toEqual({
      outstandingMinor: 0,
      paidMinor: 5000,
      status: "PAID",
    });
    expect(
      normalizePaymentInstructions(
        [{ amountMinor: 5000, method: "CARD", reference: "  TXN  123  " }],
        false,
      ),
    ).toEqual([{ amountMinor: 5000, method: "CARD", reference: "TXN 123" }]);
    expect(
      balance(
        [
          { amountMinor: 2000, method: "CASH" },
          { amountMinor: 3000, method: "MOBILE_BANKING", reference: "MB-1" },
        ],
        5000,
      ),
    ).toMatchObject({ paidMinor: 5000, status: "PAID" });
  });

  it("derives partial and zero-payment outstanding balances explicitly", () => {
    expect(
      balance([{ amountMinor: 1500, method: "CASH" }], 5000, true),
    ).toEqual({
      outstandingMinor: 3500,
      paidMinor: 1500,
      status: "PARTIALLY_PAID",
    });
    expect(balance([], 5000, true)).toEqual({
      outstandingMinor: 5000,
      paidMinor: 0,
      status: "UNPAID",
    });
  });

  it("rejects incomplete and overpaid checkouts", () => {
    expect(() => balance([], 5000)).toThrow(BusinessRuleError);
    expect(() =>
      balance([{ amountMinor: 1000, method: "CASH" }], 5000),
    ).toThrow(BusinessRuleError);
    expect(() =>
      balance([{ amountMinor: 5001, method: "CASH" }], 5000),
    ).toThrow(BusinessRuleError);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER])(
    "rejects invalid payment amount %s",
    (amountMinor) => {
      expect(() =>
        normalizePaymentInstructions([{ amountMinor, method: "CASH" }], false),
      ).toThrow(ValidationApplicationError);
    },
  );

  it("protects the PostgreSQL integer range while summing", () => {
    const payments = normalizePaymentInstructions(
      [
        { amountMinor: 2_147_483_647, method: "CASH" },
        { amountMinor: 1, method: "CASH" },
      ],
      false,
    );
    expect(() =>
      calculatePaymentBalance(2_147_483_647, payments, false),
    ).toThrow(ValidationApplicationError);
  });

  it("requires non-cash references and limits payment lines", () => {
    expect(() =>
      normalizePaymentInstructions(
        [{ amountMinor: 5000, method: "BANK_TRANSFER" }],
        false,
      ),
    ).toThrow(ValidationApplicationError);
    expect(() =>
      normalizePaymentInstructions(
        Array.from({ length: 9 }, () => ({
          amountMinor: 1,
          method: "CASH" as const,
        })),
        false,
      ),
    ).toThrow(ValidationApplicationError);
  });

  it("creates an order-sensitive signature from normalized input", () => {
    const first = normalizePaymentInstructions(
      [
        { amountMinor: 2000, method: "CASH" },
        { amountMinor: 3000, method: "CARD", reference: " REF-1 " },
      ],
      false,
    );
    expect(createPaymentRequestSignature(first, false)).toBe(
      createPaymentRequestSignature(first, false),
    );
    expect(createPaymentRequestSignature(first, false)).not.toBe(
      createPaymentRequestSignature([...first].reverse(), false),
    );
    expect(createPaymentRequestSignature(first, false)).not.toBe(
      createPaymentRequestSignature(first, true),
    );
  });

  it("derives cumulative balances across partial collections", () => {
    expect(
      calculateCumulativePaymentBalance(10_000, 2_000, [1_500, 2_500]),
    ).toEqual({
      outstandingMinor: 4_000,
      paidMinor: 6_000,
      status: "PARTIALLY_PAID",
    });
    expect(
      calculatePaymentCollection(10_000, 6_000, [
        { amountMinor: 4_000, method: "CASH", reference: null },
      ]),
    ).toMatchObject({
      amountMinor: 4_000,
      balanceBeforeMinor: 4_000,
      outstandingMinor: 0,
      status: "PAID",
    });
  });

  it("rejects over-collection and collecting an already-paid balance", () => {
    expect(() =>
      calculatePaymentCollection(10_000, 6_000, [
        { amountMinor: 4_001, method: "CASH", reference: null },
      ]),
    ).toThrow(BusinessRuleError);
    expect(() =>
      calculatePaymentCollection(10_000, 10_000, [
        { amountMinor: 1, method: "CASH", reference: null },
      ]),
    ).toThrow(BusinessRuleError);
  });
});

function balance(
  input: Parameters<typeof normalizePaymentInstructions>[0],
  payableMinor: number,
  allowOutstanding = false,
) {
  const payments = normalizePaymentInstructions(input, allowOutstanding);
  return calculatePaymentBalance(payableMinor, payments, allowOutstanding);
}
