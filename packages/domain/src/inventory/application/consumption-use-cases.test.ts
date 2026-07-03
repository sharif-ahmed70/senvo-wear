import { describe, expect, it } from "vitest";
import { ConflictError } from "../../errors.js";
import type {
  ConsumeInventoryReservationRecord,
  ConsumeInventoryReservationResult,
  InventoryReservationConsumptionRepository,
} from "../repositories/inventory-repositories.js";
import { consumeInventoryReservation } from "./consumption-use-cases.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const reservationId = "22222222-2222-4222-8222-222222222222";
const movementId = "33333333-3333-4333-8333-333333333333";
const variantId = "44444444-4444-4444-8444-444444444444";
const locationId = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-07-03T00:00:00.000Z");

describe("consumeInventoryReservation", () => {
  it("normalizes a focused consumption command and returns linkage output", async () => {
    const repository = new CapturingConsumptionRepository();

    const result = await consumeInventoryReservation(repository, {
      expectedReservationVersion: 1,
      idempotencyKey: " consume-key ",
      movementNumber: " ISSUE-RSV-1 ",
      note: " ship reserved stock ",
      occurredAt: now.toISOString(),
      organizationId,
      referenceId: " REF-1 ",
      referenceType: " MANUAL ",
      reservationId,
    });

    expect(repository.lastRecord).toMatchObject({
      expectedReservationVersion: 1,
      idempotencyKey: "consume-key",
      movementNumber: "ISSUE-RSV-1",
      note: "ship reserved stock",
      referenceId: "REF-1",
      referenceType: "MANUAL",
    });
    expect(repository.lastPayloadSignature).toContain(reservationId);
    expect(result.movement).toMatchObject({
      consumesReservationId: reservationId,
      isReservationConsumption: true,
      sourceLocationId: locationId,
      status: "POSTED",
      type: "ISSUE",
    });
    expect(result.reservation).toMatchObject({
      consumedByMovementId: movementId,
      isConsumed: true,
      status: "CONFIRMED",
      version: 2,
    });
  });

  it("rejects invalid expected reservation versions before persistence", async () => {
    const repository = new CapturingConsumptionRepository();

    await expect(
      consumeInventoryReservation(repository, {
        expectedReservationVersion: 0,
        idempotencyKey: "consume-key",
        movementNumber: "ISSUE-RSV-1",
        occurredAt: now,
        organizationId,
        reservationId,
      }),
    ).rejects.toThrow("expectedReservationVersion");
    expect(repository.lastRecord).toBeNull();
  });

  it("lets the repository enforce conflicting idempotency payloads", async () => {
    const repository = new CapturingConsumptionRepository({ conflict: true });

    await expect(
      consumeInventoryReservation(repository, {
        expectedReservationVersion: 1,
        idempotencyKey: "consume-key",
        movementNumber: "ISSUE-RSV-1",
        occurredAt: now,
        organizationId,
        reservationId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

class CapturingConsumptionRepository implements InventoryReservationConsumptionRepository {
  lastPayloadSignature: string | null = null;
  lastRecord: ConsumeInventoryReservationRecord | null = null;

  constructor(private readonly options: { conflict?: boolean } = {}) {}

  async consume(
    record: ConsumeInventoryReservationRecord,
    payloadSignature: string,
  ): Promise<ConsumeInventoryReservationResult> {
    await Promise.resolve();
    this.lastRecord = record;
    this.lastPayloadSignature = payloadSignature;
    if (this.options.conflict) {
      throw new ConflictError("Idempotency key was already used.");
    }
    return {
      movement: {
        consumesReservationId: reservationId,
        createdAt: now,
        destinationLocationId: null,
        id: movementId,
        idempotencyKey: record.idempotencyKey,
        isReservationConsumption: true,
        isReversal: false,
        isReversed: false,
        lines: [
          {
            createdAt: now,
            id: "66666666-6666-4666-8666-666666666666",
            lineNumber: 1,
            movementId,
            note: null,
            organizationId,
            productVariantId: variantId,
            quantity: 4,
          },
        ],
        movementNumber: record.movementNumber,
        note: record.note,
        occurredAt: record.occurredAt,
        organizationId,
        postedAt: now,
        referenceId: record.referenceId,
        referenceType: record.referenceType,
        reversedByMovementId: null,
        reversalReason: null,
        reversesMovementId: null,
        sourceLocationId: locationId,
        status: "POSTED",
        type: "ISSUE",
        updatedAt: now,
        version: 2,
      },
      reservation: {
        confirmedAt: now,
        consumedByMovementId: movementId,
        createdAt: now,
        expiredAt: null,
        expiresAt: null,
        id: reservationId,
        idempotencyKey: "reserve-key",
        isConsumed: true,
        lines: [
          {
            createdAt: now,
            id: "77777777-7777-4777-8777-777777777777",
            lineNumber: 1,
            organizationId,
            productVariantId: variantId,
            quantity: 4,
            reservationId,
          },
        ],
        note: null,
        organizationId,
        referenceId: null,
        referenceType: null,
        releasedAt: null,
        reservationNumber: "RSV-1",
        status: "CONFIRMED",
        stockLocationId: locationId,
        updatedAt: now,
        version: 2,
      },
    };
  }
}
