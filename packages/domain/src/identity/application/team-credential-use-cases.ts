import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "../../errors.js";
import type { OrganizationMembership, Role, User } from "../domain/models.js";
import {
  assertIdentityId,
  normalizeExpectedVersion,
  normalizeIdentityEmail,
  normalizeIdentityName,
  normalizeRole,
} from "../domain/value-objects.js";
import {
  assertTeamMembershipChangeAllowed,
  type TeamMembershipTransactionContext,
  type TeamMembershipTransactionManager,
} from "./team-membership-use-cases.js";

/**
 * Owner-managed workforce passwords. Callers hash the password before calling
 * these use cases; plain passwords never reach the domain, the database or
 * the audit log.
 */

export const EXISTING_LOGIN_MESSAGE =
  "This email already has a password login. Use a different email, or reset that team member's password instead.";
export const CUSTOMER_ACCOUNT_MESSAGE =
  "This email belongs to a storefront customer account and cannot be used for a team login.";

export type CreateTeamMemberWithPasswordInput = {
  actorUserId: string;
  email: string;
  name: string;
  organizationId: string;
  passwordHash: string;
  role: Role;
};

export type CreateTeamMemberWithPasswordResult = {
  membership: OrganizationMembership;
  user: User;
};

/**
 * Creates (or reuses a login-less) user, the membership and the PASSWORD
 * credential in one transaction. An email that already has a password
 * credential is refused, never reused or overwritten.
 */
export async function createTeamMemberWithPassword(
  transactionManager: TeamMembershipTransactionManager,
  input: CreateTeamMemberWithPasswordInput,
): Promise<CreateTeamMemberWithPasswordResult> {
  const organizationId = assertIdentityId(
    input.organizationId,
    "organizationId",
  );
  const actorUserId = assertIdentityId(input.actorUserId, "actorUserId");
  const email = normalizeIdentityEmail(input.email);
  const role = normalizeRole(input.role);
  requirePasswordHash(input.passwordHash);

  return transactionManager.execute(async (context) => {
    const members = await context.lockOrganizationMemberships(organizationId);
    const actor = requireActiveActor(members, actorUserId);
    assertTeamMembershipChangeAllowed({
      actor,
      change: { kind: "create", role },
      members,
      target: null,
    });

    if (await context.credentials.findByProviderIdentifier("PASSWORD", email)) {
      throw new ConflictError(EXISTING_LOGIN_MESSAGE);
    }

    let user = await context.users.findByEmail(email);
    if (user) {
      if (await context.userHasCustomerAccount(user.id)) {
        throw new ConflictError(CUSTOMER_ACCOUNT_MESSAGE);
      }
      if (user.status !== "ACTIVE") {
        throw new BusinessRuleError(
          "Inactive users cannot receive membership.",
        );
      }
      if (
        await context.memberships.findByUserAndOrganization(
          user.id,
          organizationId,
        )
      ) {
        throw new ConflictError("This person is already a team member.");
      }
    } else {
      user = await context.users.create({
        email,
        name: normalizeIdentityName(input.name),
        status: "ACTIVE",
      });
    }

    const membership = await context.memberships.create({
      organizationId,
      role,
      status: "ACTIVE",
      userId: user.id,
    });
    await context.credentials.create({
      identifier: email,
      passwordHash: input.passwordHash,
      provider: "PASSWORD",
      status: "ACTIVE",
      userId: user.id,
    });

    // Ids and the role only: no email, name or password.
    await context.auditWriter.recordWithinTransaction({
      action: "TEAM_MEMBER_PASSWORD_SET",
      actor: { userId: actorUserId },
      metadata: {
        actorRole: actor.role,
        membershipId: membership.id,
        role,
        targetUserId: user.id,
      },
      organizationId,
      resource: "ORGANIZATION_MEMBERSHIP",
      resourceId: membership.id,
    });

    return { membership, user };
  });
}

export type ResetTeamMemberPasswordInput = {
  actorUserId: string;
  /** The membership version the screen showed; stale screens are refused. */
  expectedVersion: number;
  membershipId: string;
  now?: Date;
  organizationId: string;
  passwordHash: string;
};

export type ResetTeamMemberPasswordResult = {
  membership: OrganizationMembership;
  revokedSessionCount: number;
};

/**
 * Sets a team member's password. Follows the team rules (not your own, and
 * owner/admin passwords only by an owner). Bumps the credential version and
 * revokes every workforce session of that user, like the maintenance flow.
 * A member without a password login gets one.
 */
export async function resetTeamMemberPassword(
  transactionManager: TeamMembershipTransactionManager,
  input: ResetTeamMemberPasswordInput,
): Promise<ResetTeamMemberPasswordResult> {
  const organizationId = assertIdentityId(
    input.organizationId,
    "organizationId",
  );
  const membershipId = assertIdentityId(input.membershipId, "membershipId");
  const actorUserId = assertIdentityId(input.actorUserId, "actorUserId");
  const expectedVersion = normalizeExpectedVersion(input.expectedVersion);
  requirePasswordHash(input.passwordHash);

  return transactionManager.execute(async (context) => {
    const members = await context.lockOrganizationMemberships(organizationId);
    const actor = requireActiveActor(members, actorUserId);
    const target = members.find((member) => member.id === membershipId) ?? null;
    assertTeamMembershipChangeAllowed({
      actor,
      change: { kind: "password" },
      members,
      target,
    });
    if (!target) throw new NotFoundError("Team member was not found.");
    if (target.version !== expectedVersion) {
      throw new ConflictError("Expected membership version did not match.");
    }

    const user = await context.users.findById(target.userId);
    if (!user) throw new NotFoundError("Team member was not found.");
    if (user.status !== "ACTIVE") {
      throw new BusinessRuleError("Target user is not active.");
    }
    if (await context.userHasCustomerAccount(user.id)) {
      throw new BusinessRuleError(CUSTOMER_ACCOUNT_MESSAGE);
    }

    const resultingVersion = await setOrReplacePassword(
      context,
      user,
      input.passwordHash,
    );
    const revokedSessionCount =
      await context.workforceSessions.revokeAllWorkforceSessionsForUser({
        revokedAt: input.now ?? new Date(),
        userId: user.id,
      });

    await context.auditWriter.recordWithinTransaction({
      action: "TEAM_MEMBER_PASSWORD_RESET",
      actor: { userId: actorUserId },
      metadata: {
        actorRole: actor.role,
        membershipId,
        resultingVersion,
        revokedSessionCount,
        targetUserId: user.id,
      },
      organizationId,
      resource: "ORGANIZATION_MEMBERSHIP",
      resourceId: membershipId,
    });

    return { membership: target, revokedSessionCount };
  });
}

async function setOrReplacePassword(
  context: TeamMembershipTransactionContext,
  user: User,
  passwordHash: string,
): Promise<number> {
  const existing = await context.credentials.findByProviderIdentifier(
    "PASSWORD",
    user.email,
  );
  if (!existing) {
    const created = await context.credentials.create({
      identifier: user.email,
      passwordHash,
      provider: "PASSWORD",
      status: "ACTIVE",
      userId: user.id,
    });
    return created.version;
  }
  if (existing.userId !== user.id) {
    throw new ConflictError(EXISTING_LOGIN_MESSAGE);
  }
  if (existing.status !== "ACTIVE") {
    throw new BusinessRuleError("This team member's login is disabled.");
  }
  const updated = await context.credentials.replacePassword({
    expectedVersion: existing.version,
    id: existing.id,
    passwordHash,
    userId: user.id,
  });
  if (!updated) {
    throw new ConflictError(
      "The password was changed at the same time. Try again.",
    );
  }
  return updated.version;
}

function requireActiveActor(
  members: readonly OrganizationMembership[],
  actorUserId: string,
): OrganizationMembership {
  const actor = members.find(
    (member) => member.userId === actorUserId && member.status === "ACTIVE",
  );
  if (!actor) {
    throw new AuthorizationError("Your organization membership is not active.");
  }
  return actor;
}

function requirePasswordHash(passwordHash: string) {
  if (typeof passwordHash !== "string" || passwordHash.length === 0) {
    throw new BusinessRuleError("A hashed password is required.");
  }
}
