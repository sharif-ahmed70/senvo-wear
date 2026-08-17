import { describe, expect, it } from "vitest";
import { checkoutAttempt } from "./_lib/checkout-attempt";

describe("storefront checkout attempt", () => {
  it("preserves the key for an uncertain retry and rotates it for changed input", () => {
    let stored = "";
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };
    let sequence = 0;
    const createId = () => `id-${++sequence}`;
    const first = checkoutAttempt(
      storage,
      { lines: [{ id: "a", quantity: 1 }] },
      createId,
    );
    const retry = checkoutAttempt(
      storage,
      { lines: [{ id: "a", quantity: 1 }] },
      createId,
    );
    const changed = checkoutAttempt(
      storage,
      { lines: [{ id: "a", quantity: 2 }] },
      createId,
    );
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
  });
});
