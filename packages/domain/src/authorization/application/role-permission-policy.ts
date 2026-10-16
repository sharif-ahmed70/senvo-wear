import type { Role } from "../../identity/domain/models.js";
import type {
  PermissionAction,
  PermissionKey,
  PermissionResource,
} from "../domain/models.js";

export const allPermissionResources: readonly PermissionResource[] = [
  "ORGANIZATION",
  "TEAM",
  "USER",
  "CATALOG",
  "INVENTORY",
  "PROCUREMENT",
  "RESERVATION",
  "SALES_ORDER",
  "SALES",
  "POS",
  "PAYMENT",
  "RECEIPT",
  "REPORT",
];

export const allPermissionActions: readonly PermissionAction[] = [
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "CANCEL",
  "FULFILL",
];

const operations: readonly PermissionResource[] = [
  "CATALOG",
  "INVENTORY",
  "RESERVATION",
  "SALES_ORDER",
  "SALES",
  "POS",
];

/**
 * The role matrix. Migration 202610020001_sync_role_permission_matrix writes
 * the baseline grants; later additive migrations extend that matrix.
 *
 * - OWNER: everything.
 * - ADMIN: everything except deleting the organization and managing owners
 *   (owner-level team rules are enforced by the team membership guards).
 * - MANAGER: runs the shop: catalog, stock intake, stock, sales, prices.
 * - STAFF: sells (POS, sales orders) and looks up stock; no cost, profit,
 *   supplier, team or reports.
 */
export const defaultRolePermissions: readonly (PermissionKey & {
  role: Role;
})[] = [
  ...permissionsFor("OWNER", allPermissionResources, allPermissionActions),

  ...permissionsFor("ADMIN", ["ORGANIZATION"], ["READ", "UPDATE"]),
  ...permissionsFor(
    "ADMIN",
    ["TEAM", "USER"],
    ["CREATE", "READ", "UPDATE", "DELETE"],
  ),
  ...permissionsFor("ADMIN", operations, [
    "CREATE",
    "READ",
    "UPDATE",
    "DELETE",
    "CANCEL",
    "FULFILL",
  ]),
  ...permissionsFor("ADMIN", ["POS"], ["APPROVE"]),
  ...permissionsFor("ADMIN", ["PAYMENT"], ["CREATE", "READ", "APPROVE"]),
  ...permissionsFor("ADMIN", ["RECEIPT", "REPORT"], ["READ"]),
  ...permissionsFor("ADMIN", ["PROCUREMENT"], ["READ", "CREATE", "UPDATE"]),

  ...permissionsFor("MANAGER", ["CATALOG"], ["CREATE", "READ", "UPDATE"]),
  ...permissionsFor(
    "MANAGER",
    ["INVENTORY", "RESERVATION", "SALES_ORDER", "SALES", "POS"],
    ["CREATE", "READ", "UPDATE", "CANCEL", "FULFILL"],
  ),
  ...permissionsFor("MANAGER", ["POS"], ["APPROVE"]),
  ...permissionsFor("MANAGER", ["PAYMENT"], ["CREATE", "READ", "APPROVE"]),
  ...permissionsFor("MANAGER", ["RECEIPT", "REPORT"], ["READ"]),
  ...permissionsFor("MANAGER", ["PROCUREMENT"], ["READ", "CREATE"]),

  ...permissionsFor("STAFF", ["CATALOG", "INVENTORY", "SALES"], ["READ"]),
  // POS checkout and sales order creation require SALES CREATE.
  ...permissionsFor("STAFF", ["SALES"], ["CREATE"]),
  ...permissionsFor(
    "STAFF",
    ["POS", "SALES_ORDER", "RESERVATION"],
    ["CREATE", "READ", "UPDATE"],
  ),
  ...permissionsFor("STAFF", ["PAYMENT"], ["CREATE", "READ"]),
  // REPORT READ shows the operational dashboard only; sales money stays
  // behind POS APPROVE, which STAFF does not have.
  ...permissionsFor("STAFF", ["RECEIPT", "REPORT"], ["READ"]),
];

export function roleAllowsPermission(
  role: Role,
  permission: PermissionKey,
  grants: readonly (PermissionKey & { role: Role })[] = defaultRolePermissions,
): boolean {
  return grants.some(
    (grant) =>
      grant.role === role &&
      grant.resource === permission.resource &&
      grant.action === permission.action,
  );
}

function permissionsFor(
  role: Role,
  resources: readonly PermissionResource[],
  actions: readonly PermissionAction[],
): (PermissionKey & { role: Role })[] {
  return resources.flatMap((resource) =>
    actions.map((action) => ({ action, resource, role })),
  );
}
