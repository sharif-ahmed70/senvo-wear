import {
  BusinessRuleError,
  ConcurrencyError,
  ConflictError,
  confirmInventoryReservation,
  createInventoryReservation,
  encodeAvailabilityCursor,
  encodeReservationCursor,
  expireInventoryReservation,
  getAvailableToSell,
  getReservedQuantity,
  listInventoryReservations,
  listLocationAvailability,
  parseAvailabilityCursor,
  parseReservationCursor,
  releaseInventoryReservation,
  type CreateInventoryReservationRecord,
  type CursorPageResult,
  type InventoryAvailability,
  type InventoryAvailabilityFilter,
  type InventoryAvailabilityQueryRepository,
  type InventoryReservation,
  type InventoryReservationListFilter,
  type InventoryReservationRepository,
  type InventoryReservationStatus,
} from "../../index.js";
import { describe, expect, it } from "vitest";

const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "33333333-3333-4333-8333-333333333333";
const nonSellableLocationId = "44444444-4444-4444-8444-444444444444";
const inactiveLocationId = "55555555-5555-4555-8555-555555555555";
const variantId = "66666666-6666-4666-8666-666666666666";
const inactiveVariantId = "77777777-7777-4777-8777-777777777777";
const archivedVariantId = "88888888-8888-4888-8888-888888888888";

describe("inventory reservation use cases", () => {
  it("creates active reservation and derives reserved and ATS", async () => {
    const repository = createRepository();

    const reservation = await createReservation(repository);

    expect(reservation).toMatchObject({
      reservationNumber: "RSV-1",
      status: "ACTIVE",
      version: 1,
    });
    await expect(
      getReservedQuantity(repository, {
        organizationId,
        productVariantId: variantId,
        stockLocationId: locationId,
      }),
    ).resolves.toBe(4);
    await expect(
      getAvailableToSell(repository, {
        organizationId,
        productVariantId: variantId,
        stockLocationId: locationId,
      }),
    ).resolves.toMatchObject({
      availableQuantity: 6,
      onHandQuantity: 10,
      reservedQuantity: 4,
    });
  });

  it("rejects insufficient ATS and keeps multi-line creation atomic", async () => {
    const repository = createRepository();

    await expect(
      createReservation(repository, {
        lines: [{ productVariantId: variantId, quantity: 11 }],
      }),
    ).rejects.toThrow("Insufficient available stock");

    await expect(
      createReservation(repository, {
        lines: [
          { productVariantId: variantId, quantity: 4 },
          { productVariantId: inactiveVariantId, quantity: 1 },
        ],
      }),
    ).rejects.toThrow("variants must be active");
    await expect(
      getReservedQuantity(repository, {
        organizationId,
        productVariantId: variantId,
        stockLocationId: locationId,
      }),
    ).resolves.toBe(0);
  });

  it("rejects duplicate variants, non-positive quantity, and ineligible inventory", async () => {
    const repository = createRepository();

    await expect(
      createReservation(repository, {
        lines: [
          { productVariantId: variantId, quantity: 1 },
          { productVariantId: variantId, quantity: 1 },
        ],
      }),
    ).rejects.toThrow("only once");
    await expect(
      createReservation(repository, {
        lines: [{ productVariantId: variantId, quantity: 0 }],
      }),
    ).rejects.toThrow("positive integer");
    await expect(
      createReservation(repository, {
        stockLocationId: inactiveLocationId,
      }),
    ).rejects.toThrow("location must be active");
    await expect(
      createReservation(repository, {
        stockLocationId: nonSellableLocationId,
      }),
    ).rejects.toThrow("sellable");
    await expect(
      createReservation(repository, {
        lines: [{ productVariantId: inactiveVariantId, quantity: 1 }],
      }),
    ).rejects.toThrow("variants must be active");
    await expect(
      createReservation(repository, {
        lines: [{ productVariantId: archivedVariantId, quantity: 1 }],
      }),
    ).rejects.toThrow("variants must be active");
  });

  it("handles idempotency and conflicting idempotency keys", async () => {
    const repository = createRepository();
    const first = await createReservation(repository);
    const retry = await createReservation(repository);

    expect(retry.id).toBe(first.id);
    await expect(
      createReservation(repository, {
        lines: [{ productVariantId: variantId, quantity: 5 }],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("supports valid lifecycle transitions and excludes terminal reservations from reserved quantity", async () => {
    const repository = createRepository();

    const confirmed = await confirmInventoryReservation(repository, {
      expectedVersion: (await createReservation(repository)).version,
      organizationId,
      reservationId: "99999999-9999-4999-8999-000000000001",
    });
    expect(confirmed.status).toBe("CONFIRMED");
    await expectReserved(repository, 0);

    const releasedSource = await createReservation(repository, {
      idempotencyKey: "reservation-release",
      reservationNumber: "RSV-2",
    });
    await expect(
      releaseInventoryReservation(repository, {
        expectedVersion: releasedSource.version,
        organizationId,
        reservationId: releasedSource.id,
      }),
    ).resolves.toMatchObject({ status: "RELEASED" });

    const expiredSource = await createReservation(repository, {
      expiresAt: "2999-01-01T00:00:00.000Z",
      idempotencyKey: "reservation-expire",
      reservationNumber: "RSV-3",
    });
    await expect(
      expireInventoryReservation(repository, {
        expectedVersion: expiredSource.version,
        organizationId,
        reservationId: expiredSource.id,
      }),
    ).resolves.toMatchObject({ status: "EXPIRED" });
  });

  it("rejects terminal transitions and stale expected versions", async () => {
    const repository = createRepository();
    const reservation = await createReservation(repository);

    await confirmInventoryReservation(repository, {
      expectedVersion: reservation.version,
      organizationId,
      reservationId: reservation.id,
    });
    await expect(
      releaseInventoryReservation(repository, {
        expectedVersion: 2,
        organizationId,
        reservationId: reservation.id,
      }),
    ).rejects.toThrow("Terminal");

    const active = await createReservation(repository, {
      idempotencyKey: "reservation-stale",
      reservationNumber: "RSV-STALE",
    });
    await expect(
      releaseInventoryReservation(repository, {
        expectedVersion: 99,
        organizationId,
        reservationId: active.id,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it("validates future expiresAt and lists expired active reservations", async () => {
    const repository = createRepository();

    await expect(
      createReservation(repository, {
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("future");

    const expiring = await createReservation(repository, {
      expiresAt: "2999-01-01T00:00:00.000Z",
    });
    const page = await listInventoryReservations(repository, {
      expiresBefore: "3000-01-01T00:00:00.000Z",
      organizationId,
      status: "ACTIVE",
    });
    expect(page.items).toMatchObject([{ id: expiring.id }]);
  });

  it("lists availability and validates cursors", async () => {
    const repository = createRepository();
    await createReservation(repository);

    await expect(
      listLocationAvailability(repository, {
        onlyAvailable: true,
        organizationId,
        stockLocationId: locationId,
      }),
    ).resolves.toMatchObject({
      items: [{ availableQuantity: 6, reservedQuantity: 4 }],
    });

    expect(
      parseReservationCursor(
        encodeReservationCursor(
          new Date("2026-07-03T00:00:00.000Z"),
          variantId,
        ),
      ),
    ).toMatchObject({ id: variantId });
    expect(
      parseAvailabilityCursor(encodeAvailabilityCursor(variantId)),
    ).toEqual({ productVariantId: variantId });
    expect(() => parseReservationCursor("bad")).toThrow("cursor is invalid");
    expect(() => parseAvailabilityCursor("bad")).toThrow("cursor is invalid");
  });
});

function createRepository() {
  const repository = new InMemoryInventoryReservationRepository();
  repository.setLocation(locationId, { isSellable: true, status: "ACTIVE" });
  repository.setLocation(nonSellableLocationId, {
    isSellable: false,
    status: "ACTIVE",
  });
  repository.setLocation(inactiveLocationId, {
    isSellable: true,
    status: "INACTIVE",
  });
  repository.setVariant(variantId, "ACTIVE");
  repository.setVariant(inactiveVariantId, "INACTIVE");
  repository.setVariant(archivedVariantId, "ARCHIVED");
  repository.setOnHand(locationId, variantId, 10);
  return repository;
}

async function createReservation(
  repository: InventoryReservationRepository,
  input?: Partial<CreateReservationInput>,
) {
  return createInventoryReservation(repository, {
    idempotencyKey: input?.idempotencyKey ?? "reservation-key",
    lines: input?.lines ?? [{ productVariantId: variantId, quantity: 4 }],
    organizationId,
    reservationNumber: input?.reservationNumber ?? "RSV-1",
    stockLocationId: input?.stockLocationId ?? locationId,
    expiresAt: input?.expiresAt,
  });
}

type CreateReservationInput = Parameters<typeof createInventoryReservation>[1];

async function expectReserved(
  repository: InventoryReservationRepository,
  quantity: number,
) {
  await expect(
    getReservedQuantity(repository, {
      organizationId,
      productVariantId: variantId,
      stockLocationId: locationId,
    }),
  ).resolves.toBe(quantity);
}

class InMemoryInventoryReservationRepository
  implements
    InventoryReservationRepository,
    InventoryAvailabilityQueryRepository
{
  private counter = 0;
  private readonly locations = new Map<
    string,
    { isSellable: boolean; status: "ACTIVE" | "INACTIVE" | "ARCHIVED" }
  >();
  private readonly onHand = new Map<string, number>();
  private readonly reservations = new Map<string, InventoryReservation>();
  private readonly variants = new Map<
    string,
    "ACTIVE" | "INACTIVE" | "ARCHIVED"
  >();

  setLocation(
    id: string,
    status: { isSellable: boolean; status: "ACTIVE" | "INACTIVE" | "ARCHIVED" },
  ) {
    this.locations.set(id, status);
  }

  setOnHand(location: string, variant: string, quantity: number) {
    this.onHand.set(this.key(location, variant), quantity);
  }

  setVariant(id: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
    this.variants.set(id, status);
  }

  async changeStatus(input: {
    expectedVersion: number;
    organizationId: string;
    reservationId: string;
    status: Exclude<InventoryReservationStatus, "ACTIVE">;
  }): Promise<InventoryReservation> {
    const reservation = await this.findById(
      input.reservationId,
      input.organizationId,
    );
    if (!reservation) {
      throw new BusinessRuleError("same organization");
    }
    if (reservation.status !== "ACTIVE") {
      throw new BusinessRuleError("Terminal reservations cannot transition.");
    }
    if (reservation.version !== input.expectedVersion) {
      throw new ConcurrencyError();
    }
    const now = new Date("2026-07-03T00:01:00.000Z");
    const changed = {
      ...reservation,
      confirmedAt: input.status === "CONFIRMED" ? now : null,
      expiredAt: input.status === "EXPIRED" ? now : null,
      releasedAt: input.status === "RELEASED" ? now : null,
      status: input.status,
      updatedAt: now,
      version: reservation.version + 1,
    };
    this.reservations.set(changed.id, changed);
    return changed;
  }

  async createActive(
    record: CreateInventoryReservationRecord,
  ): Promise<InventoryReservation> {
    const existing = await this.findByIdempotencyKey(
      record.organizationId,
      record.idempotencyKey,
    );
    if (existing) {
      return existing;
    }
    const location = this.locations.get(record.stockLocationId);
    if (!location || location.status !== "ACTIVE") {
      throw new BusinessRuleError("Reservation location must be active.");
    }
    if (!location.isSellable) {
      throw new BusinessRuleError("Reservation location must be sellable.");
    }
    for (const line of record.lines) {
      if (this.variants.get(line.productVariantId) !== "ACTIVE") {
        throw new BusinessRuleError("Reservation variants must be active.");
      }
      const availability = await this.getAvailability({
        organizationId: record.organizationId,
        productVariantId: line.productVariantId,
        stockLocationId: record.stockLocationId,
      });
      if (availability.availableQuantity < line.quantity) {
        throw new BusinessRuleError(
          `Insufficient available stock for variant ${line.productVariantId} at location ${record.stockLocationId}: onHand ${availability.onHandQuantity}, reserved ${availability.reservedQuantity}, available ${availability.availableQuantity}, requested ${line.quantity}.`,
        );
      }
    }
    const id = `99999999-9999-4999-8999-${(++this.counter)
      .toString()
      .padStart(12, "0")}`;
    const now = new Date("2026-07-03T00:00:00.000Z");
    const reservation: InventoryReservation = {
      ...record,
      confirmedAt: null,
      consumedByMovementId: null,
      createdAt: now,
      expiredAt: null,
      id,
      lines: record.lines.map((line, index) => ({
        ...line,
        createdAt: now,
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${(index + this.counter)
          .toString()
          .padStart(12, "0")}`,
        lineNumber: index + 1,
        organizationId: record.organizationId,
        reservationId: id,
      })),
      isConsumed: false,
      releasedAt: null,
      status: "ACTIVE",
      updatedAt: now,
      version: 1,
    };
    this.reservations.set(id, reservation);
    return reservation;
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<InventoryReservation | null> {
    await Promise.resolve();
    const reservation = this.reservations.get(id);
    return reservation?.organizationId === organizationId ? reservation : null;
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<InventoryReservation | null> {
    await Promise.resolve();
    return (
      [...this.reservations.values()].find(
        (reservation) =>
          reservation.organizationId === organizationId &&
          reservation.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async getPayloadSignature(): Promise<string | null> {
    await Promise.resolve();
    return null;
  }

  async getAvailability(input: {
    organizationId: string;
    productVariantId: string;
    stockLocationId: string;
  }): Promise<InventoryAvailability> {
    const onHandQuantity =
      this.onHand.get(
        this.key(input.stockLocationId, input.productVariantId),
      ) ?? 0;
    const reservedQuantity = await this.sumActiveReserved(input);
    return {
      ...input,
      availableQuantity: onHandQuantity - reservedQuantity,
      onHandQuantity,
      reservedQuantity,
    };
  }

  async list(
    filter: InventoryReservationListFilter,
  ): Promise<CursorPageResult<InventoryReservation>> {
    await Promise.resolve();
    return {
      hasMore: false,
      items: [...this.reservations.values()].filter(
        (reservation) =>
          reservation.organizationId === filter.organizationId &&
          (!filter.status || reservation.status === filter.status) &&
          (!filter.stockLocationId ||
            reservation.stockLocationId === filter.stockLocationId) &&
          (!filter.expiresBefore ||
            (reservation.expiresAt !== null &&
              reservation.expiresAt < filter.expiresBefore)),
      ),
      nextCursor: null,
    };
  }

  async listByLocation(
    filter: InventoryAvailabilityFilter,
  ): Promise<CursorPageResult<InventoryAvailability>> {
    const productVariantIds = [
      ...new Set(
        [...this.onHand.keys()]
          .filter((key) => key.startsWith(`${filter.stockLocationId}:`))
          .map((key) => key.split(":")[1])
          .filter((id): id is string => id !== undefined),
      ),
    ];
    const items = await Promise.all(
      productVariantIds.map((productVariantId) =>
        this.getAvailability({
          organizationId: filter.organizationId,
          productVariantId,
          stockLocationId: filter.stockLocationId,
        }),
      ),
    );
    return {
      hasMore: false,
      items: items.filter(
        (item) => !filter.onlyAvailable || item.availableQuantity > 0,
      ),
      nextCursor: null,
    };
  }

  async sumActiveReserved(input: {
    organizationId: string;
    productVariantId: string;
    stockLocationId: string;
  }): Promise<number> {
    await Promise.resolve();
    return [...this.reservations.values()]
      .filter(
        (reservation) =>
          reservation.organizationId === input.organizationId &&
          reservation.stockLocationId === input.stockLocationId &&
          reservation.status === "ACTIVE",
      )
      .flatMap((reservation) => reservation.lines)
      .filter((line) => line.productVariantId === input.productVariantId)
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  private key(location: string, variant: string) {
    return `${location}:${variant}`;
  }
}
