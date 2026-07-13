import { AuthorizationError, ConflictError } from "../../errors.js";
import type {
  OrganizationMembershipRepository,
  UserRepository,
} from "../../identity/repositories/identity-repositories.js";
import { normalizeRole } from "../../identity/domain/value-objects.js";
import type {
  AuthorizationContext,
  AuthorizationDecision,
  Permission,
  PermissionKey,
  PermissionStatus,
  RolePermission,
} from "../domain/models.js";
import {
  assertAuthorizationId,
  normalizePermissionDescription,
  normalizePermissionKey,
  normalizePermissionStatus,
} from "../domain/value-objects.js";
import type {
  PermissionRepository,
  RolePermissionRepository,
} from "../repositories/authorization-repositories.js";
import { roleAllowsPermission } from "./role-permission-policy.js";

export type AuthorizeInput = {
  context: AuthorizationContext;
  permission: PermissionKey;
};

export type AuthorizationRepositories = {
  memberships: OrganizationMembershipRepository;
  rolePermissions?: RolePermissionRepository;
  users: UserRepository;
};

export type AuthorizationService = {
  authorize(input: AuthorizeInput): Promise<AuthorizationDecision>;
};

export async function authorize(
  repositories: AuthorizationRepositories,
  input: AuthorizeInput,
): Promise<AuthorizationDecision> {
  const userId = assertAuthorizationId(input.context.userId, "userId");
  const organizationId = assertAuthorizationId(
    input.context.organizationId,
    "organizationId",
  );
  const permission = normalizePermissionKey(input.permission);
  const user = await repositories.users.findById(userId);
  if (!user || user.status !== "ACTIVE") {
    throw new AuthorizationError("Inactive users cannot access organization.");
  }
  const membership = await repositories.memberships.findByUserAndOrganization(
    userId,
    organizationId,
  );
  if (!membership) {
    throw new AuthorizationError("User is not a member of this organization.");
  }
  if (membership.status !== "ACTIVE") {
    throw new AuthorizationError(
      "Inactive membership cannot access organization.",
    );
  }
  if (input.context.role && input.context.role !== membership.role) {
    throw new AuthorizationError(
      "Application context role does not match membership.",
    );
  }
  if (
    !(await hasPermission(
      repositories,
      input.context,
      membership.role,
      permission,
    ))
  ) {
    throw new AuthorizationError("Permission is required for this action.");
  }
  return {
    allowed: true,
    organizationId,
    permission,
    role: membership.role,
    userId,
  };
}

export type CreatePermissionInput = PermissionKey & {
  description?: string | null;
  status?: PermissionStatus;
};

export async function createPermission(
  repository: PermissionRepository,
  input: CreatePermissionInput,
): Promise<Permission> {
  const permission = normalizePermissionKey(input);
  if (await repository.findByResourceAction(permission)) {
    throw new ConflictError("Permission already exists.");
  }
  return repository.create({
    ...permission,
    description: normalizePermissionDescription(input.description),
    status: normalizePermissionStatus(input.status),
  });
}

export type AssignRolePermissionInput = {
  permissionId: string;
  role: RolePermission["role"];
  status?: PermissionStatus;
};

export async function assignRolePermission(
  repositories: {
    permissions: PermissionRepository;
    rolePermissions: RolePermissionRepository;
  },
  input: AssignRolePermissionInput,
): Promise<RolePermission> {
  const permissionId = assertAuthorizationId(
    input.permissionId,
    "permissionId",
  );
  const permission = await repositories.permissions.findById(permissionId);
  if (!permission || permission.status !== "ACTIVE") {
    throw new AuthorizationError("Permission is not active.");
  }
  if (
    await repositories.rolePermissions.findByRoleAndPermission(
      input.role,
      permissionId,
    )
  ) {
    throw new ConflictError("Role permission already exists.");
  }
  return repositories.rolePermissions.create({
    permissionId,
    role: normalizeRole(input.role),
    status: normalizePermissionStatus(input.status),
  });
}

async function hasPermission(
  repositories: AuthorizationRepositories,
  context: AuthorizationContext,
  role: AuthorizationDecision["role"],
  permission: PermissionKey,
): Promise<boolean> {
  if (context.permissions) {
    return context.permissions.some(
      (candidate) =>
        candidate.resource === permission.resource &&
        candidate.action === permission.action,
    );
  }
  if (repositories.rolePermissions) {
    const permissions =
      await repositories.rolePermissions.listActivePermissionsByRole(role);
    if (permissions.length > 0) {
      return permissions.some(
        (candidate) =>
          candidate.resource === permission.resource &&
          candidate.action === permission.action,
      );
    }
  }
  return roleAllowsPermission(role, permission);
}
