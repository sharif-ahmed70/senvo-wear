import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import { PrismaCommerceRepository } from "./repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
let prisma: ReturnType<typeof createPrismaClient>;

describeWithDatabase("Prisma commerce repository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({
      where: { organization: { code: { startsWith: "COMMERCE-TEST-" } } },
    });
    await prisma.vendor.deleteMany({
      where: { organization: { code: { startsWith: "COMMERCE-TEST-" } } },
    });
    await prisma.organization.deleteMany({
      where: { code: { startsWith: "COMMERCE-TEST-" } },
    });
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("enforces tenant-scoped customer uniqueness and list isolation", async () => {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const first = await prisma.organization.create({
      data: { code: `COMMERCE-TEST-A-${suffix}`, name: "Commerce A" },
    });
    const second = await prisma.organization.create({
      data: { code: `COMMERCE-TEST-B-${suffix}`, name: "Commerce B" },
    });
    const repository = new PrismaCommerceRepository(prisma);
    await repository.createCustomer({
      address: null,
      email: null,
      id: randomUUID(),
      name: "Buyer A",
      organizationId: first.id,
      phone: "01700000000",
    });
    await repository.createCustomer({
      address: null,
      email: null,
      id: randomUUID(),
      name: "Buyer B",
      organizationId: second.id,
      phone: "01700000000",
    });
    await expect(
      repository.createCustomer({
        address: null,
        email: null,
        id: randomUUID(),
        name: "Duplicate",
        organizationId: first.id,
        phone: "01700000000",
      }),
    ).rejects.toThrow("already exists");
    expect(
      (await repository.listCustomers(first.id)).map((item) => item.name),
    ).toEqual(["Buyer A"]);
    expect(await repository.findCustomer(first.id, randomUUID())).toBeNull();
  });

  it("keeps vendor names unique within an organization", async () => {
    const organization = await prisma.organization.create({
      data: {
        code: `COMMERCE-TEST-V-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "Commerce Vendor Test",
      },
    });
    const repository = new PrismaCommerceRepository(prisma);
    const vendor = {
      address: null,
      id: randomUUID(),
      location: "Dhaka",
      name: "Primary Supplier",
      organizationId: organization.id,
      phone: null,
    };
    await repository.createVendor(vendor);
    await expect(
      repository.createVendor({ ...vendor, id: randomUUID() }),
    ).rejects.toThrow("already exists");
  });
});
