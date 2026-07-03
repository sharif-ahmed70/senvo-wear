import { rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const targets = [
  ".turbo",
  "apps/admin/.next",
  "apps/admin/tsconfig.tsbuildinfo",
  "apps/pos/.next",
  "apps/pos/tsconfig.tsbuildinfo",
  "apps/storefront/.next",
  "apps/storefront/tsconfig.tsbuildinfo",
  "packages/application/dist",
  "packages/contracts/dist",
  "packages/database/dist",
  "packages/database/generated",
  "packages/domain/dist",
  "packages/logger/dist",
  "packages/storage/dist",
  "packages/testing/dist",
  "packages/ui/dist",
  "packages/utils/dist",
];

for (const target of targets) {
  rmSync(join(root, target), { force: true, recursive: true });
}

console.log("Removed generated and build outputs.");
