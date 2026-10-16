import {
  BusinessRuleError,
  type WorkforceAuthenticationRepository,
  type WorkforceAuthenticationSession,
  type WorkforceSessionWithPrincipal,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type WorkforceSessionRecord = Prisma.WorkforceAuthenticationSessionGetPayload<{
  include: { organization: true; user: true };
}>;

export class PrismaWorkforceAuthenticationRepository implements WorkforceAuthenticationRepository {
  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient,
  ) {}

  async createSession(
    input: WorkforceAuthenticationSession,
  ): Promise<WorkforceAuthenticationSession> {
    const created = await this.prisma.workforceAuthenticationSession.create({
      data: {
        csrfTokenHash: input.csrfTokenHash,
        expiresAt: input.expiresAt,
        id: input.id,
        lastUsedAt: input.lastUsedAt,
        organizationId: input.organizationId,
        rememberMe: input.rememberMe,
        status: toPersistedStatus(input.status),
        tokenHash: input.tokenHash,
        userId: input.userId,
      },
    });
    return mapSession(created);
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<WorkforceSessionWithPrincipal | null> {
    const record = await this.prisma.workforceAuthenticationSession.findUnique({
      include: { organization: true, user: true },
      where: { tokenHash },
    });
    if (!record) return null;
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          organizationId: record.organizationId,
          userId: record.userId,
        },
      },
    });
    if (!membership) return null;
    return {
      membership: {
        createdAt: membership.createdAt,
        id: membership.id,
        organizationId: membership.organizationId,
        role: membership.role,
        status: membership.status,
        updatedAt: membership.updatedAt,
        userId: membership.userId,
        version: membership.version,
      },
      organization: {
        id: record.organization.id,
        name: record.organization.name,
        status: record.organization.status,
      },
      session: mapSession(record),
      user: {
        createdAt: record.user.createdAt,
        email: record.user.email,
        id: record.user.id,
        name: record.user.name,
        status: record.user.status,
        updatedAt: record.user.updatedAt,
        version: record.user.version,
      },
    };
  }

  async revokeSession(input: {
    revokedAt: Date;
    tokenHash: string;
  }): Promise<boolean> {
    const result = await this.prisma.workforceAuthenticationSession.updateMany({
      data: { revokedAt: input.revokedAt, status: "REVOKED" },
      where: { status: "ACTIVE", tokenHash: input.tokenHash },
    });
    return result.count === 1;
  }

  async revokeAllForUser(input: {
    organizationId: string;
    revokedAt: Date;
    userId: string;
  }): Promise<number> {
    const result = await this.prisma.workforceAuthenticationSession.updateMany({
      data: { revokedAt: input.revokedAt, status: "REVOKED" },
      where: {
        organizationId: input.organizationId,
        status: "ACTIVE",
        userId: input.userId,
      },
    });
    return result.count;
  }

  async revokeAllWorkforceSessionsForUser(input: {
    revokedAt: Date;
    userId: string;
  }): Promise<number> {
    const result = await this.prisma.workforceAuthenticationSession.updateMany({
      data: { revokedAt: input.revokedAt, status: "REVOKED" },
      where: {
        status: "ACTIVE",
        userId: input.userId,
      },
    });
    return result.count;
  }

  async createSessionForVerifiedCredential(input: {
    credentialId: string;
    expectedCredentialVersion: number;
    session: WorkforceAuthenticationSession;
    userId: string;
  }): Promise<WorkforceAuthenticationSession | null> {
    const executeInTransaction = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${input.userId}::uuid FOR UPDATE`;

      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          user_id: string;
          version: number;
          status: string;
          provider: string;
        }>
      >`SELECT id, "user_id", version, status, provider FROM "user_credentials" WHERE id = ${input.credentialId}::uuid FOR UPDATE`;

      if (rows.length === 0) {
        return null;
      }
      const credential = rows[0];
      if (
        !credential ||
        credential.user_id !== input.userId ||
        credential.version !== input.expectedCredentialVersion ||
        credential.status !== "ACTIVE" ||
        credential.provider !== "PASSWORD"
      ) {
        return null;
      }

      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { status: true },
      });
      if (!user || user.status !== "ACTIVE") {
        return null;
      }

      const created = await tx.workforceAuthenticationSession.create({
        data: {
          csrfTokenHash: input.session.csrfTokenHash,
          expiresAt: input.session.expiresAt,
          id: input.session.id,
          lastUsedAt: input.session.lastUsedAt,
          organizationId: input.session.organizationId,
          rememberMe: input.session.rememberMe,
          status: toPersistedStatus(input.session.status),
          tokenHash: input.session.tokenHash,
          userId: input.session.userId,
        },
      });
      return mapSession(created);
    };

    if (
      "$transaction" in this.prisma &&
      typeof (this.prisma as PrismaClient).$transaction === "function"
    ) {
      return (this.prisma as PrismaClient).$transaction(executeInTransaction);
    }
    return executeInTransaction(this.prisma);
  }
}

function toPersistedStatus(
  status: WorkforceAuthenticationSession["status"],
): "ACTIVE" | "REVOKED" {
  if (status === "ACTIVE" || status === "REVOKED") return status;
  throw new BusinessRuleError(
    "Workforce authentication sessions cannot be created with an EXPIRED status.",
  );
}

function mapSession(record: {
  createdAt: Date;
  csrfTokenHash: string;
  expiresAt: Date;
  id: string;
  lastUsedAt: Date;
  organizationId: string;
  rememberMe: boolean;
  revokedAt: Date | null;
  status: WorkforceSessionRecord["status"];
  tokenHash: string;
  updatedAt: Date;
  userId: string;
}): WorkforceAuthenticationSession {
  return {
    createdAt: record.createdAt,
    csrfTokenHash: record.csrfTokenHash,
    expiresAt: record.expiresAt,
    id: record.id,
    lastUsedAt: record.lastUsedAt,
    organizationId: record.organizationId,
    rememberMe: record.rememberMe,
    revokedAt: record.revokedAt,
    status: record.status,
    tokenHash: record.tokenHash,
    updatedAt: record.updatedAt,
    userId: record.userId,
  };
}
