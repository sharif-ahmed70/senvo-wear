import type { Role } from "../../identity/domain/models.js";
import type {
  PermissionAction,
  PermissionKey,
  PermissionResource,
} from "../domain/models.js";

const allResources: readonly PermissionResource[] = [
  "ORGANIZATION",
  "USER",
  "CATALOG",
  "INVENTORY",
  "RESERVATION",
  "SALES_ORDER",
  "POS",
  "REPORT",
];

const allActions: readonly PermissionAction[] = [
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "CANCEL",
  "FULFILL",
];

export const defaultRolePermissions: readonly (PermissionKey & {
  role: Role;
})[] = [
  ...permissionsFor("OWNER", allResources, allActions),
  ...permissionsFor(
    "ADMIN",
    ["ORGANIZATION", "USER"],
    ["CREATE", "READ", "UPDATE", "DELETE"],
  ),
  ...permissionsFor(
    "ADMIN",
    ["CATALOG", "INVENTORY", "SALES_ORDER", "POS"],
    ["CREATE", "READ", "UPDATE", "DELETE", "CANCEL", "FULFILL"],
  ),
  ...permissionsFor(
    "MANAGER",
    ["INVENTORY", "RESERVATION", "SALES_ORDER", "POS"],
    ["CREATE", "READ", "UPDATE", "CANCEL", "FULFILL"],
  ),
  ...permissionsFor("STAFF", allResources, ["READ"]),
  ...permissionsFor(
    "STAFF",
    ["RESERVATION", "SALES_ORDER", "POS"],
    ["CREATE", "UPDATE"],
  ),
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
