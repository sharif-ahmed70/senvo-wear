import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const migrationsRoot = join(
  root,
  "packages",
  "database",
  "prisma",
  "migrations",
);
const offenders = [];

walk(migrationsRoot);

if (offenders.length > 0) {
  console.error("Migration SQL files must be UTF-8 without BOM:");
  for (const offender of offenders) {
    console.error(`- ${offender}`);
  }
  process.exit(1);
}

console.log("Migration SQL encoding check passed.");

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path);
      continue;
    }
    if (entry.endsWith(".sql")) {
      inspectSql(path);
    }
  }
}

function inspectSql(path) {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    offenders.push(relative(root, path).replaceAll("\\", "/"));
  }
}
