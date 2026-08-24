import type {
  AuthenticationSession,
  AuthenticationSessionRepository,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

export class PrismaAuthenticationSessionRepository implements AuthenticationSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    record: Omit<AuthenticationSession, "sessionId">,
  ): Promise<AuthenticationSession> {
    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.authenticationSession.create({
        data: {
          expiresAt: record.expiresAt,
          id: record.id,
          issuedAt: record.issuedAt,
          organizationId: record.organizationId,
          provider: record.provider,
          revokedAt: record.revokedAt,
          tokenHash: record.tokenHash,
          userId: record.userId,
        },
      });
      await recordSessionAudit(transaction, {
        action: "AUTHENTICATION_SESSION_STARTED",
        organizationId: record.organizationId,
        sessionId: record.id,
        userId: record.userId,
      });
      return mapSession(session);
    });
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthenticationSession | null> {
    const record = await this.prisma.authenticationSession.findFirst({
      where: { expiresAt: { gt: now }, revokedAt: null, tokenHash },
    });
    return record ? mapSession(record) : null;
  }

  async revoke(id: string, revokedAt: Date): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.authenticationSession.findUnique({
        where: { id },
      });
      if (!session || session.revokedAt) return false;
      const result = await transaction.authenticationSession.updateMany({
        data: { revokedAt },
        where: { id, revokedAt: null },
      });
      if (result.count !== 1) return false;
      await recordSessionAudit(transaction, {
        action: "AUTHENTICATION_SESSION_ENDED",
        organizationId: session.organizationId,
        sessionId: session.id,
        userId: session.userId,
      });
      return true;
    });
  }
}

function recordSessionAudit(
  transaction: Prisma.TransactionClient,
  input: {
    action: "AUTHENTICATION_SESSION_STARTED" | "AUTHENTICATION_SESSION_ENDED";
    organizationId: string;
    sessionId: string;
    userId: string;
  },
) {
  return transaction.auditEntry.create({
    data: {
      action: input.action,
      metadata: { authenticationProvider: "PASSWORD" },
      organizationId: input.organizationId,
      resource: "AUTHENTICATION_SESSION",
      resourceId: input.sessionId,
      userId: input.userId,
    },
  });
}

function mapSession(record: {
  expiresAt: Date;
  id: string;
  issuedAt: Date;
  organizationId: string;
  provider: AuthenticationSession["provider"];
  revokedAt: Date | null;
  tokenHash: string;
  userId: string;
}): AuthenticationSession {
  return { ...record, sessionId: record.id };
}
