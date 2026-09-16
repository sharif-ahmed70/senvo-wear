import {
  RepositoryAuditWriter,
  type CredentialStatus,
  type IdentityProvider,
  type WorkforcePasswordTargetScope,
  type WorkforcePasswordTransactionContext,
  type WorkforcePasswordTransactionManager,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { PrismaAuditEntryRepository } from "../audit/repositories.js";
import { PrismaUserCredentialRepository } from "../authentication/repositories.js";
import { PrismaWorkforceAuthenticationRepository } from "./workforce-authentication-repository.js";

type TransactionCapablePrismaClient = Pick<PrismaClient, "$transaction">;

export class PrismaWorkforcePasswordTransactionManager implements WorkforcePasswordTransactionManager {
  constructor(private readonly prisma: TransactionCapablePrismaClient) {}

  async execute<TResult>(
    operation: (
      context: WorkforcePasswordTransactionContext,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const credentials = new PrismaUserCredentialRepository(tx);
      const workforceSessions = new PrismaWorkforceAuthenticationRepository(tx);
      const auditWriter = new RepositoryAuditWriter(
        new PrismaAuditEntryRepository(tx),
      );

      const inspectTargetScope = async (target: {
        credentialId?: string;
        userId: string;
      }): Promise<WorkforcePasswordTargetScope | null> => {
        const userRows = await tx.$queryRaw<
          Array<{ id: string; status: string }>
        >`SELECT id, status FROM "users" WHERE id = ${target.userId}::uuid FOR UPDATE`;

        if (userRows.length === 0) {
          return null;
        }

        const credRows = await tx.$queryRaw<
          Array<{
            id: string;
            user_id: string;
            provider: IdentityProvider;
            identifier: string;
            status: CredentialStatus;
            version: number;
          }>
        >`SELECT id, "user_id", provider, identifier, status, version FROM "user_credentials" WHERE "user_id" = ${target.userId}::uuid AND provider = 'PASSWORD' FOR UPDATE`;

        if (credRows.length === 0) {
          return null;
        }

        const cred = credRows[0];
        if (!cred || (target.credentialId && cred.id !== target.credentialId)) {
          return null;
        }

        const customerRows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "customer_accounts" WHERE "user_id" = ${target.userId}::uuid FOR UPDATE`;

        const membershipRows = await tx.$queryRaw<
          Array<{
            id: string;
            organization_id: string;
            role: string;
            status: string;
          }>
        >`SELECT id, "organization_id", role, status FROM "organization_memberships" WHERE "user_id" = ${target.userId}::uuid FOR UPDATE`;

        const user = userRows[0];
        if (!user) {
          return null;
        }

        return {
          credential: {
            id: cred.id,
            identifier: cred.identifier,
            provider: cred.provider,
            status: cred.status,
            userId: cred.user_id,
            version: cred.version,
          },
          hasCustomerAccount: customerRows.length > 0,
          memberships: membershipRows.map((m) => ({
            id: m.id,
            organizationId: m.organization_id,
            role: m.role,
            status: m.status,
          })),
          user: {
            id: user.id,
            status: user.status,
          },
        };
      };

      const context: WorkforcePasswordTransactionContext = {
        auditWriter,
        credentials,
        inspectTargetScope,
        workforceSessions,
      };

      return operation(context);
    });
  }
}
