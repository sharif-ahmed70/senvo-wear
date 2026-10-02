import { readFileSync } from "node:fs";
import { defaultRolePermissions } from "@senvo/domain";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL(
    "../../prisma/migrations/202610020001_sync_role_permission_matrix/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

function migrationMatrixRows(sql: string): string[] {
  return [
    ...sql.matchAll(/^\s+\('([A-Z_]+)', '([A-Z_]+)', '([A-Z_]+)'\)[,;]$/gmu),
  ].map((match) => `${match[1]}:${match[2]}:${match[3]}`);
}

describe("role permission matrix migration", () => {
  it("writes exactly the code default role permissions", () => {
    const fromMigration = migrationMatrixRows(migrationSql).sort();
    const fromCode = defaultRolePermissions
      .map((grant) => `${grant.role}:${grant.resource}:${grant.action}`)
      .sort();
    expect(fromMigration).toHaveLength(196);
    expect(fromMigration).toEqual(fromCode);
  });

  it("only touches permission data, never the schema", () => {
    expect(migrationSql).not.toMatch(
      /\b(ALTER|DROP)\s+(TABLE|TYPE)\s+"public"/iu,
    );
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/iu);
    expect(migrationSql).toMatch(
      /ON CONFLICT \("resource", "action"\) DO NOTHING/u,
    );
    expect(migrationSql).toMatch(
      /ON CONFLICT \("role", "permission_id"\) DO NOTHING/u,
    );
  });
});
