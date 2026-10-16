import {
  RepositoryAuditWriter,
  type OrganizationMembership,
  type TeamMembershipTransactionContext,
  type TeamMembershipTransactionManager,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { PrismaAuditEntryRepository } from "../audit/repositories.js";
import { PrismaUserCredentialRepository } from "../authentication/repositories.js";
import { PrismaWorkforceAuthenticationRepository } from "../workforce/workforce-authentication-repository.js";
import {
  PrismaOrganizationMembershipRepository,
  PrismaUserRepository,
} from "./repositories.js";

type TransactionCapablePrismaClient = Pick<PrismaClient, "$transaction">;

/**
 * Runs a team membership change in one transaction. The organization's
 * memberships are locked first so two concurrent changes cannot both remove
 * the last active owner.
 */
export class PrismaTeamMembershipTransactionManager implements TeamMembershipTransactionManager {
  constructor(private readonly prisma: TransactionCapablePrismaClient) {}

  execute<TResult>(
    operation: (context: TeamMembershipTransactionContext) => Promise<TResult>,
  ): Promise<TResult> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const memberships = new PrismaOrganizationMembershipRepository(tx);
      return operation({
        auditWriter: new RepositoryAuditWriter(
          new PrismaAuditEntryRepository(tx),
        ),
        lockOrganizationMemberships: async (
          organizationId: string,
        ): Promise<OrganizationMembership[]> => {
          await tx.$queryRaw`SELECT id FROM "organization_memberships" WHERE "organization_id" = ${organizationId}::uuid ORDER BY id FOR UPDATE`;
          return (await memberships.listByOrganization(organizationId)).map(
            (member) => ({
              createdAt: member.createdAt,
              id: member.id,
              organizationId: member.organizationId,
              role: member.role,
              status: member.status,
              updatedAt: member.updatedAt,
              userId: member.userId,
              version: member.version,
            }),
          );
        },
        credentials: new PrismaUserCredentialRepository(tx),
        memberships,
        userHasCustomerAccount: async (userId: string) => {
          const rows = await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM "customer_accounts" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
          return rows.length > 0;
        },
        users: new PrismaUserRepository(tx),
        workforceSessions: new PrismaWorkforceAuthenticationRepository(tx),
      });
    });
  }
}
