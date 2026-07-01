import { spawn } from "node:child_process";
import {
  getRequiredShadowDatabaseUrl,
  getRequiredTestDatabaseUrl,
  maskDatabaseUrl,
} from "./test-database-safety.mjs";

const command = [
  "corepack",
  "pnpm",
  "--filter",
  "@senvo/database",
  "exec",
  "prisma",
  "migrate",
  "diff",
  "--from-migrations",
  "prisma/migrations",
  "--to-schema",
  "prisma/schema.prisma",
  "--exit-code",
];

try {
  const testDatabaseUrl = getRequiredTestDatabaseUrl();
  const shadowDatabaseUrl = getRequiredShadowDatabaseUrl();
  const environment = {
    ...process.env,
    APP_ENV: process.env.APP_ENV ?? "test",
    DATABASE_URL: testDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
    TEST_SHADOW_DATABASE_URL: shadowDatabaseUrl,
  };

  console.log(`Using test database ${maskDatabaseUrl(testDatabaseUrl)}.`);
  console.log(`Using shadow database ${maskDatabaseUrl(shadowDatabaseUrl)}.`);

  const child = spawn(command[0], command.slice(1), {
    env: environment,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`Command terminated by ${signal}.`);
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
