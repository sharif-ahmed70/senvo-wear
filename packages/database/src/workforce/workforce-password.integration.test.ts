import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  type PasswordHasher,
  type WorkforceAuthenticationSession,
} from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  PrismaUserCredentialRepository,
  PrismaUserRepository,
  PrismaWorkforceAuthenticationRepository,
  PrismaWorkforcePasswordTransactionManager,
} from "../index.js";

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

function createBarrier() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitForBarrier(promise: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Transaction barrier timed out.")),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForBlockingPid(
  client: ReturnType<typeof createPrismaClient>,
  blockedPid: number,
  expectedBlockerPid: number,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await client.$queryRaw<
      Array<{ blocked: number; blockers: number[] }>
    >`SELECT pid as blocked, pg_blocking_pids(pid) as blockers FROM pg_stat_activity WHERE pid = ${blockedPid}`;
    const row = rows[0];
    if (row && row.blockers?.includes(expectedBlockerPid)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(
    `Timed out waiting for pid ${blockedPid} to be blocked by ${expectedBlockerPid}`,
  );
}

describe("Workforce password and session integration", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let prisma2: ReturnType<typeof createPrismaClient>;
  let prismaObserver: ReturnType<typeof createPrismaClient>;
  let transactionManager: PrismaWorkforcePasswordTransactionManager;
  let sessionsRepo: PrismaWorkforceAuthenticationRepository;
  let credentialsRepo: PrismaUserCredentialRepository;
  let usersRepo: PrismaUserRepository;
  const hasher: PasswordHasher = {
    hash(password: string) {
      return Promise.resolve(`hashed_${password}`);
    },
    verify(password: string, hash: string) {
      return Promise.resolve(hash === `hashed_${password}`);
    },
  };

  beforeAll(async () => {
    assertTestDatabaseSafety(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = EXPECTED_TEST_DB_URL;
    prisma = createPrismaClient();
    prisma2 = createPrismaClient();
    prismaObserver = createPrismaClient();

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

    transactionManager = new PrismaWorkforcePasswordTransactionManager(prisma);
    sessionsRepo = new PrismaWorkforceAuthenticationRepository(prisma);
    credentialsRepo = new PrismaUserCredentialRepository(prisma);
    usersRepo = new PrismaUserRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.auditEntry.deleteMany();
    await prisma.workforceAuthenticationSession.deleteMany();
    await prisma.authenticationSession.deleteMany();
    await prisma.customerAccount.deleteMany();
    await prisma.userCredential.deleteMany();
    await prisma.organizationMembership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await prisma2?.$disconnect();
    await prismaObserver?.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it.each(["login-first", "rotation-first"] as const)(
    "proves %s overlap with distinct transactions and pg_blocking_pids",
    async (ordering) => {
      const org = await prisma.organization.create({
        data: { code: "ORG_RACE", name: "Race test", status: "ACTIVE" },
      });
      const user = await usersRepo.create({
        email: "race@senvo.test",
        name: "Race",
        status: "ACTIVE",
      });
      await prisma.organizationMembership.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: "STAFF",
          status: "ACTIVE",
        },
      });
      const cred = await credentialsRepo.create({
        identifier: "race@senvo.test",
        userId: user.id,
        provider: "PASSWORD",
        status: "ACTIVE",
        passwordHash: await hasher.hash("OldPassword123!"),
      });
      const session: WorkforceAuthenticationSession = {
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: new Date(),
        csrfTokenHash: "race_csrf",
        tokenHash: "race_token",
        expiresAt: new Date(Date.now() + 3600000),
        id: "11111111-1111-4111-8111-111111111111",
        organizationId: org.id,
        userId: user.id,
        rememberMe: false,
        revokedAt: null,
        status: "ACTIVE",
      };
      const newHash = await hasher.hash("NewPassword456!");
      const rotate = (tx: Prisma.TransactionClient) => {
        // Adapt an existing transaction to the production manager; do not
        // reproduce its lock sequence in test-only SQL.
        const manager = new PrismaWorkforcePasswordTransactionManager({
          $transaction: ((
            operation: (client: Prisma.TransactionClient) => Promise<unknown>,
          ) => operation(tx)) as PrismaClient["$transaction"],
        });
        return manager.execute(async (context) => {
          const scope = await context.inspectTargetScope({
            userId: user.id,
            credentialId: cred.id,
          });
          expect(scope?.credential.version).toBe(cred.version);
          const updated = await context.credentials.replacePassword({
            id: cred.id,
            userId: user.id,
            expectedVersion: cred.version,
            passwordHash: newHash,
          });
          expect(updated?.version).toBe(cred.version + 1);
          const revokedSessionCount =
            await context.workforceSessions.revokeAllWorkforceSessionsForUser({
              userId: user.id,
              revokedAt: new Date(),
            });
          await context.auditWriter.recordWithinTransaction({
            action: "WORKFORCE_PASSWORD_SET",
            actor: { userId: null },
            metadata: { revokedSessionCount, success: true },
            organizationId: org.id,
            resource: "USER_CREDENTIAL",
            resourceId: cred.id,
          });
        });
      };
      const login = (tx: Prisma.TransactionClient) =>
        new PrismaWorkforceAuthenticationRepository(
          tx,
        ).createSessionForVerifiedCredential({
          credentialId: cred.id,
          expectedCredentialVersion: cred.version,
          session,
          userId: user.id,
        });
      const firstReady = createBarrier();
      const secondReady = createBarrier();
      const releaseFirst = createBarrier();
      let firstPid = 0;
      let secondPid = 0;
      let issued: WorkforceAuthenticationSession | null = null;
      const pending: Promise<unknown>[] = [];
      try {
        const first = prisma.$transaction(
          async (tx) => {
            const [row] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            firstPid = row!.pid;
            if (ordering === "login-first") {
              issued = await login(tx);
              expect(issued).not.toBeNull();
            } else {
              await rotate(tx);
            }
            firstReady.resolve();
            await releaseFirst.promise;
          },
          { timeout: 15000, maxWait: 5000 },
        );
        pending.push(first);
        void first.catch(firstReady.reject);
        await waitForBarrier(firstReady.promise);

        const second = prisma2.$transaction(
          async (tx) => {
            const [row] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            secondPid = row!.pid;
            secondReady.resolve();
            if (ordering === "login-first") await rotate(tx);
            else issued = await login(tx);
          },
          { timeout: 15000, maxWait: 5000 },
        );
        pending.push(second);
        void second.catch(secondReady.reject);
        await waitForBarrier(secondReady.promise);
        expect(firstPid).not.toBe(secondPid);
        await waitForBlockingPid(prismaObserver, secondPid, firstPid);
        releaseFirst.resolve();
        await Promise.all(pending);
      } finally {
        releaseFirst.resolve();
        await Promise.allSettled(pending);
      }

      const persisted = await prisma.workforceAuthenticationSession.findUnique({
        where: { id: session.id },
      });
      if (ordering === "login-first") {
        expect(persisted?.status).toBe("REVOKED");
        expect(persisted?.revokedAt).not.toBeNull();
      } else {
        expect(issued).toBeNull();
        expect(persisted).toBeNull();
      }
      const updated = await credentialsRepo.findById(cred.id);
      expect(updated?.version).toBe(cred.version + 1);
      expect(
        await hasher.verify("NewPassword456!", updated!.passwordHash!),
      ).toBe(true);
      expect(
        await hasher.verify("OldPassword123!", updated!.passwordHash!),
      ).toBe(false);
    },
    30000,
  );

  it("revokes multiple active workforce sessions for target user while preserving other users and customer sessions", async () => {
    const org = await prisma.organization.create({
      data: { code: "ORG_MULTI_REV", name: "Org Multi Rev", status: "ACTIVE" },
    });

    // Target User A
    const userA = await usersRepo.create({
      email: "user_a@senvo.test",
      name: "User A",
      status: "ACTIVE",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: org.id,
        role: "STAFF",
        status: "ACTIVE",
        userId: userA.id,
      },
    });
    const hashA = await hasher.hash("PasswordA123!");
    await credentialsRepo.create({
      identifier: "user_a@senvo.test",
      passwordHash: hashA,
      provider: "PASSWORD",
      status: "ACTIVE",
      userId: userA.id,
    });

    // Other User B
    const userB = await usersRepo.create({
      email: "user_b@senvo.test",
      name: "User B",
      status: "ACTIVE",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: org.id,
        role: "STAFF",
        status: "ACTIVE",
        userId: userB.id,
      },
    });
    const hashB = await hasher.hash("PasswordB123!");
    await credentialsRepo.create({
      identifier: "user_b@senvo.test",
      passwordHash: hashB,
      provider: "PASSWORD",
      status: "ACTIVE",
      userId: userB.id,
    });

    // Customer User C
    const userC = await usersRepo.create({
      email: "user_c@senvo.test",
      name: "User C",
      status: "ACTIVE",
    });
    await prisma.customerAccount.create({
      data: {
        firstName: "Cust",
        lastName: "User",
        organizationId: org.id,
        termsAcceptedAt: new Date(),
        userId: userC.id,
      },
    });

    // Sessions for User A (2 active, 1 already revoked)
    const sessionA1 = await prisma.workforceAuthenticationSession.create({
      data: {
        csrfTokenHash: "csrf_a1",
        expiresAt: new Date(Date.now() + 3600000),
        id: "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa",
        lastUsedAt: new Date(),
        organizationId: org.id,
        rememberMe: false,
        status: "ACTIVE",
        tokenHash: "token_a1",
        userId: userA.id,
      },
    });
    const sessionA2 = await prisma.workforceAuthenticationSession.create({
      data: {
        csrfTokenHash: "csrf_a2",
        expiresAt: new Date(Date.now() + 3600000),
        id: "aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa",
        lastUsedAt: new Date(),
        organizationId: org.id,
        rememberMe: false,
        status: "ACTIVE",
        tokenHash: "token_a2",
        userId: userA.id,
      },
    });
    const sessionA3PreRevoked =
      await prisma.workforceAuthenticationSession.create({
        data: {
          csrfTokenHash: "csrf_a3",
          expiresAt: new Date(Date.now() + 3600000),
          id: "aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa",
          lastUsedAt: new Date(),
          organizationId: org.id,
          rememberMe: false,
          revokedAt: new Date(Date.now() - 10000),
          status: "REVOKED",
          tokenHash: "token_a3",
          userId: userA.id,
        },
      });

    // Session for User B (active)
    const sessionB1 = await prisma.workforceAuthenticationSession.create({
      data: {
        csrfTokenHash: "csrf_b1",
        expiresAt: new Date(Date.now() + 3600000),
        id: "bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb",
        lastUsedAt: new Date(),
        organizationId: org.id,
        rememberMe: false,
        status: "ACTIVE",
        tokenHash: "token_b1",
        userId: userB.id,
      },
    });

    // Session for Customer User C (active customer session)
    const customerSessionC1 = await prisma.authenticationSession.create({
      data: {
        csrfTokenHash: "csrf_c1",
        expiresAt: new Date(Date.now() + 3600000),
        id: "cccccccc-1111-4ccc-8ccc-cccccccccccc",
        lastUsedAt: new Date(),
        organizationId: org.id,
        rememberMe: false,
        status: "ACTIVE",
        tokenHash: "token_c1",
        userId: userC.id,
      },
    });

    // Revoke all workforce sessions for User A
    const revokedCount = await sessionsRepo.revokeAllWorkforceSessionsForUser({
      revokedAt: new Date(),
      userId: userA.id,
    });

    expect(revokedCount).toBe(2);

    // Verify User A sessions
    const sessionA1After =
      await prisma.workforceAuthenticationSession.findUnique({
        where: { id: sessionA1.id },
      });
    expect(sessionA1After!.status).toBe("REVOKED");
    expect(sessionA1After!.revokedAt).not.toBeNull();

    const sessionA2After =
      await prisma.workforceAuthenticationSession.findUnique({
        where: { id: sessionA2.id },
      });
    expect(sessionA2After!.status).toBe("REVOKED");
    expect(sessionA2After!.revokedAt).not.toBeNull();

    const sessionA3After =
      await prisma.workforceAuthenticationSession.findUnique({
        where: { id: sessionA3PreRevoked.id },
      });
    expect(sessionA3After!.status).toBe("REVOKED");

    // Verify User B sessions (untouched)
    const sessionB1After =
      await prisma.workforceAuthenticationSession.findUnique({
        where: { id: sessionB1.id },
      });
    expect(sessionB1After!.status).toBe("ACTIVE");
    expect(sessionB1After!.revokedAt).toBeNull();

    // Verify Customer User C sessions (untouched)
    const customerSessionC1After =
      await prisma.authenticationSession.findUnique({
        where: { id: customerSessionC1.id },
      });
    expect(customerSessionC1After!.status).toBe("ACTIVE");
    expect(customerSessionC1After!.revokedAt).toBeNull();
  });

  it("rejects target scope when target user has linked customer account or multiple memberships", async () => {
    const org1 = await prisma.organization.create({
      data: { code: "ORG_MULTI1", name: "Org Multi 1", status: "ACTIVE" },
    });
    const org2 = await prisma.organization.create({
      data: { code: "ORG_MULTI2", name: "Org Multi 2", status: "ACTIVE" },
    });
    const user = await usersRepo.create({
      email: "multi@senvo.test",
      name: "Multi Member",
      status: "ACTIVE",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: org1.id,
        role: "STAFF",
        status: "ACTIVE",
        userId: user.id,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: org2.id,
        role: "STAFF",
        status: "INACTIVE",
        userId: user.id,
      },
    });

    await credentialsRepo.create({
      identifier: "multi@senvo.test",
      passwordHash: "hash-123",
      provider: "PASSWORD",
      status: "ACTIVE",
      userId: user.id,
    });

    await transactionManager.execute(async (tx) => {
      const scope = await tx.inspectTargetScope({ userId: user.id });
      expect(scope).not.toBeNull();
      // Has 2 memberships -> must be detected
      expect(scope!.memberships).toHaveLength(2);
    });

    // Now test customer account linkage
    const userCust = await usersRepo.create({
      email: "cust@senvo.test",
      name: "Customer User",
      status: "ACTIVE",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: org1.id,
        role: "STAFF",
        status: "ACTIVE",
        userId: userCust.id,
      },
    });
    await prisma.customerAccount.create({
      data: {
        firstName: "Test",
        lastName: "User",
        organizationId: org1.id,
        termsAcceptedAt: new Date(),
        userId: userCust.id,
      },
    });
    await credentialsRepo.create({
      identifier: "cust@senvo.test",
      passwordHash: "hash-cust",
      provider: "PASSWORD",
      status: "ACTIVE",
      userId: userCust.id,
    });

    await transactionManager.execute(async (tx) => {
      const scope = await tx.inspectTargetScope({ userId: userCust.id });
      expect(scope).not.toBeNull();
      expect(scope!.hasCustomerAccount).toBe(true);
    });
  });

  it("rolls back password replacement and session revocation if audit writing fails", async () => {
    const org = await prisma.organization.create({
      data: { code: "ORG_ROLLBACK", name: "Org Rollback", status: "ACTIVE" },
    });
    const user = await usersRepo.create({
      email: "rollback@senvo.test",
      name: "Rollback User",
      status: "ACTIVE",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: org.id,
        role: "STAFF",
        status: "ACTIVE",
        userId: user.id,
      },
    });

    const initialHash = await hasher.hash("InitialHash123!");
    const cred = await credentialsRepo.create({
      identifier: "rollback@senvo.test",
      passwordHash: initialHash,
      provider: "PASSWORD",
      status: "ACTIVE",
      userId: user.id,
    });

    const session: WorkforceAuthenticationSession = {
      createdAt: new Date(),
      csrfTokenHash: "csrf_rb",
      expiresAt: new Date(Date.now() + 3600000),
      id: "33333333-3333-4333-8333-333333333333",
      lastUsedAt: new Date(),
      organizationId: org.id,
      rememberMe: false,
      revokedAt: null,
      status: "ACTIVE",
      tokenHash: "token_rb",
      updatedAt: new Date(),
      userId: user.id,
    };
    await sessionsRepo.createSessionForVerifiedCredential({
      credentialId: cred.id,
      expectedCredentialVersion: cred.version,
      session,
      userId: user.id,
    });

    // Run transaction that fails during audit write
    await expect(
      transactionManager.execute(async (tx) => {
        await tx.credentials.replacePassword({
          expectedVersion: cred.version,
          id: cred.id,
          passwordHash: "failed_password_hash",
          userId: user.id,
        });

        await tx.workforceSessions.revokeAllWorkforceSessionsForUser({
          revokedAt: new Date(),
          userId: user.id,
        });

        // Deliberate error during audit writing (e.g. sensitive field rejection)
        await tx.auditWriter.recordWithinTransaction({
          action: "WORKFORCE_PASSWORD_SET",
          actor: { userId: null },
          metadata: {
            password: "forbidden_sensitive_key",
          },
          organizationId: org.id,
          resource: "USER_CREDENTIAL",
          resourceId: cred.id,
        });
      }),
    ).rejects.toThrow();

    // Verify everything rolled back!
    const credAfter = await credentialsRepo.findById(cred.id);
    expect(credAfter!.passwordHash).toBe(initialHash);
    expect(credAfter!.version).toBe(cred.version);

    const sessionAfter = await prisma.workforceAuthenticationSession.findUnique(
      {
        where: { id: session.id },
      },
    );
    expect(sessionAfter!.status).toBe("ACTIVE");
    expect(sessionAfter!.revokedAt).toBeNull();
  });
});
