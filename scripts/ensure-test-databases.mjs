import { createRequire } from "node:module";
import {
  assertSafeTestDatabaseUrl,
  getRequiredShadowDatabaseUrl,
  getRequiredTestDatabaseUrl,
  maskDatabaseUrl,
} from "./test-database-safety.mjs";

const requireFromDatabasePackage = createRequire(
  new URL("../packages/database/package.json", import.meta.url),
);
const { Client } = requireFromDatabasePackage("pg");

const adminDatabaseUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!adminDatabaseUrl) {
  console.error(
    "TEST_ADMIN_DATABASE_URL is required to create test databases.",
  );
  process.exit(1);
}

try {
  const testDatabaseUrl = getRequiredTestDatabaseUrl();
  const shadowDatabaseUrl = getRequiredShadowDatabaseUrl();
  await ensureDatabase(adminDatabaseUrl, testDatabaseUrl, "TEST_DATABASE_URL");
  await ensureDatabase(
    adminDatabaseUrl,
    shadowDatabaseUrl,
    "TEST_SHADOW_DATABASE_URL",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function ensureDatabase(adminUrl, databaseUrl, variableName) {
  assertSafeTestDatabaseUrl(databaseUrl, variableName);
  const databaseName = decodeURIComponent(
    new URL(databaseUrl).pathname.slice(1),
  );
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    }
    console.log(
      `Ensured ${variableName} database ${maskDatabaseUrl(databaseUrl)}.`,
    );
  } finally {
    await client.end();
  }
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
