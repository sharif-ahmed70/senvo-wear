import { describe, expect, it } from "vitest";
import { assertSafeIntegrationTestDatabase } from "../../../scripts/test-database-safety.mjs";

const testEnvironment = { APP_ENV: "test", NODE_ENV: "test" };

describe("assertSafeIntegrationTestDatabase", () => {
  it.each([
    "postgresql://senvo_test:senvo_test_password@localhost:5432/senvo_wear_test",
    "postgresql://senvo_test:secret@localhost:5432/senvo_wear_shadow_test",
    "postgresql://postgres@127.0.0.1:5432/senvo_wear_ci_test",
    "postgres://senvo_test@localhost:55432/senvo_wear_test",
  ])("accepts the local test database %s", (url) => {
    expect(assertSafeIntegrationTestDatabase(url, testEnvironment)).toEqual({
      databaseName: new URL(url).pathname.slice(1),
      databaseUrl: url,
    });
  });

  it("requires a URL", () => {
    expect(() =>
      assertSafeIntegrationTestDatabase(undefined, testEnvironment),
    ).toThrow(/required/);
  });

  it.each([
    [
      "host hidden behind an underscore",
      "postgresql://u@senvo_prod:5432/senvo_wear_test",
    ],
    ["remote host", "postgresql://u@db.example.com:5432/senvo_wear_test"],
    ["staging host", "postgresql://u@staging.internal:5432/senvo_wear_test"],
  ])("rejects a %s", (_label, url) => {
    expect(() =>
      assertSafeIntegrationTestDatabase(url, testEnvironment),
    ).toThrow();
  });

  it.each([
    ["production word hidden behind an underscore", "production_test"],
    ["prod token", "senvo_prod_test"],
    ["staging token", "senvo_staging_test"],
    ["name that only contains test", "testing_db"],
    ["name with test in the middle", "senvo_test_data"],
    ["development database", "senvo_wear_dev"],
  ])("rejects a database name with a %s", (_label, databaseName) => {
    expect(() =>
      assertSafeIntegrationTestDatabase(
        `postgresql://u@127.0.0.1:5432/${databaseName}`,
        testEnvironment,
      ),
    ).toThrow();
  });

  it("rejects a production role name", () => {
    expect(() =>
      assertSafeIntegrationTestDatabase(
        "postgresql://senvo_prod@127.0.0.1:5432/senvo_wear_test",
        testEnvironment,
      ),
    ).toThrow(/production or staging/);
  });

  it.each([
    [{ APP_ENV: "test", NODE_ENV: "production" }],
    [{ APP_ENV: "production", NODE_ENV: "test" }],
    [{ APP_ENV: "staging" }],
    [{ NODE_ENV: "prod" }],
    [{ APP_ENV: "test", NODE_ENV: "staging_eu" }],
  ])("rejects production or staging in either variable: %o", (environment) => {
    expect(() =>
      assertSafeIntegrationTestDatabase(
        "postgresql://u@127.0.0.1:5432/senvo_wear_test",
        environment,
      ),
    ).toThrow(/may not/);
  });

  it("rejects a non-PostgreSQL protocol", () => {
    expect(() =>
      assertSafeIntegrationTestDatabase(
        "mysql://u@127.0.0.1:3306/senvo_wear_test",
        testEnvironment,
      ),
    ).toThrow(/postgresql/);
  });
});
