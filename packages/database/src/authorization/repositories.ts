import {
  BusinessRuleError,
  ConflictError,
  type AuthorizationPermission,
  type CreatePermissionRecord,
  type CreateRolePermissionRecord,
  type PermissionKey,
  type PermissionRepository,
  type Role,
  type RolePermission,
  type RolePermissionRepository,
} from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

type AuthorizationPrismaClient = Pick<
  PrismaClient,
  "permission" | "rolePermission"
>;

type KnownPrismaError = {
  code?: string;
};

export class PrismaPermissionRepository implements PermissionRepository {
  constructor(private readonly prisma: AuthorizationPrismaClient) {}

  async create(
    record: CreatePermissionRecord,
  ): Promise<AuthorizationPermission> {
    return mapPermission(
      await createWithIntegrityMapping(() =>
        this.prisma.permission.create({ data: record }),
      ),
    );
  }

  async findById(id: string): Promise<AuthorizationPermission | null> {
    const record = await this.prisma.permission.findUnique({ where: { id } });
    return record ? mapPermission(record) : null;
  }

  async findByResourceAction(
    permission: PermissionKey,
  ): Promise<AuthorizationPermission | null> {
    const record = await this.prisma.permission.findUnique({
      where: {
        resource_action: {
          action: permission.action,
          resource: permission.resource,
        },
      },
    });
    return record ? mapPermission(record) : null;
  }
}

export class PrismaRolePermissionRepository implements RolePermissionRepository {
  constructor(private readonly prisma: AuthorizationPrismaClient) {}

  async create(record: CreateRolePermissionRecord): Promise<RolePermission> {
    return mapRolePermission(
      await createWithIntegrityMapping(() =>
        this.prisma.rolePermission.create({ data: record }),
      ),
    );
  }

  async findByRoleAndPermission(
    role: Role,
    permissionId: string,
  ): Promise<RolePermission | null> {
    const record = await this.prisma.rolePermission.findUnique({
      where: { role_permissionId: { permissionId, role } },
    });
    return record ? mapRolePermission(record) : null;
  }

  async listActivePermissionsByRole(
    role: Role,
  ): Promise<AuthorizationPermission[]> {
    const records = await this.prisma.rolePermission.findMany({
      include: { permission: true },
      orderBy: [
        { permission: { resource: "asc" } },
        { permission: { action: "asc" } },
      ],
      where: {
        role,
        status: "ACTIVE",
        permission: { status: "ACTIVE" },
      },
    });
    return records.map((record) => mapPermission(record.permission));
  }
}

async function createWithIntegrityMapping<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(
        "Authorization uniqueness constraint was violated.",
      );
    }
    if (isForeignKeyConstraintError(error)) {
      throw new BusinessRuleError(
        "Authorization reference integrity was violated.",
      );
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2002");
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2003");
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === code
  );
}

function mapPermission(record: {
  action: AuthorizationPermission["action"];
  createdAt: Date;
  description: string | null;
  id: string;
  resource: AuthorizationPermission["resource"];
  status: AuthorizationPermission["status"];
  updatedAt: Date;
}): AuthorizationPermission {
  return {
    action: record.action,
    createdAt: record.createdAt,
    description: record.description,
    id: record.id,
    resource: record.resource,
    status: record.status,
    updatedAt: record.updatedAt,
  };
}

function mapRolePermission(record: RolePermission): RolePermission {
  return record;
}
