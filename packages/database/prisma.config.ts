import "dotenv/config";
import { defineConfig } from "prisma/config";
import { getPrismaCliDatabaseUrl } from "./src/environment.js";

const databaseUrl = getPrismaCliDatabaseUrl(process.env, process.argv);

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});
