import "dotenv/config";

const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";

if (appEnv !== "development" && appEnv !== "test" && appEnv !== "local") {
  console.error(
    "prisma db push is only allowed in development, test, or local environments.",
  );
  process.exit(1);
}

if (process.env.SENVO_ALLOW_DB_PUSH !== "local") {
  console.error(
    "Set SENVO_ALLOW_DB_PUSH=local to acknowledge development-only db push usage.",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for prisma db push.");
  process.exit(1);
}
