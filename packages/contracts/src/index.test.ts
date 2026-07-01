import { describe, expect, it } from "vitest";
import {
  apiErrorCodeSchema,
  createColorInputSchema,
  createProductVariantInputSchema,
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
});
