import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import {
  runWorkforcePasswordMaintenance,
  assertSafeMaintenanceEnvironment,
  assertConnectedIdentity,
  assertNoSecretArguments,
  loadMaintenanceHasher,
} from "./workforce-password-maintenance.mjs";

const targetUserId = "11111111-1111-4111-8111-111111111111";
const credentialId = "22222222-2222-4222-8222-222222222222";
const VALID_DEV_ENV = {
  APP_ENV: "development",
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/senvo_wear_dev",
};
const identity = {
  current_database: "senvo_wear_dev",
  current_user: "postgres",
  session_user: "postgres",
  inet_server_addr: "127.0.0.1",
  inet_server_port: 5432,
  pg_is_in_recovery: false,
};
const password = "SYNTHETIC_PASSWORD_SENTINEL_123!";
class FakeStdin extends EventEmitter {
  isTTY = true;
  isRaw = false;
  setRawMode(mode) {
    this.isRaw = mode;
  }
  resume() {}
}

function harness({ version = 3, connectedIdentity = identity, failure } = {}) {
  const stdin = new FakeStdin();
  const calls = { preflight: 0, mutation: 0, issued: [], passwords: 0 };
  const stdout = {
    output: "",
    write(text) {
      this.output += text;
      if (
        text === "Enter new password: " ||
        text === "Confirm new password: "
      ) {
        calls.passwords++;
        queueMicrotask(() => stdin.emit("data", Buffer.from(password + "\n")));
      }
      return true;
    },
  };
  const tx = {
    $queryRaw: async () => [connectedIdentity],
    userCredential: {
      findMany: async () => {
        calls.preflight++;
        return [{ id: credentialId, userId: targetUserId, version }];
      },
    },
  };
  const prisma = { $transaction: async (operation) => operation(tx) };
  const authority = {
    issueCapability(input) {
      calls.issued.push(input);
      return Object.freeze(input);
    },
  };
  const service = {
    async setPassword(input) {
      if (failure) throw failure;
      calls.mutation++;
      assert.equal(input.newPassword, password);
      assert.equal(input.expectedVersion, input.capability.expectedVersion);
      assert.equal(input.credentialId, credentialId);
      return {
        credentialId,
        userId: targetUserId,
        resultingVersion: input.expectedVersion + 1,
        revokedSessionCount: 2,
        passwordHash: "HASH_SENTINEL",
        salt: "SALT_SENTINEL",
        token: "TOKEN_SENTINEL",
      };
    },
  };
  return {
    calls,
    stdin,
    stdout,
    options: {
      env: VALID_DEV_ENV,
      argv: ["node", "script.mjs", targetUserId],
      stdin,
      stdout,
      confirmed: true,
      prisma,
      authority,
      service,
    },
  };
}

test("real hasher loader resolves production crypto without creating a database client", async () => {
  const hasher = await loadMaintenanceHasher();
  assert.equal(hasher.constructor.name, "NodeScryptPasswordHasher");
  const hash = await hasher.hash(password);
  assert.equal(await hasher.verify(password, hash), true);
  assert.equal(await hasher.verify("wrong-password", hash), false);
});

test("strict labels reject mixed, staging, test, missing and arbitrary environments", () => {
  for (const key of ["APP_ENV", "NODE_ENV"]) {
    for (const value of [
      "production",
      "staging",
      "test",
      "",
      undefined,
      "DEVELOPMENT",
    ]) {
      assert.throws(() =>
        assertSafeMaintenanceEnvironment({ ...VALID_DEV_ENV, [key]: value }),
      );
    }
  }
  assert.doesNotThrow(() => assertSafeMaintenanceEnvironment(VALID_DEV_ENV));
});

test("guard rejects wrong protocol, host, explicit port, user, database, password, query and fragment", () => {
  const urls = [
    "postgres://postgres@127.0.0.1:5432/senvo_wear_dev",
    "https://postgres@127.0.0.1:5432/senvo_wear_dev",
    "postgresql://postgres@localhost:5432/senvo_wear_dev",
    "postgresql://postgres@remote.invalid:5432/senvo_wear_dev",
    "postgresql://postgres@127.0.0.1:5433/senvo_wear_dev",
    "postgresql://postgres@127.0.0.1/senvo_wear_dev",
    "postgresql://other@127.0.0.1:5432/senvo_wear_dev",
    "postgresql://postgres@127.0.0.1:5432/senvo_production",
    "postgresql://postgres@127.0.0.1:5432/other_db",
    "postgresql://postgres:SECRET@127.0.0.1:5432/senvo_wear_dev",
    VALID_DEV_ENV.DATABASE_URL + "?host=remote.invalid",
    VALID_DEV_ENV.DATABASE_URL + "#fragment",
    VALID_DEV_ENV.DATABASE_URL + "?",
    VALID_DEV_ENV.DATABASE_URL + "#",
  ];
  for (const DATABASE_URL of urls)
    assert.throws(() =>
      assertSafeMaintenanceEnvironment({ ...VALID_DEV_ENV, DATABASE_URL }),
    );
});

test("guard rejects all present PG overrides, including unlisted and empty overrides", () => {
  for (const key of [
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGPASSWORD",
    "PGSERVICE",
    "PGPASSFILE",
    "PGOPTIONS",
    "PGSERVICEFILE",
    "PGSSLMODE",
  ]) {
    for (const value of ["override", ""])
      assert.throws(() =>
        assertSafeMaintenanceEnvironment({ ...VALID_DEV_ENV, [key]: value }),
      );
  }
});

test("connected identity requires exact fields including explicit non-recovery state", () => {
  assert.doesNotThrow(() => assertConnectedIdentity(identity));
  for (const key of Object.keys(identity)) {
    assert.throws(() =>
      assertConnectedIdentity({ ...identity, [key]: undefined }),
    );
    assert.throws(() =>
      assertConnectedIdentity({
        ...identity,
        [key]: key === "pg_is_in_recovery" ? true : "wrong",
      }),
    );
  }
});

test("secret arguments are rejected", () => {
  for (const arg of [
    "--password=SECRET",
    "--secret",
    "--hash=HASH",
    "--token=TOKEN",
  ]) {
    assert.throws(() => assertNoSecretArguments(["node", "script.mjs", arg]));
  }
});

test("noninteractive and unconfirmed calls cannot inspect or mutate", async () => {
  for (const mode of ["noninteractive", "unconfirmed"]) {
    const h = harness();
    if (mode === "noninteractive") h.stdin.isTTY = false;
    else h.options.confirmed = false;
    await assert.rejects(runWorkforcePasswordMaintenance(h.options));
    assert.equal(h.calls.preflight, 0);
    assert.equal(h.calls.mutation, 0);
  }
});

test("connected identity mismatch prevents credential reads and mutation", async () => {
  const h = harness({
    connectedIdentity: { ...identity, inet_server_port: 55439 },
  });
  await assert.rejects(runWorkforcePasswordMaintenance(h.options));
  assert.equal(h.calls.preflight, 0);
  assert.equal(h.calls.mutation, 0);
  assert.equal(h.calls.passwords, 0);
});

test("explicit matching --version above one is retained in capability and service", async () => {
  const h = harness();
  h.options.argv.push("--version=3");
  const result = await runWorkforcePasswordMaintenance(h.options);
  assert.equal(result.resultingVersion, 4);
  assert.equal(h.calls.issued[0].expectedVersion, 3);
  assert.equal(h.calls.mutation, 1);
});

test("stale explicit --version is never replaced by preflight and fails before password input or mutation", async () => {
  const h = harness();
  h.options.argv.push("--version=2");
  await assert.rejects(runWorkforcePasswordMaintenance(h.options), {
    name: "ConflictError",
  });
  assert.equal(h.calls.preflight, 1);
  assert.equal(h.calls.issued.length, 0);
  assert.equal(h.calls.passwords, 0);
  assert.equal(h.calls.mutation, 0);
});

test("omitted version comes from guarded preflight, never default one", async () => {
  const h = harness({ version: 8 });
  const result = await runWorkforcePasswordMaintenance(h.options);
  assert.equal(h.calls.issued[0].expectedVersion, 8);
  assert.equal(result.resultingVersion, 9);
});

test("invalid, duplicate and conflicting version arguments fail before preflight", async () => {
  for (const value of [
    "0",
    "-1",
    "1.5",
    "NaN",
    "Infinity",
    "",
    "9007199254740992",
  ]) {
    const h = harness();
    h.options.argv.push("--version=" + value);
    await assert.rejects(runWorkforcePasswordMaintenance(h.options));
    assert.equal(h.calls.preflight, 0);
  }
  for (const duplicate of [true, false]) {
    const h = harness();
    h.options.argv.push("--version=3");
    if (duplicate) h.options.argv.push("--version=4");
    else h.options.expectedVersion = 4;
    await assert.rejects(runWorkforcePasswordMaintenance(h.options));
    assert.equal(h.calls.preflight, 0);
  }
});

test("success emits only allowlisted fields without secrets", async () => {
  const h = harness();
  await runWorkforcePasswordMaintenance(h.options);
  for (const secret of [
    password,
    "HASH_SENTINEL",
    "SALT_SENTINEL",
    "TOKEN_SENTINEL",
    VALID_DEV_ENV.DATABASE_URL,
  ]) {
    assert.equal(h.stdout.output.includes(secret), false);
  }
  assert.equal(h.stdin.isRaw, false);
  assert.equal(h.stdin.listenerCount("data"), 0);
});

test("failure output and rejected error redact raw database and secret material", async () => {
  const secrets = [
    password,
    "HASH_SENTINEL",
    "SALT_SENTINEL",
    "TOKEN_SENTINEL",
    VALID_DEV_ENV.DATABASE_URL,
    "postgres",
    "127.0.0.1",
    "5432",
    "SELECT password_hash",
    "Prisma",
  ];
  const failure = new Error(secrets.join(" "));
  const h = harness({ failure });
  let rejected;
  try {
    await runWorkforcePasswordMaintenance(h.options);
  } catch (error) {
    rejected = error;
  }
  assert.ok(rejected);
  for (const secret of secrets) {
    assert.equal(h.stdout.output.includes(secret), false);
    assert.equal(rejected.message.includes(secret), false);
  }
  assert.equal(rejected.cause, undefined);
  assert.equal(h.calls.mutation, 0);
});

test("CLI entrypoint prints sanitized failure only and exits nonzero without database access", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/workforce-password-maintenance.mjs"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        APP_ENV: "invalid",
        NODE_ENV: "invalid",
        DATABASE_URL: "RAW_SECRET_SENTINEL",
      },
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    error: "Workforce password maintenance failed.",
    success: false,
  });
});
