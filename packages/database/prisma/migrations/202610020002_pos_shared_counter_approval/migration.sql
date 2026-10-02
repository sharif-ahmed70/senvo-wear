-- Add settlement approval grants without deleting or changing existing grants.
INSERT INTO "public"."permissions" ("id", "resource", "action", "updated_at")
VALUES (gen_random_uuid(), 'POS', 'APPROVE', CURRENT_TIMESTAMP)
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "public"."role_permissions" ("id", "role", "permission_id", "status", "updated_at")
SELECT gen_random_uuid(), "grants"."role"::"public"."Role", "permission"."id", 'ACTIVE', CURRENT_TIMESTAMP
FROM (VALUES
  ('OWNER', 'POS', 'APPROVE'),
  ('ADMIN', 'POS', 'APPROVE'),
  ('MANAGER', 'POS', 'APPROVE')
) AS "grants" ("role", "resource", "action")
JOIN "public"."permissions" AS "permission"
  ON "permission"."resource"::text = "grants"."resource"
 AND "permission"."action"::text = "grants"."action"
ON CONFLICT ("role", "permission_id") DO NOTHING;
