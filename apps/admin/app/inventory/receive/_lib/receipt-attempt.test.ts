import { describe, expect, it, vi } from "vitest";
import type { InventoryMovementContract } from "@senvo/contracts";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import {
  canReceiveStock,
  receiptPermissions,
  ReceiptAttempt,
} from "./receipt-attempt";

const input = {
  destinationLocationId: "10000000-0000-4000-8000-000000000001",
  idempotencyKey: "admin-receive:retry-1",
  lines: [
    { productVariantId: "10000000-0000-4000-8000-000000000002", quantity: 5 },
  ],
  movementNumber: "REC-RETRY-1",
  note: "Shipment",
  occurredAt: "2026-09-25T12:00:00.000Z",
  referenceId: "retry-1",
  referenceType: "ADMIN_RECEIPT",
  sourceLocationId: null,
  type: "RECEIPT" as const,
};
const draft = {
  id: "10000000-0000-4000-8000-000000000003",
  status: "DRAFT",
} as InventoryMovementContract;
const posted = { ...draft, status: "POSTED" } as InventoryMovementContract;
function client() {
  return {
    createInventoryMovementDraft: vi.fn().mockResolvedValue({ data: draft }),
    postInventoryMovement: vi.fn().mockResolvedValue({ data: posted }),
  };
}
function rejection(status: number) {
  return new AdminApiError({
    code: "VALIDATION.INVALID_INPUT",
    message: "Rejected",
    requestId: "req_receipt",
    status,
  });
}

describe("receipt attempts", () => {
  it.each(receiptPermissions)("requires %s before receiving", (missing) => {
    expect(
      canReceiveStock(receiptPermissions.filter((p) => p !== missing)),
    ).toBe(false);
  });
  it("accepts complete permissions and validates before locking an attempt", () => {
    expect(canReceiveStock(receiptPermissions)).toBe(true);
    expect(() => new ReceiptAttempt({ ...input, lines: [] })).toThrow();
  });
  it("replays identical HTTP payload after creation succeeds but its response is lost", async () => {
    const payload = structuredClone(input);
    const attempt = new ReceiptAttempt(payload);
    const bodies: string[] = [];
    let creations = 0;
    let saved: string | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      const body = init?.body;
      if (typeof body !== "string")
        return Promise.reject(new Error("Expected a JSON request body"));
      if (body.includes("idempotencyKey")) {
        bodies.push(body);
        if (!saved) {
          saved = body;
          creations++;
          return Promise.reject(new TypeError("Response lost"));
        }
        expect(body).toBe(saved);
        return Promise.resolve(
          Response.json({
            success: true,
            data: draft,
            requestId: "req_replay",
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          success: true,
          data: posted,
          requestId: "req_post",
        }),
      );
    });
    const api = new AdminApiClient({
      baseUrl: "https://receipt.example.test",
      fetcher,
    });
    await expect(attempt.submit(api)).rejects.toThrow();
    expect(attempt.locked).toBe(true);
    payload.lines[0]!.quantity = 99;
    payload.note = "Changed after request";
    payload.occurredAt = "2026-09-26T12:00:00.000Z";
    await expect(attempt.submit(api)).resolves.toEqual(posted);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(creations).toBe(1);
  });
  it("blocks concurrent submissions synchronously", async () => {
    const api = client();
    let release!: (value: { data: InventoryMovementContract }) => void;
    api.createInventoryMovementDraft.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const attempt = new ReceiptAttempt(input);
    const first = attempt.submit(api);
    await expect(attempt.submit(api)).resolves.toBeNull();
    expect(api.createInventoryMovementDraft).toHaveBeenCalledTimes(1);
    release({ data: draft });
    await first;
    expect(api.postInventoryMovement).toHaveBeenCalledTimes(1);
  });
  it("retries only the same posting after losing its response", async () => {
    const api = client();
    api.postInventoryMovement.mockRejectedValueOnce(
      new TypeError("Response lost"),
    );
    const attempt = new ReceiptAttempt(input);
    await expect(attempt.submit(api)).rejects.toThrow();
    expect(attempt.draft?.id).toBe(draft.id);
    await expect(attempt.submit(api)).resolves.toEqual(posted);
    expect(api.createInventoryMovementDraft).toHaveBeenCalledTimes(1);
    expect(api.postInventoryMovement.mock.calls).toEqual([
      [{ movementId: draft.id }],
      [{ movementId: draft.id }],
    ]);
  });
  it("finishes an already-posted replay without posting again", async () => {
    const api = client();
    api.createInventoryMovementDraft.mockResolvedValue({ data: posted });
    const attempt = new ReceiptAttempt(input);
    await expect(attempt.submit(api)).resolves.toEqual(posted);
    await expect(attempt.submit(api)).resolves.toEqual(posted);
    expect(api.postInventoryMovement).not.toHaveBeenCalled();
    expect(api.createInventoryMovementDraft).toHaveBeenCalledTimes(1);
  });
  it("allows correction after an initial definitive validation rejection", async () => {
    const api = client();
    api.createInventoryMovementDraft.mockRejectedValueOnce(rejection(400));
    const attempt = new ReceiptAttempt(input);
    await expect(attempt.submit(api)).rejects.toThrow();
    expect(attempt.locked).toBe(false);
  });
  it("retains identity after uncertainty even if a later request is rejected", async () => {
    const api = client();
    api.createInventoryMovementDraft
      .mockRejectedValueOnce(new TypeError("Lost"))
      .mockRejectedValueOnce(rejection(400));
    const attempt = new ReceiptAttempt(input);
    await expect(attempt.submit(api)).rejects.toThrow();
    await expect(attempt.submit(api)).rejects.toThrow();
    expect(attempt.locked).toBe(true);
  });
  it("retains the draft when posting permission is revoked", async () => {
    const api = client();
    api.postInventoryMovement.mockRejectedValueOnce(rejection(403));
    const attempt = new ReceiptAttempt(input);
    await expect(attempt.submit(api)).rejects.toThrow();
    expect(attempt.locked).toBe(true);
    expect(attempt.draft?.id).toBe(draft.id);
    await attempt.submit(api);
    expect(api.createInventoryMovementDraft).toHaveBeenCalledTimes(1);
  });
  it("does not report success for an unposted response", async () => {
    const api = client();
    api.postInventoryMovement.mockResolvedValueOnce({ data: draft });
    const attempt = new ReceiptAttempt(input);
    await expect(attempt.submit(api)).rejects.toThrow("has not been posted");
    expect(attempt.locked).toBe(true);
  });
});
