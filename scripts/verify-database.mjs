import { spawnSync } from "node:child_process";
import {
  getRequiredShadowDatabaseUrl,
  getRequiredTestDatabaseUrl,
  maskDatabaseUrl,
} from "./test-database-safety.mjs";

let testDatabaseUrl;
try {
  testDatabaseUrl = getRequiredTestDatabaseUrl();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const baseEnvironment = {
  ...process.env,
  APP_ENV: process.env.APP_ENV ?? "test",
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl,
};

console.log(`Verifying database ${maskDatabaseUrl(testDatabaseUrl)}.`);

const steps = [
  ["Generate Prisma client", ["corepack", "pnpm", "db:generate"]],
  ["Apply migrations", ["corepack", "pnpm", "db:test:migrate"]],
  ["Migration status", ["corepack", "pnpm", "db:test:status"]],
  [
    "Run catalog integration tests",
    ["corepack", "pnpm", "test:catalog:integration"],
  ],
  ["Reset test database", ["corepack", "pnpm", "db:test:reset"]],
  ["Reapply migrations after reset", ["corepack", "pnpm", "db:test:migrate"]],
  [
    "Rerun catalog integration tests after reset",
    ["corepack", "pnpm", "test:catalog:integration"],
  ],
];

for (const [label, command] of steps) {
  runStep(label, command, baseEnvironment);
}

try {
  const shadowDatabaseUrl = getRequiredShadowDatabaseUrl();
  runStep("Migration drift check", ["corepack", "pnpm", "db:test:drift"], {
    ...baseEnvironment,
    TEST_SHADOW_DATABASE_URL: shadowDatabaseUrl,
  });
} catch (error) {
  console.warn(
    `Skipped migration drift check: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

function runStep(label, command, environment) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command[0], command.slice(1), {
    env: environment,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
