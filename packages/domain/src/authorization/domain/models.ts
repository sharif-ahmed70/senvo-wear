import type { Role } from "../../identity/domain/models.js";

export type PermissionResource =
  | "ORGANIZATION"
  | "TEAM"
  | "USER"
  | "CATALOG"
  | "INVENTORY"
  | "RESERVATION"
  | "SALES_ORDER"
  | "REPORT";

export type PermissionAction =
  "CREATE" | "READ" | "UPDATE" | "DELETE" | "APPROVE" | "CANCEL" | "FULFILL";

export type PermissionStatus = "ACTIVE" | "INACTIVE";

export type PermissionKey = {
  action: PermissionAction;
  resource: PermissionResource;
};

export type Permission = PermissionKey & {
  createdAt: Date;
  description: string | null;
  id: string;
  status: PermissionStatus;
  updatedAt: Date;
};

export type RolePermission = {
  createdAt: Date;
  id: string;
  permissionId: string;
  role: Role;
  status: PermissionStatus;
  updatedAt: Date;
};

export type AuthorizationContext = {
  organizationId: string;
  permissions?: readonly PermissionKey[] | null;
  role?: Role | null;
  userId: string;
};

export type AuthorizationDecision = {
  allowed: true;
  organizationId: string;
  permission: PermissionKey;
  role: Role;
  userId: string;
};
