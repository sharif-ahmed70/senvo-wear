import {
  BusinessRuleError,
  ConflictError,
  createInventoryMovement,
  encodeBalanceCursor,
  encodeMovementCursor,
  getInventoryMovementById,
  getOnHandBalance,
  listInventoryMovements,
  listLocationBalances,
  parseBalanceCursor,
  parseMovementCursor,
  postInventoryMovement,
  replaceDraftMovementLines,
  reverseInventoryMovement,
  type CreateInventoryMovementRecord,
  type CursorPageResult,
  type InventoryBalanceFilter,
  type InventoryBalanceQueryRepository,
  type InventoryMovement,
  type InventoryMovementListFilter,
  type InventoryMovementRepository,
  type OnHandBalance,
  type ReplaceInventoryMovementLinesRecord,
  type ReverseInventoryMovementRecord,
} from "../../index.js";
import { describe, expect, it } from "vitest";

const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "22222222-2222-4222-8222-222222222222";
const sourceLocationId = "33333333-3333-4333-8333-333333333333";
const destinationLocationId = "44444444-4444-4444-8444-444444444444";
const variantId = "55555555-5555-4555-8555-555555555555";
const otherVariantId = "66666666-6666-4666-8666-666666666666";

describe("inventory movement use cases", () => {
  it.each([
    ["OPENING", null, destinationLocationId],
    ["RECEIPT", null, destinationLocationId],
    ["ISSUE", sourceLocationId, null],
    ["TRANSFER", sourceLocationId, destinationLocationId],
    ["ADJUSTMENT_IN", null, destinationLocationId],
    ["ADJUSTMENT_OUT", sourceLocationId, null],
  ] as const)(
    "creates %s draft movements with valid shape",
    async (type, source, destination) => {
      const repository = new InMemoryInventoryMovementRepository();

      const movement = await createInventoryMovement(repository, {
        destinationLocationId: destination,
        idempotencyKey: `key-${type}`,
        lines: [{ productVariantId: variantId, quantity: 5 }],
        movementNumber: `MOV-${type.replaceAll("_", "-")}`,
        occurredAt: "2026-07-03T00:00:00.000Z",
        organizationId,
        sourceLocationId: source,
        type,
      });

      expect(movement).toMatchObject({
        destinationLocationId: destination,
        sourceLocationId: source,
        status: "DRAFT",
        type,
      });
    },
  );

  it("rejects invalid source and destination combinations", async () => {
    const repository = new InMemoryInventoryMovementRepository();

    await expect(
      createInventoryMovement(repository, {
        destinationLocationId,
        idempotencyKey: "bad-issue",
        lines: [{ productVariantId: variantId, quantity: 1 }],
        movementNumber: "BAD-ISSUE",
        organizationId,
        sourceLocationId,
        type: "ISSUE",
      }),
    ).rejects.toThrow("requires only a source");

    await expect(
      createInventoryMovement(repository, {
        destinationLocationId: sourceLocationId,
        idempotencyKey: "bad-transfer",
        lines: [{ productVariantId: variantId, quantity: 1 }],
        movementNumber: "BAD-TRANSFER",
        organizationId,
        sourceLocationId,
        type: "TRANSFER",
      }),
    ).rejects.toThrow("must be different");
  });

  it("rejects no lines, duplicate variant lines, and non-positive quantity", async () => {
    const repository = new InMemoryInventoryMovementRepository();

    await expect(
      createInventoryMovement(repository, {
        destinationLocationId,
        idempotencyKey: "no-lines",
        lines: [],
        movementNumber: "NO-LINES",
        organizationId,
        type: "OPENING",
      }),
    ).rejects.toThrow("at least one line");

    await expect(
      createInventoryMovement(repository, {
        destinationLocationId,
        idempotencyKey: "duplicate-lines",
        lines: [
          { productVariantId: variantId, quantity: 1 },
          { productVariantId: variantId, quantity: 2 },
        ],
        movementNumber: "DUP-LINES",
        organizationId,
        type: "OPENING",
      }),
    ).rejects.toThrow("only once");

    await expect(
      createInventoryMovement(repository, {
        destinationLocationId,
        idempotencyKey: "zero-lines",
        lines: [{ productVariantId: variantId, quantity: 0 }],
        movementNumber: "ZERO-LINES",
        organizationId,
        type: "OPENING",
      }),
    ).rejects.toThrow("positive integer");
  });

  it("returns existing movement for same idempotent payload and rejects conflicts", async () => {
    const repository = new InMemoryInventoryMovementRepository();
    const first = await createInventoryMovement(repository, {
      destinationLocationId,
      idempotencyKey: "same-key",
      lines: [{ productVariantId: variantId, quantity: 5 }],
      movementNumber: "IDEMPOTENT",
      occurredAt: "2026-07-03T00:00:00.000Z",
      organizationId,
      type: "OPENING",
    });
    const retry = await createInventoryMovement(repository, {
      destinationLocationId,
      idempotencyKey: "same-key",
      lines: [{ productVariantId: variantId, quantity: 5 }],
      movementNumber: "IDEMPOTENT",
      occurredAt: "2026-07-03T00:00:00.000Z",
      organizationId,
      type: "OPENING",
    });

    expect(retry.id).toBe(first.id);
    await expect(
      createInventoryMovement(repository, {
        destinationLocationId,
        idempotencyKey: "same-key",
        lines: [{ productVariantId: variantId, quantity: 6 }],
        movementNumber: "IDEMPOTENT",
        occurredAt: "2026-07-03T00:00:00.000Z",
        organizationId,
        type: "OPENING",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows line replacement only in draft and keeps posted movement immutable", async () => {
    const repository = new InMemoryInventoryMovementRepository();
    const draft = await createOpening(repository);

    const replaced = await replaceDraftMovementLines(repository, {
      lines: [{ productVariantId: otherVariantId, quantity: 2 }],
      movementId: draft.id,
      organizationId,
    });
    expect(replaced.lines).toMatchObject([
      { productVariantId: otherVariantId, quantity: 2 },
    ]);

    await postInventoryMovement(repository, {
      movementId: draft.id,
      organizationId,
    });
    await expect(
      replaceDraftMovementLines(repository, {
        lines: [{ productVariantId: variantId, quantity: 1 }],
        movementId: draft.id,
        organizationId,
      }),
    ).rejects.toThrow("cannot change");
  });

  it("returns posted movement when posting is retried", async () => {
    const repository = new InMemoryInventoryMovementRepository();
    const draft = await createOpening(repository);

    const posted = await postInventoryMovement(repository, {
      movementId: draft.id,
      organizationId,
    });
    const retry = await postInventoryMovement(repository, {
      movementId: draft.id,
      organizationId,
    });

    expect(posted.status).toBe("POSTED");
    expect(retry.id).toBe(posted.id);
  });

  it.each([
    [
      "OPENING",
      null,
      destinationLocationId,
      "ADJUSTMENT_OUT",
      destinationLocationId,
      null,
    ],
    [
      "RECEIPT",
      null,
      destinationLocationId,
      "ADJUSTMENT_OUT",
      destinationLocationId,
      null,
    ],
    ["ISSUE", sourceLocationId, null, "ADJUSTMENT_IN", null, sourceLocationId],
    [
      "TRANSFER",
      sourceLocationId,
      destinationLocationId,
      "TRANSFER",
      destinationLocationId,
      sourceLocationId,
    ],
    [
      "ADJUSTMENT_IN",
      null,
      destinationLocationId,
      "ADJUSTMENT_OUT",
      destinationLocationId,
      null,
    ],
    [
      "ADJUSTMENT_OUT",
      sourceLocationId,
      null,
      "ADJUSTMENT_IN",
      null,
      sourceLocationId,
    ],
  ] as const)(
    "reverses %s with a compensating posted movement",
    async (
      type,
      source,
      destination,
      reversalType,
      reversalSource,
      reversalDestination,
    ) => {
      const repository = new InMemoryInventoryMovementRepository();
      const original = await createInventoryMovement(repository, {
        destinationLocationId: destination,
        idempotencyKey: `original-${type}`,
        lines: [{ productVariantId: variantId, quantity: 5 }],
        movementNumber: `ORIGINAL-${type.replaceAll("_", "-")}`,
        occurredAt: "2026-07-03T00:00:00.000Z",
        organizationId,
        sourceLocationId: source,
        type,
      });
      const posted = await postInventoryMovement(repository, {
        movementId: original.id,
        organizationId,
      });
      if (reversalSource) {
        repository.setBalance(reversalSource, variantId, 5);
      }

      const reversal = await reverseInventoryMovement(repository, {
        idempotencyKey: `reverse-${type}`,
        occurredAt: "2026-07-03T01:00:00.000Z",
        organizationId,
        originalMovementId: posted.id,
        reason: "Audit correction",
        reversalMovementNumber: `REV-${type.replaceAll("_", "-")}`,
      });

      expect(reversal).toMatchObject({
        destinationLocationId: reversalDestination,
        isReversal: true,
        reversalReason: "Audit correction",
        reversesMovementId: posted.id,
        sourceLocationId: reversalSource,
        status: "POSTED",
        type: reversalType,
      });
      expect(reversal.lines).toMatchObject([
        { productVariantId: variantId, quantity: 5 },
      ]);
      await expect(
        getInventoryMovementById(repository, {
          movementId: posted.id,
          organizationId,
        }),
      ).resolves.toMatchObject({
        isReversed: true,
        reversedByMovementId: reversal.id,
      });
    },
  );

  it("rejects invalid reversal state, idempotency conflicts, and negative stock", async () => {
    const repository = new InMemoryInventoryMovementRepository();
    const draft = await createOpening(repository);

    await expect(
      reverseInventoryMovement(repository, {
        idempotencyKey: "reverse-draft",
        organizationId,
        originalMovementId: draft.id,
        reason: "Not posted",
        reversalMovementNumber: "REV-DRAFT",
      }),
    ).rejects.toThrow("Only posted");

    const posted = await postInventoryMovement(repository, {
      movementId: draft.id,
      organizationId,
    });
    repository.setBalance(destinationLocationId, variantId, 4);

    await expect(
      reverseInventoryMovement(repository, {
        idempotencyKey: "reverse-negative",
        organizationId,
        originalMovementId: posted.id,
        reason: "Count correction",
        reversalMovementNumber: "REV-NEGATIVE",
      }),
    ).rejects.toThrow("Insufficient stock");

    repository.setBalance(destinationLocationId, variantId, 5);
    const reversal = await reverseInventoryMovement(repository, {
      idempotencyKey: "reverse-same",
      occurredAt: "2026-07-03T01:00:00.000Z",
      organizationId,
      originalMovementId: posted.id,
      reason: "Count correction",
      reversalMovementNumber: "REV-SAME",
    });
    const retry = await reverseInventoryMovement(repository, {
      idempotencyKey: "reverse-same",
      occurredAt: "2026-07-03T01:00:00.000Z",
      organizationId,
      originalMovementId: posted.id,
      reason: "Count correction",
      reversalMovementNumber: "REV-SAME",
    });

    expect(retry.id).toBe(reversal.id);
    await expect(
      reverseInventoryMovement(repository, {
        idempotencyKey: "reverse-reversal",
        organizationId,
        originalMovementId: reversal.id,
        reason: "No reversal of reversal",
        reversalMovementNumber: "REV-REVERSAL",
      }),
    ).rejects.toThrow("cannot be reversed");
    await expect(
      reverseInventoryMovement(repository, {
        idempotencyKey: "reverse-other",
        organizationId,
        originalMovementId: posted.id,
        reason: "Duplicate",
        reversalMovementNumber: "REV-OTHER",
      }),
    ).rejects.toThrow("already been reversed");
    await expect(
      reverseInventoryMovement(repository, {
        idempotencyKey: "reverse-same",
        occurredAt: "2026-07-03T01:00:00.000Z",
        organizationId,
        originalMovementId: posted.id,
        reason: "Different",
        reversalMovementNumber: "REV-SAME",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires reversal reason and organization ownership", async () => {
    const repository = new InMemoryInventoryMovementRepository();
    const posted = await postInventoryMovement(repository, {
      movementId: (await createOpening(repository)).id,
      organizationId,
    });

    await expect(
      reverseInventoryMovement(repository, {
        idempotencyKey: "reverse-blank",
        organizationId,
        originalMovementId: posted.id,
        reason: " ",
        reversalMovementNumber: "REV-BLANK",
      }),
    ).rejects.toThrow("reason");
    await expect(
      reverseInventoryMovement(repository, {
        idempotencyKey: "reverse-cross",
        organizationId: otherOrganizationId,
        originalMovementId: posted.id,
        reason: "Cross org",
        reversalMovementNumber: "REV-CROSS",
      }),
    ).rejects.toThrow("not found");
  });

  it("rejects cross-organization reads and normalizes list filters", async () => {
    const repository = new InMemoryInventoryMovementRepository();
    const draft = await createOpening(repository);

    await expect(
      getInventoryMovementById(repository, {
        movementId: draft.id,
        organizationId: otherOrganizationId,
      }),
    ).rejects.toThrow("not found");

    const page = await listInventoryMovements(repository, {
      organizationId,
      pageSize: 1,
      status: "DRAFT",
      type: "OPENING",
    });
    expect(page.items).toHaveLength(1);
  });

  it("validates movement and balance cursors", () => {
    const movementCursor = encodeMovementCursor(
      new Date("2026-07-03T00:00:00.000Z"),
      variantId,
    );
    expect(parseMovementCursor(movementCursor)).toMatchObject({
      id: variantId,
    });

    const balanceCursor = encodeBalanceCursor(variantId);
    expect(parseBalanceCursor(balanceCursor)).toEqual({
      productVariantId: variantId,
    });
    expect(() => parseMovementCursor("bad")).toThrow("cursor is invalid");
    expect(() => parseBalanceCursor("bad")).toThrow("cursor is invalid");
  });

  it("reads balances through the query repository with organization isolation", async () => {
    const balances = new InMemoryInventoryBalanceRepository();
    balances.set({
      organizationId,
      productVariantId: variantId,
      quantity: 7,
      stockLocationId: destinationLocationId,
    });

    await expect(
      getOnHandBalance(balances, {
        organizationId,
        productVariantId: variantId,
        stockLocationId: destinationLocationId,
      }),
    ).resolves.toMatchObject({ quantity: 7 });
    await expect(
      listLocationBalances(balances, {
        locationId: destinationLocationId,
        organizationId,
        onlyPositive: true,
      }),
    ).resolves.toMatchObject({ items: [{ quantity: 7 }] });
  });
});

async function createOpening(repository: InventoryMovementRepository) {
  return createInventoryMovement(repository, {
    destinationLocationId,
    idempotencyKey: `key-${Math.random().toString(16).slice(2)}`,
    lines: [{ productVariantId: variantId, quantity: 5 }],
    movementNumber: `OPEN-${Math.random().toString(16).slice(2)}`,
    occurredAt: "2026-07-03T00:00:00.000Z",
    organizationId,
    type: "OPENING",
  });
}

class InMemoryInventoryMovementRepository implements InventoryMovementRepository {
  private counter = 0;
  private readonly balances = new Map<string, number>();
  private readonly movements = new Map<string, InventoryMovement>();

  setBalance(locationId: string, productVariantId: string, quantity: number) {
    this.balances.set(this.balanceKey(locationId, productVariantId), quantity);
  }

  async createDraft(
    record: CreateInventoryMovementRecord,
  ): Promise<InventoryMovement> {
    await Promise.resolve();
    const id = `77777777-7777-4777-8777-${(++this.counter)
      .toString()
      .padStart(12, "0")}`;
    const now = new Date("2026-07-03T00:00:00.000Z");
    const movement: InventoryMovement = {
      ...record,
      consumesReservationId: null,
      createdAt: now,
      id,
      lines: record.lines.map((line, index) => ({
        ...line,
        createdAt: now,
        id: `88888888-8888-4888-8888-${(index + this.counter)
          .toString()
          .padStart(12, "0")}`,
        lineNumber: index + 1,
        movementId: id,
        organizationId: record.organizationId,
      })),
      postedAt: null,
      reversedByMovementId: null,
      reversalReason: null,
      reversesMovementId: null,
      status: "DRAFT",
      updatedAt: now,
      version: 1,
      isReservationConsumption: false,
      isReversal: false,
      isReversed: false,
    };
    this.movements.set(id, movement);
    return movement;
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<InventoryMovement | null> {
    await Promise.resolve();
    const movement = this.movements.get(id);
    return movement?.organizationId === organizationId
      ? this.withReversalState(movement)
      : null;
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<InventoryMovement | null> {
    await Promise.resolve();
    return this.withReversalState(
      [...this.movements.values()].find(
        (movement) =>
          movement.organizationId === organizationId &&
          movement.idempotencyKey === idempotencyKey,
      ) ?? null,
    );
  }

  async getPayloadSignature(): Promise<string | null> {
    await Promise.resolve();
    return null;
  }

  async list(
    filter: InventoryMovementListFilter,
  ): Promise<CursorPageResult<InventoryMovement>> {
    await Promise.resolve();
    return {
      hasMore: false,
      items: [...this.movements.values()]
        .map((movement) => this.withReversalState(movement))
        .filter(
          (movement): movement is InventoryMovement =>
            movement !== null &&
            movement.organizationId === filter.organizationId &&
            (!filter.status || movement.status === filter.status) &&
            (!filter.type || movement.type === filter.type) &&
            (filter.isReversal === undefined ||
              movement.isReversal === filter.isReversal) &&
            (filter.isReversed === undefined ||
              movement.isReversed === filter.isReversed),
        ),
      nextCursor: null,
    };
  }

  async post(record: {
    movementId: string;
    organizationId: string;
  }): Promise<InventoryMovement> {
    const movement = await this.findById(
      record.movementId,
      record.organizationId,
    );
    if (!movement) {
      throw new BusinessRuleError("same organization");
    }
    if (movement.status === "POSTED") {
      return movement;
    }
    const posted = {
      ...movement,
      postedAt: new Date("2026-07-03T00:01:00.000Z"),
      status: "POSTED" as const,
      version: movement.version + 1,
    };
    this.movements.set(posted.id, posted);
    return this.withReversalState(posted) ?? posted;
  }

  async replaceDraftLines(
    record: ReplaceInventoryMovementLinesRecord,
  ): Promise<InventoryMovement> {
    const movement = await this.findById(
      record.movementId,
      record.organizationId,
    );
    if (!movement) {
      throw new BusinessRuleError("same organization");
    }
    if (movement.status !== "DRAFT") {
      throw new BusinessRuleError(
        "Posted inventory movement lines cannot change.",
      );
    }
    const replaced = {
      ...movement,
      lines: record.lines.map((line, index) => ({
        ...line,
        createdAt: movement.createdAt,
        id: `99999999-9999-4999-8999-${index.toString().padStart(12, "0")}`,
        lineNumber: index + 1,
        movementId: movement.id,
        organizationId: movement.organizationId,
      })),
      version: movement.version + 1,
    };
    this.movements.set(replaced.id, replaced);
    return replaced;
  }

  async reversePostedMovement(
    record: ReverseInventoryMovementRecord,
  ): Promise<InventoryMovement> {
    const original = await this.findById(
      record.reversesMovementId,
      record.organizationId,
    );
    if (!original) {
      throw new BusinessRuleError("same organization");
    }
    if (original.status !== "POSTED") {
      throw new BusinessRuleError(
        "Only posted inventory movement can be reversed.",
      );
    }
    if (original.reversesMovementId) {
      throw new BusinessRuleError("A reversal movement cannot be reversed.");
    }
    if (original.reversedByMovementId) {
      throw new ConflictError("Inventory movement has already been reversed.");
    }
    const existing = await this.findByIdempotencyKey(
      record.organizationId,
      record.idempotencyKey,
    );
    if (existing) {
      return existing;
    }
    if (record.sourceLocationId) {
      for (const line of record.lines) {
        const available =
          this.balances.get(
            this.balanceKey(record.sourceLocationId, line.productVariantId),
          ) ?? 0;
        if (available < line.quantity) {
          throw new BusinessRuleError(
            `Insufficient stock for variant ${line.productVariantId} at source location ${record.sourceLocationId}: available ${available}, requested ${line.quantity}.`,
          );
        }
      }
    }

    const id = `77777777-7777-4777-8777-${(++this.counter)
      .toString()
      .padStart(12, "0")}`;
    const now = new Date("2026-07-03T00:02:00.000Z");
    const reversal: InventoryMovement = {
      ...record,
      consumesReservationId: null,
      createdAt: now,
      id,
      lines: record.lines.map((line, index) => ({
        ...line,
        createdAt: now,
        id: `88888888-8888-4888-8888-${(index + this.counter)
          .toString()
          .padStart(12, "0")}`,
        lineNumber: index + 1,
        movementId: id,
        organizationId: record.organizationId,
      })),
      note: null,
      postedAt: now,
      reversedByMovementId: null,
      status: "POSTED",
      updatedAt: now,
      version: 2,
      isReservationConsumption: false,
      isReversal: true,
      isReversed: false,
    };
    this.movements.set(id, reversal);
    return reversal;
  }

  private withReversalState(
    movement: InventoryMovement | null,
  ): InventoryMovement | null {
    if (!movement) {
      return null;
    }
    const reversedBy =
      [...this.movements.values()].find(
        (candidate) => candidate.reversesMovementId === movement.id,
      )?.id ?? null;
    return {
      ...movement,
      isReversal: movement.reversesMovementId !== null,
      isReversed: reversedBy !== null,
      reversedByMovementId: reversedBy,
    };
  }

  private balanceKey(locationId: string, productVariantId: string) {
    return `${locationId}:${productVariantId}`;
  }
}

class InMemoryInventoryBalanceRepository implements InventoryBalanceQueryRepository {
  private readonly balances = new Map<string, OnHandBalance>();

  set(balance: OnHandBalance): void {
    this.balances.set(this.key(balance), balance);
  }

  async getOnHand(input: {
    organizationId: string;
    productVariantId: string;
    stockLocationId: string;
  }): Promise<OnHandBalance> {
    await Promise.resolve();
    return (
      this.balances.get(
        this.key({
          organizationId: input.organizationId,
          productVariantId: input.productVariantId,
          quantity: 0,
          stockLocationId: input.stockLocationId,
        }),
      ) ?? { ...input, quantity: 0 }
    );
  }

  async listByLocation(
    filter: InventoryBalanceFilter,
  ): Promise<CursorPageResult<OnHandBalance>> {
    await Promise.resolve();
    const items = [...this.balances.values()].filter(
      (balance) =>
        balance.organizationId === filter.organizationId &&
        balance.stockLocationId === filter.locationId &&
        (!filter.onlyPositive || balance.quantity > 0),
    );
    return { hasMore: false, items, nextCursor: null };
  }

  private key(balance: OnHandBalance): string {
    return `${balance.organizationId}:${balance.stockLocationId}:${balance.productVariantId}`;
  }
}
