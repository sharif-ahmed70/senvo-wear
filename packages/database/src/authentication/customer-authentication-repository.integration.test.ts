import { randomUUID } from "node:crypto";
import { ConflictError } from "@senvo/domain";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createPrismaClient } from "../index.js";
import { PrismaCustomerAuthenticationRepository } from "./customer-authentication-repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("Prisma customer authentication repository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let repository: PrismaCustomerAuthenticationRepository;
  let organizationId: string;
  let testSuffix: string;
  let trackedUserIds: Set<string>;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    repository = new PrismaCustomerAuthenticationRepository(prisma);
  });

  beforeEach(async () => {
    testSuffix = randomUUID().replace(/-/g, "").slice(0, 8);
    organizationId = randomUUID();
    trackedUserIds = new Set<string>();

    await prisma.organization.create({
      data: {
        code: `AUTH_${testSuffix}`.toUpperCase(),
        id: organizationId,
        name: `Customer Auth Test ${testSuffix}`,
      },
    });
  });

  afterEach(async () => {
    if (organizationId) {
      await cleanupCustomerAuthFixture(prisma, organizationId, trackedUserIds);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("creates one organization-scoped customer and prevents duplicate identities", async () => {
    const email = `customer-${testSuffix}@example.com`;
    const customer = await createCustomer(
      repository,
      organizationId,
      { email },
      trackedUserIds,
      testSuffix,
    );
    expect(customer).toMatchObject({
      email,
      organizationId,
      status: "PENDING_VERIFICATION",
    });

    await expect(
      createCustomer(
        repository,
        organizationId,
        { email },
        trackedUserIds,
        testSuffix,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows exactly one simultaneous registration for a normalized identity", async () => {
    const raceEmail = `registration-race-${testSuffix}@example.com`;
    const results = await Promise.allSettled([
      createCustomer(
        repository,
        organizationId,
        { email: raceEmail, phone: null },
        trackedUserIds,
        testSuffix,
      ),
      createCustomer(
        repository,
        organizationId,
        { email: raceEmail, phone: null },
        trackedUserIds,
        testSuffix,
      ),
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
    const first = await createCustomer(
      repository,
      organizationId,
      { email: `phone-owner-${testSuffix}@example.com`, phone: null },
      trackedUserIds,
      testSuffix,
    );
    const second = await createCustomer(
      repository,
      organizationId,
      { email: `phone-race-${testSuffix}@example.com`, phone: null },
      trackedUserIds,
      testSuffix,
    );
    const phone = `+88018${Math.floor(10000000 + Math.random() * 90000000)}`;

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
    const customer = await createCustomer(
      repository,
      organizationId,
      {},
      trackedUserIds,
      testSuffix,
    );
    const tokenHash = `a${testSuffix}`.padEnd(64, "a").slice(0, 64);
    const csrfTokenHash = `b${testSuffix}`.padEnd(64, "b").slice(0, 64);

    await repository.createSession({
      createdAt: new Date(),
      csrfTokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      id: randomUUID(),
      lastUsedAt: new Date(),
      organizationId,
      rememberMe: false,
      revokedAt: null,
      tokenHash,
      userId: customer.userId,
    });

    await expect(
      repository.findSession(organizationId, tokenHash),
    ).resolves.toMatchObject({ profile: { userId: customer.userId } });
    await expect(
      repository.findSession(randomUUID(), tokenHash),
    ).resolves.toBeNull();
  });

  it("consumes a challenge once and applies persistent rate-limit thresholds", async () => {
    const customer = await createCustomer(
      repository,
      organizationId,
      {},
      trackedUserIds,
      testSuffix,
    );
    const secretHash = `c${testSuffix}`.padEnd(64, "c").slice(0, 64);
    const keyHash = `d${testSuffix}`.padEnd(64, "d").slice(0, 64);

    const challenge = await repository.createChallenge({
      destination: customer.email,
      expiresAt: new Date(Date.now() + 60_000),
      id: randomUUID(),
      maxAttempts: 5,
      nextResendAt: new Date(),
      organizationId,
      secretHash,
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
      keyHash,
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

  it("preserves unrelated external organizations and categories across fixture lifecycle", async () => {
    const externalSuffix = randomUUID().replace(/-/g, "").slice(0, 8);
    const externalOrgId = randomUUID();
    const externalOrg = await prisma.organization.create({
      data: {
        code: `EXT_${externalSuffix}`.toUpperCase(),
        id: externalOrgId,
        name: `External Unrelated Org ${externalSuffix}`,
      },
    });
    const externalCategory = await prisma.category.create({
      data: {
        name: `External Category ${externalSuffix}`,
        organizationId: externalOrgId,
        slug: `external-cat-${externalSuffix.toLowerCase()}`,
      },
    });

    try {
      const customer = await createCustomer(
        repository,
        organizationId,
        {},
        trackedUserIds,
        testSuffix,
      );
      expect(customer.organizationId).toBe(organizationId);

      await cleanupCustomerAuthFixture(prisma, organizationId, trackedUserIds);

      const survivingOrg = await prisma.organization.findUnique({
        where: { id: externalOrgId },
      });
      expect(survivingOrg).not.toBeNull();
      expect(survivingOrg?.id).toBe(externalOrg.id);

      const survivingCategory = await prisma.category.findUnique({
        where: { id: externalCategory.id },
      });
      expect(survivingCategory).not.toBeNull();
      expect(survivingCategory?.id).toBe(externalCategory.id);
      expect(survivingCategory?.organizationId).toBe(externalOrg.id);
    } finally {
      await prisma.category.deleteMany({
        where: { organizationId: externalOrgId },
      });
      await prisma.organization.deleteMany({
        where: { id: externalOrgId },
      });
    }
  });
});

async function cleanupCustomerAuthFixture(
  prisma: ReturnType<typeof createPrismaClient>,
  organizationId: string,
  trackedUserIds: Set<string>,
) {
  const [accounts, sessions, challenges] = await Promise.all([
    prisma.customerAccount.findMany({
      select: { userId: true },
      where: { organizationId },
    }),
    prisma.authenticationSession.findMany({
      select: { userId: true },
      where: { organizationId },
    }),
    prisma.authenticationChallenge.findMany({
      select: { userId: true },
      where: { organizationId, userId: { not: null } },
    }),
  ]);

  for (const record of accounts) {
    trackedUserIds.add(record.userId);
  }
  for (const record of sessions) {
    trackedUserIds.add(record.userId);
  }
  for (const record of challenges) {
    if (record.userId) {
      trackedUserIds.add(record.userId);
    }
  }

  const userIds = Array.from(trackedUserIds);

  await prisma.authenticationSession.deleteMany({
    where: {
      OR: [
        { organizationId },
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
      ],
    },
  });

  await prisma.authenticationChallenge.deleteMany({
    where: {
      OR: [
        { organizationId },
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
      ],
    },
  });

  await prisma.authenticationRateLimit.deleteMany({
    where: { organizationId },
  });

  await prisma.customerAccount.deleteMany({
    where: {
      OR: [
        { organizationId },
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
      ],
    },
  });

  if (userIds.length > 0) {
    await prisma.userCredential.deleteMany({
      where: { userId: { in: userIds } },
    });

    await prisma.organizationMembership.deleteMany({
      where: {
        OR: [{ organizationId }, { userId: { in: userIds } }],
      },
    });

    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }

  await prisma.organization.deleteMany({
    where: { id: organizationId },
  });
}

async function createCustomer(
  repository: PrismaCustomerAuthenticationRepository,
  organizationId: string,
  overrides: { email?: string; phone?: string | null; userId?: string } = {},
  trackedUserIds?: Set<string>,
  testSuffix?: string,
) {
  const userId = overrides.userId ?? randomUUID();
  if (trackedUserIds) {
    trackedUserIds.add(userId);
  }
  const suffix = testSuffix ?? randomUUID().replace(/-/g, "").slice(0, 8);

  return repository.createPasswordCustomer({
    customerAccountId: randomUUID(),
    email: overrides.email ?? `customer-${suffix}@example.com`,
    firstName: "SENVO",
    lastName: "Customer",
    marketingConsent: false,
    organizationId,
    passwordCredentialId: randomUUID(),
    passwordHash: "scrypt$16384$8$1$salt$hash",
    phone:
      overrides.phone === undefined
        ? `+88017${Math.floor(10000000 + Math.random() * 90000000)}`
        : overrides.phone,
    termsAcceptedAt: new Date(),
    userId,
  });
}
