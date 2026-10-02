import { roleAllowsPermission, type Role } from "@senvo/domain";
import { describe, expect, it } from "vitest";
import { stockIntakePermissionsFor } from "./stock-intake-application-service.js";

const base = {
  idempotencyKey: "intake-key-0001",
  lines: [
    {
      colorName: "Black",
      quantity: 1,
      sellingPriceMinor: 1000,
      sizeName: "M",
      unitCostMinor: 500,
    },
  ],
  product: { existingProductId: "55555555-5555-4555-8555-555555555555" },
  purchase: { destinationLocationId: "44444444-4444-4444-8444-444444444444" },
};
const supplierId = "88888888-8888-4888-8888-888888888888";

const allowed = (
  role: Role,
  input: Parameters<typeof stockIntakePermissionsFor>[0],
) =>
  stockIntakePermissionsFor(input).every((permission) =>
    roleAllowsPermission(role, permission),
  );

describe("stock intake access by role (default matrix)", () => {
  it.each([
    ["OWNER", true],
    ["ADMIN", true],
    ["MANAGER", true],
    ["STAFF", false],
  ] as const)("%s can record a stock intake: %s", (role, expected) => {
    expect(allowed(role, { ...base, supplier: null })).toBe(expected);
    expect(
      allowed(role, { ...base, supplier: { existingSupplierId: supplierId } }),
    ).toBe(expected);
  });

  it.each([
    ["OWNER", true],
    ["ADMIN", true],
    ["MANAGER", false],
    ["STAFF", false],
  ] as const)(
    "%s can edit supplier phone/address during intake: %s",
    (role, expected) => {
      expect(
        allowed(role, {
          ...base,
          supplier: {
            existingSupplierId: supplierId,
            updates: { phone: "01700000000" },
          },
        }),
      ).toBe(expected);
    },
  );
});
