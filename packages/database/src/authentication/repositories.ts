import {
  BusinessRuleError,
  ConflictError,
  type CreateUserCredentialRecord,
  type IdentityProvider,
  type UserCredential,
  type UserCredentialRepository,
} from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

type AuthenticationPrismaClient = Pick<PrismaClient, "userCredential">;

type KnownPrismaError = {
  code?: string;
};

export class PrismaUserCredentialRepository implements UserCredentialRepository {
  constructor(private readonly prisma: AuthenticationPrismaClient) {}

  async create(record: CreateUserCredentialRecord): Promise<UserCredential> {
    return mapCredential(
      await createWithIntegrityMapping(() =>
        this.prisma.userCredential.create({ data: record }),
      ),
    );
  }

  async findById(id: string): Promise<UserCredential | null> {
    const record = await this.prisma.userCredential.findUnique({
      where: { id },
    });
    return record ? mapCredential(record) : null;
  }

  async findByProviderIdentifier(
    provider: IdentityProvider,
    identifier: string,
  ): Promise<UserCredential | null> {
    const record = await this.prisma.userCredential.findUnique({
      where: { provider_identifier: { identifier, provider } },
    });
    return record ? mapCredential(record) : null;
  }

  async changeStatus(record: {
    expectedVersion: number;
    id: string;
    status: UserCredential["status"];
  }): Promise<UserCredential | null> {
    const update = await this.prisma.userCredential.updateMany({
      data: {
        status: record.status,
        version: { increment: 1 },
      },
      where: {
        id: record.id,
        version: record.expectedVersion,
      },
    });
    if (update.count === 0) {
      return null;
    }
    return this.findById(record.id);
  }

  async replacePassword(record: {
    expectedVersion: number;
    id: string;
    passwordHash: string;
    userId: string;
  }): Promise<UserCredential | null> {
    const update = await this.prisma.userCredential.updateMany({
      data: {
        passwordHash: record.passwordHash,
        version: { increment: 1 },
      },
      where: {
        id: record.id,
        provider: "PASSWORD",
        status: "ACTIVE",
        userId: record.userId,
        version: record.expectedVersion,
      },
    });
    if (update.count === 0) {
      return null;
    }
    return this.findById(record.id);
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
        "Authentication uniqueness constraint was violated.",
      );
    }
    if (isForeignKeyConstraintError(error)) {
      throw new BusinessRuleError(
        "Authentication reference integrity was violated.",
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

function mapCredential(record: UserCredential): UserCredential {
  return record;
}
