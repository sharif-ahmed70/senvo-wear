import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const requiredOutputs = [
  "packages/domain/dist/index.js",
  "packages/domain/dist/index.d.ts",
  "packages/database/generated/prisma/client.ts",
];

run("Clean generated outputs", "corepack pnpm clean");
run(
  "Prepare database integration dependencies",
  "corepack pnpm prepare:database-integration",
);

for (const output of requiredOutputs) {
  if (!existsSync(join(root, output))) {
    console.error(`Expected generated output is missing: ${output}`);
    process.exit(1);
  }
}

const databaseRequire = createRequire(
  join(root, "packages/database/package.json"),
);
const domainEntry = databaseRequire.resolve("@senvo/domain");
await import(pathToFileURL(domainEntry));
console.log("@senvo/domain public export resolves after preparation.");

run(
  "Import database integration test without PostgreSQL",
  "corepack pnpm --filter @senvo/database test:integration",
  {
    ...process.env,
    DATABASE_URL: undefined,
    TEST_DATABASE_URL: undefined,
  },
);

function run(label, command, environment = process.env) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, {
    env: environment,
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
