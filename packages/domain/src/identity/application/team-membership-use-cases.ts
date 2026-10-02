import type { AuditWriter } from "../../audit/application/audit-writer.js";
import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "../../errors.js";
import type { WorkforceAuthenticationRepository } from "../../workforce/repositories/workforce-authentication-repository.js";
import type {
  OrganizationMembership,
  OrganizationMembershipStatus,
  Role,
} from "../domain/models.js";
import {
  assertIdentityId,
  normalizeExpectedVersion,
  normalizeMembershipStatus,
  normalizeRole,
} from "../domain/value-objects.js";
import type { UserCredentialRepository } from "../../authentication/repositories/authentication-repositories.js";
import type {
  OrganizationMembershipRepository,
  UserRepository,
} from "../repositories/identity-repositories.js";

/**
 * Team membership rules (role changes, deactivation, new members):
 *
 * 1. Nobody changes their own role or deactivates their own membership.
 * 2. The last active OWNER of an organization is never demoted or
 *    deactivated.
 * 3. Only an OWNER grants, changes or removes OWNER and ADMIN memberships;
 *    an ADMIN manages MANAGER and STAFF only. Other roles manage nobody.
 * 4. A role change or deactivation revokes the member's workforce sessions so
 *    the new access applies at once.
 *
 * Password resets follow rules 1 and 3 (not your own, owner/admin passwords
 * only by an owner); see team-credential-use-cases.ts.
 */
export class TeamMembershipRuleError extends BusinessRuleError {}

export const OWN_MEMBERSHIP_MESSAGE =
  "You cannot change your own role or deactivate your own membership.";
export const LAST_OWNER_MESSAGE =
  "The last active owner cannot be demoted or deactivated. Make another member owner first.";
export const OWNER_ONLY_MEMBERSHIP_MESSAGE =
  "Only an owner can grant, change or remove owner and admin roles.";
export const OWN_PASSWORD_MESSAGE = "You cannot reset your own password here.";
export const OWNER_ONLY_PASSWORD_MESSAGE =
  "Only an owner can reset an owner's or admin's password.";

const rolesAdminCanManage: readonly Role[] = ["MANAGER", "STAFF"];

/** Roles the actor may assign to someone else (rule 3). */
export function assignableRoles(actorRole: Role): readonly Role[] {
  if (actorRole === "OWNER") return ["OWNER", "ADMIN", "MANAGER", "STAFF"];
  if (actorRole === "ADMIN") return rolesAdminCanManage;
  return [];
}

/** Whether the actor may change or deactivate a member with this role. */
export function canManageMemberRole(actorRole: Role, targetRole: Role) {
  return assignableRoles(actorRole).includes(targetRole);
}

export type TeamMembershipChange =
  | { kind: "create"; role: Role }
  | { kind: "password" }
  | { kind: "role"; role: Role }
  | { kind: "status"; status: OrganizationMembershipStatus };

/**
 * Pure rule check. `members` must be the organization's memberships read
 * under a lock so the owner count cannot change concurrently.
 */
export function assertTeamMembershipChangeAllowed(input: {
  actor: Pick<OrganizationMembership, "role" | "userId">;
  change: TeamMembershipChange;
  members: readonly Pick<
    OrganizationMembership,
    "id" | "role" | "status" | "userId"
  >[];
  target: Pick<
    OrganizationMembership,
    "id" | "role" | "status" | "userId"
  > | null;
}): void {
  const { actor, change, members, target } = input;

  if (change.kind === "create") {
    if (!canManageMemberRole(actor.role, change.role)) {
      throw new AuthorizationError(OWNER_ONLY_MEMBERSHIP_MESSAGE);
    }
    return;
  }
  if (!target) throw new NotFoundError("Team member was not found.");

  // Rule 1.
  if (target.userId === actor.userId) {
    throw new TeamMembershipRuleError(
      change.kind === "password"
        ? OWN_PASSWORD_MESSAGE
        : OWN_MEMBERSHIP_MESSAGE,
    );
  }

  // Rule 3: the member's current role and the new role must both be ones the
  // actor manages.
  if (!canManageMemberRole(actor.role, target.role)) {
    throw new AuthorizationError(
      change.kind === "password"
        ? OWNER_ONLY_PASSWORD_MESSAGE
        : OWNER_ONLY_MEMBERSHIP_MESSAGE,
    );
  }
  // A password reset changes neither role nor status, so rule 2 does not apply.
  if (change.kind === "password") return;
  if (change.kind === "role" && !canManageMemberRole(actor.role, change.role)) {
    throw new AuthorizationError(OWNER_ONLY_MEMBERSHIP_MESSAGE);
  }

  // Rule 2.
  const removesOwner =
    target.role === "OWNER" &&
    target.status === "ACTIVE" &&
    (change.kind === "role"
      ? change.role !== "OWNER"
      : change.status !== "ACTIVE");
  if (removesOwner) {
    const activeOwners = members.filter(
      (member) => member.role === "OWNER" && member.status === "ACTIVE",
    ).length;
    if (activeOwners <= 1) {
      throw new TeamMembershipRuleError(LAST_OWNER_MESSAGE);
    }
  }
}

export type TeamMembershipTransactionContext = {
  auditWriter: Pick<AuditWriter, "recordWithinTransaction">;
  /**
   * Returns every membership of the organization, locked (FOR UPDATE) for the
   * rest of the transaction.
   */
  lockOrganizationMemberships(
    organizationId: string,
  ): Promise<OrganizationMembership[]>;
  memberships: Pick<
    OrganizationMembershipRepository,
    "assignRole" | "changeStatus" | "create" | "findByUserAndOrganization"
  >;
  /** Password credentials (provider PASSWORD), for new members and resets. */
  credentials: Pick<
    UserCredentialRepository,
    "create" | "findByProviderIdentifier" | "replacePassword"
  >;
  /** True when the user also has a storefront customer account (locked). */
  userHasCustomerAccount(userId: string): Promise<boolean>;
  users: Pick<UserRepository, "create" | "findByEmail" | "findById">;
  workforceSessions: Pick<
    WorkforceAuthenticationRepository,
    "revokeAllForUser" | "revokeAllWorkforceSessionsForUser"
  >;
};

export type TeamMembershipTransactionManager = {
  execute<TResult>(
    operation: (context: TeamMembershipTransactionContext) => Promise<TResult>,
  ): Promise<TResult>;
};

type MembershipChangeInput = {
  actorUserId: string;
  expectedVersion: number;
  membershipId: string;
  now?: Date;
  organizationId: string;
};

export type TeamMembershipChangeResult = {
  membership: OrganizationMembership;
  revokedSessionCount: number;
};

export async function changeTeamMemberRole(
  transactionManager: TeamMembershipTransactionManager,
  input: MembershipChangeInput & { role: Role },
): Promise<TeamMembershipChangeResult> {
  const role = normalizeRole(input.role);
  return applyMembershipChange(
    transactionManager,
    input,
    { kind: "role", role },
    async (context, ids, target) => {
      const membership = await context.memberships.assignRole({
        expectedVersion: normalizeExpectedVersion(input.expectedVersion),
        id: ids.membershipId,
        organizationId: ids.organizationId,
        role,
      });
      return {
        audit: {
          action: "TEAM_MEMBER_ROLE_CHANGED" as const,
          metadata: { fromRole: target.role, toRole: role },
        },
        membership,
        revoke: target.role !== role,
      };
    },
  );
}

export async function changeTeamMemberStatus(
  transactionManager: TeamMembershipTransactionManager,
  input: MembershipChangeInput & { status: OrganizationMembershipStatus },
): Promise<TeamMembershipChangeResult> {
  const status = normalizeMembershipStatus(input.status);
  return applyMembershipChange(
    transactionManager,
    input,
    { kind: "status", status },
    async (context, ids, target) => {
      const membership = await context.memberships.changeStatus({
        expectedVersion: normalizeExpectedVersion(input.expectedVersion),
        id: ids.membershipId,
        organizationId: ids.organizationId,
        status,
      });
      return {
        audit: {
          action: "TEAM_MEMBER_STATUS_CHANGED" as const,
          metadata: { fromStatus: target.status, toStatus: status },
        },
        membership,
        revoke: target.status === "ACTIVE" && status !== "ACTIVE",
      };
    },
  );
}

async function applyMembershipChange(
  transactionManager: TeamMembershipTransactionManager,
  input: MembershipChangeInput,
  change: TeamMembershipChange,
  write: (
    context: TeamMembershipTransactionContext,
    ids: { membershipId: string; organizationId: string },
    target: OrganizationMembership,
  ) => Promise<{
    audit: {
      action: "TEAM_MEMBER_ROLE_CHANGED" | "TEAM_MEMBER_STATUS_CHANGED";
      metadata: Record<string, string>;
    };
    membership: OrganizationMembership | null;
    revoke: boolean;
  }>,
): Promise<TeamMembershipChangeResult> {
  const organizationId = assertIdentityId(
    input.organizationId,
    "organizationId",
  );
  const membershipId = assertIdentityId(input.membershipId, "membershipId");
  const actorUserId = assertIdentityId(input.actorUserId, "actorUserId");

  return transactionManager.execute(async (context) => {
    const members = await context.lockOrganizationMemberships(organizationId);
    const actor = members.find(
      (member) => member.userId === actorUserId && member.status === "ACTIVE",
    );
    if (!actor) {
      throw new AuthorizationError(
        "Your organization membership is not active.",
      );
    }
    const target = members.find((member) => member.id === membershipId) ?? null;
    assertTeamMembershipChangeAllowed({ actor, change, members, target });
    if (!target) throw new NotFoundError("Team member was not found.");

    const result = await write(
      context,
      { membershipId, organizationId },
      target,
    );
    if (!result.membership) {
      throw new ConflictError("Expected membership version did not match.");
    }
    const revokedSessionCount = result.revoke
      ? await context.workforceSessions.revokeAllForUser({
          organizationId,
          revokedAt: input.now ?? new Date(),
          userId: target.userId,
        })
      : 0;

    // Identifiers and role/status values only: no names or emails.
    await context.auditWriter.recordWithinTransaction({
      action: result.audit.action,
      actor: { userId: actorUserId },
      metadata: {
        ...result.audit.metadata,
        actorRole: actor.role,
        membershipId,
        resultingVersion: result.membership.version,
        revokedSessionCount,
        targetUserId: target.userId,
      },
      organizationId,
      resource: "ORGANIZATION_MEMBERSHIP",
      resourceId: membershipId,
    });

    return { membership: result.membership, revokedSessionCount };
  });
}
