export type DevelopmentServerConfig = {
  allowedOrigin: string;
  databaseUrl: string;
  host: "127.0.0.1";
  organizationCode: string;
  port: number;
};

export function loadDevelopmentServerConfig(
  environment: NodeJS.ProcessEnv,
): DevelopmentServerConfig {
  if (environment.APP_ENV !== "development") {
    throw new Error("The development API requires APP_ENV=development.");
  }
  const databaseUrl = requiredValue(environment.DATABASE_URL, "DATABASE_URL");
  assertSafeLocalDatabaseUrl(databaseUrl);
  const allowedOrigin =
    environment.SENVO_API_ALLOWED_ORIGIN?.trim() || "http://localhost:3000";
  assertSafeLocalOrigin(allowedOrigin);
  const port = Number(environment.SENVO_API_PORT?.trim() || "4000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SENVO_API_PORT must be an integer from 1 to 65535.");
  }
  return {
    allowedOrigin,
    databaseUrl,
    host: "127.0.0.1",
    organizationCode: requiredValue(
      environment.STOREFRONT_ORGANIZATION_CODE,
      "STOREFRONT_ORGANIZATION_CODE",
    ),
    port,
  };
}

function assertSafeLocalDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }
  if (!isLoopbackHostname(url.hostname)) {
    throw new Error(
      "The development API only accepts a loopback PostgreSQL host.",
    );
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
  if (
    !databaseName ||
    !/(?:dev|development|local|test)/u.test(databaseName) ||
    /(?:prod|production|stage|staging)/u.test(databaseName)
  ) {
    throw new Error(
      "The development database name must identify a local, development, or test database.",
    );
  }
}

function assertSafeLocalOrigin(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "SENVO_API_ALLOWED_ORIGIN must be a valid local HTTP origin.",
    );
  }
  if (
    url.protocol !== "http:" ||
    !isLoopbackHostname(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    value !== url.origin
  ) {
    throw new Error(
      "SENVO_API_ALLOWED_ORIGIN must be an exact loopback HTTP origin.",
    );
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function requiredValue(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}
