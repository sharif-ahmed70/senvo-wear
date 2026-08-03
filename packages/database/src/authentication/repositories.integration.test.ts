import {
  BusinessRuleError,
  ConflictError,
  authenticateCredential,
  createUser,
  createUserCredential,
  disableUserCredential,
} from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import { PrismaUserRepository } from "../identity/repositories.js";
import { PrismaUserCredentialRepository } from "./repositories.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("Prisma authentication repositories", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let repositories: AuthenticationRepositories;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    repositories = {
      credentials: new PrismaUserCredentialRepository(prisma),
      users: new PrismaUserRepository(prisma),
    };
  });

  beforeEach(async () => {
    await prisma.posCartLine.deleteMany();
    await prisma.posCart.deleteMany();
    await prisma.salesSession.deleteMany();
    await prisma.salesCounter.deleteMany();
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.inventoryReservationLine.deleteMany();
    await prisma.inventoryReservation.deleteMany();
    await prisma.inventoryMovementLine.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryAllocationPolicyLocation.deleteMany();
    await prisma.inventoryAllocationPolicy.deleteMany();
    await prisma.productCollection.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.collection.deleteMany();
    await prisma.category.deleteMany();
    await prisma.color.deleteMany();
    await prisma.size.deleteMany();
    await prisma.posCounter.deleteMany();
    await prisma.stockLocation.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.auditEntry.deleteMany();
    await prisma.userCredential.deleteMany();
    await prisma.organizationMembership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("enforces unique provider identifiers and authenticates active credentials", async () => {
    const user = await createUser(repositories.users, {
      email: "owner@senvo.test",
    });
    await createUserCredential(repositories, {
      identifier: "Owner@Senvo.Test",
      passwordHash: "hashed_password_value_1234567890",
      provider: "PASSWORD",
      userId: user.id,
    });

    await expect(
      createUserCredential(repositories, {
        identifier: "owner@senvo.test",
        passwordHash: "hashed_password_value_abcdefghij",
        provider: "PASSWORD",
        userId: user.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      authenticateCredential(repositories, {
        identifier: "owner@senvo.test",
        provider: "PASSWORD",
        requestId: "req_db_auth_1",
      }),
    ).resolves.toMatchObject({ authenticatedUserId: user.id });
  });

  it("disables credentials with optimistic concurrency", async () => {
    const user = await createUser(repositories.users, {
      email: "owner@senvo.test",
    });
    const credential = await createUserCredential(repositories, {
      identifier: "owner@senvo.test",
      passwordHash: "hashed_password_value_1234567890",
      provider: "PASSWORD",
      userId: user.id,
    });

    await expect(
      disableUserCredential(repositories.credentials, {
        credentialId: credential.id,
        expectedVersion: credential.version,
      }),
    ).resolves.toMatchObject({ status: "INACTIVE", version: 2 });
  });

  it("restricts deleting users while credentials exist", async () => {
    const user = await createUser(repositories.users, {
      email: "owner@senvo.test",
    });
    await createUserCredential(repositories, {
      identifier: "owner@senvo.test",
      passwordHash: "hashed_password_value_1234567890",
      provider: "PASSWORD",
      userId: user.id,
    });

    await expect(
      prisma.user.delete({ where: { id: user.id } }),
    ).rejects.toThrow();
  });

  it("maps missing user references to business rule errors", async () => {
    await expect(
      repositories.credentials.create({
        identifier: "missing@senvo.test",
        passwordHash: "hashed_password_value_1234567890",
        provider: "PASSWORD",
        status: "ACTIVE",
        userId: "99999999-9999-4999-8999-999999999999",
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

type AuthenticationRepositories = {
  credentials: PrismaUserCredentialRepository;
  users: PrismaUserRepository;
};
