import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "../../errors.js";
import type { OrganizationLookupRepository } from "../../organization/repositories/organization-repositories.js";
import type { OrganizationMembership, Role, User } from "../domain/models.js";
import {
  assertIdentityId,
  normalizeExpectedVersion,
  normalizeIdentityEmail,
  normalizeIdentityName,
  normalizeMembershipStatus,
  normalizeRole,
  normalizeUserStatus,
} from "../domain/value-objects.js";
import type {
  OrganizationMembershipRepository,
  UserRepository,
} from "../repositories/identity-repositories.js";

export type CreateUserInput = {
  email: string;
  name?: string | null;
  status?: User["status"];
};

export async function createUser(
  repository: UserRepository,
  input: CreateUserInput,
): Promise<User> {
  const email = normalizeIdentityEmail(input.email);
  if (await repository.findByEmail(email)) {
    throw new ConflictError("User email already exists.");
  }
  return repository.create({
    email,
    name: normalizeIdentityName(input.name),
    status: normalizeUserStatus(input.status),
  });
}

export type CreateOrganizationMembershipInput = {
  organizationId: string;
  role: Role;
  status?: OrganizationMembership["status"];
  userId: string;
};

export async function createOrganizationMembership(
  repositories: {
    memberships: OrganizationMembershipRepository;
    organizations: OrganizationLookupRepository;
    users: UserRepository;
  },
  input: CreateOrganizationMembershipInput,
): Promise<OrganizationMembership> {
  const userId = assertIdentityId(input.userId, "userId");
  const organizationId = assertIdentityId(
    input.organizationId,
    "organizationId",
  );
  const user = await requireUser(repositories.users, userId);
  await requireOrganization(repositories.organizations, organizationId);
  if (user.status !== "ACTIVE") {
    throw new BusinessRuleError("Inactive users cannot receive membership.");
  }
  if (
    await repositories.memberships.findByUserAndOrganization(
      userId,
      organizationId,
    )
  ) {
    throw new ConflictError("Organization membership already exists.");
  }
  return repositories.memberships.create({
    organizationId,
    role: normalizeRole(input.role),
    status: normalizeMembershipStatus(input.status),
    userId,
  });
}

export type UpdateMembershipStatusInput = {
  expectedVersion: number;
  membershipId: string;
  organizationId: string;
  status: OrganizationMembership["status"];
};

export async function updateOrganizationMembershipStatus(
  repository: OrganizationMembershipRepository,
  input: UpdateMembershipStatusInput,
): Promise<OrganizationMembership> {
  const membership = await repository.changeStatus({
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    id: assertIdentityId(input.membershipId, "membershipId"),
    organizationId: assertIdentityId(input.organizationId, "organizationId"),
    status: normalizeMembershipStatus(input.status),
  });
  if (!membership) {
    throw new ConflictError("Expected membership version did not match.");
  }
  return membership;
}

export type AssignRoleInput = {
  expectedVersion: number;
  membershipId: string;
  organizationId: string;
  role: Role;
};

export async function assignOrganizationMembershipRole(
  repository: OrganizationMembershipRepository,
  input: AssignRoleInput,
): Promise<OrganizationMembership> {
  const membership = await repository.assignRole({
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    id: assertIdentityId(input.membershipId, "membershipId"),
    organizationId: assertIdentityId(input.organizationId, "organizationId"),
    role: normalizeRole(input.role),
  });
  if (!membership) {
    throw new ConflictError("Expected membership version did not match.");
  }
  return membership;
}

export type ValidateOrganizationAccessInput = {
  organizationId: string;
  userId: string;
};

export async function validateOrganizationAccess(
  repositories: {
    memberships: OrganizationMembershipRepository;
    users: UserRepository;
  },
  input: ValidateOrganizationAccessInput,
): Promise<OrganizationMembership> {
  const user = await requireUser(
    repositories.users,
    assertIdentityId(input.userId, "userId"),
  );
  if (user.status !== "ACTIVE") {
    throw new BusinessRuleError("Inactive users cannot access organization.");
  }
  const membership = await repositories.memberships.findByUserAndOrganization(
    user.id,
    assertIdentityId(input.organizationId, "organizationId"),
  );
  if (!membership) {
    throw new NotFoundError("Organization membership was not found.");
  }
  if (membership.status !== "ACTIVE") {
    throw new BusinessRuleError(
      "Inactive membership cannot access organization.",
    );
  }
  return membership;
}

async function requireUser(
  repository: UserRepository,
  userId: string,
): Promise<User> {
  const user = await repository.findById(userId);
  if (!user) {
    throw new NotFoundError("User was not found.");
  }
  return user;
}

async function requireOrganization(
  repository: OrganizationLookupRepository,
  organizationId: string,
): Promise<void> {
  if (!(await repository.findById(organizationId))) {
    throw new NotFoundError("Organization was not found.");
  }
}
