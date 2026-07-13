import {
  allocateAndCreateInventoryReservation,
  changeInventoryAllocationPolicyStatus,
  createInventoryAllocationPolicy,
  createInventoryMovement,
  createInventoryReservation,
  confirmInventoryReservation,
  consumeInventoryReservation,
  expireInventoryReservation,
  getAvailableToSell,
  getOnHandBalance,
  listInventoryMovements,
  listInventoryReservations,
  listLocationAvailability,
  listLocationBalances,
  postInventoryMovement,
  previewInventoryAllocation,
  replaceDraftMovementLines,
  replaceInventoryAllocationPolicyLocations,
  releaseInventoryReservation,
  reverseInventoryMovement,
  type InventoryMovementType,
} from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import {
  PrismaInventoryBalanceQueryRepository,
  PrismaInventoryMovementRepository,
  PrismaInventoryAvailabilityQueryRepository,
  PrismaInventoryAllocationPolicyRepository,
  PrismaInventoryAllocationQueryRepository,
  PrismaInventoryReservationConsumptionRepository,
  PrismaInventoryReservationRepository,
} from "./repositories.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("Prisma inventory ledger repositories", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let movements: PrismaInventoryMovementRepository;
  let balances: PrismaInventoryBalanceQueryRepository;
  let reservations: PrismaInventoryReservationRepository;
  let consumption: PrismaInventoryReservationConsumptionRepository;
  let availability: PrismaInventoryAvailabilityQueryRepository;
  let allocationPolicies: PrismaInventoryAllocationPolicyRepository;
  let allocation: PrismaInventoryAllocationQueryRepository;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    movements = new PrismaInventoryMovementRepository(prisma);
    balances = new PrismaInventoryBalanceQueryRepository(prisma);
    reservations = new PrismaInventoryReservationRepository(prisma);
    consumption = new PrismaInventoryReservationConsumptionRepository(prisma);
    availability = new PrismaInventoryAvailabilityQueryRepository(prisma);
    allocationPolicies = new PrismaInventoryAllocationPolicyRepository(prisma);
    allocation = new PrismaInventoryAllocationQueryRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.inventoryReservationLine.deleteMany();
    await prisma.inventoryReservation.deleteMany();
    await prisma.inventoryMovementLine.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryAllocationPolicyLocation.deleteMany();
    await prisma.inventoryAllocationPolicy.deleteMany();
    await prisma.productCollection.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.collection.deleteMany();
    await prisma.category.deleteMany();
    await prisma.color.deleteMany();
    await prisma.size.deleteMany();
    await prisma.posCounter.deleteMany();
    await prisma.stockLocation.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.organizationMembership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("posts opening movement and derives on-hand balance", async () => {
    const base = await createInventoryBase("OPEN");

    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 10,
    });

    await expect(
      getOnHandBalance(balances, {
        organizationId: base.organization.id,
        productVariantId: base.variant.id,
        stockLocationId: base.primaryLocation.id,
      }),
    ).resolves.toMatchObject({ quantity: 10 });
  });

  it("posts receipt and increases balance", async () => {
    const base = await createInventoryBase("RECEIPT");

    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      movementNumber: "OPENING-RECEIPT",
      quantity: 3,
    });
    await createAndPost("RECEIPT", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 4,
    });

    await expectBalance(base, base.primaryLocation.id, 7);
  });

  it("posts issue and decreases balance", async () => {
    const base = await createInventoryBase("ISSUE");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 8,
    });

    await createAndPost("ISSUE", base, {
      quantity: 3,
      sourceLocationId: base.primaryLocation.id,
    });

    await expectBalance(base, base.primaryLocation.id, 5);
  });

  it("posts transfer and moves stock between locations", async () => {
    const base = await createInventoryBase("TRANSFER");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 8,
    });

    await createAndPost("TRANSFER", base, {
      destinationLocationId: base.secondaryLocation.id,
      quantity: 5,
      sourceLocationId: base.primaryLocation.id,
    });

    await expectBalance(base, base.primaryLocation.id, 3);
    await expectBalance(base, base.secondaryLocation.id, 5);
  });

  it("posts adjustment in and out with derived balance", async () => {
    const base = await createInventoryBase("ADJUST");

    await createAndPost("ADJUSTMENT_IN", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 6,
    });
    await createAndPost("ADJUSTMENT_OUT", base, {
      quantity: 2,
      sourceLocationId: base.primaryLocation.id,
    });

    await expectBalance(base, base.primaryLocation.id, 4);
  });

  it.each([
    ["OPENING", "ADJUSTMENT_OUT", "primary", null],
    ["RECEIPT", "ADJUSTMENT_OUT", "primary", null],
    ["ISSUE", "ADJUSTMENT_IN", null, "primary"],
    ["TRANSFER", "TRANSFER", "secondary", "primary"],
    ["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "primary", null],
    ["ADJUSTMENT_OUT", "ADJUSTMENT_IN", null, "primary"],
  ] as const)(
    "reverses posted %s with a compensating posted movement",
    async (originalType, reversalType, expectedSource, expectedDestination) => {
      const movementLabel = originalType.replaceAll("_", "-");
      const base = await createInventoryBase(`REV-${movementLabel}`);
      if (originalType === "ISSUE" || originalType === "ADJUSTMENT_OUT") {
        await createAndPost("OPENING", base, {
          destinationLocationId: base.primaryLocation.id,
          movementNumber: `SEED-${movementLabel}`,
          quantity: 9,
        });
      }
      if (originalType === "TRANSFER") {
        await createAndPost("OPENING", base, {
          destinationLocationId: base.primaryLocation.id,
          movementNumber: "SEED-TRANSFER",
          quantity: 9,
        });
      }

      const original = await createAndPost(originalType, base, {
        destinationLocationId:
          originalType === "TRANSFER"
            ? base.secondaryLocation.id
            : originalType === "OPENING" ||
                originalType === "RECEIPT" ||
                originalType === "ADJUSTMENT_IN"
              ? base.primaryLocation.id
              : undefined,
        movementNumber: `ORIGINAL-${movementLabel}`,
        quantity: 4,
        sourceLocationId:
          originalType === "TRANSFER" ||
          originalType === "ISSUE" ||
          originalType === "ADJUSTMENT_OUT"
            ? base.primaryLocation.id
            : undefined,
      });

      const reversal = await reversePosted(base, original.id, {
        idempotencyKey: `reverse-${movementLabel}`,
        movementNumber: `REVERSAL-${movementLabel}`,
      });

      expect(reversal).toMatchObject({
        destinationLocationId: expectedDestination
          ? base.primaryLocation.id
          : null,
        isReversal: true,
        reversalReason: "Inventory audit correction",
        reversesMovementId: original.id,
        sourceLocationId: expectedSource
          ? expectedSource === "primary"
            ? base.primaryLocation.id
            : base.secondaryLocation.id
          : null,
        status: "POSTED",
        type: reversalType,
      });
      expect(reversal.lines).toMatchObject([
        { productVariantId: base.variant.id, quantity: 4 },
      ]);

      const rereadOriginal = await movements.findById(
        original.id,
        base.organization.id,
      );
      expect(rereadOriginal).toMatchObject({
        id: original.id,
        isReversed: true,
        reversedByMovementId: reversal.id,
        status: "POSTED",
      });
    },
  );

  it("returns balance to the previous value when no later movements exist", async () => {
    const base = await createInventoryBase("REV-BALANCE");
    const original = await createAndPost("RECEIPT", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 6,
    });

    await expectBalance(base, base.primaryLocation.id, 6);
    await reversePosted(base, original.id);

    await expectBalance(base, base.primaryLocation.id, 0);
  });

  it("rejects reversal when current stock is insufficient", async () => {
    const base = await createInventoryBase("REV-NEGATIVE");
    const receipt = await createAndPost("RECEIPT", base, {
      destinationLocationId: base.primaryLocation.id,
      movementNumber: "REV-NEGATIVE-RECEIPT",
      quantity: 5,
    });
    await createAndPost("ISSUE", base, {
      movementNumber: "REV-NEGATIVE-ISSUE",
      quantity: 4,
      sourceLocationId: base.primaryLocation.id,
    });

    await expect(
      reversePosted(base, receipt.id, {
        idempotencyKey: "reverse-negative-stock",
        movementNumber: "REV-NEGATIVE-STOCK",
      }),
    ).rejects.toThrow("Insufficient stock");
    await expectBalance(base, base.primaryLocation.id, 1);
  });

  it("rejects draft movement, reversal movement, and duplicate reversal", async () => {
    const base = await createInventoryBase("REV-RULES");
    const draft = await createInventoryMovement(movements, {
      destinationLocationId: base.primaryLocation.id,
      idempotencyKey: "draft-reversal-source",
      lines: [{ productVariantId: base.variant.id, quantity: 2 }],
      movementNumber: "DRAFT-REVERSAL-SOURCE",
      organizationId: base.organization.id,
      type: "OPENING",
    });
    await expect(
      reversePosted(base, draft.id, {
        idempotencyKey: "reverse-draft",
        movementNumber: "REV-DRAFT",
      }),
    ).rejects.toThrow("Only posted");

    const original = await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      movementNumber: "REV-RULES-OPEN",
      quantity: 3,
    });
    const reversal = await reversePosted(base, original.id, {
      idempotencyKey: "reverse-rules",
      movementNumber: "REV-RULES",
    });

    await expect(
      reversePosted(base, reversal.id, {
        idempotencyKey: "reverse-reversal",
        movementNumber: "REV-REVERSAL",
      }),
    ).rejects.toThrow("cannot be reversed");
    await expect(
      reversePosted(base, original.id, {
        idempotencyKey: "reverse-rules-second",
        movementNumber: "REV-RULES-SECOND",
      }),
    ).rejects.toThrow("already been reversed");
  });

  it("handles reversal idempotency and concurrent duplicate reversal", async () => {
    const base = await createInventoryBase("REV-IDEMPOTENT");
    const original = await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 8,
    });
    const input = {
      idempotencyKey: "same-reversal-key",
      movementNumber: "SAME-REVERSAL",
    };

    const [first, second] = await Promise.all([
      reversePosted(base, original.id, input),
      reversePosted(base, original.id, input),
    ]);
    expect(second.id).toBe(first.id);
    await expectBalance(base, base.primaryLocation.id, 0);

    await expect(
      reverseInventoryMovement(movements, {
        idempotencyKey: "same-reversal-key",
        occurredAt: "2026-07-03T01:00:00.000Z",
        organizationId: base.organization.id,
        originalMovementId: original.id,
        reason: "Different correction",
        reversalMovementNumber: "SAME-REVERSAL",
      }),
    ).rejects.toThrow("Idempotency key");
  });

  it("rejects cross-organization reversal as not found", async () => {
    const base = await createInventoryBase("REV-CROSS-A");
    const other = await createInventoryBase("REV-CROSS-B");
    const original = await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 2,
    });

    await expect(
      reverseInventoryMovement(movements, {
        idempotencyKey: "cross-reversal",
        organizationId: other.organization.id,
        originalMovementId: original.id,
        reason: "Cross org",
        reversalMovementNumber: "CROSS-REVERSAL",
      }),
    ).rejects.toThrow("not found");
  });

  it("enforces reversal self-reference and restrictive deletion constraints", async () => {
    const base = await createInventoryBase("REV-CONSTRAINT");
    const original = await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 2,
    });
    const reversal = await reversePosted(base, original.id, {
      idempotencyKey: "constraint-reversal",
      movementNumber: "CONSTRAINT-REVERSAL",
    });

    await expect(
      prisma.inventoryMovement.update({
        data: { reversesMovementId: reversal.id },
        where: { id: reversal.id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.inventoryMovement.delete({ where: { id: original.id } }),
    ).rejects.toThrow();
  });

  it("excludes draft movements from balance", async () => {
    const base = await createInventoryBase("DRAFT");

    await createInventoryMovement(movements, {
      destinationLocationId: base.primaryLocation.id,
      idempotencyKey: "draft-only-key",
      lines: [{ productVariantId: base.variant.id, quantity: 9 }],
      movementNumber: "DRAFT-ONLY",
      organizationId: base.organization.id,
      type: "OPENING",
    });

    await expectBalance(base, base.primaryLocation.id, 0);
  });

  it("blocks editing posted movement lines", async () => {
    const base = await createInventoryBase("IMMUTABLE");
    const movement = await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 4,
    });

    await expect(
      replaceDraftMovementLines(movements, {
        lines: [{ productVariantId: base.variant.id, quantity: 5 }],
        movementId: movement.id,
        organizationId: base.organization.id,
      }),
    ).rejects.toThrow("cannot change");
  });

  it("deduplicates identical idempotency key without duplicating ledger effect", async () => {
    const base = await createInventoryBase("IDEMPOTENT");
    const input = {
      destinationLocationId: base.primaryLocation.id,
      idempotencyKey: "same-create-key",
      lines: [{ productVariantId: base.variant.id, quantity: 5 }],
      movementNumber: "IDEMPOTENT-OPEN",
      occurredAt: "2026-07-03T00:00:00.000Z",
      organizationId: base.organization.id,
      type: "OPENING" as const,
    };

    const first = await createInventoryMovement(movements, input);
    const second = await createInventoryMovement(movements, input);
    await postInventoryMovement(movements, {
      movementId: first.id,
      organizationId: base.organization.id,
    });
    await postInventoryMovement(movements, {
      movementId: second.id,
      organizationId: base.organization.id,
    });

    expect(second.id).toBe(first.id);
    await expectBalance(base, base.primaryLocation.id, 5);
  });

  it("rejects conflicting payload for the same idempotency key", async () => {
    const base = await createInventoryBase("IDEMPOTENCY-CONFLICT");

    await createInventoryMovement(movements, {
      destinationLocationId: base.primaryLocation.id,
      idempotencyKey: "conflict-key",
      lines: [{ productVariantId: base.variant.id, quantity: 5 }],
      movementNumber: "CONFLICT-OPEN",
      occurredAt: "2026-07-03T00:00:00.000Z",
      organizationId: base.organization.id,
      type: "OPENING",
    });

    await expect(
      createInventoryMovement(movements, {
        destinationLocationId: base.primaryLocation.id,
        idempotencyKey: "conflict-key",
        lines: [{ productVariantId: base.variant.id, quantity: 6 }],
        movementNumber: "CONFLICT-OPEN",
        occurredAt: "2026-07-03T00:00:00.000Z",
        organizationId: base.organization.id,
        type: "OPENING",
      }),
    ).rejects.toThrow("Idempotency key");
  });

  it("prevents negative stock", async () => {
    const base = await createInventoryBase("NEGATIVE");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 2,
    });

    const issue = await createInventoryMovement(movements, {
      idempotencyKey: "negative-issue",
      lines: [{ productVariantId: base.variant.id, quantity: 3 }],
      movementNumber: "NEGATIVE-ISSUE",
      organizationId: base.organization.id,
      sourceLocationId: base.primaryLocation.id,
      type: "ISSUE",
    });

    await expect(
      postInventoryMovement(movements, {
        movementId: issue.id,
        organizationId: base.organization.id,
      }),
    ).rejects.toThrow("Insufficient stock");
    await expectBalance(base, base.primaryLocation.id, 2);
  });

  it("rejects cross-organization location references", async () => {
    const base = await createInventoryBase("CROSS-LOC-A");
    const other = await createInventoryBase("CROSS-LOC-B");

    await expect(
      createInventoryMovement(movements, {
        destinationLocationId: other.primaryLocation.id,
        idempotencyKey: "cross-location",
        lines: [{ productVariantId: base.variant.id, quantity: 1 }],
        movementNumber: "CROSS-LOCATION",
        organizationId: base.organization.id,
        type: "OPENING",
      }),
    ).rejects.toThrow("reference integrity");
  });

  it("rejects cross-organization variant references", async () => {
    const base = await createInventoryBase("CROSS-VAR-A");
    const other = await createInventoryBase("CROSS-VAR-B");

    await expect(
      createInventoryMovement(movements, {
        destinationLocationId: base.primaryLocation.id,
        idempotencyKey: "cross-variant",
        lines: [{ productVariantId: other.variant.id, quantity: 1 }],
        movementNumber: "CROSS-VARIANT",
        organizationId: base.organization.id,
        type: "OPENING",
      }),
    ).rejects.toThrow("reference integrity");
  });

  it("rejects inactive locations at posting time", async () => {
    const base = await createInventoryBase("INACTIVE-LOC");
    const movement = await createInventoryMovement(movements, {
      destinationLocationId: base.primaryLocation.id,
      idempotencyKey: "inactive-location",
      lines: [{ productVariantId: base.variant.id, quantity: 1 }],
      movementNumber: "INACTIVE-LOCATION",
      organizationId: base.organization.id,
      type: "OPENING",
    });
    await prisma.stockLocation.update({
      data: { isSellable: false, status: "INACTIVE" },
      where: { id: base.primaryLocation.id },
    });

    await expect(
      postInventoryMovement(movements, {
        movementId: movement.id,
        organizationId: base.organization.id,
      }),
    ).rejects.toThrow("locations must be active");
  });

  it("rejects archived variants at posting time", async () => {
    const base = await createInventoryBase("ARCHIVED-VAR");
    const movement = await createInventoryMovement(movements, {
      destinationLocationId: base.primaryLocation.id,
      idempotencyKey: "archived-variant",
      lines: [{ productVariantId: base.variant.id, quantity: 1 }],
      movementNumber: "ARCHIVED-VARIANT",
      organizationId: base.organization.id,
      type: "OPENING",
    });
    await prisma.productVariant.update({
      data: { status: "ARCHIVED" },
      where: { id: base.variant.id },
    });

    await expect(
      postInventoryMovement(movements, {
        movementId: movement.id,
        organizationId: base.organization.id,
      }),
    ).rejects.toThrow("not archived");
  });

  it("rejects duplicate variant lines at the database layer", async () => {
    const base = await createInventoryBase("DUP-VAR");

    await expect(
      prisma.inventoryMovement.create({
        data: {
          destinationLocationId: base.primaryLocation.id,
          idempotencyKey: "db-duplicate-variant",
          lines: {
            create: [
              {
                lineNumber: 1,
                organizationId: base.organization.id,
                productVariantId: base.variant.id,
                quantity: 1,
              },
              {
                lineNumber: 2,
                organizationId: base.organization.id,
                productVariantId: base.variant.id,
                quantity: 1,
              },
            ],
          },
          movementNumber: "DB-DUP-VARIANT",
          occurredAt: new Date(),
          organizationId: base.organization.id,
          payloadSignature: "x".repeat(64),
          type: "OPENING",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects source equal to destination at the database layer", async () => {
    const base = await createInventoryBase("SAME-LOC");

    await expect(
      prisma.inventoryMovement.create({
        data: {
          destinationLocationId: base.primaryLocation.id,
          idempotencyKey: "same-location",
          movementNumber: "SAME-LOCATION",
          occurredAt: new Date(),
          organizationId: base.organization.id,
          payloadSignature: "x".repeat(64),
          sourceLocationId: base.primaryLocation.id,
          type: "TRANSFER",
        },
      }),
    ).rejects.toThrow();
  });

  it("serializes concurrent issue attempts and prevents overspending", async () => {
    const base = await createInventoryBase("CONCURRENT-ISSUE");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 5,
    });
    const first = await createInventoryMovement(movements, {
      idempotencyKey: "concurrent-issue-a",
      lines: [{ productVariantId: base.variant.id, quantity: 4 }],
      movementNumber: "CONCURRENT-ISSUE-A",
      organizationId: base.organization.id,
      sourceLocationId: base.primaryLocation.id,
      type: "ISSUE",
    });
    const second = await createInventoryMovement(movements, {
      idempotencyKey: "concurrent-issue-b",
      lines: [{ productVariantId: base.variant.id, quantity: 4 }],
      movementNumber: "CONCURRENT-ISSUE-B",
      organizationId: base.organization.id,
      sourceLocationId: base.primaryLocation.id,
      type: "ISSUE",
    });

    const results = await Promise.allSettled([
      postInventoryMovement(movements, {
        movementId: first.id,
        organizationId: base.organization.id,
      }),
      postInventoryMovement(movements, {
        movementId: second.id,
        organizationId: base.organization.id,
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expectBalance(base, base.primaryLocation.id, 1);
  });

  it("serializes concurrent duplicate idempotent posting into one ledger effect", async () => {
    const base = await createInventoryBase("CONCURRENT-IDEMPOTENT");
    const input = {
      destinationLocationId: base.primaryLocation.id,
      idempotencyKey: "concurrent-idempotent",
      lines: [{ productVariantId: base.variant.id, quantity: 6 }],
      movementNumber: "CONCURRENT-IDEMPOTENT",
      occurredAt: "2026-07-03T00:00:00.000Z",
      organizationId: base.organization.id,
      type: "OPENING" as const,
    };

    const [first, second] = await Promise.all([
      createInventoryMovement(movements, input),
      createInventoryMovement(movements, input),
    ]);
    await Promise.all([
      postInventoryMovement(movements, {
        movementId: first.id,
        organizationId: base.organization.id,
      }),
      postInventoryMovement(movements, {
        movementId: second.id,
        organizationId: base.organization.id,
      }),
    ]);

    expect(second.id).toBe(first.id);
    await expectBalance(base, base.primaryLocation.id, 6);
  });

  it("lists movements with organization isolation and filters", async () => {
    const base = await createInventoryBase("LIST-MOVE-A");
    const other = await createInventoryBase("LIST-MOVE-B");
    const posted = await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      movementNumber: "LIST-OPEN",
      quantity: 1,
    });
    await createAndPost("OPENING", other, {
      destinationLocationId: other.primaryLocation.id,
      movementNumber: "LIST-OTHER",
      quantity: 1,
    });

    const page = await listInventoryMovements(movements, {
      destinationLocationId: base.primaryLocation.id,
      organizationId: base.organization.id,
      pageSize: 1,
      status: "POSTED",
      type: "OPENING",
    });

    expect(page.items).toMatchObject([{ id: posted.id }]);
    expect(page.items).toHaveLength(1);
  });

  it("lists balances with organization isolation and positive filter", async () => {
    const base = await createInventoryBase("LIST-BAL-A");
    const other = await createInventoryBase("LIST-BAL-B");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 2,
    });
    await createAndPost("OPENING", other, {
      destinationLocationId: other.primaryLocation.id,
      quantity: 9,
    });

    const page = await listLocationBalances(balances, {
      locationId: base.primaryLocation.id,
      onlyPositive: true,
      organizationId: base.organization.id,
    });

    expect(page.items).toMatchObject([
      {
        organizationId: base.organization.id,
        productVariantId: base.variant.id,
        quantity: 2,
      },
    ]);
  });

  it("creates active reservation and decreases ATS without changing on-hand", async () => {
    const base = await createInventoryBase("RSV-CREATE");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 10,
    });

    const reservation = await reserve(base, {
      quantity: 4,
      reservationNumber: "RSV-CREATE",
    });

    expect(reservation).toMatchObject({
      stockLocationId: base.primaryLocation.id,
      status: "ACTIVE",
      version: 1,
    });
    await expectBalance(base, base.primaryLocation.id, 10);
    await expectAvailability(base, 10, 4, 6);
  });

  it("confirm, release, and expire restore ATS without issuing stock", async () => {
    const base = await createInventoryBase("RSV-LIFE");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 10,
    });
    const confirmedSource = await reserve(base, {
      idempotencyKey: "rsv-life-confirm",
      quantity: 3,
      reservationNumber: "RSV-LIFE-CONFIRM",
    });

    await confirmInventoryReservation(reservations, {
      expectedVersion: confirmedSource.version,
      organizationId: base.organization.id,
      reservationId: confirmedSource.id,
    });
    await expectAvailability(base, 10, 0, 10);

    const releasedSource = await reserve(base, {
      idempotencyKey: "rsv-life-release",
      quantity: 3,
      reservationNumber: "RSV-LIFE-RELEASE",
    });
    await releaseInventoryReservation(reservations, {
      expectedVersion: releasedSource.version,
      organizationId: base.organization.id,
      reservationId: releasedSource.id,
    });
    await expectAvailability(base, 10, 0, 10);

    const expiredSource = await reserve(base, {
      expiresAt: "2999-01-01T00:00:00.000Z",
      idempotencyKey: "rsv-life-expire",
      quantity: 3,
      reservationNumber: "RSV-LIFE-EXPIRE",
    });
    await expireInventoryReservation(reservations, {
      expectedVersion: expiredSource.version,
      organizationId: base.organization.id,
      reservationId: expiredSource.id,
    });
    await expectAvailability(base, 10, 0, 10);
    await expectBalance(base, base.primaryLocation.id, 10);
  });

  it("rejects terminal transitions and stale reservation versions", async () => {
    const base = await createInventoryBase("RSV-TERMINAL");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 5,
    });
    const reservation = await reserve(base, {
      quantity: 2,
      reservationNumber: "RSV-TERMINAL",
    });
    const confirmed = await confirmInventoryReservation(reservations, {
      expectedVersion: reservation.version,
      organizationId: base.organization.id,
      reservationId: reservation.id,
    });

    await expect(
      releaseInventoryReservation(reservations, {
        expectedVersion: confirmed.version,
        organizationId: base.organization.id,
        reservationId: reservation.id,
      }),
    ).rejects.toThrow("Terminal");

    const active = await reserve(base, {
      idempotencyKey: "rsv-stale-version",
      quantity: 1,
      reservationNumber: "RSV-STALE",
    });
    await expect(
      releaseInventoryReservation(reservations, {
        expectedVersion: active.version + 1,
        organizationId: base.organization.id,
        reservationId: active.id,
      }),
    ).rejects.toThrow("changed");
  });

  it("rejects insufficient ATS and keeps multi-line reservation atomic", async () => {
    const base = await createInventoryBase("RSV-ATS");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 5,
    });
    const secondVariant = await createSecondVariant(base, "RSV-ATS");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      movementNumber: "RSV-ATS-SECOND-OPEN",
      quantity: 1,
      variantId: secondVariant.id,
    });

    await expect(
      createInventoryReservation(reservations, {
        idempotencyKey: "rsv-atomic-fail",
        lines: [
          { productVariantId: base.variant.id, quantity: 3 },
          { productVariantId: secondVariant.id, quantity: 2 },
        ],
        organizationId: base.organization.id,
        reservationNumber: "RSV-ATOMIC",
        stockLocationId: base.primaryLocation.id,
      }),
    ).rejects.toThrow("Insufficient available stock");
    await expectAvailability(base, 5, 0, 5);
  });

  it("serializes concurrent reservations and prevents overselling", async () => {
    const base = await createInventoryBase("RSV-CONCURRENT");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 10,
    });

    const results = await Promise.allSettled([
      reserve(base, {
        idempotencyKey: "rsv-concurrent-a",
        quantity: 7,
        reservationNumber: "RSV-CONCURRENT-A",
      }),
      reserve(base, {
        idempotencyKey: "rsv-concurrent-b",
        quantity: 7,
        reservationNumber: "RSV-CONCURRENT-B",
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expectAvailability(base, 10, 7, 3);
  });

  it("handles concurrent duplicate idempotency and conflicting idempotency", async () => {
    const base = await createInventoryBase("RSV-IDEMPOTENT");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 10,
    });
    const input = {
      idempotencyKey: "rsv-same-key",
      quantity: 4,
      reservationNumber: "RSV-SAME",
    };

    const [first, second] = await Promise.all([
      reserve(base, input),
      reserve(base, input),
    ]);
    expect(second.id).toBe(first.id);
    await expectAvailability(base, 10, 4, 6);

    await expect(
      reserve(base, {
        idempotencyKey: "rsv-same-key",
        quantity: 5,
        reservationNumber: "RSV-SAME",
      }),
    ).rejects.toThrow("Idempotency key");
  });

  it("consumes an active reservation as a posted issue and preserves the ATS invariant", async () => {
    const base = await createInventoryBase("RSV-CONSUME");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 10,
    });
    const reservation = await reserve(base, {
      quantity: 4,
      reservationNumber: "RSV-CONSUME",
    });
    await expectAvailability(base, 10, 4, 6);

    const result = await consume(base, reservation, {
      idempotencyKey: "consume-rsv",
      movementNumber: "ISSUE-RSV",
    });

    expect(result.movement).toMatchObject({
      consumesReservationId: reservation.id,
      destinationLocationId: null,
      isReservationConsumption: true,
      sourceLocationId: base.primaryLocation.id,
      status: "POSTED",
      type: "ISSUE",
    });
    expect(result.movement.lines).toMatchObject([
      {
        lineNumber: 1,
        note: null,
        productVariantId: base.variant.id,
        quantity: 4,
      },
    ]);
    expect(result.reservation).toMatchObject({
      consumedByMovementId: result.movement.id,
      isConsumed: true,
      status: "CONFIRMED",
      version: reservation.version + 1,
    });
    expect(result.reservation.confirmedAt).toBeInstanceOf(Date);
    await expectBalance(base, base.primaryLocation.id, 6);
    await expectAvailability(base, 6, 0, 6);
  });

  it("consumes multiple reservation lines atomically", async () => {
    const base = await createInventoryBase("RSV-CONSUME-MULTI");
    const secondVariant = await createSecondVariant(base, "RSV-CONSUME-MULTI");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      movementNumber: "RSV-CONSUME-MULTI-OPEN-A",
      quantity: 7,
    });
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      movementNumber: "RSV-CONSUME-MULTI-OPEN-B",
      quantity: 5,
      variantId: secondVariant.id,
    });
    const reservation = await reserve(base, {
      lines: [
        { productVariantId: base.variant.id, quantity: 3 },
        { productVariantId: secondVariant.id, quantity: 2 },
      ],
      reservationNumber: "RSV-CONSUME-MULTI",
    });

    const result = await consume(base, reservation, {
      idempotencyKey: "consume-multi",
      movementNumber: "ISSUE-RSV-MULTI",
    });

    expect(result.movement.lines.map((line) => line.productVariantId)).toEqual([
      base.variant.id,
      secondVariant.id,
    ]);
    await expectBalance(base, base.primaryLocation.id, 4);
    await expect(
      getOnHandBalance(balances, {
        organizationId: base.organization.id,
        productVariantId: secondVariant.id,
        stockLocationId: base.primaryLocation.id,
      }),
    ).resolves.toMatchObject({ quantity: 3 });
  });

  it("rejects insufficient physical stock without confirming or creating a movement", async () => {
    const base = await createInventoryBase("RSV-CONSUME-NOSTOCK");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 4,
    });
    const reservation = await reserve(base, {
      quantity: 4,
      reservationNumber: "RSV-CONSUME-NOSTOCK",
    });
    await createAndPost("ISSUE", base, {
      movementNumber: "RSV-CONSUME-NOSTOCK-ISSUE",
      quantity: 1,
      sourceLocationId: base.primaryLocation.id,
    });

    await expect(
      consume(base, reservation, {
        idempotencyKey: "consume-nostock",
        movementNumber: "ISSUE-RSV-NOSTOCK",
      }),
    ).rejects.toThrow("Insufficient physical stock");

    await expect(
      reservations.findById(reservation.id, base.organization.id),
    ).resolves.toMatchObject({
      consumedByMovementId: null,
      status: "ACTIVE",
    });
    await expect(
      movements.findByIdempotencyKey(base.organization.id, "consume-nostock"),
    ).resolves.toBeNull();
  });

  it("rejects released, expired, past-expiry, stale, and cross-organization consumption", async () => {
    const base = await createInventoryBase("RSV-CONSUME-REJECT");
    const other = await createInventoryBase("RSV-CONSUME-OTHER");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 10,
    });

    const released = await reserve(base, {
      idempotencyKey: "consume-reject-release",
      quantity: 1,
      reservationNumber: "RSV-CONSUME-RELEASE",
    });
    await releaseInventoryReservation(reservations, {
      expectedVersion: released.version,
      organizationId: base.organization.id,
      reservationId: released.id,
    });
    await expect(
      consume(base, released, {
        idempotencyKey: "consume-released",
        movementNumber: "ISSUE-RELEASED",
      }),
    ).rejects.toThrow("active");

    const expired = await reserve(base, {
      expiresAt: "2999-01-01T00:00:00.000Z",
      idempotencyKey: "consume-reject-expired",
      quantity: 1,
      reservationNumber: "RSV-CONSUME-EXPIRED",
    });
    await expireInventoryReservation(reservations, {
      expectedVersion: expired.version,
      organizationId: base.organization.id,
      reservationId: expired.id,
    });
    await expect(
      consume(base, expired, {
        idempotencyKey: "consume-expired",
        movementNumber: "ISSUE-EXPIRED",
      }),
    ).rejects.toThrow("active");

    const pastExpiry = await reserve(base, {
      idempotencyKey: "consume-reject-past",
      quantity: 1,
      reservationNumber: "RSV-CONSUME-PAST",
    });
    await prisma.inventoryReservation.update({
      data: { expiresAt: new Date("2000-01-01T00:00:00.000Z") },
      where: { id: pastExpiry.id },
    });
    await expect(
      consume(base, pastExpiry, {
        idempotencyKey: "consume-past",
        movementNumber: "ISSUE-PAST",
      }),
    ).rejects.toThrow("expired");

    const stale = await reserve(base, {
      idempotencyKey: "consume-reject-stale",
      quantity: 1,
      reservationNumber: "RSV-CONSUME-STALE",
    });
    await expect(
      consume(base, stale, {
        expectedReservationVersion: stale.version + 1,
        idempotencyKey: "consume-stale",
        movementNumber: "ISSUE-STALE",
      }),
    ).rejects.toThrow("changed");

    await expect(
      consumeInventoryReservation(consumption, {
        expectedReservationVersion: stale.version,
        idempotencyKey: "consume-cross-org",
        movementNumber: "ISSUE-CROSS-ORG",
        occurredAt: "2026-07-03T00:00:00.000Z",
        organizationId: other.organization.id,
        reservationId: stale.id,
      }),
    ).rejects.toThrow("not found");
  });

  it("keeps consumption idempotent and rejects conflicting reuse", async () => {
    const base = await createInventoryBase("RSV-CONSUME-IDEMP");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 10,
    });
    const reservation = await reserve(base, {
      quantity: 4,
      reservationNumber: "RSV-CONSUME-IDEMP",
    });

    const first = await consume(base, reservation, {
      idempotencyKey: "consume-idempotent",
      movementNumber: "ISSUE-IDEMPOTENT",
    });
    const second = await consume(base, reservation, {
      idempotencyKey: "consume-idempotent",
      movementNumber: "ISSUE-IDEMPOTENT",
    });

    expect(second.movement.id).toBe(first.movement.id);
    expect(second.reservation.id).toBe(first.reservation.id);
    await expectAvailability(base, 6, 0, 6);

    await expect(
      consume(base, reservation, {
        idempotencyKey: "consume-idempotent",
        movementNumber: "ISSUE-CONFLICT",
      }),
    ).rejects.toThrow("Idempotency key");
  });

  it("serializes concurrent duplicate consumption into one ledger effect", async () => {
    const base = await createInventoryBase("RSV-CONSUME-CONCURRENT");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 10,
    });
    const reservation = await reserve(base, {
      quantity: 4,
      reservationNumber: "RSV-CONSUME-CONCURRENT",
    });

    const [first, second] = await Promise.all([
      consume(base, reservation, {
        idempotencyKey: "consume-concurrent",
        movementNumber: "ISSUE-CONCURRENT",
      }),
      consume(base, reservation, {
        idempotencyKey: "consume-concurrent",
        movementNumber: "ISSUE-CONCURRENT",
      }),
    ]);

    expect(second.movement.id).toBe(first.movement.id);
    const page = await listInventoryMovements(movements, {
      organizationId: base.organization.id,
      pageSize: 10,
      type: "ISSUE",
    });
    expect(
      page.items.filter((item) => item.id === first.movement.id),
    ).toHaveLength(1);
    await expectAvailability(base, 6, 0, 6);
  });

  it("serializes consumption against concurrent physical stock issues", async () => {
    const base = await createInventoryBase("RSV-CONSUME-RACE");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 5,
    });
    const reservation = await reserve(base, {
      quantity: 4,
      reservationNumber: "RSV-CONSUME-RACE",
    });

    const results = await Promise.allSettled([
      consume(base, reservation, {
        idempotencyKey: "consume-race",
        movementNumber: "ISSUE-RACE-CONSUME",
      }),
      createAndPost("ISSUE", base, {
        movementNumber: "ISSUE-RACE-INDEPENDENT",
        quantity: 2,
        sourceLocationId: base.primaryLocation.id,
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const balance = await getOnHandBalance(balances, {
      organizationId: base.organization.id,
      productVariantId: base.variant.id,
      stockLocationId: base.primaryLocation.id,
    });
    expect(balance.quantity).toBeGreaterThanOrEqual(0);
  });

  it("enforces same-organization consumption linkage and restrictive deletion", async () => {
    const base = await createInventoryBase("RSV-CONSUME-LINK");
    const other = await createInventoryBase("RSV-CONSUME-LINK-OTHER");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 5,
    });
    await createAndPost("OPENING", other, {
      destinationLocationId: other.primaryLocation.id,
      quantity: 5,
    });
    const reservation = await reserve(base, {
      reservationNumber: "RSV-CONSUME-LINK",
    });
    const otherReservation = await reserve(other, {
      idempotencyKey: "consume-link-other",
      reservationNumber: "RSV-CONSUME-LINK-OTHER",
    });
    const result = await consume(base, reservation, {
      idempotencyKey: "consume-link",
      movementNumber: "ISSUE-LINK",
    });

    await expect(
      prisma.inventoryReservation.update({
        data: {
          consumedByMovementId: result.movement.id,
          status: "CONFIRMED",
        },
        where: { id: otherReservation.id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.inventoryMovement.delete({ where: { id: result.movement.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.inventoryReservation.delete({
        where: { id: result.reservation.id },
      }),
    ).rejects.toThrow();
  });

  it("reverses a consumption movement without reactivating the reservation", async () => {
    const base = await createInventoryBase("RSV-CONSUME-REV");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 10,
    });
    const reservation = await reserve(base, {
      quantity: 4,
      reservationNumber: "RSV-CONSUME-REV",
    });
    const consumed = await consume(base, reservation, {
      idempotencyKey: "consume-reversal",
      movementNumber: "ISSUE-REV",
    });
    await expectAvailability(base, 6, 0, 6);

    await reversePosted(base, consumed.movement.id, {
      idempotencyKey: "reverse-consumption",
      movementNumber: "REV-CONSUMPTION",
    });

    await expectAvailability(base, 10, 0, 10);
    await expect(
      reservations.findById(reservation.id, base.organization.id),
    ).resolves.toMatchObject({
      consumedByMovementId: consumed.movement.id,
      isConsumed: true,
      status: "CONFIRMED",
    });
  });

  it("enforces organization, location, and variant eligibility", async () => {
    const base = await createInventoryBase("RSV-ELIG-A");
    const other = await createInventoryBase("RSV-ELIG-B");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 5,
    });

    await expect(
      reserve(base, {
        stockLocationId: other.primaryLocation.id,
      }),
    ).rejects.toThrow("same organization");
    await expect(
      reserve(base, {
        lines: [{ productVariantId: other.variant.id, quantity: 1 }],
      }),
    ).rejects.toThrow("same organization");

    await prisma.stockLocation.update({
      data: { isSellable: false, status: "INACTIVE" },
      where: { id: base.primaryLocation.id },
    });
    await expect(
      reserve(base, {
        idempotencyKey: "rsv-inactive-location",
        reservationNumber: "RSV-INACTIVE-LOCATION",
      }),
    ).rejects.toThrow("active");
    await prisma.stockLocation.update({
      data: { status: "ACTIVE" },
      where: { id: base.primaryLocation.id },
    });
    await expect(
      reserve(base, {
        idempotencyKey: "rsv-nonsell-location",
        reservationNumber: "RSV-NONSELL-LOCATION",
      }),
    ).rejects.toThrow("sellable");
    await prisma.stockLocation.update({
      data: { isSellable: true },
      where: { id: base.primaryLocation.id },
    });
    await prisma.productVariant.update({
      data: { status: "INACTIVE" },
      where: { id: base.variant.id },
    });
    await expect(
      reserve(base, {
        idempotencyKey: "rsv-inactive-variant",
        reservationNumber: "RSV-INACTIVE-VARIANT",
      }),
    ).rejects.toThrow("variants must be active");
    await prisma.productVariant.update({
      data: { status: "ARCHIVED" },
      where: { id: base.variant.id },
    });
    await expect(
      reserve(base, {
        idempotencyKey: "rsv-archived-variant",
        reservationNumber: "RSV-ARCHIVED-VARIANT",
      }),
    ).rejects.toThrow("variants must be active");
  });

  it("excludes draft movements and reflects reversal through on-hand", async () => {
    const base = await createInventoryBase("RSV-LEDGER");
    await createInventoryMovement(movements, {
      destinationLocationId: base.primaryLocation.id,
      idempotencyKey: "rsv-draft-stock",
      lines: [{ productVariantId: base.variant.id, quantity: 10 }],
      movementNumber: "RSV-DRAFT-STOCK",
      organizationId: base.organization.id,
      type: "OPENING",
    });
    await expectAvailability(base, 0, 0, 0);

    const receipt = await createAndPost("RECEIPT", base, {
      destinationLocationId: base.primaryLocation.id,
      movementNumber: "RSV-REVERSAL-RECEIPT",
      quantity: 6,
    });
    await expectAvailability(base, 6, 0, 6);
    await reversePosted(base, receipt.id, {
      idempotencyKey: "rsv-reverse-receipt",
      movementNumber: "RSV-REVERSAL",
    });
    await expectAvailability(base, 0, 0, 0);
  });

  it("lists reservations and availability with organization isolation", async () => {
    const base = await createInventoryBase("RSV-LIST-A");
    const other = await createInventoryBase("RSV-LIST-B");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 5,
    });
    await createAndPost("OPENING", other, {
      destinationLocationId: other.primaryLocation.id,
      quantity: 9,
    });
    const reservation = await reserve(base, {
      referenceId: "REF-1",
      referenceType: "MANUAL",
      reservationNumber: "RSV-LIST",
    });
    await reserve(other, {
      idempotencyKey: "rsv-list-other",
      reservationNumber: "RSV-LIST-OTHER",
    });

    const reservationPage = await listInventoryReservations(reservations, {
      organizationId: base.organization.id,
      pageSize: 10,
      productVariantId: base.variant.id,
      referenceId: "REF-1",
      referenceType: "MANUAL",
      status: "ACTIVE",
      stockLocationId: base.primaryLocation.id,
    });
    expect(reservationPage.items).toMatchObject([{ id: reservation.id }]);

    const availabilityPage = await listLocationAvailability(availability, {
      onlyAvailable: true,
      organizationId: base.organization.id,
      stockLocationId: base.primaryLocation.id,
    });
    expect(availabilityPage.items).toMatchObject([
      {
        availableQuantity: 1,
        organizationId: base.organization.id,
        productVariantId: base.variant.id,
      },
    ]);
  });

  it("preserves restrictive deletion for reservation history", async () => {
    const base = await createInventoryBase("RSV-DELETE");
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      quantity: 5,
    });
    await reserve(base, { reservationNumber: "RSV-DELETE" });

    await expect(
      prisma.stockLocation.delete({ where: { id: base.primaryLocation.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.productVariant.delete({ where: { id: base.variant.id } }),
    ).rejects.toThrow();
  });

  it("creates and manages allocation policies with optimistic replacement rules", async () => {
    const base = await createInventoryBase("ALLOC-POLICY");
    const other = await createInventoryBase("ALLOC-POLICY-OTHER");

    const policy = await createPolicy(base, "ALLOC-POLICY");
    expect(policy).toMatchObject({
      code: "ALLOC-POLICY",
      requireSellableLocation: true,
      status: "ACTIVE",
      strategy: "PRIORITY_ORDER",
      version: 1,
    });
    await expect(createPolicy(base, "ALLOC-POLICY")).rejects.toThrow(
      "already exists",
    );

    const withLocations = await replacePolicyLocations(base, policy.id, 1, [
      { priority: 1, stockLocationId: base.primaryLocation.id },
      {
        isEnabled: false,
        priority: 2,
        stockLocationId: base.secondaryLocation.id,
      },
    ]);
    expect(withLocations.locations).toHaveLength(2);
    expect(withLocations.version).toBe(2);

    await expect(
      replacePolicyLocations(base, policy.id, 1, [
        { priority: 1, stockLocationId: base.primaryLocation.id },
      ]),
    ).rejects.toThrow("changed");
    await expect(
      replacePolicyLocations(base, policy.id, 2, [
        { priority: 1, stockLocationId: base.primaryLocation.id },
        { priority: 1, stockLocationId: base.secondaryLocation.id },
      ]),
    ).rejects.toThrow("priority");
    await expect(
      replacePolicyLocations(base, policy.id, 2, [
        { priority: 1, stockLocationId: base.primaryLocation.id },
        { priority: 2, stockLocationId: base.primaryLocation.id },
      ]),
    ).rejects.toThrow("stock location");
    await expect(
      replacePolicyLocations(base, policy.id, 2, [
        { priority: 1, stockLocationId: other.primaryLocation.id },
      ]),
    ).rejects.toThrow("same organization");

    const inactive = await changeInventoryAllocationPolicyStatus(
      allocationPolicies,
      {
        expectedVersion: withLocations.version,
        organizationId: base.organization.id,
        policyId: policy.id,
        status: "INACTIVE",
      },
    );
    await expect(
      allocate(base, policy.id, { idempotencyKey: "alloc-inactive" }),
    ).rejects.toThrow("active");
    const archived = await changeInventoryAllocationPolicyStatus(
      allocationPolicies,
      {
        expectedVersion: inactive.version,
        organizationId: base.organization.id,
        policyId: policy.id,
        status: "ARCHIVED",
      },
    );
    await expect(
      changeInventoryAllocationPolicyStatus(allocationPolicies, {
        expectedVersion: archived.version,
        organizationId: base.organization.id,
        policyId: policy.id,
        status: "ACTIVE",
      }),
    ).rejects.toThrow("Archived");
  });

  it("previews and allocates from the highest-priority sufficient location", async () => {
    const base = await createInventoryBase("ALLOC-SELECT");
    const highPriorityLowStock = await createStockLocation(base, "HIGH", {
      isSellable: true,
      type: "WAREHOUSE",
    });
    const lowerPrioritySufficient = await createStockLocation(base, "LOW", {
      isSellable: true,
      type: "SHOWROOM",
    });
    const secondVariant = await createSecondVariant(base, "ALLOC-SELECT");
    const policy = await createPolicy(base, "ALLOC-SELECT");
    await replacePolicyLocations(base, policy.id, policy.version, [
      { priority: 1, stockLocationId: highPriorityLowStock.id },
      { priority: 2, stockLocationId: lowerPrioritySufficient.id },
      { priority: 3, stockLocationId: base.primaryLocation.id },
    ]);
    await createAndPost("OPENING", base, {
      destinationLocationId: highPriorityLowStock.id,
      movementNumber: "ALLOC-SELECT-HIGH-A",
      quantity: 5,
    });
    await createAndPost("OPENING", base, {
      destinationLocationId: highPriorityLowStock.id,
      movementNumber: "ALLOC-SELECT-HIGH-B",
      quantity: 1,
      variantId: secondVariant.id,
    });
    await createAndPost("OPENING", base, {
      destinationLocationId: lowerPrioritySufficient.id,
      movementNumber: "ALLOC-SELECT-LOW-A",
      quantity: 5,
    });
    await createAndPost("OPENING", base, {
      destinationLocationId: lowerPrioritySufficient.id,
      movementNumber: "ALLOC-SELECT-LOW-B",
      quantity: 5,
      variantId: secondVariant.id,
    });

    const preview = await previewInventoryAllocation(allocation, {
      lines: [
        { productVariantId: base.variant.id, quantity: 3 },
        { productVariantId: secondVariant.id, quantity: 2 },
      ],
      organizationId: base.organization.id,
      policyId: policy.id,
    });
    expect(preview).toMatchObject({
      canFulfill: true,
      selectedBranchId: base.branch.id,
      selectedStockLocationId: lowerPrioritySufficient.id,
    });
    expect(preview.selectedLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          availableQuantity: 5,
          productVariantId: secondVariant.id,
        }),
      ]),
    );
    await expect(
      listInventoryReservations(reservations, {
        organizationId: base.organization.id,
      }),
    ).resolves.toMatchObject({ items: [] });

    const result = await allocate(base, policy.id, {
      lines: [
        { productVariantId: base.variant.id, quantity: 3 },
        { productVariantId: secondVariant.id, quantity: 2 },
      ],
      reservationNumber: "ALLOC-SELECT",
    });
    expect(result.selectedStockLocationId).toBe(lowerPrioritySufficient.id);
    expect(result.reservation).toMatchObject({
      stockLocationId: lowerPrioritySufficient.id,
      status: "ACTIVE",
    });
    await expect(
      getAvailableToSell(availability, {
        organizationId: base.organization.id,
        productVariantId: base.variant.id,
        stockLocationId: lowerPrioritySufficient.id,
      }),
    ).resolves.toMatchObject({
      availableQuantity: 2,
      onHandQuantity: 5,
      reservedQuantity: 3,
    });
  });

  it("honors preferred location and preferred branch when eligible", async () => {
    const base = await createInventoryBase("ALLOC-PREF");
    const first = await createStockLocation(base, "FIRST", {
      isSellable: true,
      type: "WAREHOUSE",
    });
    const preferredBranch = await prisma.branch.create({
      data: {
        code: "BRANCH-ALLOC-PREF-2",
        name: "Preferred Branch",
        organizationId: base.organization.id,
      },
    });
    const branchLocation = await createStockLocation(base, "BRANCH", {
      branchId: preferredBranch.id,
      isSellable: true,
      type: "SHOWROOM",
    });
    const preferredLocation = await createStockLocation(base, "LOCATION", {
      isSellable: true,
      type: "OTHER",
    });
    const policy = await createPolicy(base, "ALLOC-PREF");
    await replacePolicyLocations(base, policy.id, policy.version, [
      { priority: 1, stockLocationId: first.id },
      { priority: 2, stockLocationId: branchLocation.id },
      { priority: 3, stockLocationId: preferredLocation.id },
    ]);
    for (const [location, movementNumber] of [
      [first, "ALLOC-PREF-FIRST"],
      [branchLocation, "ALLOC-PREF-BRANCH"],
      [preferredLocation, "ALLOC-PREF-LOCATION"],
    ] as const) {
      await createAndPost("OPENING", base, {
        destinationLocationId: location.id,
        movementNumber,
        quantity: 5,
      });
    }

    await expect(
      previewInventoryAllocation(allocation, {
        lines: [{ productVariantId: base.variant.id, quantity: 2 }],
        organizationId: base.organization.id,
        policyId: policy.id,
        preferredLocationId: preferredLocation.id,
      }),
    ).resolves.toMatchObject({
      selectedStockLocationId: preferredLocation.id,
    });
    await expect(
      previewInventoryAllocation(allocation, {
        lines: [{ productVariantId: base.variant.id, quantity: 2 }],
        organizationId: base.organization.id,
        policyId: policy.id,
        preferredBranchId: preferredBranch.id,
      }),
    ).resolves.toMatchObject({
      selectedStockLocationId: branchLocation.id,
    });
  });

  it("excludes ineligible allocation locations and variants", async () => {
    const base = await createInventoryBase("ALLOC-ELIG");
    const inactiveBranch = await prisma.branch.create({
      data: {
        code: "BRANCH-ALLOC-ELIG-INACTIVE",
        name: "Inactive Branch",
        organizationId: base.organization.id,
        status: "INACTIVE",
      },
    });
    const inactiveBranchLocation = await createStockLocation(base, "IB", {
      branchId: inactiveBranch.id,
      isSellable: true,
      type: "WAREHOUSE",
    });
    const inactiveLocation = await createStockLocation(base, "IL", {
      isSellable: false,
      status: "INACTIVE",
      type: "WAREHOUSE",
    });
    const nonSellableLocation = await createStockLocation(base, "NS", {
      isSellable: false,
      type: "WAREHOUSE",
    });
    const transitLocation = await createStockLocation(base, "TR", {
      isSellable: false,
      type: "TRANSIT",
    });
    const fallback = await createStockLocation(base, "OK", {
      isSellable: true,
      type: "WAREHOUSE",
    });
    const policy = await createPolicy(base, "ALLOC-ELIG");
    await replacePolicyLocations(base, policy.id, policy.version, [
      { priority: 1, stockLocationId: inactiveBranchLocation.id },
      { priority: 2, stockLocationId: inactiveLocation.id },
      { priority: 3, stockLocationId: nonSellableLocation.id },
      { priority: 4, stockLocationId: transitLocation.id },
      { priority: 5, stockLocationId: fallback.id },
    ]);
    for (const [location, movementNumber] of [
      [inactiveBranchLocation, "ALLOC-ELIG-IB"],
      [nonSellableLocation, "ALLOC-ELIG-NS"],
      [transitLocation, "ALLOC-ELIG-TR"],
      [fallback, "ALLOC-ELIG-OK"],
    ] as const) {
      await createAndPost("OPENING", base, {
        destinationLocationId: location.id,
        movementNumber,
        quantity: 5,
      });
    }

    await expect(
      previewInventoryAllocation(allocation, {
        lines: [{ productVariantId: base.variant.id, quantity: 2 }],
        organizationId: base.organization.id,
        policyId: policy.id,
        preferredLocationId: inactiveBranchLocation.id,
      }),
    ).resolves.toMatchObject({
      selectedStockLocationId: fallback.id,
    });
    await prisma.productVariant.update({
      data: { status: "INACTIVE" },
      where: { id: base.variant.id },
    });
    await expect(
      previewInventoryAllocation(allocation, {
        lines: [{ productVariantId: base.variant.id, quantity: 1 }],
        organizationId: base.organization.id,
        policyId: policy.id,
      }),
    ).rejects.toThrow("variants must be active");
  });

  it("rejects split allocation and keeps one reservation per successful allocation", async () => {
    const base = await createInventoryBase("ALLOC-SPLIT");
    const first = await createStockLocation(base, "FIRST", {
      isSellable: true,
      type: "WAREHOUSE",
    });
    const second = await createStockLocation(base, "SECOND", {
      isSellable: true,
      type: "WAREHOUSE",
    });
    const policy = await createPolicy(base, "ALLOC-SPLIT");
    await replacePolicyLocations(base, policy.id, policy.version, [
      { priority: 1, stockLocationId: first.id },
      { priority: 2, stockLocationId: second.id },
    ]);
    await createAndPost("OPENING", base, {
      destinationLocationId: first.id,
      movementNumber: "ALLOC-SPLIT-FIRST",
      quantity: 2,
    });
    await createAndPost("OPENING", base, {
      destinationLocationId: second.id,
      movementNumber: "ALLOC-SPLIT-SECOND",
      quantity: 2,
    });

    await expect(
      previewInventoryAllocation(allocation, {
        lines: [{ productVariantId: base.variant.id, quantity: 3 }],
        organizationId: base.organization.id,
        policyId: policy.id,
      }),
    ).resolves.toMatchObject({
      canFulfill: false,
      selectedStockLocationId: null,
    });
    await expect(
      allocate(base, policy.id, {
        idempotencyKey: "alloc-split",
        quantity: 3,
        reservationNumber: "ALLOC-SPLIT",
      }),
    ).rejects.toThrow("No eligible location");
    await expect(
      listInventoryReservations(reservations, {
        organizationId: base.organization.id,
      }),
    ).resolves.toMatchObject({ items: [] });
  });

  it("keeps allocation idempotent and rejects conflicting reuse", async () => {
    const base = await createInventoryBase("ALLOC-IDEMP");
    const policy = await createPolicy(base, "ALLOC-IDEMP");
    await replacePolicyLocations(base, policy.id, policy.version, [
      { priority: 1, stockLocationId: base.primaryLocation.id },
    ]);
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      movementNumber: "ALLOC-IDEMP-OPEN",
      quantity: 10,
    });

    const input = {
      idempotencyKey: "alloc-idempotent",
      quantity: 4,
      reservationNumber: "ALLOC-IDEMP",
    };
    const first = await allocate(base, policy.id, input);
    const second = await allocate(base, policy.id, input);
    expect(second.reservation.id).toBe(first.reservation.id);
    await expectAvailability(base, 10, 4, 6);

    await expect(
      allocate(base, policy.id, {
        ...input,
        quantity: 5,
      }),
    ).rejects.toThrow("Idempotency key");
  });

  it("serializes concurrent allocation and may use another sufficient location", async () => {
    const base = await createInventoryBase("ALLOC-RACE");
    const first = await createStockLocation(base, "FIRST", {
      isSellable: true,
      type: "WAREHOUSE",
    });
    const second = await createStockLocation(base, "SECOND", {
      isSellable: true,
      type: "WAREHOUSE",
    });
    const policy = await createPolicy(base, "ALLOC-RACE");
    await replacePolicyLocations(base, policy.id, policy.version, [
      { priority: 1, stockLocationId: first.id },
      { priority: 2, stockLocationId: second.id },
    ]);
    await createAndPost("OPENING", base, {
      destinationLocationId: first.id,
      movementNumber: "ALLOC-RACE-FIRST",
      quantity: 5,
    });
    await createAndPost("OPENING", base, {
      destinationLocationId: second.id,
      movementNumber: "ALLOC-RACE-SECOND",
      quantity: 5,
    });

    const results = await Promise.allSettled([
      allocate(base, policy.id, {
        idempotencyKey: "alloc-race-a",
        quantity: 5,
        reservationNumber: "ALLOC-RACE-A",
      }),
      allocate(base, policy.id, {
        idempotencyKey: "alloc-race-b",
        quantity: 5,
        reservationNumber: "ALLOC-RACE-B",
      }),
    ]);
    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof allocate>>
      > => result.status === "fulfilled",
    );
    expect(fulfilled).toHaveLength(2);
    expect(
      new Set(fulfilled.map((result) => result.value.selectedStockLocationId))
        .size,
    ).toBe(2);
  });

  it("enforces allocation organization isolation and restrictive deletion", async () => {
    const base = await createInventoryBase("ALLOC-ORG");
    const other = await createInventoryBase("ALLOC-ORG-OTHER");
    const policy = await createPolicy(base, "ALLOC-ORG");
    await replacePolicyLocations(base, policy.id, policy.version, [
      { priority: 1, stockLocationId: base.primaryLocation.id },
    ]);
    await createAndPost("OPENING", base, {
      destinationLocationId: base.primaryLocation.id,
      movementNumber: "ALLOC-ORG-OPEN",
      quantity: 5,
    });

    await expect(
      previewInventoryAllocation(allocation, {
        lines: [{ productVariantId: base.variant.id, quantity: 1 }],
        organizationId: other.organization.id,
        policyId: policy.id,
      }),
    ).rejects.toThrow("not found");
    await expect(
      allocate(other, policy.id, {
        idempotencyKey: "alloc-cross-org",
        lines: [{ productVariantId: base.variant.id, quantity: 1 }],
        reservationNumber: "ALLOC-CROSS-ORG",
      }),
    ).rejects.toThrow("not found");
    await expect(
      prisma.stockLocation.delete({ where: { id: base.primaryLocation.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.inventoryAllocationPolicy.delete({ where: { id: policy.id } }),
    ).rejects.toThrow();
  });

  it("exposes allocation constraints and indexes for migration review", async () => {
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'inventory_allocation_policies_version_positive_check',
        'inventory_allocation_policy_locations_priority_positive_check',
        'inventory_allocation_policy_locations_policy_id_organizati_fkey',
        'inventory_allocation_policy_locations_stock_location_id_or_fkey'
      )
      ORDER BY conname
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'inventory_allocation_policies_organization_id_status_create_idx',
          'inventory_allocation_policy_locations_organization_id_polic_idx',
          'inventory_allocation_policy_locations_organization_id_stock_idx'
        )
      ORDER BY indexname
    `;

    expect(constraints.map((constraint) => constraint.conname)).toEqual([
      "inventory_allocation_policies_version_positive_check",
      "inventory_allocation_policy_locations_policy_id_organizati_fkey",
      "inventory_allocation_policy_locations_priority_positive_check",
      "inventory_allocation_policy_locations_stock_location_id_or_fkey",
    ]);
    expect(indexes).toHaveLength(3);
  });

  it("exposes inventory constraints and indexes for migration review", async () => {
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'inventory_movements_location_shape_check',
        'inventory_movements_posted_at_status_check',
        'inventory_movement_lines_quantity_positive_check',
        'inventory_movement_lines_movement_id_organization_id_fkey',
        'inventory_movement_lines_product_variant_id_organization_i_fkey'
      )
      ORDER BY conname
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'inventory_movements_organization_id_status_occurred_at_id_idx',
          'inventory_movements_organization_id_type_occurred_at_id_idx',
          'inventory_movements_organization_id_source_location_id_occu_idx',
          'inventory_movements_organization_id_destination_location_id_idx',
          'inventory_movement_lines_organization_id_product_variant_id_idx'
        )
      ORDER BY indexname
    `;

    expect(constraints.map((constraint) => constraint.conname)).toEqual([
      "inventory_movement_lines_movement_id_organization_id_fkey",
      "inventory_movement_lines_product_variant_id_organization_i_fkey",
      "inventory_movement_lines_quantity_positive_check",
      "inventory_movements_location_shape_check",
      "inventory_movements_posted_at_status_check",
    ]);
    expect(indexes).toHaveLength(5);
  });

  async function createPolicy(
    base: Awaited<ReturnType<typeof createInventoryBase>>,
    code: string,
  ) {
    return createInventoryAllocationPolicy(allocationPolicies, {
      code,
      name: `Policy ${code}`,
      organizationId: base.organization.id,
    });
  }

  async function replacePolicyLocations(
    base: Awaited<ReturnType<typeof createInventoryBase>>,
    policyId: string,
    expectedVersion: number,
    locations: Array<{
      isEnabled?: boolean;
      priority: number;
      stockLocationId: string;
    }>,
  ) {
    return replaceInventoryAllocationPolicyLocations(allocationPolicies, {
      expectedVersion,
      locations,
      organizationId: base.organization.id,
      policyId,
    });
  }

  async function allocate(
    base: Awaited<ReturnType<typeof createInventoryBase>>,
    policyId: string,
    input?: {
      idempotencyKey?: string;
      lines?: { productVariantId: string; quantity: number }[];
      preferredBranchId?: string | null;
      preferredLocationId?: string | null;
      quantity?: number;
      reservationNumber?: string;
    },
  ) {
    return allocateAndCreateInventoryReservation(allocation, {
      idempotencyKey: input?.idempotencyKey ?? "allocation-key",
      lines: input?.lines ?? [
        { productVariantId: base.variant.id, quantity: input?.quantity ?? 4 },
      ],
      organizationId: base.organization.id,
      policyId,
      preferredBranchId: input?.preferredBranchId,
      preferredLocationId: input?.preferredLocationId,
      reservationNumber: input?.reservationNumber ?? "ALLOCATION",
    });
  }

  async function createStockLocation(
    base: Awaited<ReturnType<typeof createInventoryBase>>,
    suffix: string,
    input?: {
      branchId?: string;
      isSellable?: boolean;
      status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
      type?:
        | "WAREHOUSE"
        | "SHOWROOM"
        | "QC_HOLD"
        | "DAMAGE_HOLD"
        | "RETURN_HOLD"
        | "TRANSIT"
        | "OTHER";
    },
  ) {
    return prisma.stockLocation.create({
      data: {
        branchId: input?.branchId ?? base.branch.id,
        code: `LOC-${suffix}-${base.organization.code}`,
        isSellable: input?.isSellable ?? true,
        name: `Location ${suffix}`,
        organizationId: base.organization.id,
        status: input?.status ?? "ACTIVE",
        type: input?.type ?? "WAREHOUSE",
      },
    });
  }

  async function createAndPost(
    type: InventoryMovementType,
    base: Awaited<ReturnType<typeof createInventoryBase>>,
    input: {
      destinationLocationId?: string;
      movementNumber?: string;
      quantity: number;
      sourceLocationId?: string;
      variantId?: string;
    },
  ) {
    const defaultMovementNumber = type.replaceAll("_", "-");
    const movement = await createInventoryMovement(movements, {
      destinationLocationId: input.destinationLocationId,
      idempotencyKey: `${input.movementNumber ?? defaultMovementNumber}-key`,
      lines: [
        {
          productVariantId: input.variantId ?? base.variant.id,
          quantity: input.quantity,
        },
      ],
      movementNumber: input.movementNumber ?? defaultMovementNumber,
      organizationId: base.organization.id,
      sourceLocationId: input.sourceLocationId,
      type,
    });
    return postInventoryMovement(movements, {
      movementId: movement.id,
      organizationId: base.organization.id,
    });
  }

  async function reversePosted(
    base: Awaited<ReturnType<typeof createInventoryBase>>,
    originalMovementId: string,
    input?: {
      idempotencyKey?: string;
      movementNumber?: string;
    },
  ) {
    return reverseInventoryMovement(movements, {
      idempotencyKey: input?.idempotencyKey ?? "reverse-posted-key",
      occurredAt: "2026-07-03T01:00:00.000Z",
      organizationId: base.organization.id,
      originalMovementId,
      reason: "Inventory audit correction",
      referenceId: "AUDIT-1",
      referenceType: "AUDIT",
      reversalMovementNumber: input?.movementNumber ?? "REV-POSTED",
    });
  }

  async function reserve(
    base: Awaited<ReturnType<typeof createInventoryBase>>,
    input?: {
      expiresAt?: string;
      idempotencyKey?: string;
      lines?: { productVariantId: string; quantity: number }[];
      quantity?: number;
      referenceId?: string;
      referenceType?: string;
      reservationNumber?: string;
      stockLocationId?: string;
    },
  ) {
    return createInventoryReservation(reservations, {
      expiresAt: input?.expiresAt,
      idempotencyKey: input?.idempotencyKey ?? "reservation-key",
      lines: input?.lines ?? [
        { productVariantId: base.variant.id, quantity: input?.quantity ?? 4 },
      ],
      organizationId: base.organization.id,
      referenceId: input?.referenceId,
      referenceType: input?.referenceType,
      reservationNumber: input?.reservationNumber ?? "RESERVATION",
      stockLocationId: input?.stockLocationId ?? base.primaryLocation.id,
    });
  }

  async function consume(
    base: Awaited<ReturnType<typeof createInventoryBase>>,
    reservation: Awaited<ReturnType<typeof reserve>>,
    input: {
      expectedReservationVersion?: number;
      idempotencyKey: string;
      movementNumber: string;
    },
  ) {
    return consumeInventoryReservation(consumption, {
      expectedReservationVersion:
        input.expectedReservationVersion ?? reservation.version,
      idempotencyKey: input.idempotencyKey,
      movementNumber: input.movementNumber,
      occurredAt: "2026-07-03T00:00:00.000Z",
      organizationId: base.organization.id,
      reservationId: reservation.id,
    });
  }

  async function expectBalance(
    base: Awaited<ReturnType<typeof createInventoryBase>>,
    stockLocationId: string,
    quantity: number,
  ) {
    await expect(
      getOnHandBalance(balances, {
        organizationId: base.organization.id,
        productVariantId: base.variant.id,
        stockLocationId,
      }),
    ).resolves.toMatchObject({ quantity });
  }

  async function expectAvailability(
    base: Awaited<ReturnType<typeof createInventoryBase>>,
    onHandQuantity: number,
    reservedQuantity: number,
    availableQuantity: number,
  ) {
    await expect(
      getAvailableToSell(availability, {
        organizationId: base.organization.id,
        productVariantId: base.variant.id,
        stockLocationId: base.primaryLocation.id,
      }),
    ).resolves.toMatchObject({
      availableQuantity,
      onHandQuantity,
      reservedQuantity,
    });
  }

  async function createSecondVariant(
    base: Awaited<ReturnType<typeof createInventoryBase>>,
    suffix: string,
  ) {
    const color = await prisma.color.create({
      data: {
        code: `COLOR-2-${suffix}`,
        name: `Color 2 ${suffix}`,
        normalizedName: `COLOR 2 ${suffix}`,
        organizationId: base.organization.id,
      },
    });
    const size = await prisma.size.create({
      data: {
        code: `SIZE-2-${suffix}`,
        name: `Size 2 ${suffix}`,
        organizationId: base.organization.id,
        sortOrder: 2,
      },
    });
    return prisma.productVariant.create({
      data: {
        colorId: color.id,
        organizationId: base.organization.id,
        productId: base.product.id,
        sizeId: size.id,
        sku: `SKU-2-${suffix}`,
      },
    });
  }

  async function createInventoryBase(suffix: string) {
    const organization = await prisma.organization.create({
      data: {
        code: `ORG-${suffix}`,
        name: `Org ${suffix}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        code: `BRANCH-${suffix}`,
        name: `Branch ${suffix}`,
        organizationId: organization.id,
      },
    });
    const primaryLocation = await prisma.stockLocation.create({
      data: {
        branchId: branch.id,
        code: `PRIMARY-${suffix}`,
        isSellable: true,
        name: `Primary ${suffix}`,
        organizationId: organization.id,
        type: "WAREHOUSE",
      },
    });
    const secondaryLocation = await prisma.stockLocation.create({
      data: {
        branchId: branch.id,
        code: `SECONDARY-${suffix}`,
        name: `Secondary ${suffix}`,
        organizationId: organization.id,
        type: "QC_HOLD",
      },
    });
    const category = await prisma.category.create({
      data: {
        name: `Category ${suffix}`,
        organizationId: organization.id,
        slug: `category-${suffix.toLowerCase()}`,
      },
    });
    const color = await prisma.color.create({
      data: {
        code: `COLOR-${suffix}`,
        name: `Color ${suffix}`,
        normalizedName: `COLOR ${suffix}`,
        organizationId: organization.id,
      },
    });
    const size = await prisma.size.create({
      data: {
        code: `SIZE-${suffix}`,
        name: `Size ${suffix}`,
        organizationId: organization.id,
        sortOrder: 1,
      },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: `Product ${suffix}`,
        organizationId: organization.id,
        productCode: `PRODUCT-${suffix}`,
        slug: `product-${suffix.toLowerCase()}`,
        status: "ACTIVE",
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        colorId: color.id,
        organizationId: organization.id,
        productId: product.id,
        sizeId: size.id,
        sku: `SKU-${suffix}`,
      },
    });

    return {
      branch,
      organization,
      primaryLocation,
      product,
      secondaryLocation,
      variant,
    };
  }
});
