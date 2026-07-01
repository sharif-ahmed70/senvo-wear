import "dotenv/config";

const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV;

if (appEnv !== "production" && appEnv !== "staging") {
  console.error(
    "APP_ENV or NODE_ENV must be production or staging for migration deployment.",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for migration deployment.");
  process.exit(1);
}
