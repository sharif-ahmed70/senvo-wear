import { describe, expect, it } from "vitest";
import {
  apiErrorCodeSchema,
  branchContractSchema,
  createBranchInputSchema,
  createColorInputSchema,
  createPosCounterInputSchema,
  createProductVariantInputSchema,
  createStockLocationInputSchema,
  createApiFailure,
  createApiSuccess,
  paginationMetaSchema,
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
      }),
    ).toMatchObject({ code: "MAIN" });
  });
});
