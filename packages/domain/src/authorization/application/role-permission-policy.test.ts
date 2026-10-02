import { describe, expect, it } from "vitest";
import type { Role } from "../../identity/domain/models.js";
import type {
  PermissionAction,
  PermissionKey,
  PermissionResource,
} from "../domain/models.js";
import {
  allPermissionActions,
  allPermissionResources,
  defaultRolePermissions,
  roleAllowsPermission,
} from "./role-permission-policy.js";

const grantsOf = (role: Role) =>
  defaultRolePermissions
    .filter((grant) => grant.role === role)
    .map((grant) => `${grant.resource}:${grant.action}`)
    .sort();

const keys = (
  resources: readonly PermissionResource[],
  actions: readonly PermissionAction[],
) => resources.flatMap((resource) => actions.map((a) => `${resource}:${a}`));

const can = (
  role: Role,
  resource: PermissionResource,
  action: PermissionAction,
) => roleAllowsPermission(role, { action, resource });

// Stock intake needs these (stock-intake-application-service.ts).
const stockIntake: readonly PermissionKey[] = [
  { action: "CREATE", resource: "CATALOG" },
  { action: "UPDATE", resource: "CATALOG" },
  { action: "CREATE", resource: "INVENTORY" },
  { action: "UPDATE", resource: "INVENTORY" },
  { action: "CREATE", resource: "PROCUREMENT" },
];
// POS checkout needs these (pos-application-service.ts).
const posCheckout: readonly PermissionKey[] = [
  { action: "UPDATE", resource: "POS" },
  { action: "CREATE", resource: "SALES" },
  { action: "CREATE", resource: "PAYMENT" },
];

describe("default role permission matrix", () => {
  it("has no duplicate grants", () => {
    const all = defaultRolePermissions.map(
      (grant) => `${grant.role}:${grant.resource}:${grant.action}`,
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("OWNER has every resource and action, including PROCUREMENT", () => {
    expect(grantsOf("OWNER")).toEqual(
      keys(allPermissionResources, allPermissionActions).sort(),
    );
    expect(grantsOf("OWNER")).toHaveLength(91);
  });

  it("ADMIN matches the target matrix", () => {
    expect(grantsOf("ADMIN")).toEqual(
      [
        ...keys(["ORGANIZATION"], ["READ", "UPDATE"]),
        ...keys(["TEAM", "USER"], ["CREATE", "READ", "UPDATE", "DELETE"]),
        ...keys(
          [
            "CATALOG",
            "INVENTORY",
            "RESERVATION",
            "SALES_ORDER",
            "SALES",
            "POS",
          ],
          ["CREATE", "READ", "UPDATE", "DELETE", "CANCEL", "FULFILL"],
        ),
        ...keys(["PAYMENT"], ["CREATE", "READ", "APPROVE"]),
        ...keys(["RECEIPT", "REPORT"], ["READ"]),
        ...keys(["PROCUREMENT"], ["READ", "CREATE", "UPDATE"]),
      ].sort(),
    );
  });

  it("MANAGER matches the target matrix", () => {
    expect(grantsOf("MANAGER")).toEqual(
      [
        ...keys(["CATALOG"], ["CREATE", "READ", "UPDATE"]),
        ...keys(
          ["INVENTORY", "RESERVATION", "SALES_ORDER", "SALES", "POS"],
          ["CREATE", "READ", "UPDATE", "CANCEL", "FULFILL"],
        ),
        ...keys(["PAYMENT"], ["CREATE", "READ", "APPROVE"]),
        ...keys(["RECEIPT", "REPORT"], ["READ"]),
        ...keys(["PROCUREMENT"], ["READ", "CREATE"]),
      ].sort(),
    );
  });

  it("STAFF matches the target matrix (plus SALES CREATE for POS checkout)", () => {
    expect(grantsOf("STAFF")).toEqual(
      [
        ...keys(["CATALOG", "INVENTORY"], ["READ"]),
        ...keys(["SALES"], ["READ", "CREATE"]),
        ...keys(
          ["POS", "SALES_ORDER", "RESERVATION"],
          ["CREATE", "READ", "UPDATE"],
        ),
        ...keys(["PAYMENT"], ["CREATE", "READ"]),
        ...keys(["RECEIPT"], ["READ"]),
      ].sort(),
    );
  });

  it.each([
    ["OWNER", true],
    ["ADMIN", true],
    ["MANAGER", true],
    ["STAFF", false],
  ] as const)("stock intake for %s: %s", (role, allowed) => {
    expect(
      stockIntake.every((permission) => roleAllowsPermission(role, permission)),
    ).toBe(allowed);
  });

  it.each(["OWNER", "ADMIN", "MANAGER", "STAFF"] as const)(
    "%s can complete a POS checkout",
    (role) => {
      expect(
        posCheckout.every((permission) =>
          roleAllowsPermission(role, permission),
        ),
      ).toBe(true);
    },
  );

  it("only OWNER and ADMIN edit supplier details or manage the team", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      expect(can(role, "PROCUREMENT", "UPDATE")).toBe(true);
      expect(can(role, "TEAM", "UPDATE")).toBe(true);
    }
    for (const role of ["MANAGER", "STAFF"] as const) {
      expect(can(role, "PROCUREMENT", "UPDATE")).toBe(false);
      expect(can(role, "TEAM", "UPDATE")).toBe(false);
      expect(can(role, "TEAM", "READ")).toBe(false);
    }
  });

  it("STAFF sees no cost, supplier, report, team or organization data", () => {
    for (const resource of [
      "PROCUREMENT",
      "REPORT",
      "TEAM",
      "USER",
      "ORGANIZATION",
    ] as const) {
      for (const action of allPermissionActions) {
        expect(can("STAFF", resource, action)).toBe(false);
      }
    }
    expect(can("STAFF", "CATALOG", "UPDATE")).toBe(false);
    expect(can("STAFF", "INVENTORY", "CREATE")).toBe(false);
  });

  it("MANAGER has no deletes and ADMIN cannot delete the organization", () => {
    expect(grantsOf("MANAGER").some((key) => key.endsWith(":DELETE"))).toBe(
      false,
    );
    expect(can("ADMIN", "ORGANIZATION", "DELETE")).toBe(false);
    expect(can("ADMIN", "ORGANIZATION", "CREATE")).toBe(false);
  });
});
