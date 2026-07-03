import { describe, expect, it } from "vitest";
import {
  apiErrorCodeSchema,
  branchContractSchema,
  branchPageContractSchema,
  changeBranchStatusInputSchema,
  changePosCounterStatusInputSchema,
  changeStockLocationStatusInputSchema,
  createBranchInputSchema,
  createInventoryMovementInputSchema,
  createColorInputSchema,
  createPosCounterInputSchema,
  createProductVariantInputSchema,
  createInventoryReservationInputSchema,
  createStockLocationInputSchema,
  getBranchQuerySchema,
  getInventoryMovementQuerySchema,
  getOnHandBalanceQuerySchema,
  getAvailableToSellQuerySchema,
  getPosCounterQuerySchema,
  getInventoryReservationQuerySchema,
  getStockLocationQuerySchema,
  inventoryReservationPageContractSchema,
  locationAvailabilityPageContractSchema,
  inventoryMovementPageContractSchema,
  listInventoryMovementsQuerySchema,
  listBranchesQuerySchema,
  listLocationBalancesQuerySchema,
  listLocationAvailabilityQuerySchema,
  listInventoryReservationsQuerySchema,
  listPosCountersQuerySchema,
  listStockLocationsQuerySchema,
  posCounterPageContractSchema,
  postInventoryMovementInputSchema,
  confirmInventoryReservationInputSchema,
  consumeInventoryReservationInputSchema,
  expireInventoryReservationInputSchema,
  replaceDraftMovementLinesInputSchema,
  releaseInventoryReservationInputSchema,
  reverseInventoryMovementInputSchema,
  createApiFailure,
  createApiSuccess,
  paginationMetaSchema,
  stockLocationPageContractSchema,
  updateBranchMetadataInputSchema,
  updatePosCounterMetadataInputSchema,
  updateStockLocationMetadataInputSchema,
} from "./index.js";

describe("API contracts", () => {
  it("creates a discriminated success response", () => {
    expect(createApiSuccess({ ready: true }, "req_contract_1")).toEqual({
      data: { ready: true },
      requestId: "req_contract_1",
      success: true,
    });
  });

  it("creates a public failure response without stack traces", () => {
    const failure = createApiFailure({
      code: "VALIDATION.INVALID_INPUT",
      fieldErrors: { name: ["Required"] },
      message: "Input is invalid.",
      requestId: "req_contract_2",
    });

    expect(failure.success).toBe(false);
    expect(JSON.stringify(failure)).not.toContain("stack");
  });

  it("validates error code and pagination conventions", () => {
    expect(
      apiErrorCodeSchema.safeParse("CONFLICT.VERSION_MISMATCH").success,
    ).toBe(true);
    expect(apiErrorCodeSchema.safeParse("conflict.version").success).toBe(
      false,
    );
    expect(paginationMetaSchema.parse({ page: 1, pageSize: 50 })).toEqual({
      page: 1,
      pageSize: 50,
    });
  });

  it("validates catalog identity creation inputs without Prisma types", () => {
    expect(
      createColorInputSchema.parse({
        code: "black",
        hexValue: "#000000",
        name: "Black",
        organizationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toMatchObject({ code: "black" });

    expect(
      createProductVariantInputSchema.safeParse({
        colorId: "11111111-1111-4111-8111-111111111111",
        organizationId: "11111111-1111-4111-8111-111111111111",
        productId: "11111111-1111-4111-8111-111111111111",
        sizeId: "11111111-1111-4111-8111-111111111111",
        sku: "bad sku",
      }).success,
    ).toBe(false);
  });

  it("validates organization operation creation inputs without Prisma types", () => {
    expect(
      createBranchInputSchema.parse({
        code: "main-01",
        countryCode: "BD",
        email: "ops@senvo.test",
        name: "Main Showroom",
        organizationId: "11111111-1111-4111-8111-111111111111",
        phone: "+880 1700-000000",
        timezone: "Asia/Dhaka",
        type: "SHOWROOM",
      }),
    ).toMatchObject({ code: "main-01" });

    expect(
      createStockLocationInputSchema.safeParse({
        branchId: "11111111-1111-4111-8111-111111111111",
        code: "bad code",
        name: "QC Hold",
        organizationId: "11111111-1111-4111-8111-111111111111",
        type: "QC_HOLD",
      }).success,
    ).toBe(false);

    expect(
      createPosCounterInputSchema.safeParse({
        branchId: "11111111-1111-4111-8111-111111111111",
        code: "COUNTER-1",
        name: "",
        organizationId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
  });

  it("validates organization operation output contracts with ISO timestamps", () => {
    expect(
      branchContractSchema.parse({
        addressLine1: null,
        addressLine2: null,
        city: null,
        code: "MAIN",
        countryCode: "BD",
        createdAt: "2026-07-02T00:00:00.000Z",
        district: null,
        email: null,
        id: "11111111-1111-4111-8111-111111111111",
        name: "Main Showroom",
        organizationId: "11111111-1111-4111-8111-111111111111",
        phone: null,
        postalCode: null,
        status: "ACTIVE",
        timezone: "Asia/Dhaka",
        type: "SHOWROOM",
        updatedAt: "2026-07-02T00:00:00.000Z",
        version: 1,
      }),
    ).toMatchObject({ code: "MAIN" });
  });

  it("validates lifecycle inputs with expected versions and immutable fields absent", () => {
    expect(
      updateBranchMetadataInputSchema.safeParse({
        branchId: "11111111-1111-4111-8111-111111111111",
        code: "NEW-CODE",
        email: null,
        expectedVersion: 1,
        name: "Main Updated",
        organizationId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
    expect(
      updateBranchMetadataInputSchema.parse({
        branchId: "11111111-1111-4111-8111-111111111111",
        email: null,
        expectedVersion: 1,
        name: "Main Updated",
        organizationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toMatchObject({ email: null, expectedVersion: 1 });

    expect(
      updateStockLocationMetadataInputSchema.safeParse({
        branchId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 1,
        name: "Floor",
        organizationId: "11111111-1111-4111-8111-111111111111",
        stockLocationId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
    expect(
      updatePosCounterMetadataInputSchema.safeParse({
        code: "COUNTER-2",
        expectedVersion: 1,
        name: "Counter",
        organizationId: "11111111-1111-4111-8111-111111111111",
        posCounterId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);

    expect(
      changeBranchStatusInputSchema.parse({
        branchId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 2,
        organizationId: "11111111-1111-4111-8111-111111111111",
        status: "INACTIVE",
      }),
    ).toMatchObject({ status: "INACTIVE" });
    expect(
      changeStockLocationStatusInputSchema.safeParse({
        expectedVersion: 0,
        organizationId: "11111111-1111-4111-8111-111111111111",
        status: "ARCHIVED",
        stockLocationId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
    expect(
      changePosCounterStatusInputSchema.safeParse({
        expectedVersion: 1,
        organizationId: "11111111-1111-4111-8111-111111111111",
        posCounterId: "11111111-1111-4111-8111-111111111111",
        status: "ARCHIVED",
      }).success,
    ).toBe(true);
  });

  it("validates organization operation read query inputs and paginated outputs", () => {
    const branchId = "11111111-1111-4111-8111-111111111111";
    const organizationId = "22222222-2222-4222-8222-222222222222";
    const cursor =
      "v1|2026-07-02T00%3A00%3A00.000Z|11111111-1111-4111-8111-111111111111";

    expect(
      getBranchQuerySchema.parse({
        branchId,
        organizationId,
      }),
    ).toMatchObject({ branchId, organizationId });
    expect(
      getStockLocationQuerySchema.safeParse({
        branchId,
        organizationId,
        stockLocationId: branchId,
      }).success,
    ).toBe(false);
    expect(
      getPosCounterQuerySchema.parse({
        organizationId,
        posCounterId: branchId,
      }),
    ).toMatchObject({ posCounterId: branchId });

    expect(
      listBranchesQuerySchema.parse({
        cursor,
        organizationId,
        pageSize: 100,
        search: "Main",
        status: "ARCHIVED",
        type: "SHOWROOM",
      }),
    ).toMatchObject({ cursor, status: "ARCHIVED" });
    expect(
      listBranchesQuerySchema.safeParse({
        code: "MAIN",
        organizationId,
      }).success,
    ).toBe(false);
    expect(
      listBranchesQuerySchema.safeParse({
        organizationId,
        pageSize: 101,
      }).success,
    ).toBe(false);
    expect(
      listBranchesQuerySchema.safeParse({
        cursor: "bad",
        organizationId,
      }).success,
    ).toBe(false);

    expect(
      listStockLocationsQuerySchema.parse({
        branchId,
        isSellable: true,
        organizationId,
        search: "floor",
        status: "ACTIVE",
        type: "SHOWROOM",
      }),
    ).toMatchObject({ branchId, isSellable: true });
    expect(
      listPosCountersQuerySchema.parse({
        branchId,
        organizationId,
        status: "INACTIVE",
      }),
    ).toMatchObject({ status: "INACTIVE" });

    const branch = {
      addressLine1: null,
      addressLine2: null,
      city: null,
      code: "MAIN",
      countryCode: "BD",
      createdAt: "2026-07-02T00:00:00.000Z",
      district: null,
      email: null,
      id: branchId,
      name: "Main",
      organizationId,
      phone: null,
      postalCode: null,
      status: "ACTIVE",
      timezone: "Asia/Dhaka",
      type: "SHOWROOM",
      updatedAt: "2026-07-02T00:00:00.000Z",
      version: 1,
    };
    expect(
      branchPageContractSchema.parse({
        hasMore: true,
        items: [branch],
        nextCursor: cursor,
      }),
    ).toMatchObject({ hasMore: true });
    expect(
      stockLocationPageContractSchema.safeParse({
        hasMore: false,
        items: [],
        nextCursor: null,
      }).success,
    ).toBe(true);
    expect(
      posCounterPageContractSchema.safeParse({
        hasMore: false,
        items: [],
        nextCursor: null,
      }).success,
    ).toBe(true);
  });

  it("validates inventory ledger command inputs", () => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const sourceLocationId = "22222222-2222-4222-8222-222222222222";
    const destinationLocationId = "33333333-3333-4333-8333-333333333333";
    const productVariantId = "44444444-4444-4444-8444-444444444444";

    expect(
      createInventoryMovementInputSchema.parse({
        destinationLocationId,
        idempotencyKey: "request-123",
        lines: [{ productVariantId, quantity: 5 }],
        movementNumber: "OPEN-1",
        note: "Opening stock",
        occurredAt: "2026-07-03T00:00:00.000Z",
        organizationId,
        referenceId: "REF-1",
        referenceType: "MANUAL",
        type: "OPENING",
      }),
    ).toMatchObject({ movementNumber: "OPEN-1" });
    expect(
      createInventoryMovementInputSchema.safeParse({
        destinationLocationId,
        id: productVariantId,
        idempotencyKey: "request-123",
        lines: [{ productVariantId, quantity: 5 }],
        movementNumber: "OPEN-1",
        organizationId,
        type: "OPENING",
      }).success,
    ).toBe(false);
    expect(
      createInventoryMovementInputSchema.safeParse({
        destinationLocationId,
        idempotencyKey: "request-123",
        lines: [{ productVariantId, quantity: 0 }],
        movementNumber: "OPEN-1",
        organizationId,
        type: "OPENING",
      }).success,
    ).toBe(false);
    expect(
      createInventoryMovementInputSchema.safeParse({
        destinationLocationId,
        idempotencyKey: "bad key with spaces",
        lines: [{ productVariantId, quantity: 1 }],
        movementNumber: "OPEN-1",
        organizationId,
        type: "OPENING",
      }).success,
    ).toBe(false);

    expect(
      replaceDraftMovementLinesInputSchema.parse({
        lines: [{ productVariantId, quantity: 1 }],
        movementId: productVariantId,
        organizationId,
      }),
    ).toMatchObject({ movementId: productVariantId });
    expect(
      postInventoryMovementInputSchema.parse({
        movementId: productVariantId,
        organizationId,
      }),
    ).toMatchObject({ organizationId });
    expect(
      reverseInventoryMovementInputSchema.parse({
        idempotencyKey: "reverse-123",
        occurredAt: "2026-07-03T01:00:00.000Z",
        organizationId,
        originalMovementId: productVariantId,
        reason: "Incorrect receipt count",
        referenceId: "AUDIT-1",
        referenceType: "AUDIT",
        reversalMovementNumber: "REV-1",
      }),
    ).toMatchObject({ reason: "Incorrect receipt count" });
    expect(
      reverseInventoryMovementInputSchema.safeParse({
        idempotencyKey: "reverse-123",
        lines: [{ productVariantId, quantity: 1 }],
        organizationId,
        originalMovementId: productVariantId,
        reason: "Tampered",
        reversalMovementNumber: "REV-1",
        type: "ISSUE",
      }).success,
    ).toBe(false);
    expect(sourceLocationId).toBeDefined();
  });

  it("validates inventory reservation command inputs", () => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const stockLocationId = "33333333-3333-4333-8333-333333333333";
    const productVariantId = "44444444-4444-4444-8444-444444444444";

    expect(
      createInventoryReservationInputSchema.parse({
        expiresAt: "2999-01-01T00:00:00.000Z",
        idempotencyKey: "reserve-123",
        lines: [{ productVariantId, quantity: 2 }],
        note: "Hold for future workflow",
        organizationId,
        referenceId: "REF-1",
        referenceType: "MANUAL",
        reservationNumber: "RSV-1",
        stockLocationId,
      }),
    ).toMatchObject({ reservationNumber: "RSV-1" });
    expect(
      createInventoryReservationInputSchema.safeParse({
        idempotencyKey: "reserve-123",
        lines: [{ productVariantId, quantity: 2 }],
        organizationId,
        reservationNumber: "RSV-1",
        salesOrderId: productVariantId,
        stockLocationId,
      }).success,
    ).toBe(false);
    expect(
      createInventoryReservationInputSchema.safeParse({
        idempotencyKey: "reserve-123",
        lines: [{ productVariantId, quantity: 0 }],
        organizationId,
        reservationNumber: "RSV-1",
        stockLocationId,
      }).success,
    ).toBe(false);

    for (const schema of [
      confirmInventoryReservationInputSchema,
      releaseInventoryReservationInputSchema,
      expireInventoryReservationInputSchema,
    ]) {
      expect(
        schema.parse({
          expectedVersion: 1,
          organizationId,
          reservationId: productVariantId,
        }),
      ).toMatchObject({ expectedVersion: 1 });
      expect(
        schema.safeParse({
          expectedVersion: 0,
          organizationId,
          reservationId: productVariantId,
        }).success,
      ).toBe(false);
    }

    expect(
      consumeInventoryReservationInputSchema.parse({
        expectedReservationVersion: 1,
        idempotencyKey: "consume-123",
        movementNumber: "ISSUE-RSV-1",
        occurredAt: "2999-01-01T00:00:00.000Z",
        organizationId,
        referenceId: "REF-1",
        referenceType: "MANUAL",
        reservationId: productVariantId,
      }),
    ).toMatchObject({
      expectedReservationVersion: 1,
      movementNumber: "ISSUE-RSV-1",
    });
    expect(
      consumeInventoryReservationInputSchema.safeParse({
        destinationLocationId: null,
        expectedReservationVersion: 1,
        idempotencyKey: "consume-123",
        lines: [{ productVariantId, quantity: 2 }],
        movementNumber: "ISSUE-RSV-1",
        occurredAt: "2999-01-01T00:00:00.000Z",
        organizationId,
        reservationId: productVariantId,
        sourceLocationId: stockLocationId,
        type: "ISSUE",
      }).success,
    ).toBe(false);
  });

  it("validates inventory read query inputs and paginated outputs", () => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const movementId = "22222222-2222-4222-8222-222222222222";
    const locationId = "33333333-3333-4333-8333-333333333333";
    const productVariantId = "44444444-4444-4444-8444-444444444444";
    const movementCursor =
      "movement-v1|2026-07-03T00%3A00%3A00.000Z|22222222-2222-4222-8222-222222222222";
    const balanceCursor = "balance-v1|44444444-4444-4444-8444-444444444444";

    expect(
      getInventoryMovementQuerySchema.parse({ movementId, organizationId }),
    ).toMatchObject({ movementId });
    expect(
      listInventoryMovementsQuerySchema.parse({
        cursor: movementCursor,
        destinationLocationId: locationId,
        occurredFrom: "2026-07-03T00:00:00.000Z",
        organizationId,
        pageSize: 100,
        status: "POSTED",
        type: "TRANSFER",
      }),
    ).toMatchObject({ status: "POSTED" });
    expect(
      listInventoryMovementsQuerySchema.safeParse({
        cursor: "v1|wrong|22222222-2222-4222-8222-222222222222",
        organizationId,
      }).success,
    ).toBe(false);

    expect(
      getOnHandBalanceQuerySchema.parse({
        organizationId,
        productVariantId,
        stockLocationId: locationId,
      }),
    ).toMatchObject({ productVariantId });
    expect(
      listLocationBalancesQuerySchema.parse({
        cursor: balanceCursor,
        locationId,
        onlyPositive: true,
        organizationId,
        productVariantId,
      }),
    ).toMatchObject({ onlyPositive: true });

    expect(
      inventoryMovementPageContractSchema.parse({
        hasMore: true,
        items: [
          {
            consumesReservationId: null,
            createdAt: "2026-07-03T00:00:00.000Z",
            destinationLocationId: locationId,
            id: movementId,
            idempotencyKey: "request-123",
            isReservationConsumption: false,
            isReversal: false,
            isReversed: true,
            lines: [
              {
                createdAt: "2026-07-03T00:00:00.000Z",
                id: productVariantId,
                lineNumber: 1,
                movementId,
                note: null,
                organizationId,
                productVariantId,
                quantity: 5,
              },
            ],
            movementNumber: "OPEN-1",
            note: null,
            occurredAt: "2026-07-03T00:00:00.000Z",
            organizationId,
            postedAt: "2026-07-03T00:01:00.000Z",
            referenceId: null,
            referenceType: null,
            reversedByMovementId: productVariantId,
            reversalReason: null,
            reversesMovementId: null,
            sourceLocationId: null,
            status: "POSTED",
            type: "OPENING",
            updatedAt: "2026-07-03T00:01:00.000Z",
            version: 2,
          },
        ],
        nextCursor: movementCursor,
      }),
    ).toMatchObject({ hasMore: true });
  });

  it("validates inventory reservation and availability read contracts", () => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const reservationId = "22222222-2222-4222-8222-222222222222";
    const locationId = "33333333-3333-4333-8333-333333333333";
    const productVariantId = "44444444-4444-4444-8444-444444444444";
    const reservationCursor =
      "reservation-v1|2026-07-03T00%3A00%3A00.000Z|22222222-2222-4222-8222-222222222222";
    const availabilityCursor =
      "availability-v1|44444444-4444-4444-8444-444444444444";

    expect(
      getInventoryReservationQuerySchema.parse({
        organizationId,
        reservationId,
      }),
    ).toMatchObject({ reservationId });
    expect(
      listInventoryReservationsQuerySchema.parse({
        cursor: reservationCursor,
        expiresBefore: "2999-01-01T00:00:00.000Z",
        organizationId,
        pageSize: 100,
        productVariantId,
        referenceId: "REF-1",
        referenceType: "MANUAL",
        status: "ACTIVE",
        stockLocationId: locationId,
      }),
    ).toMatchObject({ status: "ACTIVE" });
    expect(
      listInventoryReservationsQuerySchema.safeParse({
        cursor: "bad",
        organizationId,
      }).success,
    ).toBe(false);
    expect(
      getAvailableToSellQuerySchema.parse({
        organizationId,
        productVariantId,
        stockLocationId: locationId,
      }),
    ).toMatchObject({ productVariantId });
    expect(
      listLocationAvailabilityQuerySchema.parse({
        cursor: availabilityCursor,
        onlyAvailable: true,
        organizationId,
        stockLocationId: locationId,
      }),
    ).toMatchObject({ onlyAvailable: true });

    expect(
      inventoryReservationPageContractSchema.parse({
        hasMore: true,
        items: [
          {
            confirmedAt: null,
            consumedByMovementId: null,
            createdAt: "2026-07-03T00:00:00.000Z",
            expiredAt: null,
            expiresAt: "2999-01-01T00:00:00.000Z",
            id: reservationId,
            idempotencyKey: "reserve-123",
            isConsumed: false,
            lines: [
              {
                createdAt: "2026-07-03T00:00:00.000Z",
                id: productVariantId,
                lineNumber: 1,
                organizationId,
                productVariantId,
                quantity: 2,
                reservationId,
              },
            ],
            note: null,
            organizationId,
            referenceId: null,
            referenceType: null,
            releasedAt: null,
            reservationNumber: "RSV-1",
            status: "ACTIVE",
            stockLocationId: locationId,
            updatedAt: "2026-07-03T00:00:00.000Z",
            version: 1,
          },
        ],
        nextCursor: reservationCursor,
      }),
    ).toMatchObject({ hasMore: true });
    expect(
      locationAvailabilityPageContractSchema.parse({
        hasMore: true,
        items: [
          {
            availableQuantity: 8,
            onHandQuantity: 10,
            organizationId,
            productVariantId,
            reservedQuantity: 2,
            stockLocationId: locationId,
          },
        ],
        nextCursor: availabilityCursor,
      }),
    ).toMatchObject({ hasMore: true });
  });
});
