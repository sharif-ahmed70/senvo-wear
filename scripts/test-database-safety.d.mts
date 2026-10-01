type Environment = Record<string, string | undefined>;

export declare function getRequiredTestDatabaseUrl(
  environment?: Environment,
): string;
export declare function getRequiredShadowDatabaseUrl(
  environment?: Environment,
): string;
export declare function assertSafeTestDatabaseUrl(
  databaseUrl: string,
  variableName: string,
  environment?: Environment,
): void;
export declare function assertSafeIntegrationTestDatabase(
  databaseUrl: string | undefined,
  environment?: Environment,
): { databaseName: string; databaseUrl: string };
export declare function maskDatabaseUrl(databaseUrl: string): string;
