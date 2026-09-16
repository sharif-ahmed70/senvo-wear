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

const EXPECTED_TEST_DB_URL =
  "postgresql://senvo_wpr_test@127.0.0.1:55439/senvo_workforce_rotation_test";

function assertTestDatabaseSafety(url: string | undefined) {
  if (process.env.APP_ENV !== "test" || process.env.NODE_ENV !== "test") {
    throw new Error(
      "Integration tests require APP_ENV=test and NODE_ENV=test.",
    );
  }
  if (!url || url !== EXPECTED_TEST_DB_URL) {
    throw new Error(
      `TEST_DATABASE_URL must equal exact approved test URL: ${EXPECTED_TEST_DB_URL}; got: ${url}`,
    );
  }
  if (process.env.DATABASE_URL !== EXPECTED_TEST_DB_URL) {
    throw new Error(
      `DATABASE_URL must equal exact approved test URL: ${EXPECTED_TEST_DB_URL}`,
    );
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "postgresql:") {
    throw new Error("Protocol must be postgresql:");
  }
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439") {
    throw new Error("Target host/port must be 127.0.0.1:55439");
  }
  if (parsed.username !== "senvo_wpr_test" || parsed.password) {
    throw new Error("Role must be senvo_wpr_test without password");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("No query parameters or hash allowed");
  }
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (dbName.includes("senvo_wear_dev")) {
    throw new Error("Forbidden database: senvo_wear_dev");
  }
  if (dbName !== "senvo_workforce_rotation_test") {
    throw new Error(
      `Database name must be senvo_workforce_rotation_test, got: ${dbName}`,
    );
  }
}

describe("Prisma authentication repositories", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let repositories: AuthenticationRepositories;

  beforeAll(async () => {
    assertTestDatabaseSafety(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = EXPECTED_TEST_DB_URL;
    prisma = createPrismaClient();

    const [identity] = await prisma.$queryRaw<
      Array<{
        current_database: string;
        current_user: string;
        inet_server_port: number;
        data_directory: string;
        pg_is_in_recovery: boolean;
      }>
    >`SELECT current_database(), current_user, inet_server_port(), current_setting('data_directory') as data_directory, pg_is_in_recovery()`;

    if (!identity) {
      throw new Error("No database identity row returned from query.");
    }
    if (identity.current_database !== "senvo_workforce_rotation_test") {
      throw new Error(`Database mismatch: ${identity.current_database}`);
    }
    if (identity.current_user !== "senvo_wpr_test") {
      throw new Error(`User mismatch: ${identity.current_user}`);
    }
    if (identity.inet_server_port !== 55439) {
      throw new Error(`Port mismatch: ${identity.inet_server_port}`);
    }
    if (
      !identity.data_directory
        .toLowerCase()
        .replace(/\//g, "\\")
        .includes("senvo-wpr-test-047573c3\\data")
    ) {
      throw new Error(`Data directory mismatch: ${identity.data_directory}`);
    }
    if (identity.pg_is_in_recovery) {
      throw new Error("Database cluster must not be in recovery.");
    }

    repositories = {
      credentials: new PrismaUserCredentialRepository(prisma),
      users: new PrismaUserRepository(prisma),
    };
  });

  beforeEach(async () => {
    await prisma.salesReceiptPayment.deleteMany();
    await prisma.salesReceiptLine.deleteMany();
    await prisma.salesReceipt.deleteMany();
    await prisma.paymentLine.deleteMany();
    await prisma.paymentBatch.deleteMany();
    await prisma.posCheckoutRecord.deleteMany();
    await prisma.posCartLine.deleteMany();
    await prisma.posCart.deleteMany();
    await prisma.salesSession.deleteMany();
    await prisma.salesCounter.deleteMany();
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrderCommerceProfile.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.inventoryReservationLine.deleteMany();
    await prisma.inventoryReservation.deleteMany();
    await prisma.inventoryMovementLine.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryAllocationPolicyLocation.deleteMany();
    await prisma.inventoryAllocationPolicy.deleteMany();
    await prisma.catalogMediaLink.deleteMany();
    await prisma.mediaAsset.deleteMany();
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
    await prisma.workforceAuthenticationSession.deleteMany();
    await prisma.authenticationSession.deleteMany();
    await prisma.authenticationChallenge.deleteMany();
    await prisma.authenticationRateLimit.deleteMany();
    await prisma.customerAccount.deleteMany();
    await prisma.userCredential.deleteMany();
    await prisma.organizationMembership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await prisma?.$disconnect();
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

  it("replaces password conditionally, increments version, and rejects mismatches without mutation", async () => {
    const user = await createUser(repositories.users, {
      email: "replace-test@senvo.test",
    });
    const credential = await repositories.credentials.create({
      identifier: "replace-test@senvo.test",
      passwordHash: "old-hash-1",
      provider: "PASSWORD",
      status: "ACTIVE",
      userId: user.id,
    });

    // 1. Exact match replaces password and increments version once
    const updated = await repositories.credentials.replacePassword({
      expectedVersion: credential.version,
      id: credential.id,
      passwordHash: "new-hash-2",
      userId: user.id,
    });

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(credential.id);
    expect(updated!.userId).toBe(user.id);
    expect(updated!.provider).toBe("PASSWORD");
    expect(updated!.identifier).toBe(credential.identifier);
    expect(updated!.status).toBe("ACTIVE");
    expect(updated!.passwordHash).toBe("new-hash-2");
    expect(updated!.version).toBe(credential.version + 1);

    // 2. Stale version causes zero mutation and returns null
    const staleResult = await repositories.credentials.replacePassword({
      expectedVersion: credential.version,
      id: credential.id,
      passwordHash: "stale-hash",
      userId: user.id,
    });
    expect(staleResult).toBeNull();

    // 3. Wrong userId causes zero mutation and returns null
    const wrongUserResult = await repositories.credentials.replacePassword({
      expectedVersion: updated!.version,
      id: credential.id,
      passwordHash: "wrong-user-hash",
      userId: "99999999-9999-4999-8999-999999999999",
    });
    expect(wrongUserResult).toBeNull();

    // Verify credential was not mutated by failed attempts
    // 4. Wrong credential ID causes zero mutation and returns null
    const wrongIdResult = await repositories.credentials.replacePassword({
      expectedVersion: updated!.version,
      id: "99999999-9999-4999-8999-999999999999",
      passwordHash: "wrong-id-hash",
      userId: user.id,
    });
    expect(wrongIdResult).toBeNull();

    // 5. Inactive status causes zero mutation and returns null
    const inactiveUser = await createUser(repositories.users, {
      email: "inactive-test@senvo.test",
    });
    const inactiveCred = await repositories.credentials.create({
      identifier: "inactive-test@senvo.test",
      passwordHash: "inactive-hash-1",
      provider: "PASSWORD",
      status: "INACTIVE",
      userId: inactiveUser.id,
    });
    const inactiveResult = await repositories.credentials.replacePassword({
      expectedVersion: inactiveCred.version,
      id: inactiveCred.id,
      passwordHash: "inactive-hash-2",
      userId: inactiveUser.id,
    });
    expect(inactiveResult).toBeNull();
    const inactiveCredAfter = await repositories.credentials.findById(
      inactiveCred.id,
    );
    expect(inactiveCredAfter!.passwordHash).toBe("inactive-hash-1");
    expect(inactiveCredAfter!.version).toBe(inactiveCred.version);

    // 6. Wrong provider causes zero mutation and returns null
    const nonPasswordCred = await prisma.userCredential.create({
      data: {
        identifier: "google-user@senvo.test",
        provider: "GOOGLE",
        status: "ACTIVE",
        userId: user.id,
        version: 1,
      },
    });
    const wrongProviderResult = await repositories.credentials.replacePassword({
      expectedVersion: nonPasswordCred.version,
      id: nonPasswordCred.id,
      passwordHash: "google-hash",
      userId: user.id,
    });
    expect(wrongProviderResult).toBeNull();
    const nonPasswordCredAfter = await prisma.userCredential.findUnique({
      where: { id: nonPasswordCred.id },
    });
    expect(nonPasswordCredAfter!.passwordHash).toBeNull();
    expect(nonPasswordCredAfter!.version).toBe(1);

    // Verify original credential was not mutated by failed attempts
    const finalCred = await repositories.credentials.findById(credential.id);
    expect(finalCred!.passwordHash).toBe("new-hash-2");
    expect(finalCred!.version).toBe(updated!.version);
  });
});

type AuthenticationRepositories = {
  credentials: PrismaUserCredentialRepository;
  users: PrismaUserRepository;
};
