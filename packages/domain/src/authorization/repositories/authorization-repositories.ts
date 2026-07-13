import type { Role } from "../../identity/domain/models.js";
import type {
  Permission,
  PermissionKey,
  RolePermission,
} from "../domain/models.js";

export type CreatePermissionRecord = Pick<
  Permission,
  "action" | "description" | "resource" | "status"
>;

export type CreateRolePermissionRecord = Pick<
  RolePermission,
  "permissionId" | "role" | "status"
>;

export type PermissionRepository = {
  create(record: CreatePermissionRecord): Promise<Permission>;
  findById(id: string): Promise<Permission | null>;
  findByResourceAction(permission: PermissionKey): Promise<Permission | null>;
};

export type RolePermissionRepository = {
  create(record: CreateRolePermissionRecord): Promise<RolePermission>;
  findByRoleAndPermission(
    role: Role,
    permissionId: string,
  ): Promise<RolePermission | null>;
  listActivePermissionsByRole(role: Role): Promise<Permission[]>;
};
