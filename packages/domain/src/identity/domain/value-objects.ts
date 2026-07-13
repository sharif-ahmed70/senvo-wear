import { ValidationApplicationError } from "../../errors.js";
import type {
  OrganizationMembershipStatus,
  Role,
  UserStatus,
} from "./models.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const roles: readonly Role[] = ["OWNER", "ADMIN", "MANAGER", "STAFF"];
const userStatuses: readonly UserStatus[] = ["ACTIVE", "INACTIVE", "LOCKED"];
const membershipStatuses: readonly OrganizationMembershipStatus[] = [
  "ACTIVE",
  "INACTIVE",
];

export function assertIdentityId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

export function normalizeIdentityEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !emailPattern.test(normalized)) {
    throw new ValidationApplicationError("email must be valid.");
  }
  return normalized;
}

export function normalizeIdentityName(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.trim().replaceAll(/\s+/gu, " ");
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > 160) {
    throw new ValidationApplicationError(
      "name must be 160 characters or fewer.",
    );
  }
  return normalized;
}

export function normalizeRole(value: Role): Role {
  if (!roles.includes(value)) {
    throw new ValidationApplicationError("role is invalid.");
  }
  return value;
}

export function normalizeUserStatus(value?: UserStatus): UserStatus {
  if (value === undefined) {
    return "ACTIVE";
  }
  if (!userStatuses.includes(value)) {
    throw new ValidationApplicationError("user status is invalid.");
  }
  return value;
}

export function normalizeMembershipStatus(
  value?: OrganizationMembershipStatus,
): OrganizationMembershipStatus {
  if (value === undefined) {
    return "ACTIVE";
  }
  if (!membershipStatuses.includes(value)) {
    throw new ValidationApplicationError("membership status is invalid.");
  }
  return value;
}

export function normalizeExpectedVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationApplicationError(
      "expectedVersion must be a positive integer.",
    );
  }
  return value;
}
