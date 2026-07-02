import { describe, expect, it } from "vitest";
import {
  apiErrorCodeSchema,
  branchContractSchema,
  branchPageContractSchema,
  changeBranchStatusInputSchema,
  changePosCounterStatusInputSchema,
  changeStockLocationStatusInputSchema,
  createBranchInputSchema,
  createColorInputSchema,
  createPosCounterInputSchema,
  createProductVariantInputSchema,
  createStockLocationInputSchema,
  getBranchQuerySchema,
  getPosCounterQuerySchema,
  getStockLocationQuerySchema,
  listBranchesQuerySchema,
  listPosCountersQuerySchema,
  listStockLocationsQuerySchema,
  posCounterPageContractSchema,
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
});
