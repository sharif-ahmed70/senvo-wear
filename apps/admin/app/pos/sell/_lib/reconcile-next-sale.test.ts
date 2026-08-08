import type { SalesSessionContract } from "@senvo/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  reconcileNextSale,
  type NextSaleSessionGateway,
} from "./reconcile-next-sale";

const counterId = id("1");
const completedSession = session("2", 4);
const nextSession = session("3", 1);

describe("next-sale reconciliation", () => {
  it("closes with the freshly loaded version and opens one new session", async () => {
    const gateway = gatewayWithSessions([[completedSession], [], []]);
    await expect(reconcile(gateway)).resolves.toEqual(nextSession);
    expect(gateway.closeSession).toHaveBeenCalledWith({
      expectedVersion: 4,
      sessionId: completedSession.id,
    });
    expect(gateway.openSession).toHaveBeenCalledTimes(1);
  });

  it("continues when close succeeded but its response was lost", async () => {
    const gateway = gatewayWithSessions([[completedSession], [], []]);
    vi.mocked(gateway.closeSession).mockRejectedValueOnce(
      new TypeError("network response lost"),
    );
    await expect(reconcile(gateway)).resolves.toEqual(nextSession);
    expect(gateway.openSession).toHaveBeenCalledTimes(1);
  });

  it("recovers and reuses a session created before an open response loss", async () => {
    const gateway = gatewayWithSessions([
      [completedSession],
      [],
      [nextSession],
    ]);
    vi.mocked(gateway.openSession).mockRejectedValueOnce(
      new TypeError("network response lost"),
    );
    await expect(reconcile(gateway)).resolves.toEqual(nextSession);
    expect(gateway.openSession).toHaveBeenCalledTimes(1);
  });

  it("reuses an already-created next session without closing or opening", async () => {
    const gateway = gatewayWithSessions([[nextSession]]);
    await expect(reconcile(gateway)).resolves.toEqual(nextSession);
    expect(gateway.closeSession).not.toHaveBeenCalled();
    expect(gateway.openSession).not.toHaveBeenCalled();
  });

  it("keeps the completed sale recoverable when close is still unresolved", async () => {
    const refreshed = { ...completedSession, version: 5 };
    const gateway = gatewayWithSessions([[completedSession], [refreshed]]);
    const failure = new TypeError("close failed");
    vi.mocked(gateway.closeSession).mockRejectedValueOnce(failure);
    await expect(reconcile(gateway)).rejects.toBe(failure);
    expect(gateway.openSession).not.toHaveBeenCalled();
  });
});

function reconcile(gateway: NextSaleSessionGateway) {
  return reconcileNextSale(gateway, {
    completedSessionId: completedSession.id,
    counterId,
  });
}

function gatewayWithSessions(
  responses: readonly (readonly SalesSessionContract[])[],
): NextSaleSessionGateway {
  const listCurrentSessions =
    vi.fn<() => Promise<readonly SalesSessionContract[]>>();
  for (const response of responses) {
    listCurrentSessions.mockResolvedValueOnce(response);
  }
  return {
    closeSession: vi.fn(() => Promise.resolve()),
    listCurrentSessions,
    openSession: vi.fn(() => Promise.resolve(nextSession)),
  };
}

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
    status: "OPEN",
    updatedAt: timestamp,
    version,
  };
}

function id(suffix: string) {
  return `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
}
