import { describe, expect, it } from "vitest";
import { loadProductionServerConfig } from "./production-server-config.js";

const validProductionEnv = {
  APP_ENV: "production",
  AUTH_SECRET: "1234567890123456789012345678901234567890",
  DATABASE_URL:
    "postgresql://senvo:super_secret@db.senvo.internal:5432/senvo_production",
  SENVO_ADMIN_ORIGINS: "https://admin.senvo.com,https://pos.senvo.com",
  SENVO_STOREFRONT_ORIGINS: "https://senvo.com,https://www.senvo.com",
  SENVO_API_PORT: "4000",
  COOKIE_DOMAIN: ".senvo.com",
  COOKIE_SAME_SITE: "lax",
  COOKIE_SECURE: "true",
  STOREFRONT_ORGANIZATION_CODE: "SENVO",
} satisfies NodeJS.ProcessEnv;

describe("production-server-config", () => {
  it("loads and parses valid production environment variables", () => {
    const config = loadProductionServerConfig(validProductionEnv);

    expect(config).toEqual({
      adminOrigins: ["https://admin.senvo.com", "https://pos.senvo.com"],
      allowedOrigins: [
        "https://admin.senvo.com",
        "https://pos.senvo.com",
        "https://senvo.com",
        "https://www.senvo.com",
      ],
      authSecret: validProductionEnv.AUTH_SECRET,
      cookieDomain: ".senvo.com",
      cookieSameSite: "lax",
      cookieSecure: true,
      databaseUrl: validProductionEnv.DATABASE_URL,
      host: "0.0.0.0",
      organizationCode: "SENVO",
      port: 4000,
      storefrontOrigins: ["https://senvo.com", "https://www.senvo.com"],
    });
  });

  it("defaults host to 0.0.0.0 and cookieSecure to true", () => {
    const config = loadProductionServerConfig({
      ...validProductionEnv,
      SENVO_API_HOST: undefined,
      COOKIE_SECURE: undefined,
    });
    expect(config.host).toBe("0.0.0.0");
    expect(config.cookieSecure).toBe(true);
  });

  it("rejects non-production APP_ENV", () => {
    expect(() =>
      loadProductionServerConfig({
        ...validProductionEnv,
        APP_ENV: "development",
      }),
    ).toThrow(/APP_ENV=production/);
  });

  it("rejects missing or short AUTH_SECRET", () => {
    expect(() =>
      loadProductionServerConfig({ ...validProductionEnv, AUTH_SECRET: "" }),
    ).toThrow(/AUTH_SECRET is required/);

    expect(() =>
      loadProductionServerConfig({
        ...validProductionEnv,
        AUTH_SECRET: "too-short",
      }),
    ).toThrow(/at least 32 characters/);
  });

  it("rejects loopback or local DATABASE_URL in production", () => {
    expect(() =>
      loadProductionServerConfig({
        ...validProductionEnv,
        DATABASE_URL:
          "postgresql://senvo:secret@127.0.0.1:5432/senvo_production",
      }),
    ).toThrow(/loopback database host/);

    expect(() =>
      loadProductionServerConfig({
        ...validProductionEnv,
        DATABASE_URL:
          "postgresql://senvo:secret@localhost:5432/senvo_production",
      }),
    ).toThrow(/loopback database host/);
  });

  it("rejects wildcard CORS origins", () => {
    expect(() =>
      loadProductionServerConfig({
        ...validProductionEnv,
        SENVO_ADMIN_ORIGINS: "*",
      }),
    ).toThrow(/wildcard origins in production/);

    expect(() =>
      loadProductionServerConfig({
        ...validProductionEnv,
        SENVO_STOREFRONT_ORIGINS: "*",
      }),
    ).toThrow(/wildcard origins in production/);
  });

  it("rejects insecure HTTP origins in production", () => {
    expect(() =>
      loadProductionServerConfig({
        ...validProductionEnv,
        SENVO_ADMIN_ORIGINS: "http://admin.senvo.com",
      }),
    ).toThrow(/must use HTTPS in production/);
  });

  it("rejects invalid ports", () => {
    expect(() =>
      loadProductionServerConfig({
        ...validProductionEnv,
        SENVO_API_PORT: "70000",
      }),
    ).toThrow(/integer from 1 to 65535/);
  });
});
