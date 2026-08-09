import { describe, expect, it } from "vitest";
import {
  appendRefundMethod,
  createRefundPayload,
  maxRefundMethodLines,
  updateRefundMethod,
  type RefundDraftLine,
} from "./checkout-refund-workspace";

describe("checkout refund draft helpers", () => {
  it("clears a stale card reference when switching to cash and omits it from submission", () => {
    const card: RefundDraftLine[] = [
      { amount: "10.00", method: "CARD", reference: "CARD-REF-1" },
    ];

    const cash = updateRefundMethod(card, 0, { method: "CASH" });

    expect(cash[0]?.reference).toBe("");
    expect(createRefundPayload(cash)).toEqual([
      { amountMinor: 1_000, method: "CASH" },
    ]);
  });

  it("does not create more than eight refund method rows", () => {
    let lines: RefundDraftLine[] = [];
    for (let index = 0; index < maxRefundMethodLines + 2; index += 1) {
      lines = appendRefundMethod(lines);
    }

    expect(lines).toHaveLength(8);
    expect(appendRefundMethod(lines)).toHaveLength(8);
  });
});
