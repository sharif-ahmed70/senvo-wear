import {
  AuthenticationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "../../errors.js";
import { normalizeExpectedVersion } from "../../identity/domain/value-objects.js";
import type { UserRepository } from "../../identity/repositories/identity-repositories.js";
import type {
  AuthenticatedPrincipal,
  CredentialStatus,
  IdentityProvider,
  UserCredential,
} from "../domain/models.js";
import {
  assertAuthenticationId,
  normalizeAuthenticationRequestId,
  normalizeCredentialIdentifier,
  normalizeCredentialStatus,
  normalizeIdentityProvider,
  normalizePasswordHash,
} from "../domain/value-objects.js";
import type { UserCredentialRepository } from "../repositories/authentication-repositories.js";

export type AuthenticationRequest = {
  identifier: string;
  provider: IdentityProvider;
  requestId: string;
};

export type AuthenticationService = {
  authenticate(request: AuthenticationRequest): Promise<AuthenticatedPrincipal>;
};

export type CreateUserCredentialInput = {
  identifier: string;
  passwordHash?: string | null;
  provider: IdentityProvider;
  status?: CredentialStatus;
  userId: string;
};

export async function createUserCredential(
  repositories: {
    credentials: UserCredentialRepository;
    users: UserRepository;
  },
  input: CreateUserCredentialInput,
): Promise<UserCredential> {
  const userId = assertAuthenticationId(input.userId, "userId");
  const provider = normalizeIdentityProvider(input.provider);
  const identifier = normalizeCredentialIdentifier(input.identifier);
  const user = await repositories.users.findById(userId);
  if (!user) {
    throw new NotFoundError("User was not found.");
  }
  if (user.status !== "ACTIVE") {
    throw new BusinessRuleError(
      "Inactive users cannot receive authentication credentials.",
    );
  }
  if (
    await repositories.credentials.findByProviderIdentifier(
      provider,
      identifier,
    )
  ) {
    throw new ConflictError("Credential provider identifier already exists.");
  }
  const passwordHash = normalizePasswordHash(input.passwordHash);
  if (provider === "PASSWORD" && !passwordHash) {
    throw new BusinessRuleError("Password credentials require passwordHash.");
  }
  return repositories.credentials.create({
    identifier,
    passwordHash,
    provider,
    status: normalizeCredentialStatus(input.status),
    userId,
  });
}

export type DisableUserCredentialInput = {
  credentialId: string;
  expectedVersion: number;
};

export async function disableUserCredential(
  repository: UserCredentialRepository,
  input: DisableUserCredentialInput,
): Promise<UserCredential> {
  const credential = await repository.changeStatus({
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    id: assertAuthenticationId(input.credentialId, "credentialId"),
    status: "INACTIVE",
  });
  if (!credential) {
    throw new ConflictError("Expected credential version did not match.");
  }
  return credential;
}

export async function authenticateCredential(
  repositories: {
    credentials: UserCredentialRepository;
    users: UserRepository;
  },
  request: AuthenticationRequest,
): Promise<AuthenticatedPrincipal> {
  const provider = normalizeIdentityProvider(request.provider);
  const identifier = normalizeCredentialIdentifier(request.identifier);
  const requestId = normalizeAuthenticationRequestId(request.requestId);
  const credential = await repositories.credentials.findByProviderIdentifier(
    provider,
    identifier,
  );
  if (!credential) {
    throw new AuthenticationError("Authentication identity was not found.");
  }
  if (credential.status !== "ACTIVE") {
    throw new AuthenticationError("Authentication credential is inactive.");
  }
  const user = await repositories.users.findById(credential.userId);
  if (!user || user.status !== "ACTIVE") {
    throw new AuthenticationError("Authenticated user is inactive.");
  }
  return {
    authenticatedUserId: user.id,
    provider,
    requestId,
  };
}
