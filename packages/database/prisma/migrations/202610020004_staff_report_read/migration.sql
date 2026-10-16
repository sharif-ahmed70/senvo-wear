-- Let STAFF read the operational dashboard (REPORT READ). Insert only: no
-- existing grant is deleted or changed. Financial figures stay behind
-- POS APPROVE, which STAFF does not have.
INSERT INTO "public"."permissions" ("id", "resource", "action", "updated_at")
VALUES (gen_random_uuid(), 'REPORT', 'READ', CURRENT_TIMESTAMP)
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "public"."role_permissions" ("id", "role", "permission_id", "status", "updated_at")
SELECT gen_random_uuid(), "grants"."role"::"public"."Role", "permission"."id", 'ACTIVE', CURRENT_TIMESTAMP
FROM (VALUES
  ('STAFF', 'REPORT', 'READ')
) AS "grants" ("role", "resource", "action")
JOIN "public"."permissions" AS "permission"
  ON "permission"."resource"::text = "grants"."resource"
 AND "permission"."action"::text = "grants"."action"
ON CONFLICT ("role", "permission_id") DO NOTHING;
