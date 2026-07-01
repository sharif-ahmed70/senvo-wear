import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const commands = [
  ["build", ["corepack", "pnpm", "build"]],
  ["typecheck", ["corepack", "pnpm", "typecheck"]],
  ["test:run", ["corepack", "pnpm", "test:run"]],
];

const results = new Map();

await Promise.all(
  commands.map(
    ([label, command]) =>
      new Promise((resolve) => {
        const child = spawn(command[0], command.slice(1), {
          shell: process.platform === "win32",
          stdio: "inherit",
        });
        child.on("exit", (code, signal) => {
          results.set(label, { code, signal });
          resolve();
        });
      }),
  ),
);

let failed = false;
for (const [label, result] of results) {
  if (result.signal || result.code !== 0) {
    console.error(
      `${label} failed with ${
        result.signal ? `signal ${result.signal}` : `exit code ${result.code}`
      }.`,
    );
    failed = true;
  }
}

const generatedClientPath = join(
  process.cwd(),
  "packages",
  "database",
  "generated",
  "prisma",
  "client.ts",
);

if (!existsSync(generatedClientPath)) {
  console.error(
    `Generated Prisma client is missing at ${generatedClientPath}.`,
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log(
  "Generated Prisma client remained available during concurrent tasks.",
);
