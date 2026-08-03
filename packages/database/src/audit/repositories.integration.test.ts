import { RepositoryAuditWriter } from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import { PrismaAuditEntryRepository } from "./repositories.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("Prisma audit repository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let repository: PrismaAuditEntryRepository;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    repository = new PrismaAuditEntryRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.posCheckoutRecord.deleteMany();
    await prisma.posCartLine.deleteMany();
    await prisma.posCart.deleteMany();
    await prisma.salesSession.deleteMany();
    await prisma.salesCounter.deleteMany();
    await prisma.auditEntry.deleteMany();
    await prisma.userCredential.deleteMany();
    await prisma.organizationMembership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("isolates audit entries by organization", async () => {
    const organization = await prisma.organization.create({
      data: { code: "AUDIT-1", name: "Audit One" },
    });
    const otherOrganization = await prisma.organization.create({
      data: { code: "AUDIT-2", name: "Audit Two" },
    });
    const entry = await new RepositoryAuditWriter(repository).record({
      action: "SALES_ORDER_CREATED",
      actor: { userId: null },
      organizationId: organization.id,
      resource: "SALES_ORDER",
      resourceId: "11111111-1111-4111-8111-111111111111",
    });

    await expect(
      repository.findById(entry.id, organization.id),
    ).resolves.toMatchObject({ id: entry.id });
    await expect(
      repository.findById(entry.id, otherOrganization.id),
    ).resolves.toBeNull();
  });

  it("restricts deleting referenced organizations and users", async () => {
    const organization = await prisma.organization.create({
      data: { code: "AUDIT-1", name: "Audit One" },
    });
    const user = await prisma.user.create({
      data: { email: "auditor@senvo.test" },
    });
    await new RepositoryAuditWriter(repository).record({
      action: "INVENTORY_MOVEMENT_POSTED",
      actor: { userId: user.id },
      organizationId: organization.id,
      resource: "INVENTORY_MOVEMENT",
      resourceId: "22222222-2222-4222-8222-222222222222",
    });

    await expect(
      prisma.organization.delete({ where: { id: organization.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.user.delete({ where: { id: user.id } }),
    ).rejects.toThrow();
  });
});
