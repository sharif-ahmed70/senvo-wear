import type { WorkforceAuthenticationRepository, WorkforceAuthenticationSession, WorkforceSessionWithPrincipal } from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

export class PrismaWorkforceAuthenticationRepository implements WorkforceAuthenticationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createSession(input: WorkforceAuthenticationSession): Promise<WorkforceAuthenticationSession> {
    const created = await this.prisma.workforceAuthenticationSession.create({
      data: {
        csrfTokenHash: input.csrfTokenHash,
        expiresAt: input.expiresAt,
        id: input.id,
        lastUsedAt: input.lastUsedAt,
        organizationId: input.organizationId,
        rememberMe: input.rememberMe,
        status: input.status as any,
        tokenHash: input.tokenHash,
        userId: input.userId,
      },
    });
    return mapSession(created);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<WorkforceSessionWithPrincipal | null> {
    const record = await this.prisma.workforceAuthenticationSession.findUnique({
      include: { organization: true, user: true },
      where: { tokenHash },
    });
    if (!record) return null;
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { organizationId: record.organizationId, userId: record.userId } },
    });
    if (!membership) return null;
    return {
      membership: {
        createdAt: membership.createdAt,
        id: membership.id,
        organizationId: membership.organizationId,
        role: membership.role as any,
        status: membership.status as any,
        updatedAt: membership.updatedAt,
        userId: membership.userId,
        version: membership.version,
      },
      organization: { id: record.organization.id, name: record.organization.name },
      session: mapSession(record),
      user: {
        createdAt: record.user.createdAt,
        email: record.user.email,
        id: record.user.id,
        name: record.user.name,
        status: record.user.status as any,
        updatedAt: record.user.updatedAt,
        version: record.user.version,
      },
    };
  }

  async revokeSession(input: { revokedAt: Date; tokenHash: string }): Promise<boolean> {
    const result = await this.prisma.workforceAuthenticationSession.updateMany({
      data: { revokedAt: input.revokedAt, status: "REVOKED" },
      where: { status: "ACTIVE", tokenHash: input.tokenHash },
    });
    return result.count === 1;
  }

  async revokeAllForUser(input: { organizationId: string; revokedAt: Date; userId: string }): Promise<number> {
    const result = await this.prisma.workforceAuthenticationSession.updateMany({
      data: { revokedAt: input.revokedAt, status: "REVOKED" },
      where: { organizationId: input.organizationId, status: "ACTIVE", userId: input.userId },
    });
    return result.count;
  }
}

function mapSession(record: any): WorkforceAuthenticationSession {
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
