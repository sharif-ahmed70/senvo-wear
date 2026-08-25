import { randomUUID } from "node:crypto";
import type {
  AuthenticationChallenge,
  AuthenticationChallengeType,
  AuthenticationMessageProvider,
  AuthenticationSecretService,
  AuthenticationSession,
  CustomerAuthenticationProfile,
  CustomerAuthenticationRepository,
  GoogleOAuthProvider,
  PasswordHasher,
} from "@senvo/domain";
import type {
  CustomerForgotPasswordInputContract,
  CustomerLoginInputContract,
  CustomerOtpRequestInputContract,
  CustomerOtpVerifyInputContract,
  CustomerRegisterInputContract,
  CustomerResetPasswordInputContract,
  CustomerVerificationInputContract,
} from "@senvo/contracts";
import { ConflictError } from "@senvo/domain";

export type CustomerSessionResult = {
  csrfToken: string;
  expiresAt: string;
  profile: CustomerAuthenticationProfile;
  sessionToken: string;
};

export type CustomerAuthenticationServiceDependencies = {
  clock?: () => Date;
  fallbackPasswordHash: string;
  idGenerator?: () => string;
  messages: AuthenticationMessageProvider;
  organizationCode: string;
  passwords: PasswordHasher;
  repository: CustomerAuthenticationRepository;
  secrets: AuthenticationSecretService;
  google?: GoogleOAuthProvider;
};

export class CustomerAuthenticationError extends Error {
  constructor(
    readonly code:
      | "ACCOUNT_DISABLED"
      | "CONFLICT"
      | "DELIVERY_UNAVAILABLE"
      | "INVALID_CHALLENGE"
      | "INVALID_CREDENTIALS"
      | "RATE_LIMITED"
      | "UNAUTHORIZED"
      | "VALIDATION",
    message: string,
    readonly retryAfterSeconds?: number,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "CustomerAuthenticationError";
  }
}

export class CustomerAuthenticationService {
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;

  constructor(
    private readonly dependencies: CustomerAuthenticationServiceDependencies,
  ) {
    this.clock = dependencies.clock ?? (() => new Date());
    this.idGenerator = dependencies.idGenerator ?? randomUUID;
  }

  async register(
    input: CustomerRegisterInputContract,
  ): Promise<CustomerSessionResult & { verificationDelivery: DeliveryStatus }> {
    const organizationId = await this.organizationId();
    const email = normalizeEmail(input.email);
    const phone = input.phone ? normalizePhone(input.phone) : null;
    await this.rateLimit(organizationId, "REGISTER", email, 5, 60 * 60_000);
    assertPassword(input.password, email);
    const now = this.clock();
    const profile = await this.mapIdentityConflict(async () =>
      this.dependencies.repository.createPasswordCustomer({
        customerAccountId: this.idGenerator(),
        email,
        firstName: normalizeName(input.firstName, "firstName"),
        lastName: normalizeName(input.lastName, "lastName"),
        marketingConsent: input.marketingConsent,
        organizationId,
        passwordCredentialId: this.idGenerator(),
        passwordHash: await this.dependencies.passwords.hash(input.password),
        phone,
        termsAcceptedAt: now,
        userId: this.idGenerator(),
      }),
    );
    const verificationDelivery = await this.createAndDeliverChallenge({
      destination: profile.email,
      organizationId,
      type: "EMAIL_VERIFICATION",
      userId: profile.userId,
    });
    return {
      ...(await this.issueSession(profile, input.rememberMe)),
      verificationDelivery,
    };
  }

  async startGoogle(): Promise<{
    challengeId: string;
    codeVerifier: string;
    state: string;
    url: string;
  }> {
    const google = this.dependencies.google;
    if (!google) {
      throw new CustomerAuthenticationError(
        "DELIVERY_UNAVAILABLE",
        "Google sign-in is not configured.",
      );
    }
    const organizationId = await this.organizationId();
    const state = this.dependencies.secrets.generateToken();
    const challengeId = this.idGenerator();
    const now = this.clock();
    const request = google.authorizationRequest({ state });
    await this.dependencies.repository.invalidateChallenges({
      destination: "google-oauth",
      organizationId,
      type: "GOOGLE_OAUTH_STATE",
    });
    await this.dependencies.repository.createChallenge({
      destination: "google-oauth",
      expiresAt: new Date(now.getTime() + 10 * 60_000),
      id: challengeId,
      maxAttempts: 1,
      nextResendAt: now,
      organizationId,
      secretHash: this.dependencies.secrets.hashSecret(
        `${challengeId}:${state}`,
      ),
      type: "GOOGLE_OAUTH_STATE",
      userId: null,
    });
    return {
      challengeId,
      codeVerifier: request.codeVerifier,
      state,
      url: request.url,
    };
  }

  async completeGoogle(input: {
    challengeId: string;
    code: string;
    codeVerifier: string;
    state: string;
    termsAccepted: boolean;
  }): Promise<CustomerSessionResult> {
    const google = this.dependencies.google;
    if (!google) {
      throw new CustomerAuthenticationError(
        "DELIVERY_UNAVAILABLE",
        "Google sign-in is not configured.",
      );
    }
    const organizationId = await this.organizationId();
    const challenge = await this.dependencies.repository.findChallengeById({
      challengeId: input.challengeId,
      organizationId,
      type: "GOOGLE_OAUTH_STATE",
    });
    await this.verifyChallenge(challenge, input.state);
    const identity = await google.exchange({
      code: input.code,
      codeVerifier: input.codeVerifier,
    });
    const email = normalizeEmail(identity.email);
    let profile = await this.dependencies.repository.findCustomerByEmail(
      organizationId,
      email,
    );
    if (!profile) {
      if (!input.termsAccepted) {
        throw new CustomerAuthenticationError(
          "VALIDATION",
          "Terms acceptance is required to create an account.",
        );
      }
      profile = await this.mapIdentityConflict(() =>
        this.dependencies.repository.createPasswordlessCustomer({
          customerAccountId: this.idGenerator(),
          email,
          firstName: normalizeName(identity.firstName, "firstName"),
          identifier: identity.subject,
          lastName: normalizeName(identity.lastName, "lastName"),
          organizationId,
          phone: null,
          provider: "GOOGLE",
          providerCredentialId: this.idGenerator(),
          termsAcceptedAt: this.clock(),
          userId: this.idGenerator(),
        }),
      );
    } else {
      await this.ensureProviderIdentity(profile, "GOOGLE", identity.subject);
      if (!profile.emailVerified) {
        await this.dependencies.repository.markEmailVerified({
          organizationId,
          userId: profile.userId,
          verifiedAt: this.clock(),
        });
        profile = { ...profile, emailVerified: true, status: "ACTIVE" };
      }
    }
    return this.issueSession(profile, true);
  }

  async login(
    input: CustomerLoginInputContract,
  ): Promise<CustomerSessionResult> {
    const organizationId = await this.organizationId();
    const email = normalizeEmail(input.email);
    await this.rateLimit(
      organizationId,
      "PASSWORD_LOGIN",
      email,
      8,
      15 * 60_000,
    );
    const customer = await this.dependencies.repository.findPasswordCustomer(
      organizationId,
      email,
    );
    const valid = await this.dependencies.passwords.verify(
      input.password,
      customer?.passwordHash ?? this.dependencies.fallbackPasswordHash,
    );
    if (
      !customer ||
      !valid ||
      customer.credentialStatus !== "ACTIVE" ||
      customer.userStatus !== "ACTIVE"
    ) {
      throw new CustomerAuthenticationError(
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    }
    assertProfileActive(customer, true);
    return this.issueSession(customer, input.rememberMe);
  }

  async authenticateSession(
    sessionToken: string,
  ): Promise<CustomerSessionResult> {
    const organizationId = await this.organizationId();
    const tokenHash = this.dependencies.secrets.hashSecret(sessionToken);
    const record = await this.dependencies.repository.findSession(
      organizationId,
      tokenHash,
    );
    const now = this.clock();
    if (
      !record ||
      record.session.expiresAt <= now ||
      record.userStatus !== "ACTIVE"
    ) {
      throw new CustomerAuthenticationError(
        "UNAUTHORIZED",
        "Authentication is required.",
      );
    }
    assertProfileActive(record.profile, true);
    return {
      csrfToken: "",
      expiresAt: record.session.expiresAt.toISOString(),
      profile: record.profile,
      sessionToken: "",
    };
  }

  async logout(sessionToken: string): Promise<void> {
    const organizationId = await this.organizationId();
    await this.dependencies.repository.revokeSession({
      organizationId,
      revokedAt: this.clock(),
      tokenHash: this.dependencies.secrets.hashSecret(sessionToken),
    });
  }

  async authorizeMutation(
    sessionToken: string,
    csrfToken: string,
  ): Promise<CustomerAuthenticationProfile> {
    const organizationId = await this.organizationId();
    const record = await this.dependencies.repository.findSession(
      organizationId,
      this.dependencies.secrets.hashSecret(sessionToken),
    );
    const now = this.clock();
    if (
      !record ||
      record.session.expiresAt <= now ||
      record.userStatus !== "ACTIVE" ||
      !this.dependencies.secrets.verifySecret(
        csrfToken,
        record.session.csrfTokenHash,
      )
    ) {
      throw new CustomerAuthenticationError(
        "UNAUTHORIZED",
        "Authentication is required.",
      );
    }
    assertProfileActive(record.profile, true);
    return record.profile;
  }

  async logoutAll(sessionToken: string): Promise<void> {
    const authenticated = await this.authenticateSession(sessionToken);
    await this.dependencies.repository.revokeAllSessions({
      organizationId: authenticated.profile.organizationId,
      revokedAt: this.clock(),
      userId: authenticated.profile.userId,
    });
  }

  async requestOtp(
    input: CustomerOtpRequestInputContract,
  ): Promise<{ delivery: DeliveryStatus; expiresInSeconds: number }> {
    const organizationId = await this.organizationId();
    const destination = normalizeDestination(input.channel, input.destination);
    await this.rateLimit(
      organizationId,
      `${input.channel}_OTP_REQUEST`,
      destination,
      5,
      60 * 60_000,
    );
    const customer =
      input.channel === "EMAIL"
        ? await this.dependencies.repository.findCustomerByEmail(
            organizationId,
            destination,
          )
        : await this.dependencies.repository.findCustomerByPhone(
            organizationId,
            destination,
          );
    const delivery = await this.createAndDeliverChallenge({
      destination,
      organizationId,
      type: input.channel === "EMAIL" ? "EMAIL_OTP" : "PHONE_OTP",
      userId: customer?.userId ?? null,
    });
    return { delivery, expiresInSeconds: 600 };
  }

  async verifyOtp(
    input: CustomerOtpVerifyInputContract,
  ): Promise<CustomerSessionResult> {
    const organizationId = await this.organizationId();
    const destination = normalizeDestination(input.channel, input.destination);
    await this.rateLimit(
      organizationId,
      `${input.channel}_OTP_VERIFY`,
      destination,
      10,
      15 * 60_000,
    );
    const type = input.channel === "EMAIL" ? "EMAIL_OTP" : "PHONE_OTP";
    let profile =
      input.channel === "EMAIL"
        ? await this.dependencies.repository.findCustomerByEmail(
            organizationId,
            destination,
          )
        : await this.dependencies.repository.findCustomerByPhone(
            organizationId,
            destination,
          );
    if (!profile && !input.onboarding?.termsAccepted) {
      throw new CustomerAuthenticationError(
        "VALIDATION",
        "Account details and terms acceptance are required.",
      );
    }
    const challenge = await this.dependencies.repository.findActiveChallenge({
      destination,
      organizationId,
      type,
    });
    await this.verifyChallenge(challenge, input.code);
    if (!profile) {
      const onboarding = input.onboarding;
      if (!onboarding) throw invalidChallenge();
      const email =
        input.channel === "EMAIL"
          ? destination
          : normalizeEmail(onboarding.email);
      profile = await this.mapIdentityConflict(() =>
        this.dependencies.repository.createPasswordlessCustomer({
          customerAccountId: this.idGenerator(),
          email,
          firstName: normalizeName(onboarding.firstName, "firstName"),
          identifier: destination,
          lastName: normalizeName(onboarding.lastName, "lastName"),
          organizationId,
          phone: input.channel === "PHONE" ? destination : null,
          provider: input.channel === "EMAIL" ? "EMAIL_OTP" : "PHONE_OTP",
          providerCredentialId: this.idGenerator(),
          termsAcceptedAt: this.clock(),
          userId: this.idGenerator(),
        }),
      );
    } else {
      await this.ensureProviderIdentity(
        profile,
        input.channel === "EMAIL" ? "EMAIL_OTP" : "PHONE_OTP",
        destination,
      );
      if (input.channel === "EMAIL" && !profile.emailVerified) {
        await this.dependencies.repository.markEmailVerified({
          organizationId,
          userId: profile.userId,
          verifiedAt: this.clock(),
        });
        profile = { ...profile, emailVerified: true, status: "ACTIVE" };
      }
      if (input.channel === "PHONE" && !profile.phoneVerified) {
        await this.dependencies.repository.markPhoneVerified({
          organizationId,
          phone: destination,
          userId: profile.userId,
          verifiedAt: this.clock(),
        });
        profile = {
          ...profile,
          phone: destination,
          phoneVerified: true,
          status: "ACTIVE",
        };
      }
    }
    return this.issueSession(profile, input.rememberMe);
  }

  async requestPasswordReset(
    input: CustomerForgotPasswordInputContract,
  ): Promise<{ accepted: true }> {
    const organizationId = await this.organizationId();
    const email = normalizeEmail(input.email);
    await this.rateLimit(
      organizationId,
      "PASSWORD_RESET_REQUEST",
      email,
      5,
      60 * 60_000,
    );
    const profile = await this.dependencies.repository.findCustomerByEmail(
      organizationId,
      email,
    );
    if (profile) {
      await this.createAndDeliverChallenge({
        destination: email,
        organizationId,
        type: "PASSWORD_RESET",
        userId: profile.userId,
      });
    }
    return { accepted: true };
  }

  async resetPassword(
    input: CustomerResetPasswordInputContract,
  ): Promise<void> {
    const organizationId = await this.organizationId();
    const challenge = await this.dependencies.repository.findChallengeById({
      challengeId: input.challengeId,
      organizationId,
      type: "PASSWORD_RESET",
    });
    if (!challenge?.userId) {
      throw invalidChallenge();
    }
    const profile = await this.dependencies.repository.findCustomerByEmail(
      organizationId,
      challenge.destination,
    );
    if (!profile || profile.userId !== challenge.userId)
      throw invalidChallenge();
    assertPassword(input.password, profile.email);
    await this.verifyChallenge(challenge, input.token);
    await this.dependencies.repository.replacePassword({
      organizationId,
      passwordHash: await this.dependencies.passwords.hash(input.password),
      revokedAt: this.clock(),
      userId: profile.userId,
    });
  }

  async requestEmailVerification(
    sessionToken: string,
  ): Promise<{ delivery: DeliveryStatus }> {
    const authenticated = await this.authenticateSession(sessionToken);
    const delivery = await this.createAndDeliverChallenge({
      destination: authenticated.profile.email,
      organizationId: authenticated.profile.organizationId,
      type: "EMAIL_VERIFICATION",
      userId: authenticated.profile.userId,
    });
    return { delivery };
  }

  async verifyEmail(input: CustomerVerificationInputContract): Promise<void> {
    const organizationId = await this.organizationId();
    const challenge = await this.dependencies.repository.findChallengeById({
      challengeId: input.challengeId,
      organizationId,
      type: "EMAIL_VERIFICATION",
    });
    await this.verifyChallenge(challenge, input.token);
    if (!challenge?.userId) throw invalidChallenge();
    await this.dependencies.repository.markEmailVerified({
      organizationId,
      userId: challenge.userId,
      verifiedAt: this.clock(),
    });
  }

  private async issueSession(
    profile: CustomerAuthenticationProfile,
    rememberMe: boolean,
  ): Promise<CustomerSessionResult> {
    assertProfileActive(profile, true);
    const now = this.clock();
    const sessionToken = this.dependencies.secrets.generateToken();
    const csrfToken = this.dependencies.secrets.generateToken();
    const expiresAt = new Date(
      now.getTime() + (rememberMe ? 30 * 24 * 60 * 60_000 : 12 * 60 * 60_000),
    );
    const session: AuthenticationSession = {
      createdAt: now,
      csrfTokenHash: this.dependencies.secrets.hashSecret(csrfToken),
      expiresAt,
      id: this.idGenerator(),
      lastUsedAt: now,
      organizationId: profile.organizationId,
      rememberMe,
      revokedAt: null,
      tokenHash: this.dependencies.secrets.hashSecret(sessionToken),
      userId: profile.userId,
    };
    await this.dependencies.repository.createSession(session);
    return {
      csrfToken,
      expiresAt: expiresAt.toISOString(),
      profile,
      sessionToken,
    };
  }

  private async createAndDeliverChallenge(input: {
    destination: string;
    organizationId: string;
    type: AuthenticationChallengeType;
    userId: string | null;
  }): Promise<DeliveryStatus> {
    const existing =
      await this.dependencies.repository.findActiveChallenge(input);
    const now = this.clock();
    if (existing?.nextResendAt && existing.nextResendAt > now) {
      throw new CustomerAuthenticationError(
        "RATE_LIMITED",
        "Please wait before requesting another code.",
        Math.ceil((existing.nextResendAt.getTime() - now.getTime()) / 1000),
      );
    }
    await this.dependencies.repository.invalidateChallenges(input);
    const secret =
      input.type === "EMAIL_OTP" || input.type === "PHONE_OTP"
        ? this.dependencies.secrets.generateCode()
        : this.dependencies.secrets.generateToken();
    const id = this.idGenerator();
    const expiresAt = new Date(
      now.getTime() +
        (input.type === "EMAIL_OTP" || input.type === "PHONE_OTP"
          ? 10 * 60_000
          : 30 * 60_000),
    );
    await this.dependencies.repository.createChallenge({
      destination: input.destination,
      expiresAt,
      id,
      maxAttempts: 5,
      nextResendAt: new Date(now.getTime() + 60_000),
      organizationId: input.organizationId,
      secretHash: this.dependencies.secrets.hashSecret(`${id}:${secret}`),
      type: input.type,
      userId: input.userId,
    });
    const message = {
      challengeId: id,
      destination: input.destination,
      expiresAt,
      secret,
    };
    try {
      switch (input.type) {
        case "EMAIL_OTP":
          return await this.dependencies.messages.sendEmailOtp(message);
        case "PHONE_OTP":
          return await this.dependencies.messages.sendPhoneOtp(message);
        case "EMAIL_VERIFICATION":
          return await this.dependencies.messages.sendEmailVerification(
            message,
          );
        case "PASSWORD_RESET":
          return await this.dependencies.messages.sendPasswordReset(message);
        default:
          return "UNAVAILABLE";
      }
    } catch {
      return "UNAVAILABLE";
    }
  }

  private async verifyChallenge(
    challenge: AuthenticationChallenge | null,
    secret: string,
  ): Promise<void> {
    const now = this.clock();
    if (
      !challenge ||
      challenge.status !== "ACTIVE" ||
      challenge.expiresAt <= now ||
      challenge.attempts >= challenge.maxAttempts
    ) {
      throw invalidChallenge();
    }
    const valid = this.dependencies.secrets.verifySecret(
      `${challenge.id}:${secret}`,
      challenge.secretHash,
    );
    if (!valid) {
      await this.dependencies.repository.incrementChallengeAttempts({
        challengeId: challenge.id,
        expectedAttempts: challenge.attempts,
      });
      throw invalidChallenge();
    }
    const consumed = await this.dependencies.repository.consumeChallenge({
      challengeId: challenge.id,
      consumedAt: now,
      expectedAttempts: challenge.attempts,
    });
    if (!consumed) throw invalidChallenge();
  }

  private async ensureProviderIdentity(
    profile: CustomerAuthenticationProfile,
    provider: "EMAIL_OTP" | "GOOGLE" | "PHONE_OTP",
    identifier: string,
  ): Promise<void> {
    const owner = await this.dependencies.repository.findProviderIdentityOwner({
      identifier,
      provider,
    });
    if (owner === profile.userId) return;
    if (owner) {
      throw new CustomerAuthenticationError(
        "CONFLICT",
        "This sign-in identity belongs to another account.",
      );
    }
    await this.mapIdentityConflict(() =>
      this.dependencies.repository.linkProviderIdentity({
        credentialId: this.idGenerator(),
        identifier,
        provider,
        userId: profile.userId,
      }),
    );
  }

  private async mapIdentityConflict<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ConflictError) {
        throw new CustomerAuthenticationError(
          "CONFLICT",
          "An account already exists for these details.",
        );
      }
      throw error;
    }
  }

  private async rateLimit(
    organizationId: string,
    action: string,
    key: string,
    maximumAttempts: number,
    windowMs: number,
  ): Promise<void> {
    const result = await this.dependencies.repository.consumeRateLimit({
      action,
      blockForMs: windowMs,
      keyHash: this.dependencies.secrets.hashSecret(`${action}:${key}`),
      maximumAttempts,
      now: this.clock(),
      organizationId,
      windowMs,
    });
    if (!result.allowed) {
      throw new CustomerAuthenticationError(
        "RATE_LIMITED",
        "Too many attempts. Please try again later.",
        result.retryAfterSeconds,
      );
    }
  }

  private async organizationId(): Promise<string> {
    const organizationId =
      await this.dependencies.repository.findOrganizationIdByCode(
        this.dependencies.organizationCode,
      );
    if (!organizationId) {
      throw new CustomerAuthenticationError(
        "UNAUTHORIZED",
        "Storefront authentication is unavailable.",
      );
    }
    return organizationId;
  }
}

type DeliveryStatus = "SENT" | "UNAVAILABLE";


function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
  const compact = value.replace(/[\s()-]/gu, "");
  const normalized = compact.startsWith("01")
    ? `+880${compact.slice(1)}`
    : compact.startsWith("880")
      ? `+${compact}`
      : compact;
  if (!/^\+8801[3-9][0-9]{8}$/u.test(normalized)) {
    throw new CustomerAuthenticationError(
      "VALIDATION",
      "Use a valid Bangladesh phone number.",
    );
  }
  return normalized;
}

function normalizeDestination(channel: "EMAIL" | "PHONE", value: string) {
  return channel === "EMAIL" ? normalizeEmail(value) : normalizePhone(value);
}

function normalizeName(value: string, field: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > 80) {
    throw new CustomerAuthenticationError("VALIDATION", `${field} is invalid.`);
  }
  return normalized;
}

function assertPassword(password: string, email: string): void {
  if (
    password.length < 12 ||
    password.length > 128 ||
    !/[a-z]/u.test(password) ||
    !/[A-Z]/u.test(password) ||
    !/[0-9]/u.test(password) ||
    !/[^A-Za-z0-9]/u.test(password) ||
    password.toLowerCase().includes(email.split("@")[0] ?? "")
  ) {
    throw new CustomerAuthenticationError(
      "VALIDATION",
      "Password does not meet security requirements.",
    );
  }
}

function assertProfileActive(
  profile: CustomerAuthenticationProfile,
  allowPending = false,
): void {
  if (
    profile.status !== "ACTIVE" &&
    !(allowPending && profile.status === "PENDING_VERIFICATION")
  ) {
    throw new CustomerAuthenticationError(
      "ACCOUNT_DISABLED",
      "This account is unavailable.",
    );
  }
}

function invalidChallenge(): CustomerAuthenticationError {
  return new CustomerAuthenticationError(
    "INVALID_CHALLENGE",
    "The code or link is invalid or expired.",
  );
}
