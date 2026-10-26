import { describe, expect, it } from "vitest";
import { withExchangeCredit } from "../sell/_components/payment-panel";
import {
  exchangeCheckoutIdFrom,
  exchangeHref,
  exchangeRefundKey,
  splitExchange,
} from "./exchange";

const id = "b55c82d4-96e5-44cc-8982-b69a16100216";

describe("exchange", () => {
  it("customer pays only the difference for a dearer item", () => {
    expect(splitExchange(148_000, 160_000)).toEqual({
      appliedCreditMinor: 148_000,
      customerPaysMinor: 12_000,
      giveBackMinor: 0,
    });
  });

  it("gives the rest back for a cheaper item", () => {
    expect(splitExchange(148_000, 135_000)).toEqual({
      appliedCreditMinor: 135_000,
      customerPaysMinor: 0,
      giveBackMinor: 13_000,
    });
  });

  it("same price swap (other size or colour) moves no money", () => {
    expect(splitExchange(148_000, 148_000)).toEqual({
      appliedCreditMinor: 148_000,
      customerPaysMinor: 0,
      giveBackMinor: 0,
    });
  });

  it("round-trips the old sale id through the New Sale link", () => {
    const href = exchangeHref(id);
    expect(exchangeCheckoutIdFrom(href.slice(href.indexOf("?")))).toBe(id);
    expect(exchangeCheckoutIdFrom("?exchange=not-an-id")).toBeNull();
    expect(exchangeCheckoutIdFrom("")).toBeNull();
  });

  it("adds the credit to the cash line, or as a new cash line", () => {
    expect(
      withExchangeCredit(
        [
          { amountMinor: 5_000, method: "MOBILE_BANKING", reference: "TX1" },
          { amountMinor: 7_000, method: "CASH" },
        ],
        148_000,
      ),
    ).toEqual([
      { amountMinor: 5_000, method: "MOBILE_BANKING", reference: "TX1" },
      { amountMinor: 155_000, method: "CASH" },
    ]);
    expect(
      withExchangeCredit(
        [{ amountMinor: 12_000, method: "MOBILE_BANKING", reference: "TX2" }],
        148_000,
      ),
    ).toEqual([
      { amountMinor: 12_000, method: "MOBILE_BANKING", reference: "TX2" },
      { amountMinor: 148_000, method: "CASH" },
    ]);
    // Fully paid by the credit (same price swap).
    expect(withExchangeCredit([], 148_000)).toEqual([
      { amountMinor: 148_000, method: "CASH" },
    ]);
  });

  it("refund key fits the API limit and is tied to the new sale", () => {
    const key = exchangeRefundKey(id);
    expect(key).toBe(`exchange-${id}`);
    expect(key.length).toBeLessThanOrEqual(64);
    expect(key).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u);
  });
});
