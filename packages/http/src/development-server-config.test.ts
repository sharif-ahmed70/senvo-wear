import { describe, expect, it } from "vitest";
import { loadDevelopmentServerConfig } from "./development-server-config.js";

const validEnvironment = {
  APP_ENV: "development",
  DATABASE_URL: "postgresql://senvo:secret@127.0.0.1:5432/senvo_wear_dev",
  STOREFRONT_ORGANIZATION_CODE: "SENVO",
} satisfies NodeJS.ProcessEnv;

describe("development server config", () => {
  it("loads loopback-only development defaults", () => {
    expect(loadDevelopmentServerConfig(validEnvironment)).toEqual({
      allowedOrigin: "http://localhost:3000",
      databaseUrl: validEnvironment.DATABASE_URL,
      host: "127.0.0.1",
      organizationCode: "SENVO",
      port: 4000,
    });
  });

  it.each([
    [{ ...validEnvironment, APP_ENV: "production" }, "APP_ENV=development"],
    [
      {
        ...validEnvironment,
        DATABASE_URL:
          "postgresql://senvo:secret@db.example.com:5432/senvo_wear_dev",
      },
      "loopback PostgreSQL host",
    ],
    [
      {
        ...validEnvironment,
        DATABASE_URL:
          "postgresql://senvo:secret@127.0.0.1:5432/senvo_wear_production",
      },
      "local, development, or test",
    ],
    [
      {
        ...validEnvironment,
        SENVO_API_ALLOWED_ORIGIN: "https://store.example.com",
      },
      "exact loopback HTTP origin",
    ],
    [{ ...validEnvironment, SENVO_API_PORT: "0" }, "integer from 1 to 65535"],
  ])("rejects unsafe development configuration", (environment, message) => {
    expect(() => loadDevelopmentServerConfig(environment)).toThrow(message);
  });
});
