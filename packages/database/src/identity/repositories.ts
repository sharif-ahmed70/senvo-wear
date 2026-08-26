import {
  BusinessRuleError,
  ConflictError,
  type CreateOrganizationMembershipRecord,
  type CreateUserRecord,
  type OrganizationMembership,
  type OrganizationMembershipRepository,
  type OrganizationTeamMember,
  type OrganizationTeamReadRepository,
  type Role,
  type User,
  type UserRepository,
} from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

type IdentityPrismaClient = Pick<
  PrismaClient,
  "organizationMembership" | "user"
>;

type KnownPrismaError = {
  code?: string;
};

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: IdentityPrismaClient) {}

  async create(record: CreateUserRecord): Promise<User> {
    return mapUser(
      await createWithIntegrityMapping(() =>
        this.prisma.user.create({ data: record }),
      ),
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { email } });
    return record ? mapUser(record) : null;
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? mapUser(record) : null;
  }
}

export class PrismaOrganizationMembershipRepository
  implements OrganizationMembershipRepository, OrganizationTeamReadRepository
{
  constructor(private readonly prisma: IdentityPrismaClient) {}

  async create(
    record: CreateOrganizationMembershipRecord,
  ): Promise<OrganizationMembership> {
    return mapMembership(
      await createWithIntegrityMapping(() =>
        this.prisma.organizationMembership.create({ data: record }),
      ),
    );
  }

  async findById(
    id: string,
    organizationId?: string,
  ): Promise<OrganizationMembership | null> {
    const record = await this.prisma.organizationMembership.findFirst({
      where: { id, ...(organizationId ? { organizationId } : {}) },
    });
    return record ? mapMembership(record) : null;
  }

  async findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembership | null> {
    const record = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { organizationId, userId } },
    });
    return record ? mapMembership(record) : null;
  }

  async listByOrganization(
    organizationId: string,
  ): Promise<OrganizationTeamMember[]> {
    const records = await this.prisma.organizationMembership.findMany({
      include: { user: true },
      orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
      where: { organizationId },
    });
    return records.map((record) => ({
      createdAt: record.createdAt,
      email: record.user.email,
      id: record.id,
      name: record.user.name,
      organizationId: record.organizationId,
      role: record.role,
      status: record.status,
      updatedAt: record.updatedAt,
      userId: record.userId,
      userStatus: record.user.status,
      version: record.version,
    }));
  }

  async changeStatus(record: {
    expectedVersion: number;
    id: string;
    organizationId: string;
    status: OrganizationMembership["status"];
  }): Promise<OrganizationMembership | null> {
    const update = await this.prisma.organizationMembership.updateMany({
      data: {
        status: record.status,
        version: { increment: 1 },
      },
      where: versionedWhere(record),
    });
    if (update.count === 0) {
      return null;
    }
    return this.findById(record.id, record.organizationId);
  }

  async listByUser(userId: string): Promise<OrganizationMembership[]> {
    const records = await this.prisma.organizationMembership.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(mapMembership);
  }

  async findFirstActiveByUser(
    userId: string,
  ): Promise<OrganizationMembership | null> {
    const record = await this.prisma.organizationMembership.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    return record ? mapMembership(record) : null;
  }

  async assignRole(record: {
    expectedVersion: number;
    id: string;
    organizationId: string;
    role: Role;
  }): Promise<OrganizationMembership | null> {
    const update = await this.prisma.organizationMembership.updateMany({
      data: {
        role: record.role,
        version: { increment: 1 },
      },
      where: versionedWhere(record),
    });
    if (update.count === 0) {
      return null;
    }
    return this.findById(record.id, record.organizationId);
  }
}

async function createWithIntegrityMapping<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError("Identity uniqueness constraint was violated.");
    }
    if (isForeignKeyConstraintError(error)) {
      throw new BusinessRuleError("Identity reference integrity was violated.");
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

function versionedWhere(record: {
  expectedVersion: number;
  id: string;
  organizationId: string;
}) {
  return {
    id: record.id,
    organizationId: record.organizationId,
    version: record.expectedVersion,
  };
}

function mapUser(record: User): User {
  return record;
}

function mapMembership(record: OrganizationMembership): OrganizationMembership {
  return record;
}
