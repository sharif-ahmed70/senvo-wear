import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const sourceRoots = ["apps", "packages"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const violations = [];

const forbiddenByPackage = new Map([
  ["apps", []],
  [
    "packages/domain",
    [
      {
        pattern: /^@senvo\/database($|\/)/,
        reason: "domain must not depend on database",
      },
      {
        pattern: /^@senvo\/application($|\/)/,
        reason: "domain must not depend on application services",
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
        pattern: /^@senvo\/application($|\/)/,
        reason: "contracts must not depend on application services",
      },
      {
        pattern: /^@prisma\//,
        reason: "contracts must not expose Prisma types",
      },
    ],
  ],
  [
    "packages/application",
    [
      {
        pattern: /^@senvo\/ui($|\/)/,
        reason: "application services must not depend on UI",
      },
      {
        pattern: /^@prisma\//,
        reason:
          "application services must depend on database repositories, not Prisma directly",
      },
      {
        pattern: /^next($|\/)/,
        reason: "application services must not depend on Next.js",
      },
      {
        pattern: /^react($|\/)/,
        reason: "application services must not depend on React",
      },
    ],
  ],
  [
    "packages/api",
    [
      {
        pattern: /^@senvo\/database($|\/)/,
        reason: "API gateway must not depend on database infrastructure",
      },
      {
        pattern: /^@senvo\/ui($|\/)/,
        reason: "API gateway must not depend on UI",
      },
      {
        pattern: /^@prisma\//,
        reason: "API gateway must not depend on Prisma",
      },
      {
        pattern: /^next($|\/)/,
        reason: "API gateway must remain transport-independent",
      },
      {
        pattern: /^react($|\/)/,
        reason: "API gateway must not depend on React",
      },
    ],
  ],
  [
    "packages/http",
    [
      {
        pattern: /^@senvo\/database($|\/)/,
        reason: "HTTP adapter must not depend on database infrastructure",
      },
      {
        pattern: /^@senvo\/ui($|\/)/,
        reason: "HTTP adapter must not depend on UI",
      },
      {
        pattern: /^@prisma\//,
        reason: "HTTP adapter must not depend on Prisma",
      },
      {
        pattern: /^next($|\/)/,
        reason: "Node HTTP adapter must not depend on Next.js",
      },
      {
        pattern: /^react($|\/)/,
        reason: "HTTP adapter must not depend on React",
      },
    ],
  ],
  [
    "packages/database",
    [
      {
        pattern: /^@senvo\/application($|\/)/,
        reason: "database must not depend on application services",
      },
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
        pattern: /^@senvo\/application($|\/)/,
        reason: "utils must not contain application service composition",
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
  [
    "packages/ui",
    [
      {
        pattern: /^@senvo\/application($|\/)/,
        reason: "UI must not import server-only application services",
      },
      {
        pattern: /^@senvo\/database($|\/)/,
        reason: "UI must not import database access",
      },
    ],
  ],
  [
    "packages/logger",
    [
      {
        pattern: /^@senvo\/application($|\/)/,
        reason: "logger must not depend on application services",
      },
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

  const fileImports = [...imports].map((match) => match[1] ?? match[2]);
  const isClientFile = /^\s*["']use client["'];?/mu.test(content);

  for (const specifier of fileImports) {
    for (const rule of rules) {
      if (rule.pattern.test(specifier)) {
        violations.push(`${rel}: ${rule.reason}: ${specifier}`);
      }
    }
    if (
      isClientFile &&
      /^@senvo\/(?:application|database)($|\/)/.test(specifier)
    ) {
      violations.push(
        `${rel}: client modules must not import server-only packages: ${specifier}`,
      );
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
