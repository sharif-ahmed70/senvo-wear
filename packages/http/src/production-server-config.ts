export type ProductionServerConfig = {
  adminOrigins: readonly string[];
  allowedOrigins: readonly string[];
  authSecret: string;
  cookieDomain?: string;
  cookieSameSite: "lax" | "strict" | "none";
  cookieSecure: boolean;
  databaseUrl: string;
  host: string;
  organizationCode: string;
  port: number;
  storefrontOrigins: readonly string[];
};

export function loadProductionServerConfig(
  environment: NodeJS.ProcessEnv,
): ProductionServerConfig {
  if (environment.APP_ENV !== "production") {
    throw new Error("The production API requires APP_ENV=production.");
  }

  const databaseUrl = requiredValue(environment.DATABASE_URL, "DATABASE_URL");
  assertSafeProductionDatabaseUrl(databaseUrl);

  const authSecret = requiredValue(environment.AUTH_SECRET, "AUTH_SECRET");
  assertSafeAuthSecret(authSecret);

  const adminOrigins = parseAndValidateOrigins(
    environment.ADMIN_ORIGINS ?? environment.SENVO_ADMIN_ORIGINS,
    "ADMIN_ORIGINS",
  );
  const storefrontOrigins = parseAndValidateOrigins(
    environment.STOREFRONT_ORIGINS ?? environment.SENVO_STOREFRONT_ORIGINS,
    "STOREFRONT_ORIGINS",
  );

  const allowedOrigins = Array.from(
    new Set([...adminOrigins, ...storefrontOrigins]),
  );

  const rawPort =
    environment.PORT?.trim() || environment.SENVO_API_PORT?.trim() || "4000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }

  const host = environment.HOST?.trim() || "0.0.0.0";
  const cookieDomain = environment.COOKIE_DOMAIN?.trim() || undefined;
  const cookieSecure = environment.COOKIE_SECURE !== "false";
  const rawSameSite =
    environment.COOKIE_SAME_SITE?.trim().toLowerCase() || "lax";
  if (!["lax", "strict", "none"].includes(rawSameSite)) {
    throw new Error("COOKIE_SAME_SITE must be lax, strict, or none.");
  }
  const cookieSameSite = rawSameSite as "lax" | "strict" | "none";

  const organizationCode =
    environment.STOREFRONT_ORGANIZATION_CODE?.trim() || "DEFAULT";

  return {
    adminOrigins,
    allowedOrigins,
    authSecret,
    cookieDomain,
    cookieSameSite,
    cookieSecure,
    databaseUrl,
    host,
    organizationCode,
    port,
    storefrontOrigins,
  };
}

function assertSafeProductionDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }
  if (isLoopbackHostname(url.hostname)) {
    throw new Error(
      "The production API cannot connect to a loopback database host.",
    );
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
  if (!databaseName) {
    throw new Error("DATABASE_URL must specify a database name.");
  }
}

function assertSafeAuthSecret(value: string): void {
  if (value.length < 32) {
    throw new Error(
      "AUTH_SECRET must be at least 32 characters long in production.",
    );
  }
  const insecureDefaults = new Set([
    "development",
    "secret",
    "password",
    "changeme",
    "12345678901234567890123456789012",
  ]);
  if (insecureDefaults.has(value.toLowerCase())) {
    throw new Error("AUTH_SECRET must not use a known insecure default value.");
  }
}

function parseAndValidateOrigins(
  raw: string | undefined,
  name: string,
): readonly string[] {
  const normalized = requiredValue(raw, name);
  const origins = normalized
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error(`${name} must contain at least one allowed origin.`);
  }
  for (const origin of origins) {
    if (origin === "*") {
      throw new Error(`${name} cannot use wildcard origins in production.`);
    }
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`${name} contains an invalid URL origin: "${origin}".`);
    }
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      origin !== url.origin
    ) {
      throw new Error(
        `${name} origin "${origin}" must be an exact origin without path, query, or credentials.`,
      );
    }
    if (url.protocol !== "https:") {
      throw new Error(
        `${name} origin "${origin}" must use HTTPS in production.`,
      );
    }
    if (isLoopbackHostname(url.hostname)) {
      throw new Error(
        `${name} cannot allow loopback origin "${origin}" in production.`,
      );
    }
  }
  return origins;
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
