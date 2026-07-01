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
