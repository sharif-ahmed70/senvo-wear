import "dotenv/config";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for migration creation.");
  process.exit(1);
}
