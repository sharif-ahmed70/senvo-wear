/* eslint-disable @typescript-eslint/require-await -- in-memory fakes implement async repository interfaces */
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { createPrismaClient } from "@senvo/database";
import type {
  AuthenticationSecretService,
  PasswordHasher,
} from "@senvo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApplicationServices } from "../composition/create-application-services.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

// Small stand-ins for the http package's scrypt hasher and secret service.
const passwordHasher: PasswordHasher = {
  hash: async (password) => {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 32).toString("hex")}`;
  },
  verify: async (password, stored) => {
    const [, salt, hash] = stored.split("$");
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, "hex");
    const actual = scryptSync(password, Buffer.from(salt, "hex"), 32);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  },
};
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const authenticationSecrets: AuthenticationSecretService = {
  generateCode: () => String(Math.floor(100000 + Math.random() * 899999)),
  generateToken: () => randomBytes(32).toString("base64url"),
  hashSecret: sha,
  verifySecret: (secret, hash) => sha(secret) === hash,
};

describe("team member passwords (database)", () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  const prisma = createPrismaClient();
  const services = createApplicationServices({
    authenticationSecrets,
    passwordHasher,
    prismaClient: prisma,
  });
  const suffix = randomUUID().slice(0, 8);
  const staffEmail = `staff.${suffix}@team-password.test`;
  let organizationId = "";
  let ownerUserId = "";

  const ownerContext = () => ({
    organizationId,
    requestId: `req-${randomUUID()}`,
    userId: ownerUserId,
  });

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { code: `TPW-${suffix}`.toUpperCase(), name: "Team password test" },
    });
    organizationId = organization.id;
    const owner = await prisma.user.create({
      data: { email: `owner.${suffix}@team-password.test`, name: "Owner" },
    });
    ownerUserId = owner.id;
    await prisma.organizationMembership.create({
      data: {
        organizationId,
        role: "OWNER",
        status: "ACTIVE",
        userId: owner.id,
      },
    });
  });

  afterAll(async () => {
    const users = await prisma.organizationMembership.findMany({
      select: { userId: true },
      where: { organizationId },
    });
    const userIds = users.map((item) => item.userId);
    await prisma.auditEntry.deleteMany({ where: { organizationId } });
    await prisma.authenticationRateLimit.deleteMany({
      where: { organizationId },
    });
    await prisma.workforceAuthenticationSession.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userCredential.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("creates a member with a password that can log in, then resets it", async () => {
    const login = services.workforceAuthentication;
    expect(login).toBeDefined();
    if (!login) return;

    const created = await services.organization.createTeamMember(
      ownerContext(),
      {
        email: staffEmail,
        name: "Staff One",
        role: "STAFF",
        temporaryPassword: "Temp-pass-123",
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(JSON.stringify(created)).not.toContain("Temp-pass-123");

    const session = await login.login({
      email: staffEmail.toUpperCase(),
      password: "Temp-pass-123",
    });
    expect(session.principal.role).toBe("STAFF");
    await expect(
      login.login({ email: staffEmail, password: "Wrong-pass-999" }),
    ).rejects.toThrow();

    // The same email cannot get a second login.
    const duplicate = await services.organization.createTeamMember(
      ownerContext(),
      {
        email: staffEmail,
        name: "Staff Again",
        role: "STAFF",
        temporaryPassword: "Other-pass-123",
      },
    );
    expect(duplicate).toMatchObject({ error: { code: "CONFLICT" }, ok: false });

    const reset = await services.organization.resetTeamMemberPassword(
      ownerContext(),
      {
        expectedVersion: created.data.version,
        newPassword: "New-pass-456",
        teamMemberId: created.data.id,
      },
    );
    expect(reset.ok).toBe(true);

    // Old session is revoked; old password no longer works; new one does.
    await expect(
      login.authenticateSession(session.sessionToken),
    ).rejects.toThrow();
    await expect(
      login.login({ email: staffEmail, password: "Temp-pass-123" }),
    ).rejects.toThrow();
    const fresh = await login.login({
      email: staffEmail,
      password: "New-pass-456",
    });
    expect(fresh.principal.userId).toBe(created.data.userId);

    const audits = await prisma.auditEntry.findMany({
      orderBy: { createdAt: "asc" },
      where: { organizationId },
    });
    expect(audits.map((entry) => entry.action)).toEqual([
      "TEAM_MEMBER_PASSWORD_SET",
      "TEAM_MEMBER_PASSWORD_RESET",
    ]);
    expect(JSON.stringify(audits)).not.toMatch(/Temp-pass|New-pass|scrypt\$/u);
  });
});
