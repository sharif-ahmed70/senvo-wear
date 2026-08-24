import type {
  AuthenticationSession,
  CredentialStatus,
  IdentityProvider,
  UserCredential,
} from "../domain/models.js";

export type AuthenticationSessionRepository = {
  create(
    record: Omit<AuthenticationSession, "sessionId">,
  ): Promise<AuthenticationSession>;
  findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthenticationSession | null>;
  revoke(id: string, revokedAt: Date): Promise<boolean>;
};

export type CreateUserCredentialRecord = {
  identifier: string;
  passwordHash: string | null;
  provider: IdentityProvider;
  status: CredentialStatus;
  userId: string;
};

export type UserCredentialRepository = {
  changeStatus(record: {
    expectedVersion: number;
    id: string;
    status: CredentialStatus;
  }): Promise<UserCredential | null>;
  create(record: CreateUserCredentialRecord): Promise<UserCredential>;
  findById(id: string): Promise<UserCredential | null>;
  findByProviderIdentifier(
    provider: IdentityProvider,
    identifier: string,
  ): Promise<UserCredential | null>;
};
