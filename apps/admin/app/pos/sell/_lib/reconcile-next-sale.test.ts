import type { SalesSessionContract } from "@senvo/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  reconcileNextSale,
  type NextSaleSessionGateway,
} from "./reconcile-next-sale";

const counterId = id("1");
const completedSession = session("2", 4);

describe("next-sale reconciliation", () => {
  it("starts the next cart in the same daily session without close/reopen", async () => {
    const next = { ...completedSession, cartId: id("10") };
    const startNextCart = vi.fn(() => Promise.resolve(next));
    await expect(
      reconcileNextSale(
        { startNextCart },
        { completedSessionId: completedSession.id, counterId },
      ),
    ).resolves.toEqual(next);
    expect(startNextCart).toHaveBeenCalledWith(completedSession.id);
  });
  it("allows a safe retry after response loss against the same session", async () => {
    const next = { ...completedSession, cartId: id("10") };
    const startNextCart = vi
      .fn<NextSaleSessionGateway["startNextCart"]>()
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValue(next);
    const input = { completedSessionId: completedSession.id, counterId };
    await expect(reconcileNextSale({ startNextCart }, input)).rejects.toThrow(
      "response lost",
    );
    await expect(reconcileNextSale({ startNextCart }, input)).resolves.toEqual(
      next,
    );
    expect(startNextCart.mock.calls).toEqual([
      [completedSession.id],
      [completedSession.id],
    ]);
  });
});

function session(suffix: string, version: number): SalesSessionContract {
  const timestamp = "2026-08-09T09:00:00.000Z";
  return {
    cartId: id(`${suffix}4`),
    closedAt: null,
    counterId,
    createdAt: timestamp,
    id: id(suffix),
    openedAt: timestamp,
    openedByUserId: id("9"),
    openingFloatMinor: 0,
    status: "OPEN",
    updatedAt: timestamp,
    version,
  };
}

function id(suffix: string) {
  return `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
}
