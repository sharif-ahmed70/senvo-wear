import { describe, expect, it } from "vitest";
import {
  PRISMA_CLI_PLACEHOLDER_DATABASE_URL,
  getPrismaCliDatabaseUrl,
  getRuntimeDatabaseUrl,
} from "./environment.js";

describe("database environment handling", () => {
  it("requires DATABASE_URL for runtime access", () => {
    expect(() => getRuntimeDatabaseUrl({ APP_ENV: "development" })).toThrow(
      "DATABASE_URL is required",
    );
  });

  it("allows a placeholder only for offline Prisma CLI commands outside production", () => {
    expect(getPrismaCliDatabaseUrl({}, ["prisma", "generate"])).toBe(
      PRISMA_CLI_PLACEHOLDER_DATABASE_URL,
    );
  });

  it("rejects missing DATABASE_URL for production Prisma commands", () => {
    expect(() =>
      getPrismaCliDatabaseUrl({ APP_ENV: "production" }, [
        "prisma",
        "generate",
      ]),
    ).toThrow("production or staging");
  });

  it("rejects missing DATABASE_URL for connectivity commands", () => {
    expect(() =>
      getPrismaCliDatabaseUrl({}, ["prisma", "migrate", "deploy"]),
    ).toThrow("may connect");
  });
});
