import { randomUUID } from "node:crypto";
import { ConflictError } from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import { PrismaCustomerAuthenticationRepository } from "./customer-authentication-repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("Prisma customer authentication repository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let repository: PrismaCustomerAuthenticationRepository;
  let organizationId: string;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    repository = new PrismaCustomerAuthenticationRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.authenticationSession.deleteMany();
    await prisma.authenticationChallenge.deleteMany();
    await prisma.authenticationRateLimit.deleteMany();
    await prisma.customerAccount.deleteMany();
    await prisma.userCredential.deleteMany();
    await prisma.organizationMembership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
    organizationId = randomUUID();
    await prisma.organization.create({
      data: { code: "SENVO", id: organizationId, name: "SENVO Wear" },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("creates one organization-scoped customer and prevents duplicate identities", async () => {
    const customer = await createCustomer(repository, organizationId);
    expect(customer).toMatchObject({
      email: "customer@example.com",
      organizationId,
      status: "PENDING_VERIFICATION",
    });

    await expect(
      createCustomer(repository, organizationId),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows exactly one simultaneous registration for a normalized identity", async () => {
    const results = await Promise.allSettled([
      createCustomer(repository, organizationId, {
        email: "registration-race@example.com",
        phone: null,
      }),
      createCustomer(repository, organizationId, {
        email: "registration-race@example.com",
        phone: null,
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (!rejected || rejected.status !== "rejected") {
      throw new Error("Expected one registration to be rejected.");
    }
    expect(rejected.reason).toBeInstanceOf(ConflictError);
  });

  it("normalizes a verified-phone uniqueness collision", async () => {
    const first = await createCustomer(repository, organizationId, {
      email: "phone-owner@example.com",
      phone: null,
    });
    const second = await createCustomer(repository, organizationId, {
      email: "phone-race@example.com",
      phone: null,
    });
    const phone = "+8801812345678";

    await repository.markPhoneVerified({
      organizationId,
      phone,
      userId: first.userId,
      verifiedAt: new Date(),
    });
    await expect(
      repository.markPhoneVerified({
        organizationId,
        phone,
        userId: second.userId,
        verifiedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("stores only session hashes and enforces organization isolation", async () => {
    const customer = await createCustomer(repository, organizationId);
    await repository.createSession({
      createdAt: new Date(),
      csrfTokenHash: "b".repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
      id: randomUUID(),
      lastUsedAt: new Date(),
      organizationId,
      rememberMe: false,
      revokedAt: null,
      tokenHash: "a".repeat(64),
      userId: customer.userId,
    });

    await expect(
      repository.findSession(organizationId, "a".repeat(64)),
    ).resolves.toMatchObject({ profile: { userId: customer.userId } });
    await expect(
      repository.findSession(randomUUID(), "a".repeat(64)),
    ).resolves.toBeNull();
  });

  it("consumes a challenge once and applies persistent rate-limit thresholds", async () => {
    const customer = await createCustomer(repository, organizationId);
    const challenge = await repository.createChallenge({
      destination: customer.email,
      expiresAt: new Date(Date.now() + 60_000),
      id: randomUUID(),
      maxAttempts: 5,
      nextResendAt: new Date(),
      organizationId,
      secretHash: "c".repeat(64),
      type: "EMAIL_VERIFICATION",
      userId: customer.userId,
    });

    const consumptions = await Promise.all([
      repository.consumeChallenge({
        challengeId: challenge.id,
        consumedAt: new Date(),
        expectedAttempts: 0,
      }),
      repository.consumeChallenge({
        challengeId: challenge.id,
        consumedAt: new Date(),
        expectedAttempts: 0,
      }),
    ]);
    expect(consumptions.sort()).toEqual([false, true]);

    const input = {
      action: "PASSWORD_LOGIN",
      blockForMs: 60_000,
      keyHash: "d".repeat(64),
      maximumAttempts: 2,
      now: new Date(),
      organizationId,
      windowMs: 60_000,
    };
    await expect(repository.consumeRateLimit(input)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(repository.consumeRateLimit(input)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(repository.consumeRateLimit(input)).resolves.toMatchObject({
      allowed: false,
    });
  });
});

async function createCustomer(
  repository: PrismaCustomerAuthenticationRepository,
  organizationId: string,
  overrides: { email?: string; phone?: string | null } = {},
) {
  return repository.createPasswordCustomer({
    customerAccountId: randomUUID(),
    email: overrides.email ?? "customer@example.com",
    firstName: "SENVO",
    lastName: "Customer",
    marketingConsent: false,
    organizationId,
    passwordCredentialId: randomUUID(),
    passwordHash: "scrypt$16384$8$1$salt$hash",
    phone: overrides.phone === undefined ? "+8801712345678" : overrides.phone,
    termsAcceptedAt: new Date(),
    userId: randomUUID(),
  });
}
