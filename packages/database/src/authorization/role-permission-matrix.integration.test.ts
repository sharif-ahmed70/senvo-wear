import { readFileSync } from "node:fs";
import { defaultRolePermissions } from "@senvo/domain";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

const migrationSql = readFileSync(
  new URL(
    "../../prisma/migrations/202610020001_sync_role_permission_matrix/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const expected = defaultRolePermissions
  .map((grant) => `${grant.role}:${grant.resource}:${grant.action}:ACTIVE`)
  .sort();

describeWithDatabase("role permission matrix migration (database)", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: testDatabaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  async function grants(): Promise<string[]> {
    const result = await client.query<{ key: string }>(`
      SELECT rp.role || ':' || p.resource || ':' || p.action || ':' || rp.status AS key
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      ORDER BY 1`);
    return result.rows.map((row) => row.key).sort();
  }

  it("converges any grant state to the code matrix and is idempotent", async () => {
    // Start from a drifted state: a stray STAFF REPORT grant, a disabled
    // OWNER grant, missing MANAGER catalog grants and a missing PROCUREMENT
    // permission row.
    await client.query(`
      INSERT INTO permissions (id, resource, action, status, updated_at)
      VALUES (gen_random_uuid(), 'REPORT', 'READ', 'ACTIVE', now())
      ON CONFLICT (resource, action) DO NOTHING`);
    await client.query(`
      INSERT INTO role_permissions (id, role, permission_id, status, updated_at)
      SELECT gen_random_uuid(), 'STAFF', id, 'ACTIVE', now()
      FROM permissions WHERE resource = 'REPORT' AND action = 'READ'
      ON CONFLICT (role, permission_id) DO NOTHING`);
    await client.query(`
      UPDATE role_permissions SET status = 'INACTIVE'
      WHERE role = 'OWNER' AND permission_id IN (
        SELECT id FROM permissions WHERE resource = 'TEAM' AND action = 'UPDATE')`);
    await client.query(`
      DELETE FROM role_permissions WHERE role = 'MANAGER' AND permission_id IN (
        SELECT id FROM permissions WHERE resource = 'CATALOG')`);
    await client.query(`
      DELETE FROM role_permissions WHERE permission_id IN (
        SELECT id FROM permissions WHERE resource = 'PROCUREMENT' AND action = 'APPROVE')`);
    await client.query(`
      DELETE FROM permissions WHERE resource = 'PROCUREMENT' AND action = 'APPROVE'`);

    await client.query(migrationSql);
    expect(await grants()).toEqual(expected);

    const permissionCount = await client.query<{ count: string }>(
      `SELECT count(*) FROM permissions WHERE resource = 'PROCUREMENT' AND status = 'ACTIVE'`,
    );
    expect(Number(permissionCount.rows[0]?.count)).toBe(7);

    await client.query(migrationSql);
    expect(await grants()).toEqual(expected);
  });
});
