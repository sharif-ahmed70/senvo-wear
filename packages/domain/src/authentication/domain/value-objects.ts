import { ValidationApplicationError } from "../../errors.js";
import type { CredentialStatus, IdentityProvider } from "./models.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const providers: readonly IdentityProvider[] = [
  "PASSWORD",
  "GOOGLE",
  "MICROSOFT",
];
const statuses: readonly CredentialStatus[] = ["ACTIVE", "INACTIVE"];

export function assertAuthenticationId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

export function normalizeIdentityProvider(
  value: IdentityProvider,
): IdentityProvider {
  if (!providers.includes(value)) {
    throw new ValidationApplicationError("identity provider is invalid.");
  }
  return value;
}

export function normalizeCredentialStatus(
  value?: CredentialStatus,
): CredentialStatus {
  if (value === undefined) {
    return "ACTIVE";
  }
  if (!statuses.includes(value)) {
    throw new ValidationApplicationError("credential status is invalid.");
  }
  return value;
}

export function normalizeCredentialIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 320) {
    throw new ValidationApplicationError(
      "credential identifier must be between 3 and 320 characters.",
    );
  }
  return normalized;
}

export function normalizePasswordHash(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length < 20 || normalized.length > 1000) {
    throw new ValidationApplicationError("passwordHash is invalid.");
  }
  return normalized;
}

export function normalizeAuthenticationRequestId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/u.test(normalized)) {
    throw new ValidationApplicationError("requestId is invalid.");
  }
  return normalized;
}
