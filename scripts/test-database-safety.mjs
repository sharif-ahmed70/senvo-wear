const productionWords = /\b(prod|production|stage|staging)\b/i;

export function getRequiredTestDatabaseUrl(environment = process.env) {
  const databaseUrl = environment.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for database verification.");
  }
  assertSafeTestDatabaseUrl(databaseUrl, "TEST_DATABASE_URL", environment);
  return databaseUrl;
}

export function getRequiredShadowDatabaseUrl(environment = process.env) {
  const databaseUrl = environment.TEST_SHADOW_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "TEST_SHADOW_DATABASE_URL is required for migration drift checks.",
    );
  }
  assertSafeTestDatabaseUrl(
    databaseUrl,
    "TEST_SHADOW_DATABASE_URL",
    environment,
  );
  return databaseUrl;
}

export function assertSafeTestDatabaseUrl(
  databaseUrl,
  variableName,
  environment = process.env,
) {
  const appEnv = environment.APP_ENV ?? environment.NODE_ENV ?? "test";
  if (productionWords.test(appEnv)) {
    throw new Error(
      `${variableName} may not be used when APP_ENV/NODE_ENV is ${appEnv}.`,
    );
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(`${variableName} must use the postgresql:// protocol.`);
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName) {
    throw new Error(`${variableName} must include a database name.`);
  }

  if (!/(^|[_-])test($|[_-])|test/i.test(databaseName)) {
    throw new Error(
      `${variableName} database name must clearly include "test"; received "${databaseName}".`,
    );
  }

  if (
    productionWords.test(databaseName) ||
    productionWords.test(parsed.hostname)
  ) {
    throw new Error(`${variableName} appears to target production or staging.`);
  }
}

export function maskDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (parsed.password) {
    parsed.password = "***";
  }
  if (parsed.username) {
    parsed.username = "***";
  }
  return parsed.toString();
}

// Stricter guard for integration suites that connect from inside vitest.
// Applies assertSafeTestDatabaseUrl and additionally:
// - rejects production/staging in APP_ENV or NODE_ENV independently, so
//   APP_ENV=test cannot mask NODE_ENV=production;
// - matches production words as tokens split on any non-alphanumeric
//   character, so underscores (senvo_prod, production_test) cannot hide them;
// - requires a local host and a database name ending in "_test" (or one of the
//   CI test database names), and always refuses the development database.
const productionTokenPattern =
  /(^|[^a-z0-9])(prod|production|stage|staging)([^a-z0-9]|$)/i;
const localTestHosts = new Set(["127.0.0.1", "localhost"]);
const ciTestDatabaseNames = new Set([
  "senvo_wear_test",
  "senvo_wear_shadow_test",
]);

export function assertSafeIntegrationTestDatabase(
  databaseUrl,
  environment = process.env,
) {
  if (!databaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests.");
  }
  for (const variableName of ["APP_ENV", "NODE_ENV"]) {
    const value = environment[variableName];
    if (value && productionTokenPattern.test(value)) {
      throw new Error(
        `Integration tests may not run when ${variableName} is ${value}.`,
      );
    }
  }
  assertSafeTestDatabaseUrl(databaseUrl, "TEST_DATABASE_URL", environment);

  const parsed = new URL(databaseUrl);
  if (!localTestHosts.has(parsed.hostname)) {
    throw new Error(
      `TEST_DATABASE_URL host must be 127.0.0.1 or localhost; received "${parsed.hostname}".`,
    );
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (databaseName === "senvo_wear_dev") {
    throw new Error("Forbidden database: senvo_wear_dev");
  }
  if (
    !databaseName.endsWith("_test") &&
    !ciTestDatabaseNames.has(databaseName)
  ) {
    throw new Error(
      `TEST_DATABASE_URL database name must end in "_test"; received "${databaseName}".`,
    );
  }
  if (
    productionTokenPattern.test(databaseName) ||
    productionTokenPattern.test(decodeURIComponent(parsed.username))
  ) {
    throw new Error(
      "TEST_DATABASE_URL appears to target production or staging.",
    );
  }
  return { databaseName, databaseUrl };
}
