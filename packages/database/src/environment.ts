import { z } from "zod";

const productionLikeEnvironments = new Set(["production", "staging"]);

const envSchema = z.object({
  APP_ENV: z.string().optional(),
  DATABASE_URL: z.string().min(1).optional(),
  NODE_ENV: z.string().optional(),
});

export const PRISMA_CLI_PLACEHOLDER_DATABASE_URL =
  "postgresql://prisma-placeholder.invalid:5432/senvo_wear_prisma_cli_placeholder";

type DatabaseEnvironment = z.infer<typeof envSchema>;

function parseEnvironment(
  environment: NodeJS.ProcessEnv | Record<string, string | undefined>,
): DatabaseEnvironment {
  return envSchema.parse(environment);
}

export function isProductionLikeEnvironment(
  environment: NodeJS.ProcessEnv | Record<string, string | undefined>,
): boolean {
  const parsed = parseEnvironment(environment);
  return (
    productionLikeEnvironments.has(parsed.APP_ENV ?? "") ||
    productionLikeEnvironments.has(parsed.NODE_ENV ?? "")
  );
}

export function getRuntimeDatabaseUrl(
  environment: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string {
  const parsed = parseEnvironment(environment);
  if (!parsed.DATABASE_URL) {
    const appEnv = parsed.APP_ENV ?? parsed.NODE_ENV ?? "development";
    throw new Error(
      `DATABASE_URL is required for runtime database access in ${appEnv}.`,
    );
  }
  return parsed.DATABASE_URL;
}

export function isPrismaConnectivityCommand(argv: readonly string[]): boolean {
  const command = argv.join(" ");
  return (
    command.includes("migrate") ||
    command.includes(" db push") ||
    command.includes("db push") ||
    command.includes("db pull") ||
    command.includes("studio")
  );
}

export function isPrismaOfflineCommand(argv: readonly string[]): boolean {
  const command = argv.join(" ");
  return (
    command.includes("generate") ||
    command.includes("validate") ||
    (command.includes("migrate diff") &&
      command.includes("--from-empty") &&
      (command.includes("--to-schema-datamodel") ||
        command.includes("--to-schema")))
  );
}

export function getPrismaCliDatabaseUrl(
  environment: NodeJS.ProcessEnv | Record<string, string | undefined>,
  argv: readonly string[],
): string {
  const parsed = parseEnvironment(environment);

  if (parsed.DATABASE_URL) {
    return parsed.DATABASE_URL;
  }

  if (isProductionLikeEnvironment(parsed)) {
    throw new Error(
      "DATABASE_URL is required for Prisma commands in production or staging.",
    );
  }

  if (isPrismaOfflineCommand(argv) && !isPrismaConnectivityCommand(argv)) {
    return PRISMA_CLI_PLACEHOLDER_DATABASE_URL;
  }

  throw new Error(
    "DATABASE_URL is required for Prisma commands that may connect to a database.",
  );
}
