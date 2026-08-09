import { describe, expect, it } from "vitest";
import {
  apiErrorCodeSchema,
  amendDraftSalesOrderInputSchema,
  amendDraftSalesOrderServiceInputSchema,
  allocateAndCreateInventoryReservationInputSchema,
  allocateInventoryReservationResultContractSchema,
  branchContractSchema,
  branchPageContractSchema,
  cancelSalesOrderInputSchema,
  cancelSalesOrderServiceInputSchema,
  confirmSalesOrderInputSchema,
  confirmSalesOrderServiceInputSchema,
  changeInventoryAllocationPolicyStatusInputSchema,
  changeBranchStatusInputSchema,
  changePosCounterStatusInputSchema,
  changeStockLocationStatusInputSchema,
  checkoutPosCartServiceInputSchema,
  createBranchInputSchema,
  createCredentialInputSchema,
  createInventoryAllocationPolicyInputSchema,
  createInventoryMovementInputSchema,
  createColorInputSchema,
  createColorServiceInputSchema,
  createPosCounterInputSchema,
  createProductVariantInputSchema,
  createInventoryReservationInputSchema,
  createSalesOrderInputSchema,
  createSalesOrderServiceInputSchema,
  createStockLocationInputSchema,
  createOrganizationMembershipInputSchema,
  createUserInputSchema,
  disableCredentialInputSchema,
  recordAuditEntryInputSchema,
  fulfillSalesOrderInputSchema,
  getPosCartServiceInputSchema,
  fulfillSalesOrderServiceInputSchema,
  getInventoryAllocationPolicyQuerySchema,
  getBranchQuerySchema,
  getInventoryMovementQuerySchema,
  getOnHandBalanceQuerySchema,
  getAvailableToSellQuerySchema,
  getPosCounterQuerySchema,
  getInventoryReservationQuerySchema,
  getSalesOrderQuerySchema,
  getSalesOrderServiceInputSchema,
  getStockLocationQuerySchema,
  inventoryAllocationPolicyPageContractSchema,
  inventoryAllocationPreviewContractSchema,
  inventoryReservationPageContractSchema,
  locationAvailabilityPageContractSchema,
  inventoryMovementPageContractSchema,
  inventoryAvailabilityPageContractSchema,
  inventoryMovementHistoryPageContractSchema,
  inventoryStockLocationPageContractSchema,
  listInventoryAllocationPoliciesQuerySchema,
  listInventoryMovementsQuerySchema,
  listInventoryAvailabilityServiceInputSchema,
  listInventoryMovementsServiceInputSchema,
  listStockLocationsServiceInputSchema,
  listBranchesQuerySchema,
  listLocationBalancesQuerySchema,
  listLocationAvailabilityQuerySchema,
  listInventoryReservationsQuerySchema,
  listSalesOrdersQuerySchema,
  listSalesOrdersServiceInputSchema,
  listPosCountersQuerySchema,
  listStockLocationsQuerySchema,
  posCounterPageContractSchema,
  postInventoryMovementInputSchema,
  previewInventoryAllocationInputSchema,
  confirmInventoryReservationInputSchema,
  consumeInventoryReservationInputSchema,
  expireInventoryReservationInputSchema,
  replaceDraftMovementLinesInputSchema,
  replaceDraftSalesOrderLinesInputSchema,
  replaceDraftSalesOrderLinesServiceInputSchema,
  replaceInventoryAllocationPolicyLocationsInputSchema,
  reserveSalesOrderInputSchema,
  reserveSalesOrderServiceInputSchema,
  releaseInventoryReservationInputSchema,
  reverseInventoryMovementInputSchema,
  salesOrderContractSchema,
  salesOrderPageContractSchema,
  salesOrderServiceContractSchema,
  salesOrderServicePageContractSchema,
  createApiFailure,
  createApiSuccess,
  paginationMetaSchema,
  stockLocationPageContractSchema,
  storefrontCatalogQuerySchema,
  storefrontCheckoutInputSchema,
  storefrontProductQuerySchema,
  variantInventoryAvailabilityContractSchema,
  assignOrganizationMembershipRoleInputSchema,
  assignRolePermissionInputSchema,
  createPermissionInputSchema,
  updateOrganizationMembershipStatusInputSchema,
  updateDraftSalesOrderMetadataInputSchema,
  updateDraftSalesOrderMetadataServiceInputSchema,
  updateInventoryAllocationPolicyMetadataInputSchema,
  updateBranchMetadataInputSchema,
  updatePosCounterMetadataInputSchema,
  updateStockLocationMetadataInputSchema,
} from "./index.js";

describe("API contracts", () => {
  it("accepts safe storefront discovery filters and valid product slugs", () => {
    expect(
      storefrontCatalogQuerySchema.parse({
        category: "everyday",
        color: "BLACK",
        page: "2",
        pageSize: "48",
        search: "tee",
        size: "M",
      }),
    ).toMatchObject({ page: 2, pageSize: 48 });
    expect(
      storefrontProductQuerySchema.safeParse({ slug: "everyday-tee" }).success,
    ).toBe(true);
    expect(
      storefrontCatalogQuerySchema.safeParse({ organizationId: "untrusted" })
        .success,
    ).toBe(false);
  });

  it("bounds guest checkout and rejects browser-controlled order facts", () => {
    const valid = {
      customer: { name: "Guest Buyer", phone: "01712345678" },
      deliveryAddress: {
        city: "Dhaka",
        district: "Dhaka",
        line1: "House 10, Road 2",
      },
      idempotencyKey: "web:checkout-contract-001",
      lines: [
        {
          productVariantId: "10000000-0000-4000-8000-000000000001",
          quantity: 1,
        },
      ],
      paymentPreference: "CASH_ON_DELIVERY",
    };
    expect(storefrontCheckoutInputSchema.safeParse(valid).success).toBe(true);
    expect(
      storefrontCheckoutInputSchema.safeParse({
        ...valid,
        lines: [],
      }).success,
    ).toBe(false);
    expect(
      storefrontCheckoutInputSchema.safeParse({
        ...valid,
        lines: [{ ...valid.lines[0], quantity: 21 }],
      }).success,
    ).toBe(false);
    expect(
      storefrontCheckoutInputSchema.safeParse({
        ...valid,
        organizationId: "10000000-0000-4000-8000-000000000002",
        totalMinor: 1,
      }).success,
    ).toBe(false);
  });

  it("accepts only a cart ID for POS cart reads", () => {
    const cartId = "10000000-0000-4000-8000-000000000001";
    expect(getPosCartServiceInputSchema.safeParse({ cartId }).success).toBe(
      true,
    );
    expect(
      getPosCartServiceInputSchema.safeParse({ cartId, organizationId: cartId })
        .success,
    ).toBe(false);
  });
  it("accepts only operator-controlled checkout payment fields", () => {
    const valid = {
      allowOutstanding: false,
      cartId: "10000000-0000-4000-8000-000000000001",
      idempotencyKey: "checkout-contract-001",
      payments: [
        { amountMinor: 1200, method: "CASH" },
        { amountMinor: 1300, method: "CARD", reference: "CARD-123" },
      ],
    };
    expect(checkoutPosCartServiceInputSchema.safeParse(valid).success).toBe(
      true,
    );
    expect(
      checkoutPosCartServiceInputSchema.safeParse({
        ...valid,
        organizationId: "10000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(false);
    expect(
      checkoutPosCartServiceInputSchema.safeParse({
        ...valid,
        payments: [{ amountMinor: 2500, method: "CARD" }],
      }).success,
    ).toBe(false);
    expect(
      checkoutPosCartServiceInputSchema.safeParse({
        ...valid,
        payments: [{ amountMinor: 0, method: "CASH" }],
      }).success,
    ).toBe(false);
    expect(
      checkoutPosCartServiceInputSchema.safeParse({ ...valid, payments: [] })
        .success,
    ).toBe(false);
    expect(
      checkoutPosCartServiceInputSchema.safeParse({
        ...valid,
        allowOutstanding: true,
        payments: [],
      }).success,
    ).toBe(true);
  });
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

  it("requires a valid color hex value at the client service boundary", () => {
    expect(
      createColorServiceInputSchema.safeParse({
        code: "BLACK",
        hexValue: "#000000",
        name: "Black",
      }).success,
    ).toBe(true);
    expect(
      createColorServiceInputSchema.safeParse({
        code: "BLACK",
        name: "Black",
      }).success,
    ).toBe(false);
    expect(
      createColorServiceInputSchema.safeParse({
        code: "BLACK",
        hexValue: null,
        name: "Black",
      }).success,
    ).toBe(false);
  });

  it("keeps inventory read inputs strict and response projections public", () => {
    expect(
      listInventoryAvailabilityServiceInputSchema.parse({
        locationId: "11111111-1111-4111-8111-111111111111",
        pageSize: "25",
        search: "SKU",
      }),
    ).toMatchObject({ pageSize: 25, search: "SKU" });
    expect(
      listInventoryAvailabilityServiceInputSchema.safeParse({
        organizationId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
    expect(
      listStockLocationsServiceInputSchema.safeParse({ internal: true })
        .success,
    ).toBe(false);
    expect(
      listInventoryMovementsServiceInputSchema.safeParse({
        pageSize: 0,
      }).success,
    ).toBe(false);

    const availability = {
      availableToSell: 15,
      location: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Main Warehouse",
      },
      onHand: 20,
      reserved: 5,
      variant: {
        color: "Black",
        id: "33333333-3333-4333-8333-333333333333",
        productId: "44444444-4444-4444-8444-444444444444",
        productName: "Classic Tee",
        size: "M",
        sku: "TEE-BLK-M",
      },
    };
    expect(
      inventoryAvailabilityPageContractSchema.parse({
        hasMore: false,
        items: [availability],
        nextCursor: null,
      }).items,
    ).toHaveLength(1);
    expect(
      inventoryStockLocationPageContractSchema.safeParse({
        hasMore: false,
        items: [],
        nextCursor: null,
      }).success,
    ).toBe(true);
    expect(
      inventoryMovementHistoryPageContractSchema.safeParse({
        hasMore: false,
        items: [],
        nextCursor: null,
      }).success,
    ).toBe(true);
    expect(
      variantInventoryAvailabilityContractSchema.parse({
        locations: [
          {
            availableToSell: availability.availableToSell,
            location: availability.location,
            onHand: availability.onHand,
            reserved: availability.reserved,
          },
        ],
        variant: availability.variant,
      }).locations,
    ).toHaveLength(1);
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

  it("validates identity command inputs without password or auth transport fields", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const organizationId = "22222222-2222-4222-8222-222222222222";
    const membershipId = "33333333-3333-4333-8333-333333333333";

    expect(
      createUserInputSchema.parse({
        email: "Owner@Senvo.Test",
        name: "Owner User",
        status: "ACTIVE",
      }),
    ).toMatchObject({ email: "Owner@Senvo.Test" });
    expect(
      createUserInputSchema.safeParse({
        email: "owner@senvo.test",
        password: "not-in-scope",
      }).success,
    ).toBe(false);
    expect(
      createOrganizationMembershipInputSchema.parse({
        organizationId,
        role: "OWNER",
        userId,
      }),
    ).toMatchObject({ role: "OWNER" });
    expect(
      createOrganizationMembershipInputSchema.safeParse({
        organizationId,
        role: "SUPERUSER",
        userId,
      }).success,
    ).toBe(false);
    expect(
      updateOrganizationMembershipStatusInputSchema.parse({
        expectedVersion: 1,
        membershipId,
        organizationId,
        status: "INACTIVE",
      }),
    ).toMatchObject({ status: "INACTIVE" });
    expect(
      assignOrganizationMembershipRoleInputSchema.parse({
        expectedVersion: 2,
        membershipId,
        organizationId,
        role: "MANAGER",
      }),
    ).toMatchObject({ role: "MANAGER" });
    expect(
      assignOrganizationMembershipRoleInputSchema.safeParse({
        expectedVersion: 0,
        membershipId,
        organizationId,
        role: "ADMIN",
      }).success,
    ).toBe(false);
  });

  it("validates authorization command inputs without auth transport fields", () => {
    const permissionId = "11111111-1111-4111-8111-111111111111";

    expect(
      createPermissionInputSchema.parse({
        action: "CREATE",
        description: "Create sales orders",
        resource: "SALES_ORDER",
      }),
    ).toMatchObject({ action: "CREATE", resource: "SALES_ORDER" });
    expect(
      createPermissionInputSchema.safeParse({
        action: "CREATE",
        resource: "SALES_ORDER",
        token: "not-in-scope",
      }).success,
    ).toBe(false);
    expect(
      createPermissionInputSchema.safeParse({
        action: "EXPORT",
        resource: "REPORT",
      }).success,
    ).toBe(false);
    expect(
      assignRolePermissionInputSchema.parse({
        permissionId,
        role: "ADMIN",
      }),
    ).toMatchObject({ role: "ADMIN" });
    expect(
      assignRolePermissionInputSchema.safeParse({
        permissionId,
        role: "SUPERUSER",
      }).success,
    ).toBe(false);
  });

  it("validates authentication credential commands without plaintext passwords", () => {
    expect(
      createCredentialInputSchema.parse({
        identifier: "owner@senvo.test",
        passwordHash: "hashed_password_value_1234567890",
        provider: "PASSWORD",
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toMatchObject({
      identifier: "owner@senvo.test",
      provider: "PASSWORD",
    });
    expect(
      createCredentialInputSchema.safeParse({
        identifier: "owner@senvo.test",
        password: "never-store-plaintext",
        provider: "PASSWORD",
        userId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
    expect(
      disableCredentialInputSchema.parse({
        credentialId: "22222222-2222-4222-8222-222222222222",
        expectedVersion: 1,
      }),
    ).toMatchObject({ expectedVersion: 1 });
  });

  it("validates strict audit records and rejects sensitive metadata", () => {
    const record = {
      action: "SALES_ORDER_CREATED",
      metadata: { requestId: "req_audit_contract_1" },
      organizationId: "11111111-1111-4111-8111-111111111111",
      resource: "SALES_ORDER",
      resourceId: "22222222-2222-4222-8222-222222222222",
      userId: null,
    };

    expect(recordAuditEntryInputSchema.parse(record)).toEqual(record);
    expect(
      recordAuditEntryInputSchema.safeParse({
        ...record,
        metadata: { nested: { credentialToken: "never-record" } },
      }).success,
    ).toBe(false);
    expect(
      recordAuditEntryInputSchema.safeParse({ ...record, password: "no" })
        .success,
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

  it("validates inventory allocation policy commands and strict boundaries", () => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const policyId = "22222222-2222-4222-8222-222222222222";
    const stockLocationId = "33333333-3333-4333-8333-333333333333";
    const productVariantId = "44444444-4444-4444-8444-444444444444";

    expect(
      createInventoryAllocationPolicyInputSchema.parse({
        code: "WEB-FIRST",
        name: "Web First",
        organizationId,
        requireSellableLocation: true,
      }),
    ).toMatchObject({ code: "WEB-FIRST" });
    expect(
      createInventoryAllocationPolicyInputSchema.safeParse({
        code: "WEB-FIRST",
        name: "Web First",
        organizationId,
        strategy: "PRIORITY_ORDER",
      }).success,
    ).toBe(false);
    expect(
      updateInventoryAllocationPolicyMetadataInputSchema.safeParse({
        code: "NEW-CODE",
        expectedVersion: 1,
        name: "Updated",
        organizationId,
        policyId,
      }).success,
    ).toBe(false);
    expect(
      replaceInventoryAllocationPolicyLocationsInputSchema.parse({
        expectedVersion: 1,
        locations: [
          { priority: 1, stockLocationId },
          {
            isEnabled: false,
            priority: 2,
            stockLocationId: "55555555-5555-4555-8555-555555555555",
          },
        ],
        organizationId,
        policyId,
      }),
    ).toMatchObject({ expectedVersion: 1 });
    expect(
      replaceInventoryAllocationPolicyLocationsInputSchema.safeParse({
        expectedVersion: 1,
        locations: [
          { priority: 1, stockLocationId },
          {
            priority: 1,
            stockLocationId: "55555555-5555-4555-8555-555555555555",
          },
        ],
        organizationId,
        policyId,
      }).success,
    ).toBe(false);
    expect(
      changeInventoryAllocationPolicyStatusInputSchema.parse({
        expectedVersion: 2,
        organizationId,
        policyId,
        status: "INACTIVE",
      }),
    ).toMatchObject({ status: "INACTIVE" });

    const allocationLines = [{ productVariantId, quantity: 2 }];
    expect(
      previewInventoryAllocationInputSchema.parse({
        lines: allocationLines,
        organizationId,
        policyId,
        preferredLocationId: stockLocationId,
      }),
    ).toMatchObject({ preferredLocationId: stockLocationId });
    expect(
      previewInventoryAllocationInputSchema.safeParse({
        lines: [
          { productVariantId, quantity: 1 },
          { productVariantId, quantity: 1 },
        ],
        organizationId,
        policyId,
      }).success,
    ).toBe(false);
    expect(
      allocateAndCreateInventoryReservationInputSchema.safeParse({
        idempotencyKey: "allocate-123",
        lines: allocationLines,
        organizationId,
        policyId,
        reservationNumber: "ALLOC-1",
        selectedStockLocationId: stockLocationId,
      }).success,
    ).toBe(false);
    expect(
      allocateAndCreateInventoryReservationInputSchema.parse({
        expiresAt: "2999-01-01T00:00:00.000Z",
        idempotencyKey: "allocate-123",
        lines: allocationLines,
        note: "Hold for checkout",
        organizationId,
        policyId,
        preferredBranchId: null,
        preferredLocationId: stockLocationId,
        referenceId: "CART-1",
        referenceType: "CHECKOUT",
        reservationNumber: "ALLOC-1",
      }),
    ).toMatchObject({ reservationNumber: "ALLOC-1" });

    expect(
      getInventoryAllocationPolicyQuerySchema.parse({
        organizationId,
        policyId,
      }),
    ).toMatchObject({ policyId });
    expect(
      listInventoryAllocationPoliciesQuerySchema.safeParse({
        cursor: "bad",
        organizationId,
      }).success,
    ).toBe(false);
  });

  it("validates inventory allocation result contracts without client ATS inputs", () => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const policyId = "22222222-2222-4222-8222-222222222222";
    const stockLocationId = "33333333-3333-4333-8333-333333333333";
    const branchId = "55555555-5555-4555-8555-555555555555";
    const productVariantId = "44444444-4444-4444-8444-444444444444";
    const reservationId = "66666666-6666-4666-8666-666666666666";
    const timestamp = "2026-07-03T00:00:00.000Z";

    const preview = {
      canFulfill: true,
      evaluatedAt: timestamp,
      failureReason: null,
      lines: [{ productVariantId, quantity: 2 }],
      policyId,
      selectedBranchId: branchId,
      selectedLines: [
        {
          availableQuantity: 8,
          onHandQuantity: 10,
          productVariantId,
          quantity: 2,
          reservedQuantity: 2,
        },
      ],
      selectedStockLocationId: stockLocationId,
    };

    expect(
      inventoryAllocationPreviewContractSchema.parse(preview),
    ).toMatchObject({ canFulfill: true });
    expect(
      inventoryAllocationPolicyPageContractSchema.parse({
        hasMore: false,
        items: [
          {
            code: "WEB-FIRST",
            createdAt: timestamp,
            id: policyId,
            locations: [
              {
                createdAt: timestamp,
                id: reservationId,
                isEnabled: true,
                organizationId,
                policyId,
                priority: 1,
                stockLocationId,
                updatedAt: timestamp,
              },
            ],
            name: "Web First",
            organizationId,
            requireSellableLocation: true,
            status: "ACTIVE",
            strategy: "PRIORITY_ORDER",
            updatedAt: timestamp,
            version: 1,
          },
        ],
        nextCursor: null,
      }),
    ).toMatchObject({ hasMore: false });
    expect(
      allocateInventoryReservationResultContractSchema.safeParse({
        reservation: {
          confirmedAt: null,
          consumedByMovementId: null,
          createdAt: timestamp,
          expiredAt: null,
          expiresAt: null,
          id: reservationId,
          idempotencyKey: "allocate-123",
          isConsumed: false,
          lines: [
            {
              createdAt: timestamp,
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
          reservationNumber: "ALLOC-1",
          status: "ACTIVE",
          stockLocationId,
          updatedAt: timestamp,
          version: 1,
        },
        selectedBranchId: branchId,
        selectedStockLocationId: stockLocationId,
      }).success,
    ).toBe(true);
    expect(
      inventoryAllocationPreviewContractSchema.safeParse({
        ...preview,
        clientSuppliedAts: 999,
      }).success,
    ).toBe(false);
  });

  it("validates sales order core contracts without client totals or inventory lines", () => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const salesOrderId = "22222222-2222-4222-8222-222222222222";
    const productVariantId = "33333333-3333-4333-8333-333333333333";
    const allocationPolicyId = "44444444-4444-4444-8444-444444444444";
    const reservationId = "55555555-5555-4555-8555-555555555555";
    const movementId = "66666666-6666-4666-8666-666666666666";
    const timestamp = "2026-07-03T00:00:00.000Z";

    expect(
      createSalesOrderInputSchema.parse({
        allocationPolicyId,
        channel: "ONLINE",
        currencyCode: "BDT",
        customerPhone: "+8801711111111",
        deliveryMinor: 100,
        idempotencyKey: "order-123",
        lines: [
          {
            discountMinor: 100,
            productVariantId,
            quantity: 2,
            unitPriceMinor: 1000,
          },
        ],
        orderDiscountMinor: 50,
        orderNumber: "SO-1",
        organizationId,
      }),
    ).toMatchObject({ currencyCode: "BDT" });
    expect(
      createSalesOrderServiceInputSchema.safeParse({
        allocationPolicyId,
        channel: "ONLINE",
        currencyCode: "BDT",
        idempotencyKey: "order-123",
        lines: [{ productVariantId, quantity: 1, unitPriceMinor: 1000 }],
        orderNumber: "SO-1",
        organizationId,
      }).success,
    ).toBe(false);
    expect(
      createSalesOrderServiceInputSchema.parse({
        allocationPolicyId,
        channel: "ONLINE",
        currencyCode: "BDT",
        idempotencyKey: "order-123",
        lines: [{ productVariantId, quantity: 1, unitPriceMinor: 1000 }],
        orderNumber: "SO-1",
      }),
    ).toMatchObject({ orderNumber: "SO-1" });
    expect(
      createSalesOrderInputSchema.safeParse({
        channel: "ONLINE",
        currencyCode: "BDT",
        idempotencyKey: "order-123",
        lines: [
          { productVariantId, quantity: 1, unitPriceMinor: 1000 },
          { productVariantId, quantity: 1, unitPriceMinor: 1000 },
        ],
        orderNumber: "SO-1",
        organizationId,
      }).success,
    ).toBe(false);
    expect(
      createSalesOrderInputSchema.safeParse({
        channel: "ONLINE",
        currencyCode: "BDT",
        idempotencyKey: "order-123",
        lines: [{ productVariantId, quantity: 1, unitPriceMinor: 1000 }],
        orderNumber: "SO-1",
        organizationId,
        totalMinor: 1000,
      }).success,
    ).toBe(false);
    expect(
      updateDraftSalesOrderMetadataInputSchema.parse({
        allocationPolicyId: null,
        customerName: null,
        deliveryMinor: 150,
        expectedVersion: 1,
        note: "Call before delivery",
        orderDiscountMinor: 25,
        organizationId,
        salesOrderId,
      }),
    ).toMatchObject({
      allocationPolicyId: null,
      expectedVersion: 1,
      orderDiscountMinor: 25,
    });
    expect(
      updateDraftSalesOrderMetadataInputSchema.safeParse({
        channel: "POS",
        expectedVersion: 1,
        organizationId,
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      updateDraftSalesOrderMetadataServiceInputSchema.safeParse({
        expectedVersion: 1,
        organizationId,
        salesOrderId,
        totalMinor: 1,
      }).success,
    ).toBe(false);
    expect(
      updateDraftSalesOrderMetadataServiceInputSchema.parse({
        expectedVersion: 1,
        note: "Call before delivery",
        salesOrderId,
      }),
    ).toMatchObject({ note: "Call before delivery" });
    expect(
      updateDraftSalesOrderMetadataInputSchema.safeParse({
        expectedVersion: 1,
        organizationId,
        salesOrderId,
        status: "CONFIRMED",
      }).success,
    ).toBe(false);
    expect(
      updateDraftSalesOrderMetadataInputSchema.safeParse({
        expectedVersion: 1,
        organizationId,
        salesOrderId,
        totalMinor: 1,
      }).success,
    ).toBe(false);
    expect(
      replaceDraftSalesOrderLinesInputSchema.parse({
        expectedVersion: 1,
        lines: [
          {
            discountMinor: 100,
            productVariantId,
            quantity: 2,
            unitPriceMinor: 1000,
          },
        ],
        organizationId,
        salesOrderId,
      }),
    ).toMatchObject({ expectedVersion: 1 });
    expect(
      replaceDraftSalesOrderLinesInputSchema.safeParse({
        expectedVersion: 1,
        lines: [
          { productVariantId, quantity: 1, unitPriceMinor: 1000 },
          { productVariantId, quantity: 1, unitPriceMinor: 1000 },
        ],
        organizationId,
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      replaceDraftSalesOrderLinesServiceInputSchema.safeParse({
        expectedVersion: 1,
        lines: [{ productVariantId, quantity: 1, unitPriceMinor: 1000 }],
        organizationId,
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      replaceDraftSalesOrderLinesInputSchema.safeParse({
        expectedVersion: 1,
        lines: [
          {
            lineTotalMinor: 1000,
            productNameSnapshot: "Tampered",
            productVariantId,
            quantity: 1,
            unitPriceMinor: 1000,
          },
        ],
        organizationId,
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      amendDraftSalesOrderInputSchema.parse({
        expectedVersion: 1,
        lines: [{ productVariantId, quantity: 1, unitPriceMinor: 1000 }],
        metadata: { allocationPolicyId, deliveryMinor: 100 },
        organizationId,
        salesOrderId,
      }),
    ).toMatchObject({ expectedVersion: 1 });
    expect(
      amendDraftSalesOrderInputSchema.safeParse({
        expectedVersion: 1,
        organizationId,
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      amendDraftSalesOrderInputSchema.safeParse({
        expectedVersion: 1,
        fulfillmentMovementId: movementId,
        metadata: { note: "Tampered" },
        organizationId,
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      amendDraftSalesOrderServiceInputSchema.safeParse({
        expectedVersion: 1,
        metadata: { note: "Tampered", totalMinor: 1 },
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      amendDraftSalesOrderServiceInputSchema.safeParse({
        expectedVersion: 1,
        lines: [
          {
            productNameSnapshot: "Tampered",
            productVariantId,
            quantity: 1,
            unitPriceMinor: 1000,
          },
        ],
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      reserveSalesOrderInputSchema.safeParse({
        expectedVersion: 1,
        lines: [{ productVariantId, quantity: 1 }],
        organizationId,
        reservationIdempotencyKey: "reserve-123",
        reservationNumber: "RSV-SO-1",
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      reserveSalesOrderServiceInputSchema.safeParse({
        expectedVersion: 1,
        organizationId,
        reservationIdempotencyKey: "reserve-123",
        reservationNumber: "RSV-SO-1",
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      fulfillSalesOrderInputSchema.safeParse({
        consumptionIdempotencyKey: "consume-123",
        expectedVersion: 3,
        movementNumber: "MOVE-SO-1",
        occurredAt: timestamp,
        organizationId,
        salesOrderId,
        movementLines: [{ productVariantId, quantity: 1 }],
      }).success,
    ).toBe(false);
    expect(
      fulfillSalesOrderServiceInputSchema.safeParse({
        consumptionIdempotencyKey: "consume-123",
        expectedVersion: 3,
        movementLines: [{ productVariantId, quantity: 1 }],
        movementNumber: "MOVE-SO-1",
        occurredAt: timestamp,
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      confirmSalesOrderInputSchema.parse({
        expectedVersion: 2,
        organizationId,
        salesOrderId,
      }),
    ).toMatchObject({ expectedVersion: 2 });
    expect(
      confirmSalesOrderServiceInputSchema.safeParse({
        expectedVersion: 2,
        organizationId,
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      cancelSalesOrderInputSchema.parse({
        expectedVersion: 2,
        organizationId,
        salesOrderId,
      }),
    ).toMatchObject({ salesOrderId });
    expect(
      cancelSalesOrderServiceInputSchema.safeParse({
        expectedVersion: 2,
        organizationId,
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      getSalesOrderQuerySchema.parse({ organizationId, salesOrderId }),
    ).toMatchObject({ organizationId });
    expect(
      getSalesOrderServiceInputSchema.safeParse({
        organizationId,
        salesOrderId,
      }).success,
    ).toBe(false);
    expect(
      listSalesOrdersQuerySchema.parse({
        channel: "ONLINE",
        organizationId,
        pageSize: 25,
        status: "RESERVED",
      }),
    ).toMatchObject({ status: "RESERVED" });
    expect(
      listSalesOrdersServiceInputSchema.safeParse({
        organizationId,
        pageSize: 25,
      }).success,
    ).toBe(false);

    const order = {
      allocationPolicyId,
      boothId: null,
      cancelledAt: null,
      channel: "ONLINE",
      confirmedAt: null,
      createdAt: timestamp,
      currencyCode: "BDT",
      customerEmail: null,
      customerName: "A Buyer",
      customerPhone: "+8801711111111",
      deliveryAddressLine1: null,
      deliveryAddressLine2: null,
      deliveryCity: null,
      deliveryDistrict: null,
      deliveryMinor: 100,
      deliveryPostalCode: null,
      discountMinor: 50,
      fulfilledAt: null,
      fulfillmentMovementId: null,
      id: salesOrderId,
      idempotencyKey: "order-123",
      inventoryReservationId: reservationId,
      lines: [
        {
          colorSnapshot: "Black",
          createdAt: timestamp,
          discountMinor: 100,
          id: reservationId,
          lineNumber: 1,
          lineTotalMinor: 1900,
          organizationId,
          productNameSnapshot: "Oxford Shirt",
          productVariantId,
          quantity: 2,
          salesOrderId,
          sizeSnapshot: "L",
          skuSnapshot: "OX-BLK-L",
          unitPriceMinor: 1000,
        },
      ],
      note: null,
      orderNumber: "SO-1",
      organizationId,
      payloadSignature: "{}",
      reservedAt: timestamp,
      status: "RESERVED",
      subtotalMinor: 1900,
      totalMinor: 1950,
      updatedAt: timestamp,
      version: 2,
    };
    expect(salesOrderContractSchema.parse(order)).toMatchObject({
      inventoryReservationId: reservationId,
    });
    expect(salesOrderServiceContractSchema.safeParse(order).success).toBe(
      false,
    );
    const serviceOrder = { ...order };
    delete (serviceOrder as Partial<typeof order>).idempotencyKey;
    delete (serviceOrder as Partial<typeof order>).payloadSignature;
    expect(salesOrderServiceContractSchema.parse(serviceOrder)).toMatchObject({
      id: salesOrderId,
    });
    expect(
      salesOrderPageContractSchema.parse({
        hasMore: false,
        items: [
          {
            ...order,
            fulfillmentMovementId: movementId,
          },
        ],
        nextCursor: null,
      }),
    ).toMatchObject({ hasMore: false });
    expect(
      salesOrderServicePageContractSchema.parse({
        hasMore: false,
        items: [serviceOrder],
        nextCursor: null,
      }),
    ).toMatchObject({
      items: [
        expect.not.objectContaining({
          idempotencyKey: "order-123",
          payloadSignature: "{}",
        }),
      ],
    });
  });
});
