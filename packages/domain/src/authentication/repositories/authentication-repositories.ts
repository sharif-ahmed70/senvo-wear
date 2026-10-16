import type {
  CredentialStatus,
  IdentityProvider,
  UserCredential,
} from "../domain/models.js";

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
  replacePassword(record: {
    expectedVersion: number;
    id: string;
    passwordHash: string;
    userId: string;
  }): Promise<UserCredential | null>;
};
