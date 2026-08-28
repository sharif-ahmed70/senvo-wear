/* eslint-disable @typescript-eslint/unbound-method */
import { ConflictError } from "@senvo/domain";
import type {
  AuthenticationChallenge,
  AuthenticationMessageProvider,
  AuthenticationSecretService,
  AuthenticationSession,
  CustomerAuthenticationProfile,
  CustomerAuthenticationRepository,
  GoogleOAuthProvider,
  PasswordCustomerRecord,
  PasswordHasher,
} from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import { CustomerAuthenticationService } from "./customer-authentication-service.js";

const now = new Date("2026-08-25T10:00:00.000Z");
const profile: CustomerAuthenticationProfile = {
  customerAccountId: "customer-1",
  email: "customer@example.com",
  emailVerified: true,
  firstName: "SENVO",
  lastName: "Customer",
  organizationId: "organization-1",
  phone: "+8801712345678",
  phoneVerified: true,
  status: "ACTIVE",
  userId: "user-1",
};

describe("CustomerAuthenticationService", () => {
  it("normalizes registration identity and creates an opaque session", async () => {
    const harness = createHarness();
    const result = await harness.service.register(registration());

    expect(harness.repository.createPasswordCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "customer@example.com",
        phone: "+8801712345678",
      }),
    );
    expect(harness.repository.createSession).toHaveBeenCalledOnce();
    expect(result.profile).toEqual(profile);
    expect(result.sessionToken).toMatch(/^token-/u);
  });

  it("rejects weak passwords before writing an account", async () => {
    const harness = createHarness();
    await expect(
      harness.service.register(registration({ password: "weak" })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(harness.repository.createPasswordCustomer).not.toHaveBeenCalled();
  });

  it("normalizes duplicate identity persistence errors to a conflict", async () => {
    const harness = createHarness({
      createPasswordCustomer: vi.fn(() =>
        Promise.reject(new ConflictError("duplicate")),
      ),
    });
    await expect(
      harness.service.register(registration()),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("uses the same generic failure for an unknown email and wrong password", async () => {
    const unknown = createHarness({ findPasswordCustomer: vi.fn(() => null) });
    const wrong = createHarness({
      findPasswordCustomer: vi.fn(() => passwordRecord()),
      passwordValid: false,
    });

    for (const harness of [unknown, wrong]) {
      await expect(harness.service.login(login())).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect.",
      });
    }
  });

  it("blocks disabled customer profiles on the server", async () => {
    const harness = createHarness({
      findPasswordCustomer: vi.fn(() => passwordRecord({ status: "DISABLED" })),
    });
    await expect(harness.service.login(login())).rejects.toMatchObject({
      code: "ACCOUNT_DISABLED",
    });
  });

  it("keeps a pending-verification customer session authenticated", async () => {
    const pending = { ...profile, status: "PENDING_VERIFICATION" as const };
    const harness = createHarness({
      findSession: vi.fn(() => ({
        profile: pending,
        session: {
          createdAt: now,
          csrfTokenHash: "hash:csrf",
          expiresAt: new Date(now.getTime() + 60_000),
          id: "session-1",
          lastUsedAt: now,
          organizationId: profile.organizationId,
          rememberMe: false,
          revokedAt: null,
          tokenHash: "hash:session-token",
          userId: profile.userId,
        },
        userStatus: "ACTIVE",
      })),
    });

    await expect(
      harness.service.authenticateSession("session-token"),
    ).resolves.toMatchObject({ profile: pending });
  });

  it("accepts a valid OTP once and rejects its replay", async () => {
    let consumed = false;
    const harness = createHarness({
      consumeChallenge: vi.fn(() => {
        if (consumed) return false;
        consumed = true;
        return true;
      }),
      findActiveChallenge: vi.fn(() => activeChallenge()),
      findCustomerByEmail: vi.fn(() => profile),
    });

    await expect(harness.service.verifyOtp(otp())).resolves.toMatchObject({
      profile,
    });
    await expect(harness.service.verifyOtp(otp())).rejects.toMatchObject({
      code: "INVALID_CHALLENGE",
    });
  });

  it("rejects invalid, expired, and attempt-exhausted OTP challenges", async () => {
    const invalid = createHarness({
      findActiveChallenge: vi.fn(() => activeChallenge()),
      findCustomerByEmail: vi.fn(() => profile),
      validSecret: false,
    });
    await expect(invalid.service.verifyOtp(otp())).rejects.toMatchObject({
      code: "INVALID_CHALLENGE",
    });
    expect(
      invalid.repository.incrementChallengeAttempts,
    ).toHaveBeenCalledOnce();

    for (const challenge of [
      activeChallenge({ expiresAt: new Date(now.getTime() - 1) }),
      activeChallenge({ attempts: 5 }),
    ]) {
      const harness = createHarness({
        findActiveChallenge: vi.fn(() => challenge),
        findCustomerByEmail: vi.fn(() => profile),
      });
      await expect(harness.service.verifyOtp(otp())).rejects.toMatchObject({
        code: "INVALID_CHALLENGE",
      });
    }
  });

  it("consumes reset tokens and delegates password replacement with session revocation", async () => {
    const challenge = activeChallenge({
      destination: profile.email,
      type: "PASSWORD_RESET",
      userId: profile.userId,
    });
    const harness = createHarness({
      findChallengeById: vi.fn(() => challenge),
      findCustomerByEmail: vi.fn(() => profile),
    });

    await harness.service.resetPassword({
      challengeId: challenge.id,
      confirmPassword: "New!Password123",
      password: "New!Password123",
      token: "123456",
    });
    expect(harness.repository.replacePassword).toHaveBeenCalledWith(
      expect.objectContaining({ userId: profile.userId }),
    );
  });

  it("does not link a Google identity owned by another canonical user", async () => {
    const challenge = activeChallenge({
      destination: "google-oauth",
      type: "GOOGLE_OAUTH_STATE",
      userId: null,
    });
    const harness = createHarness({
      findChallengeById: vi.fn(() => challenge),
      findCustomerByEmail: vi.fn(() => profile),
      findProviderIdentityOwner: vi.fn(() => "another-user"),
      google: googleProvider(),
    });

    await expect(
      harness.service.completeGoogle({
        challengeId: challenge.id,
        code: "authorization-code",
        codeVerifier: "verifier",
        state: "123456",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(harness.repository.linkProviderIdentity).not.toHaveBeenCalled();
  });

  it("binds Google account creation consent to the persisted challenge", async () => {
    const start = createHarness({ google: googleProvider() });
    await start.service.startGoogle({ termsAccepted: true });
    expect(start.repository.createChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: "google-oauth:account-creation-approved",
        type: "GOOGLE_OAUTH_STATE",
      }),
    );

    const noConsentChallenge = activeChallenge({
      destination: "google-oauth:existing-account",
      type: "GOOGLE_OAUTH_STATE",
      userId: null,
    });
    const complete = createHarness({
      findChallengeById: vi.fn(() => noConsentChallenge),
      findCustomerByEmail: vi.fn(() => null),
      google: googleProvider(),
    });

    await expect(
      complete.service.completeGoogle({
        challengeId: noConsentChallenge.id,
        code: "authorization-code",
        codeVerifier: "verifier",
        state: "123456",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Terms acceptance is required to create an account.",
    });
    expect(
      complete.repository.createPasswordlessCustomer,
    ).not.toHaveBeenCalled();
  });

  it("normalizes a concurrent phone identity collision", async () => {
    const unverified = { ...profile, phoneVerified: false };
    const challenge = activeChallenge({
      destination: profile.phone ?? "",
      type: "PHONE_OTP",
    });
    const harness = createHarness({
      findActiveChallenge: vi.fn(() => challenge),
      findCustomerByPhone: vi.fn(() => unverified),
      markPhoneVerified: vi.fn(() =>
        Promise.reject(new ConflictError("duplicate phone")),
      ),
    });

    await expect(
      harness.service.verifyOtp({
        channel: "PHONE",
        code: "123456",
        destination: profile.phone ?? "",
        rememberMe: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("enforces persistent repository-backed rate limits", async () => {
    const harness = createHarness({
      consumeRateLimit: vi.fn(() => ({
        allowed: false,
        retryAfterSeconds: 120,
      })),
    });
    await expect(harness.service.login(login())).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 120,
    });
  });
});

type Overrides = {
  [key: string]: unknown;
  google?: GoogleOAuthProvider;
  passwordValid?: boolean;
  validSecret?: boolean;
};

function createHarness(overrides: Overrides = {}) {
  let id = 0;
  const repository = {
    consumeChallenge: vi.fn(() => true),
    consumeRateLimit: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })),
    createChallenge: vi.fn(() => activeChallenge()),
    createPasswordCustomer: vi.fn(() => profile),
    createPasswordlessCustomer: vi.fn(() => profile),
    createSession: vi.fn((input: AuthenticationSession) => input),
    findActiveChallenge: vi.fn(() => null),
    findChallengeById: vi.fn(() => null),
    findCustomerByEmail: vi.fn(() => null),
    findCustomerByPhone: vi.fn(() => null),
    findOrganizationIdByCode: vi.fn(() => profile.organizationId),
    findPasswordCustomer: vi.fn(() => passwordRecord()),
    findProviderIdentityOwner: vi.fn(() => null),
    findSession: vi.fn(() => null),
    incrementChallengeAttempts: vi.fn(() => true),
    invalidateChallenges: vi.fn(() => undefined),
    linkProviderIdentity: vi.fn(() => undefined),
    markEmailVerified: vi.fn(() => undefined),
    markPhoneVerified: vi.fn(() => undefined),
    replacePassword: vi.fn(() => undefined),
    revokeAllSessions: vi.fn(() => 1),
    revokeSession: vi.fn(() => true),
    ...overrides,
  } as unknown as CustomerAuthenticationRepository;
  const passwords: PasswordHasher = {
    hash: vi.fn((value) => Promise.resolve("hash:" + value)),
    verify: vi.fn(() => Promise.resolve(overrides.passwordValid ?? true)),
  };
  const secrets: AuthenticationSecretService = {
    generateCode: () => "123456",
    generateToken: () => "token-" + ++id,
    hashSecret: (value) => "hash:" + value,
    verifySecret: () => overrides.validSecret ?? true,
  };
  const messages: AuthenticationMessageProvider = {
    sendEmailOtp: vi.fn(() => Promise.resolve("SENT" as const)),
    sendEmailVerification: vi.fn(() => Promise.resolve("SENT" as const)),
    sendPasswordReset: vi.fn(() => Promise.resolve("SENT" as const)),
    sendPhoneOtp: vi.fn(() => Promise.resolve("SENT" as const)),
  };
  return {
    repository,
    service: new CustomerAuthenticationService({
      clock: () => now,
      fallbackPasswordHash: "fallback",
      google: overrides.google,
      idGenerator: () => "id-" + ++id,
      messages,
      organizationCode: "SENVO",
      passwords,
      repository,
      secrets,
    }),
  };
}

function registration(overrides = {}) {
  return {
    confirmPassword: "Strong!Password123",
    email: " Customer@Example.com ",
    firstName: "SENVO",
    lastName: "Customer",
    marketingConsent: false,
    password: "Strong!Password123",
    phone: "01712345678",
    rememberMe: false,
    termsAccepted: true as const,
    ...overrides,
  };
}

function login() {
  return {
    email: profile.email,
    password: "Strong!Password123",
    rememberMe: false,
  };
}

function otp() {
  return {
    channel: "EMAIL" as const,
    code: "123456",
    destination: profile.email,
    rememberMe: false,
  };
}

function activeChallenge(
  overrides: Partial<AuthenticationChallenge> = {},
): AuthenticationChallenge {
  return {
    attempts: 0,
    consumedAt: null,
    destination: profile.email,
    expiresAt: new Date(now.getTime() + 60_000),
    id: "challenge-1",
    maxAttempts: 5,
    nextResendAt: now,
    organizationId: profile.organizationId,
    secretHash: "hash:challenge-1:123456",
    status: "ACTIVE",
    type: "EMAIL_OTP",
    userId: profile.userId,
    ...overrides,
  };
}

function passwordRecord(
  overrides: Partial<CustomerAuthenticationProfile> = {},
): PasswordCustomerRecord {
  return {
    ...profile,
    credentialId: "credential-1",
    credentialStatus: "ACTIVE",
    passwordHash: "hash",
    userStatus: "ACTIVE",
    ...overrides,
  };
}

function googleProvider(): GoogleOAuthProvider {
  return {
    authorizationRequest: () => ({
      codeVerifier: "verifier",
      url: "https://accounts.google.com/o/oauth2/v2/auth",
    }),
    exchange: () =>
      Promise.resolve({
        email: profile.email,
        emailVerified: true,
        firstName: profile.firstName,
        lastName: profile.lastName,
        subject: "google-subject",
      }),
  };
}
