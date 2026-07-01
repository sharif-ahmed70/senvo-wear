import { spawn } from "node:child_process";
import {
  getRequiredShadowDatabaseUrl,
  getRequiredTestDatabaseUrl,
  maskDatabaseUrl,
} from "./test-database-safety.mjs";

const args = process.argv.slice(2);
const useShadow = args[0] === "--shadow";
const commandArgs = useShadow ? args.slice(1) : args;

if (commandArgs.length === 0) {
  console.error("A command is required.");
  process.exit(1);
}

try {
  const testDatabaseUrl = getRequiredTestDatabaseUrl();
  const environment = {
    ...process.env,
    APP_ENV: process.env.APP_ENV ?? "test",
    DATABASE_URL: testDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
  };

  if (useShadow) {
    environment.TEST_SHADOW_DATABASE_URL = getRequiredShadowDatabaseUrl();
  }

  const replacedArgs = commandArgs.map((arg) =>
    arg === "$TEST_DATABASE_URL"
      ? testDatabaseUrl
      : arg === "$TEST_SHADOW_DATABASE_URL"
        ? environment.TEST_SHADOW_DATABASE_URL
        : arg,
  );

  console.log(`Using test database ${maskDatabaseUrl(testDatabaseUrl)}.`);
  const child = spawn(replacedArgs[0], replacedArgs.slice(1), {
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
