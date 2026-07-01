import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const databasePackageJson = JSON.parse(
  readFileSync("packages/database/package.json", "utf8"),
);
const driftScript = packageJson.scripts?.["db:test:drift"] ?? "";
const migrationReviewDoc = readFileSync(
  "docs/operations/first-business-migration-review.md",
  "utf8",
);
const secondMigrationReviewDoc = readFileSync(
  "docs/operations/second-business-migration-review.md",
  "utf8",
);

const commandOwners = [
  ["root package.json", packageJson.scripts ?? {}],
  ["packages/database/package.json", databasePackageJson.scripts ?? {}],
];

const prohibitedFlags = ["--skip-seed", "--shadow-database-url"];
const compatibilityChecks = [
  {
    name: "packages/database db:generate",
    helpCommand:
      "corepack pnpm --filter @senvo/database exec prisma generate --help",
    flags: [],
  },
  {
    name: "packages/database db:validate",
    helpCommand:
      "corepack pnpm --filter @senvo/database exec prisma validate --help",
    flags: [],
  },
  {
    name: "packages/database db:migrate:create",
    helpCommand:
      "corepack pnpm --filter @senvo/database exec prisma migrate dev --help",
    flags: ["--create-only"],
  },
  {
    name: "packages/database db:migrate:deploy",
    helpCommand:
      "corepack pnpm --filter @senvo/database exec prisma migrate deploy --help",
    flags: [],
  },
  {
    name: "packages/database db:push:dev",
    helpCommand:
      "corepack pnpm --filter @senvo/database exec prisma db push --help",
    flags: [],
  },
  {
    name: "root db:test:migrate",
    helpCommand:
      "corepack pnpm --filter @senvo/database exec prisma migrate deploy --help",
    flags: [],
  },
  {
    name: "root db:test:status",
    helpCommand:
      "corepack pnpm --filter @senvo/database exec prisma migrate status --help",
    flags: [],
  },
  {
    name: "root db:test:reset",
    helpCommand:
      "corepack pnpm --filter @senvo/database exec prisma migrate reset --help",
    flags: ["--force"],
  },
  {
    name: "root db:test:drift wrapper",
    helpCommand:
      "corepack pnpm --filter @senvo/database exec prisma migrate diff --help",
    flags: ["--from-migrations", "--to-schema", "--exit-code"],
  },
  {
    name: "docs first business migration review",
    helpCommand:
      "corepack pnpm --filter @senvo/database exec prisma migrate diff --help",
    flags: ["--from-empty", "--to-schema", "--script"],
  },
  {
    name: "docs second business migration review",
    helpCommand:
      "corepack pnpm --filter @senvo/database exec prisma migrate diff --help",
    flags: ["--from-schema", "--to-schema", "--script"],
  },
];

for (const [owner, scripts] of commandOwners) {
  for (const [scriptName, script] of Object.entries(scripts)) {
    if (typeof script !== "string" || !script.includes("prisma")) {
      continue;
    }

    for (const prohibitedFlag of prohibitedFlags) {
      if (script.includes(prohibitedFlag)) {
        console.error(
          `${owner} script ${scriptName} uses unsupported Prisma 7 option: ${prohibitedFlag}`,
        );
        process.exit(1);
      }
    }
  }
}

for (const prohibitedFlag of prohibitedFlags) {
  for (const [documentPath, documentContent] of [
    ["docs/operations/first-business-migration-review.md", migrationReviewDoc],
    [
      "docs/operations/second-business-migration-review.md",
      secondMigrationReviewDoc,
    ],
  ]) {
    if (documentContent.includes(prohibitedFlag)) {
      console.error(
        `${documentPath} uses unsupported Prisma 7 option: ${prohibitedFlag}`,
      );
      process.exit(1);
    }
  }
}

if (driftScript !== "node scripts/run-test-drift-check.mjs") {
  console.error(
    "db:test:drift must use scripts/run-test-drift-check.mjs so Prisma 7 reads the shadow database URL from config.",
  );
  process.exit(1);
}

for (const check of compatibilityChecks) {
  const help = spawnSync(check.helpCommand, {
    encoding: "utf8",
    env: {
      ...process.env,
      APP_ENV: process.env.APP_ENV ?? "test",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://senvo_test:senvo_test_password@localhost:55432/senvo_wear_test",
    },
    shell: true,
  });

  const helpOutput = `${help.stdout ?? ""}\n${help.stderr ?? ""}`;

  if (help.status !== 0) {
    console.error(helpOutput.trim());
    process.exit(help.status ?? 1);
  }

  for (const flag of check.flags) {
    if (!helpOutput.includes(flag)) {
      console.error(
        `${check.name} uses ${flag}, but the installed Prisma CLI help for that command does not include it.`,
      );
      process.exit(1);
    }
  }

  for (const prohibitedFlag of prohibitedFlags) {
    if (check.flags.includes(prohibitedFlag)) {
      console.error(
        `${check.name} uses unsupported Prisma 7 option: ${prohibitedFlag}`,
      );
      process.exit(1);
    }
  }
}

console.log("Prisma CLI compatibility check passed.");
