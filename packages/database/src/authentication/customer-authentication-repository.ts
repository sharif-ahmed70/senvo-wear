import { randomUUID } from "node:crypto";
import {
  BusinessRuleError,
  ConflictError,
  type AuthenticationChallenge,
  type AuthenticationSession,
  type CustomerAuthenticationProfile,
  type CustomerAuthenticationRepository,
  type PasswordCustomerRecord,
} from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

type KnownPrismaError = { code?: string };

export class PrismaCustomerAuthenticationRepository implements CustomerAuthenticationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrganizationIdByCode(code: string): Promise<string | null> {
    const record = await this.prisma.organization.findUnique({
      select: { id: true, status: true },
      where: { code },
    });
    return record?.status === "ACTIVE" ? record.id : null;
  }

  async createPasswordCustomer(
    input: Parameters<
      CustomerAuthenticationRepository["createPasswordCustomer"]
    >[0],
  ): Promise<CustomerAuthenticationProfile> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.user.findUnique({
          select: { id: true },
          where: { email: input.email },
        });
        if (existing) {
          throw new ConflictError("Customer email already exists.");
        }
        const user = await transaction.user.create({
          data: {
            email: input.email,
            id: input.userId,
            name: `${input.firstName} ${input.lastName}`,
            status: "ACTIVE",
          },
        });
        const account = await transaction.customerAccount.create({
          data: {
            firstName: input.firstName,
            id: input.customerAccountId,
            lastName: input.lastName,
            marketingConsent: input.marketingConsent,
            organizationId: input.organizationId,
            phone: input.phone,
            status: "PENDING_VERIFICATION",
            termsAcceptedAt: input.termsAcceptedAt,
            userId: user.id,
          },
        });
        await transaction.userCredential.create({
          data: {
            id: input.passwordCredentialId,
            identifier: input.email,
            passwordHash: input.passwordHash,
            provider: "PASSWORD",
            status: "ACTIVE",
            userId: user.id,
          },
        });
        return mapProfile(account, user.email);
      });
    } catch (error) {
      throw mapIntegrityError(error);
    }
  }

  async createPasswordlessCustomer(
    input: Parameters<
      CustomerAuthenticationRepository["createPasswordlessCustomer"]
    >[0],
  ): Promise<CustomerAuthenticationProfile> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.user.findUnique({
          select: { id: true },
          where: { email: input.email },
        });
        if (existing) {
          throw new ConflictError("Customer email already exists.");
        }
        const user = await transaction.user.create({
          data: {
            email: input.email,
            id: input.userId,
            name: `${input.firstName} ${input.lastName}`,
            status: "ACTIVE",
          },
        });
        const account = await transaction.customerAccount.create({
          data: {
            emailVerifiedAt:
              input.provider === "EMAIL_OTP" || input.provider === "GOOGLE"
                ? input.termsAcceptedAt
                : null,
            firstName: input.firstName,
            id: input.customerAccountId,
            lastName: input.lastName,
            organizationId: input.organizationId,
            phone: input.phone,
            phoneVerifiedAt:
              input.provider === "PHONE_OTP" ? input.termsAcceptedAt : null,
            status: "ACTIVE",
            termsAcceptedAt: input.termsAcceptedAt,
            userId: user.id,
          },
        });
        await transaction.userCredential.create({
          data: {
            id: input.providerCredentialId,
            identifier: input.identifier,
            passwordHash: null,
            provider: input.provider,
            status: "ACTIVE",
            userId: user.id,
          },
        });
        return mapProfile(account, user.email);
      });
    } catch (error) {
      throw mapIntegrityError(error);
    }
  }

  async findPasswordCustomer(
    organizationId: string,
    email: string,
  ): Promise<PasswordCustomerRecord | null> {
    const credential = await this.prisma.userCredential.findUnique({
      include: {
        user: {
          include: {
            customerAccounts: { where: { organizationId } },
          },
        },
      },
      where: {
        provider_identifier: { identifier: email, provider: "PASSWORD" },
      },
    });
    const account = credential?.user.customerAccounts[0];
    if (!credential?.passwordHash || !account) return null;
    return {
      ...mapProfile(account, credential.user.email),
      credentialId: credential.id,
      credentialStatus: credential.status,
      passwordHash: credential.passwordHash,
      userStatus: credential.user.status,
    };
  }

  async findCustomerByEmail(
    organizationId: string,
    email: string,
  ): Promise<CustomerAuthenticationProfile | null> {
    const user = await this.prisma.user.findUnique({
      include: { customerAccounts: { where: { organizationId } } },
      where: { email },
    });
    const account = user?.customerAccounts[0];
    return user && account ? mapProfile(account, user.email) : null;
  }

  async findCustomerByPhone(
    organizationId: string,
    phone: string,
  ): Promise<CustomerAuthenticationProfile | null> {
    const account = await this.prisma.customerAccount.findUnique({
      include: { user: true },
      where: { organizationId_phone: { organizationId, phone } },
    });
    return account ? mapProfile(account, account.user.email) : null;
  }

  async createSession(
    input: AuthenticationSession,
  ): Promise<AuthenticationSession> {
    try {
      const record = await this.prisma.authenticationSession.create({
        data: {
          createdAt: input.createdAt,
          csrfTokenHash: input.csrfTokenHash,
          expiresAt: input.expiresAt,
          id: input.id,
          lastUsedAt: input.lastUsedAt,
          organizationId: input.organizationId,
          rememberMe: input.rememberMe,
          revokedAt: input.revokedAt,
          status: "ACTIVE",
          tokenHash: input.tokenHash,
          userId: input.userId,
        },
      });
      return mapSession(record);
    } catch (error) {
      throw mapIntegrityError(error);
    }
  }

  async findSession(
    organizationId: string,
    tokenHash: string,
  ): ReturnType<CustomerAuthenticationRepository["findSession"]> {
    const record = await this.prisma.authenticationSession.findUnique({
      include: {
        user: {
          include: {
            customerAccounts: { where: { organizationId } },
          },
        },
      },
      where: { tokenHash },
    });
    const account = record?.user.customerAccounts[0];
    if (
      !record ||
      !account ||
      record.organizationId !== organizationId ||
      record.status !== "ACTIVE"
    ) {
      return null;
    }
    return {
      profile: mapProfile(account, record.user.email),
      session: mapSession(record),
      userStatus: record.user.status,
    };
  }

  async revokeSession(
    input: Parameters<CustomerAuthenticationRepository["revokeSession"]>[0],
  ): Promise<boolean> {
    const result = await this.prisma.authenticationSession.updateMany({
      data: { revokedAt: input.revokedAt, status: "REVOKED" },
      where: {
        organizationId: input.organizationId,
        status: "ACTIVE",
        tokenHash: input.tokenHash,
      },
    });
    return result.count === 1;
  }

  async revokeAllSessions(
    input: Parameters<CustomerAuthenticationRepository["revokeAllSessions"]>[0],
  ): Promise<number> {
    const result = await this.prisma.authenticationSession.updateMany({
      data: { revokedAt: input.revokedAt, status: "REVOKED" },
      where: {
        organizationId: input.organizationId,
        status: "ACTIVE",
        userId: input.userId,
      },
    });
    return result.count;
  }

  async invalidateChallenges(
    input: Parameters<
      CustomerAuthenticationRepository["invalidateChallenges"]
    >[0],
  ): Promise<void> {
    await this.prisma.authenticationChallenge.updateMany({
      data: { status: "INVALIDATED" },
      where: {
        destination: input.destination,
        organizationId: input.organizationId,
        status: "ACTIVE",
        type: input.type,
      },
    });
  }

  async createChallenge(
    input: Parameters<CustomerAuthenticationRepository["createChallenge"]>[0],
  ): Promise<AuthenticationChallenge> {
    try {
      const record = await this.prisma.authenticationChallenge.create({
        data: {
          destination: input.destination,
          expiresAt: input.expiresAt,
          id: input.id,
          maxAttempts: input.maxAttempts,
          nextResendAt: input.nextResendAt,
          organizationId: input.organizationId,
          secretHash: input.secretHash,
          type: input.type,
          userId: input.userId,
        },
      });
      return mapChallenge(record);
    } catch (error) {
      throw mapIntegrityError(error);
    }
  }

  async findActiveChallenge(
    input: Parameters<
      CustomerAuthenticationRepository["findActiveChallenge"]
    >[0],
  ): Promise<AuthenticationChallenge | null> {
    const record = await this.prisma.authenticationChallenge.findFirst({
      orderBy: { createdAt: "desc" },
      where: {
        destination: input.destination,
        organizationId: input.organizationId,
        status: "ACTIVE",
        type: input.type,
      },
    });
    return record ? mapChallenge(record) : null;
  }

  async findChallengeById(
    input: Parameters<CustomerAuthenticationRepository["findChallengeById"]>[0],
  ): Promise<AuthenticationChallenge | null> {
    const record = await this.prisma.authenticationChallenge.findFirst({
      where: {
        id: input.challengeId,
        organizationId: input.organizationId,
        type: input.type,
      },
    });
    return record ? mapChallenge(record) : null;
  }

  async consumeRateLimit(
    input: Parameters<CustomerAuthenticationRepository["consumeRateLimit"]>[0],
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const key = {
      organizationId_action_keyHash: {
        action: input.action,
        keyHash: input.keyHash,
        organizationId: input.organizationId,
      },
    };
    const existing = await this.prisma.authenticationRateLimit.findUnique({
      where: key,
    });
    if (!existing) {
      try {
        await this.prisma.authenticationRateLimit.create({
          data: {
            action: input.action,
            attempts: 1,
            id: randomUUID(),
            keyHash: input.keyHash,
            organizationId: input.organizationId,
            windowStartedAt: input.now,
          },
        });
        return { allowed: true, retryAfterSeconds: 0 };
      } catch (error) {
        if (isPrismaCode(error, "P2002")) return this.consumeRateLimit(input);
        throw error;
      }
    }
    if (existing.blockedUntil && existing.blockedUntil > input.now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(
          (existing.blockedUntil.getTime() - input.now.getTime()) / 1000,
        ),
      };
    }
    if (
      input.now.getTime() - existing.windowStartedAt.getTime() >=
      input.windowMs
    ) {
      const reset = await this.prisma.authenticationRateLimit.updateMany({
        data: {
          attempts: 1,
          blockedUntil: null,
          windowStartedAt: input.now,
        },
        where: {
          id: existing.id,
          windowStartedAt: existing.windowStartedAt,
        },
      });
      return reset.count === 1
        ? { allowed: true, retryAfterSeconds: 0 }
        : this.consumeRateLimit(input);
    }
    const nextAttempts = existing.attempts + 1;
    const blockedUntil =
      nextAttempts > input.maximumAttempts
        ? new Date(input.now.getTime() + input.blockForMs)
        : null;
    const incremented = await this.prisma.authenticationRateLimit.updateMany({
      data: {
        attempts: { increment: 1 },
        ...(blockedUntil ? { blockedUntil } : {}),
      },
      where: {
        attempts: existing.attempts,
        id: existing.id,
        windowStartedAt: existing.windowStartedAt,
      },
    });
    if (incremented.count !== 1) return this.consumeRateLimit(input);
    return blockedUntil
      ? {
          allowed: false,
          retryAfterSeconds: Math.ceil(input.blockForMs / 1000),
        }
      : { allowed: true, retryAfterSeconds: 0 };
  }

  async incrementChallengeAttempts(
    input: Parameters<
      CustomerAuthenticationRepository["incrementChallengeAttempts"]
    >[0],
  ): Promise<boolean> {
    const result = await this.prisma.authenticationChallenge.updateMany({
      data: { attempts: { increment: 1 } },
      where: {
        attempts: input.expectedAttempts,
        id: input.challengeId,
        status: "ACTIVE",
      },
    });
    return result.count === 1;
  }

  async consumeChallenge(
    input: Parameters<CustomerAuthenticationRepository["consumeChallenge"]>[0],
  ): Promise<boolean> {
    const result = await this.prisma.authenticationChallenge.updateMany({
      data: { consumedAt: input.consumedAt, status: "CONSUMED" },
      where: {
        attempts: input.expectedAttempts,
        id: input.challengeId,
        status: "ACTIVE",
      },
    });
    return result.count === 1;
  }

  async markEmailVerified(
    input: Parameters<CustomerAuthenticationRepository["markEmailVerified"]>[0],
  ): Promise<void> {
    const result = await this.prisma.customerAccount.updateMany({
      data: { emailVerifiedAt: input.verifiedAt, status: "ACTIVE" },
      where: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    });
    if (result.count !== 1)
      throw new BusinessRuleError("Customer was not found.");
  }

  async markPhoneVerified(
    input: Parameters<CustomerAuthenticationRepository["markPhoneVerified"]>[0],
  ): Promise<void> {
    const result = await this.prisma.customerAccount.updateMany({
      data: {
        phone: input.phone,
        phoneVerifiedAt: input.verifiedAt,
        status: "ACTIVE",
      },
      where: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    });
    if (result.count !== 1)
      throw new BusinessRuleError("Customer was not found.");
  }

  async replacePassword(
    input: Parameters<CustomerAuthenticationRepository["replacePassword"]>[0],
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const account = await transaction.customerAccount.findUnique({
        select: { id: true },
        where: {
          userId_organizationId: {
            organizationId: input.organizationId,
            userId: input.userId,
          },
        },
      });
      if (!account) throw new BusinessRuleError("Customer was not found.");
      const updated = await transaction.userCredential.updateMany({
        data: { passwordHash: input.passwordHash, version: { increment: 1 } },
        where: {
          provider: "PASSWORD",
          status: "ACTIVE",
          userId: input.userId,
        },
      });
      if (updated.count !== 1) {
        throw new BusinessRuleError("Password credential was not found.");
      }
      await transaction.authenticationSession.updateMany({
        data: { revokedAt: input.revokedAt, status: "REVOKED" },
        where: {
          organizationId: input.organizationId,
          status: "ACTIVE",
          userId: input.userId,
        },
      });
    });
  }

  async linkProviderIdentity(
    input: Parameters<
      CustomerAuthenticationRepository["linkProviderIdentity"]
    >[0],
  ): Promise<void> {
    try {
      await this.prisma.userCredential.create({
        data: {
          id: input.credentialId,
          identifier: input.identifier,
          passwordHash: null,
          provider: input.provider,
          status: "ACTIVE",
          userId: input.userId,
        },
      });
    } catch (error) {
      throw mapIntegrityError(error);
    }
  }

  async findProviderIdentityOwner(
    input: Parameters<
      CustomerAuthenticationRepository["findProviderIdentityOwner"]
    >[0],
  ): Promise<string | null> {
    const credential = await this.prisma.userCredential.findUnique({
      select: { userId: true },
      where: {
        provider_identifier: {
          identifier: input.identifier,
          provider: input.provider,
        },
      },
    });
    return credential?.userId ?? null;
  }
}

function mapProfile(
  account: {
    emailVerifiedAt: Date | null;
    firstName: string;
    id: string;
    lastName: string;
    organizationId: string;
    phone: string | null;
    phoneVerifiedAt: Date | null;
    status: CustomerAuthenticationProfile["status"];
    userId: string;
  },
  email: string,
): CustomerAuthenticationProfile {
  return {
    customerAccountId: account.id,
    email,
    emailVerified: account.emailVerifiedAt !== null,
    firstName: account.firstName,
    lastName: account.lastName,
    organizationId: account.organizationId,
    phone: account.phone,
    phoneVerified: account.phoneVerifiedAt !== null,
    status: account.status,
    userId: account.userId,
  };
}

function mapSession(record: {
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
}): AuthenticationSession {
  return record;
}

function mapChallenge(record: {
  attempts: number;
  consumedAt: Date | null;
  destination: string;
  expiresAt: Date;
  id: string;
  maxAttempts: number;
  nextResendAt: Date;
  organizationId: string;
  secretHash: string;
  status: AuthenticationChallenge["status"];
  type: AuthenticationChallenge["type"];
  userId: string | null;
}): AuthenticationChallenge {
  return record;
}

function mapIntegrityError(error: unknown): Error {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === "P2002"
  ) {
    return new ConflictError(
      "Customer authentication identity already exists.",
    );
  }
  if (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === "P2003"
  ) {
    return new BusinessRuleError(
      "Customer authentication reference integrity was violated.",
    );
  }
  return error instanceof Error
    ? error
    : new Error("Repository operation failed.");
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === code
  );
}
