import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { ConflictError } from "../packages/domain/dist/index.js";
import {
  collectHiddenPassword,
  CancellationError,
  MismatchError,
  OverlengthError,
} from "./secure-maintenance-input.mjs";

export function assertSafeMaintenanceEnvironment(env = process.env) {
  if (env.APP_ENV !== "development" || env.NODE_ENV !== "development") {
    throw new Error(
      "Maintenance requires both environment labels to be development.",
    );
  }
  if (
    Object.keys(env).some((key) => /^PG/i.test(key) && env[key] !== undefined)
  ) {
    throw new Error("PostgreSQL connection overrides are forbidden.");
  }
  let parsed;
  try {
    parsed = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("A valid database URL is required.");
  }
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "5432" ||
    parsed.username !== "postgres" ||
    parsed.password ||
    parsed.pathname !== "/senvo_wear_dev" ||
    parsed.search ||
    parsed.hash ||
    env.DATABASE_URL.includes("?") ||
    env.DATABASE_URL.includes("#")
  ) {
    throw new Error("Database target is not approved for maintenance.");
  }
}

export function assertConnectedIdentity(identity) {
  if (
    !identity ||
    identity.current_database !== "senvo_wear_dev" ||
    identity.current_user !== "postgres" ||
    identity.session_user !== "postgres" ||
    identity.inet_server_addr !== "127.0.0.1" ||
    identity.inet_server_port !== 5432 ||
    identity.pg_is_in_recovery !== false
  ) {
    throw new Error("Connected database identity is not approved.");
  }
}

export function assertNoSecretArguments(argv = process.argv) {
  if (
    argv
      .slice(2)
      .some((arg) => /--(password|pass|secret|token|hash)/i.test(arg))
  ) {
    throw new Error("Secret command-line arguments are forbidden.");
  }
}

export async function loadMaintenanceHasher() {
  const { NodeScryptPasswordHasher } =
    await import("../packages/http/dist/authentication-crypto.js");
  return new NodeScryptPasswordHasher();
}

function toSafeFailureMessage(error) {
  if (error instanceof CancellationError) return "Operation cancelled by user.";
  if (error instanceof MismatchError)
    return "Password confirmation does not match.";
  if (error instanceof OverlengthError)
    return "Password exceeds maximum length.";
  switch (error?.name) {
    case "ConflictError":
      return "Version conflict during update.";
    case "AuthorizationError":
      return "Authorization check failed.";
    case "ValidationApplicationError":
      return "Input validation failed.";
    case "NotFoundError":
      return "Target record was not found.";
    case "BusinessRuleError":
      return "Business rule validation failed.";
    default:
      return "Workforce password maintenance failed.";
  }
}

async function checkIdentity(tx) {
  const [identity] =
    await tx.$queryRaw`SELECT current_database(), current_user, session_user, host(inet_server_addr()) as inet_server_addr, inet_server_port(), pg_is_in_recovery()`;
  assertConnectedIdentity(identity);
}

export async function runWorkforcePasswordMaintenance(options = {}) {
  const env = Object.freeze({ ...(options.env ?? process.env) });
  const argv = options.argv ?? process.argv;
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  let ownedPrisma;
  try {
    assertSafeMaintenanceEnvironment(env);
    assertNoSecretArguments(argv);
    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
      throw new Error(
        "Maintenance requires an interactive terminal with hidden input.",
      );
    }

    const args = argv.slice(2);
    const versionArgs = args.filter((arg) => arg.startsWith("--version="));
    const positional = args.filter((arg) => !arg.startsWith("--version="));
    const targetUserId = options.targetUserId ?? positional[0];
    if (
      positional.length > 1 ||
      versionArgs.length > 1 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        targetUserId ?? "",
      ) ||
      (options.targetUserId &&
        positional.length === 1 &&
        positional[0] !== options.targetUserId)
    ) {
      throw new Error(
        "Provide one valid target user ID and optional --version.",
      );
    }
    const cliVersion = versionArgs.length
      ? Number(versionArgs[0].slice("--version=".length))
      : undefined;
    if (
      cliVersion !== undefined &&
      options.expectedVersion !== undefined &&
      cliVersion !== options.expectedVersion
    ) {
      throw new ConflictError("Expected version inputs disagree.");
    }
    const suppliedVersion = cliVersion ?? options.expectedVersion;
    if (
      suppliedVersion !== undefined &&
      (!Number.isSafeInteger(suppliedVersion) || suppliedVersion < 1)
    ) {
      throw new Error("Expected version must be a positive safe integer.");
    }

    let confirmed = options.confirmed;
    if (confirmed === undefined) {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      try {
        confirmed = /^y(es)?$/i.test(
          (
            await rl.question("Rotate the selected workforce password? [y/N]: ")
          ).trim(),
        );
      } finally {
        rl.close();
      }
    }
    if (confirmed !== true) throw new CancellationError();

    let prisma = options.prisma;
    if (!prisma) {
      // The existing factory reads process.env. Validate that exact environment,
      // without replacing it with injected options or modifying it.
      assertSafeMaintenanceEnvironment(process.env);
      if (env.DATABASE_URL !== process.env.DATABASE_URL) {
        throw new Error("Validated and runtime database configuration differ.");
      }
      const { createPrismaClient } =
        await import("../packages/database/dist/src/index.js");
      ownedPrisma = createPrismaClient();
      prisma = ownedPrisma;
    }

    const target = await prisma.$transaction(async (tx) => {
      await checkIdentity(tx);
      const rows = await tx.userCredential.findMany({
        where: { userId: targetUserId, provider: "PASSWORD", status: "ACTIVE" },
        select: { id: true, userId: true, version: true },
        take: 2,
      });
      if (rows.length !== 1)
        throw new Error("Target password credential is missing or ambiguous.");
      const row = rows[0];
      if (
        row.userId !== targetUserId ||
        !Number.isSafeInteger(row.version) ||
        row.version < 1 ||
        (options.credentialId !== undefined && row.id !== options.credentialId)
      ) {
        throw new Error("Target credential does not match.");
      }
      if (suppliedVersion !== undefined && suppliedVersion !== row.version) {
        throw new ConflictError("Expected credential version is stale.");
      }
      return Object.freeze({
        credentialId: row.id,
        userId: targetUserId,
        expectedVersion: suppliedVersion ?? row.version,
      });
    });

    let service = options.service;
    let authority = options.authority;
    if (!service || !authority) {
      const { WorkforceMaintenanceAuthority } =
        await import("../packages/application/dist/workforce/workforce-maintenance-authority.js");
      const { WorkforcePasswordApplicationService } =
        await import("../packages/application/dist/workforce/workforce-password-application-service.js");
      const { PrismaWorkforcePasswordTransactionManager } =
        await import("../packages/database/dist/src/index.js");
      authority = new WorkforceMaintenanceAuthority();
      // The manager receives a transaction adapter: identity and every mutation
      // run on the same transaction client, with no nested/pool transaction.
      const transactionManager = new PrismaWorkforcePasswordTransactionManager({
        $transaction: (operation) =>
          prisma.$transaction(async (tx) => {
            await checkIdentity(tx);
            return operation(tx);
          }),
      });
      service = new WorkforcePasswordApplicationService({
        authority,
        passwords: await loadMaintenanceHasher(),
        transactionManager,
      });
    }

    const newPassword = await collectHiddenPassword({ stdin, stdout });
    const operatorId =
      options.operatorId ?? env.USERNAME ?? env.USER ?? "maintenance-operator";
    const capability = authority.issueCapability({
      ...target,
      targetUserId,
      operatorId,
    });
    const result = await service.setPassword({
      capability,
      credentialId: target.credentialId,
      expectedVersion: target.expectedVersion,
      newPassword,
      operatorId,
      requestId: options.requestId ?? `req_maint_${Date.now()}`,
      targetUserId,
    });
    const safeOutput = {
      credentialId: result.credentialId,
      resultingVersion: result.resultingVersion,
      revokedSessionCount: result.revokedSessionCount,
      success: true,
      userId: result.userId,
    };
    stdout.write(`${JSON.stringify(safeOutput)}\n`);
    return safeOutput;
  } catch (error) {
    const message = toSafeFailureMessage(error);
    stdout.write(`${JSON.stringify({ error: message, success: false })}\n`);
    // Callers also receive only safe text, without a raw database error cause.
    const safeError = new Error(message);
    if (error instanceof ConflictError) safeError.name = "ConflictError";
    throw safeError;
  } finally {
    if (ownedPrisma) await ownedPrisma.$disconnect().catch(() => {});
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runWorkforcePasswordMaintenance().catch(() => {
    process.exitCode = 1;
  });
}
