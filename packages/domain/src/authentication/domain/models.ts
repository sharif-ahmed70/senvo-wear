export type IdentityProvider = "PASSWORD" | "GOOGLE" | "MICROSOFT";

export type CredentialStatus = "ACTIVE" | "INACTIVE";

export type UserCredential = {
  createdAt: Date;
  id: string;
  identifier: string;
  passwordHash: string | null;
  provider: IdentityProvider;
  status: CredentialStatus;
  updatedAt: Date;
  userId: string;
  version: number;
};

export type AuthenticatedPrincipal = {
  authenticatedUserId: string;
  provider: IdentityProvider;
  requestId: string;
};

export type AuthenticationContext = {
  authenticatedUserId: string;
  organizationId?: string | null;
  requestId: string;
};

export type AuthenticationSessionBoundary = {
  authenticatedUserId: string;
  expiresAt: Date | null;
  issuedAt: Date;
  provider: IdentityProvider;
  sessionId: string;
};

export type AuthenticationSession = {
  expiresAt: Date;
  id: string;
  issuedAt: Date;
  organizationId: string;
  provider: IdentityProvider;
  revokedAt: Date | null;
  sessionId: string;
  tokenHash: string;
  userId: string;
};

export type PasswordHasher = {
  hash(plainTextPassword: string): Promise<string>;
  verify(plainTextPassword: string, passwordHash: string): Promise<boolean>;
};
