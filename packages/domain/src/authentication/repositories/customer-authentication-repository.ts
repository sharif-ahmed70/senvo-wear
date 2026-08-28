import type {
  AuthenticationChallenge,
  AuthenticationChallengeType,
  AuthenticationSession,
  CustomerAuthenticationProfile,
  CustomerAccountStatus,
  IdentityProvider,
} from "../domain/models.js";

export type PasswordCustomerRecord = CustomerAuthenticationProfile & {
  credentialId: string;
  credentialStatus: "ACTIVE" | "INACTIVE";
  passwordHash: string;
  userStatus: "ACTIVE" | "INACTIVE" | "LOCKED";
};

export type CustomerAuthenticationRepository = {
  consumeChallenge(input: {
    challengeId: string;
    consumedAt: Date;
    expectedAttempts: number;
  }): Promise<boolean>;
  createChallenge(
    input: Omit<AuthenticationChallenge, "attempts" | "consumedAt" | "status">,
  ): Promise<AuthenticationChallenge>;
  createPasswordCustomer(input: {
    customerAccountId: string;
    email: string;
    firstName: string;
    lastName: string;
    marketingConsent: boolean;
    organizationId: string;
    passwordCredentialId: string;
    passwordHash: string;
    phone: string | null;
    termsAcceptedAt: Date;
    userId: string;
  }): Promise<CustomerAuthenticationProfile>;
  createPasswordlessCustomer(input: {
    customerAccountId: string;
    email: string;
    firstName: string;
    identifier: string;
    lastName: string;
    organizationId: string;
    phone: string | null;
    provider: Extract<IdentityProvider, "EMAIL_OTP" | "GOOGLE" | "PHONE_OTP">;
    providerCredentialId: string;
    termsAcceptedAt: Date;
    userId: string;
  }): Promise<CustomerAuthenticationProfile>;
  createSession(input: AuthenticationSession): Promise<AuthenticationSession>;
  findActiveChallenge(input: {
    destination: string;
    organizationId: string;
    type: AuthenticationChallengeType;
  }): Promise<AuthenticationChallenge | null>;
  findChallengeById(input: {
    challengeId: string;
    organizationId: string;
    type: AuthenticationChallengeType;
  }): Promise<AuthenticationChallenge | null>;
  findCustomerByEmail(
    organizationId: string,
    email: string,
  ): Promise<CustomerAuthenticationProfile | null>;
  findCustomerByPhone(
    organizationId: string,
    phone: string,
  ): Promise<CustomerAuthenticationProfile | null>;
  findProviderIdentityOwner(input: {
    identifier: string;
    provider: Extract<IdentityProvider, "EMAIL_OTP" | "GOOGLE" | "PHONE_OTP">;
  }): Promise<string | null>;
  findOrganizationIdByCode(code: string): Promise<string | null>;
  findPasswordCustomer(
    organizationId: string,
    email: string,
  ): Promise<PasswordCustomerRecord | null>;
  findSession(
    organizationId: string,
    tokenHash: string,
  ): Promise<{
    profile: CustomerAuthenticationProfile;
    session: AuthenticationSession;
    userStatus: "ACTIVE" | "INACTIVE" | "LOCKED";
  } | null>;
  incrementChallengeAttempts(input: {
    challengeId: string;
    expectedAttempts: number;
  }): Promise<boolean>;
  consumeRateLimit(input: {
    action: string;
    blockForMs: number;
    keyHash: string;
    maximumAttempts: number;
    now: Date;
    organizationId: string;
    windowMs: number;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  invalidateChallenges(input: {
    destination: string;
    organizationId: string;
    type: AuthenticationChallengeType;
  }): Promise<void>;
  linkProviderIdentity(input: {
    credentialId: string;
    identifier: string;
    provider: Extract<IdentityProvider, "EMAIL_OTP" | "GOOGLE" | "PHONE_OTP">;
    userId: string;
  }): Promise<void>;
  markEmailVerified(input: {
    organizationId: string;
    userId: string;
    verifiedAt: Date;
  }): Promise<void>;
  markPhoneVerified(input: {
    organizationId: string;
    phone: string;
    userId: string;
    verifiedAt: Date;
  }): Promise<void>;
  replacePassword(input: {
    organizationId: string;
    passwordHash: string;
    revokedAt: Date;
    userId: string;
  }): Promise<void>;
  revokeAllSessions(input: {
    organizationId: string;
    revokedAt: Date;
    userId: string;
  }): Promise<number>;
  revokeSession(input: {
    organizationId: string;
    revokedAt: Date;
    tokenHash: string;
  }): Promise<boolean>;
};

export type CustomerAuthenticationStatus = CustomerAccountStatus;
