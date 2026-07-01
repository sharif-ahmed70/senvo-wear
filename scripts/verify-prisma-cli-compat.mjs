import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const resetScript = packageJson.scripts?.["db:test:reset"] ?? "";

if (resetScript.includes("--skip-seed")) {
  console.error(
    "db:test:reset uses unsupported Prisma 7 migrate reset option: --skip-seed",
  );
  process.exit(1);
}

const help = spawnSync(
  "corepack pnpm --filter @senvo/database exec prisma migrate reset --help",
  {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://senvo_test:senvo_test_password@localhost:55432/senvo_wear_test",
    },
    shell: true,
  },
);

const helpOutput = `${help.stdout ?? ""}\n${help.stderr ?? ""}`;

if (help.status !== 0) {
  console.error(helpOutput.trim());
  process.exit(help.status ?? 1);
}

if (!helpOutput.includes("--force")) {
  console.error(
    "Prisma migrate reset help does not include the required --force option.",
  );
  process.exit(1);
}

if (helpOutput.includes("--skip-seed")) {
  console.error(
    "Prisma migrate reset unexpectedly documents --skip-seed; review reset script policy.",
  );
  process.exit(1);
}

console.log("Prisma CLI compatibility check passed.");
