export type IdentityProvider =
  "PASSWORD" | "EMAIL_OTP" | "PHONE_OTP" | "GOOGLE" | "MICROSOFT";

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

export type PasswordHasher = {
  hash(plainTextPassword: string): Promise<string>;
  verify(plainTextPassword: string, passwordHash: string): Promise<boolean>;
};

export type CustomerAccountStatus =
  "ACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED" | "DISABLED";

export type AuthenticationChallengeType =
  | "EMAIL_OTP"
  | "PHONE_OTP"
  | "EMAIL_VERIFICATION"
  | "PASSWORD_RESET"
  | "GOOGLE_OAUTH_STATE";

export type CustomerAuthenticationProfile = {
  customerAccountId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  organizationId: string;
  phone: string | null;
  phoneVerified: boolean;
  status: CustomerAccountStatus;
  userId: string;
};

export type AuthenticationSession = {
  createdAt: Date;
  csrfTokenHash: string;
  expiresAt: Date;
  id: string;
  lastUsedAt: Date;
  organizationId: string;
  rememberMe: boolean;
  revokedAt: Date | null;
  tokenHash: string;
  userId: string;
};

export type AuthenticationChallenge = {
  attempts: number;
  consumedAt: Date | null;
  destination: string;
  expiresAt: Date;
  id: string;
  maxAttempts: number;
  nextResendAt: Date;
  organizationId: string;
  secretHash: string;
  status: "ACTIVE" | "CONSUMED" | "INVALIDATED";
  type: AuthenticationChallengeType;
  userId: string | null;
};

export type AuthenticationSecretService = {
  generateCode(): string;
  generateToken(): string;
  hashSecret(secret: string): string;
  verifySecret(secret: string, secretHash: string): boolean;
};

export type AuthenticationMessage = {
  challengeId: string;
  destination: string;
  expiresAt: Date;
  secret: string;
};

export type AuthenticationMessageProvider = {
  sendEmailOtp(message: AuthenticationMessage): Promise<"SENT" | "UNAVAILABLE">;
  sendEmailVerification(
    message: AuthenticationMessage,
  ): Promise<"SENT" | "UNAVAILABLE">;
  sendPasswordReset(
    message: AuthenticationMessage,
  ): Promise<"SENT" | "UNAVAILABLE">;
  sendPhoneOtp(message: AuthenticationMessage): Promise<"SENT" | "UNAVAILABLE">;
};

export type GoogleIdentity = {
  email: string;
  emailVerified: true;
  firstName: string;
  lastName: string;
  subject: string;
};

export type GoogleOAuthProvider = {
  authorizationRequest(input: { state: string }): {
    codeVerifier: string;
    url: string;
  };
  exchange(input: {
    code: string;
    codeVerifier: string;
  }): Promise<GoogleIdentity>;
};
