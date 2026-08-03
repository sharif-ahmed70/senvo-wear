import { ValidationApplicationError } from "../../errors.js";
import type {
  PermissionAction,
  PermissionKey,
  PermissionResource,
  PermissionStatus,
} from "./models.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const permissionResources = [
  "ORGANIZATION",
  "TEAM",
  "USER",
  "CATALOG",
  "INVENTORY",
  "RESERVATION",
  "SALES_ORDER",
  "SALES",
  "REPORT",
] as const satisfies readonly PermissionResource[];

export const permissionActions = [
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "CANCEL",
  "FULFILL",
] as const satisfies readonly PermissionAction[];

export const permissionStatuses = [
  "ACTIVE",
  "INACTIVE",
] as const satisfies readonly PermissionStatus[];

export function assertAuthorizationId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

export function normalizePermissionResource(
  value: PermissionResource,
): PermissionResource {
  if (!permissionResources.includes(value)) {
    throw new ValidationApplicationError("permission resource is invalid.");
  }
  return value;
}

export function normalizePermissionAction(
  value: PermissionAction,
): PermissionAction {
  if (!permissionActions.includes(value)) {
    throw new ValidationApplicationError("permission action is invalid.");
  }
  return value;
}

export function normalizePermissionStatus(
  value: PermissionStatus | undefined,
): PermissionStatus {
  if (value === undefined) {
    return "ACTIVE";
  }
  if (!permissionStatuses.includes(value)) {
    throw new ValidationApplicationError("permission status is invalid.");
  }
  return value;
}

export function normalizePermissionKey(
  permission: PermissionKey,
): PermissionKey {
  return {
    action: normalizePermissionAction(permission.action),
    resource: normalizePermissionResource(permission.resource),
  };
}

export function normalizePermissionDescription(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length === 0 || normalized.length > 240) {
    throw new ValidationApplicationError(
      "permission description must be between 1 and 240 characters.",
    );
  }
  return normalized;
}
