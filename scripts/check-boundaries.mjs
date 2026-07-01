import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const sourceRoots = ["apps", "packages"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const violations = [];

const forbiddenByPackage = new Map([
  [
    "packages/domain",
    [
      {
        pattern: /^@senvo\/database($|\/)/,
        reason: "domain must not depend on database",
      },
      { pattern: /^@senvo\/ui($|\/)/, reason: "domain must not depend on UI" },
      { pattern: /^@prisma\//, reason: "domain must not depend on Prisma" },
      { pattern: /^next($|\/)/, reason: "domain must not depend on Next.js" },
      { pattern: /^react($|\/)/, reason: "domain must not depend on React" },
    ],
  ],
  [
    "packages/contracts",
    [
      {
        pattern: /^@senvo\/database($|\/)/,
        reason: "contracts must not expose database records",
      },
      {
        pattern: /^@prisma\//,
        reason: "contracts must not expose Prisma types",
      },
    ],
  ],
  [
    "packages/database",
    [
      {
        pattern: /^@senvo\/ui($|\/)/,
        reason: "database must not depend on UI",
      },
      { pattern: /^next($|\/)/, reason: "database must not depend on Next.js" },
      { pattern: /^react($|\/)/, reason: "database must not depend on React" },
    ],
  ],
  [
    "packages/utils",
    [
      {
        pattern: /^@senvo\/database($|\/)/,
        reason: "utils must not contain database access",
      },
      {
        pattern: /^@prisma\//,
        reason: "utils must not contain database access",
      },
      {
        pattern: /^next($|\/)/,
        reason: "utils must not contain framework code",
      },
      { pattern: /^react($|\/)/, reason: "utils must not contain UI code" },
    ],
  ],
]);

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (
      ["node_modules", ".next", ".turbo", "dist", "generated"].includes(entry)
    ) {
      continue;
    }

    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path);
      continue;
    }

    const extension = path.slice(path.lastIndexOf("."));
    if (sourceExtensions.has(extension)) {
      inspectFile(path);
    }
  }
}

function packageScope(relativePath) {
  const normalized = relativePath.split(sep).join("/");
  for (const scope of forbiddenByPackage.keys()) {
    if (normalized.startsWith(`${scope}/`)) {
      return scope;
    }
  }
  return null;
}

function inspectFile(path) {
  const rel = relative(root, path);
  const scope = packageScope(rel);
  if (!scope) {
    return;
  }

  const rules = forbiddenByPackage.get(scope) ?? [];
  const content = readFileSync(path, "utf8");
  const imports = content.matchAll(
    /(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']|import\(["']([^"']+)["']\)/g,
  );

  for (const match of imports) {
    const specifier = match[1] ?? match[2];
    for (const rule of rules) {
      if (rule.pattern.test(specifier)) {
        violations.push(`${rel}: ${rule.reason}: ${specifier}`);
      }
    }
  }
}

for (const directory of sourceRoots) {
  walk(join(root, directory));
}

if (violations.length > 0) {
  console.error("Package boundary violations found:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Package boundary check passed.");
