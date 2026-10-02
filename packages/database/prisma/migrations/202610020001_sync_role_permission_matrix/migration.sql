-- Bring role_permissions exactly to the role matrix in
-- packages/domain/src/authorization/application/role-permission-policy.ts
-- (defaultRolePermissions). Additive and idempotent: it creates any missing
-- permission rows (including PROCUREMENT), inserts missing grants, re-activates
-- inactive ones and deletes grants that are not in the matrix. No table or
-- type changes.

CREATE TEMPORARY TABLE "role_permission_matrix" (
    "role" "public"."Role" NOT NULL,
    "resource" "public"."PermissionResource" NOT NULL,
    "action" "public"."PermissionAction" NOT NULL,
    PRIMARY KEY ("role", "resource", "action")
);

INSERT INTO "role_permission_matrix" ("role", "resource", "action") VALUES
  ('OWNER', 'ORGANIZATION', 'CREATE'),
  ('OWNER', 'ORGANIZATION', 'READ'),
  ('OWNER', 'ORGANIZATION', 'UPDATE'),
  ('OWNER', 'ORGANIZATION', 'DELETE'),
  ('OWNER', 'ORGANIZATION', 'APPROVE'),
  ('OWNER', 'ORGANIZATION', 'CANCEL'),
  ('OWNER', 'ORGANIZATION', 'FULFILL'),
  ('OWNER', 'TEAM', 'CREATE'),
  ('OWNER', 'TEAM', 'READ'),
  ('OWNER', 'TEAM', 'UPDATE'),
  ('OWNER', 'TEAM', 'DELETE'),
  ('OWNER', 'TEAM', 'APPROVE'),
  ('OWNER', 'TEAM', 'CANCEL'),
  ('OWNER', 'TEAM', 'FULFILL'),
  ('OWNER', 'USER', 'CREATE'),
  ('OWNER', 'USER', 'READ'),
  ('OWNER', 'USER', 'UPDATE'),
  ('OWNER', 'USER', 'DELETE'),
  ('OWNER', 'USER', 'APPROVE'),
  ('OWNER', 'USER', 'CANCEL'),
  ('OWNER', 'USER', 'FULFILL'),
  ('OWNER', 'CATALOG', 'CREATE'),
  ('OWNER', 'CATALOG', 'READ'),
  ('OWNER', 'CATALOG', 'UPDATE'),
  ('OWNER', 'CATALOG', 'DELETE'),
  ('OWNER', 'CATALOG', 'APPROVE'),
  ('OWNER', 'CATALOG', 'CANCEL'),
  ('OWNER', 'CATALOG', 'FULFILL'),
  ('OWNER', 'INVENTORY', 'CREATE'),
  ('OWNER', 'INVENTORY', 'READ'),
  ('OWNER', 'INVENTORY', 'UPDATE'),
  ('OWNER', 'INVENTORY', 'DELETE'),
  ('OWNER', 'INVENTORY', 'APPROVE'),
  ('OWNER', 'INVENTORY', 'CANCEL'),
  ('OWNER', 'INVENTORY', 'FULFILL'),
  ('OWNER', 'PROCUREMENT', 'CREATE'),
  ('OWNER', 'PROCUREMENT', 'READ'),
  ('OWNER', 'PROCUREMENT', 'UPDATE'),
  ('OWNER', 'PROCUREMENT', 'DELETE'),
  ('OWNER', 'PROCUREMENT', 'APPROVE'),
  ('OWNER', 'PROCUREMENT', 'CANCEL'),
  ('OWNER', 'PROCUREMENT', 'FULFILL'),
  ('OWNER', 'RESERVATION', 'CREATE'),
  ('OWNER', 'RESERVATION', 'READ'),
  ('OWNER', 'RESERVATION', 'UPDATE'),
  ('OWNER', 'RESERVATION', 'DELETE'),
  ('OWNER', 'RESERVATION', 'APPROVE'),
  ('OWNER', 'RESERVATION', 'CANCEL'),
  ('OWNER', 'RESERVATION', 'FULFILL'),
  ('OWNER', 'SALES_ORDER', 'CREATE'),
  ('OWNER', 'SALES_ORDER', 'READ'),
  ('OWNER', 'SALES_ORDER', 'UPDATE'),
  ('OWNER', 'SALES_ORDER', 'DELETE'),
  ('OWNER', 'SALES_ORDER', 'APPROVE'),
  ('OWNER', 'SALES_ORDER', 'CANCEL'),
  ('OWNER', 'SALES_ORDER', 'FULFILL'),
  ('OWNER', 'SALES', 'CREATE'),
  ('OWNER', 'SALES', 'READ'),
  ('OWNER', 'SALES', 'UPDATE'),
  ('OWNER', 'SALES', 'DELETE'),
  ('OWNER', 'SALES', 'APPROVE'),
  ('OWNER', 'SALES', 'CANCEL'),
  ('OWNER', 'SALES', 'FULFILL'),
  ('OWNER', 'POS', 'CREATE'),
  ('OWNER', 'POS', 'READ'),
  ('OWNER', 'POS', 'UPDATE'),
  ('OWNER', 'POS', 'DELETE'),
  ('OWNER', 'POS', 'APPROVE'),
  ('OWNER', 'POS', 'CANCEL'),
  ('OWNER', 'POS', 'FULFILL'),
  ('OWNER', 'PAYMENT', 'CREATE'),
  ('OWNER', 'PAYMENT', 'READ'),
  ('OWNER', 'PAYMENT', 'UPDATE'),
  ('OWNER', 'PAYMENT', 'DELETE'),
  ('OWNER', 'PAYMENT', 'APPROVE'),
  ('OWNER', 'PAYMENT', 'CANCEL'),
  ('OWNER', 'PAYMENT', 'FULFILL'),
  ('OWNER', 'RECEIPT', 'CREATE'),
  ('OWNER', 'RECEIPT', 'READ'),
  ('OWNER', 'RECEIPT', 'UPDATE'),
  ('OWNER', 'RECEIPT', 'DELETE'),
  ('OWNER', 'RECEIPT', 'APPROVE'),
  ('OWNER', 'RECEIPT', 'CANCEL'),
  ('OWNER', 'RECEIPT', 'FULFILL'),
  ('OWNER', 'REPORT', 'CREATE'),
  ('OWNER', 'REPORT', 'READ'),
  ('OWNER', 'REPORT', 'UPDATE'),
  ('OWNER', 'REPORT', 'DELETE'),
  ('OWNER', 'REPORT', 'APPROVE'),
  ('OWNER', 'REPORT', 'CANCEL'),
  ('OWNER', 'REPORT', 'FULFILL'),
  ('ADMIN', 'ORGANIZATION', 'READ'),
  ('ADMIN', 'ORGANIZATION', 'UPDATE'),
  ('ADMIN', 'TEAM', 'CREATE'),
  ('ADMIN', 'TEAM', 'READ'),
  ('ADMIN', 'TEAM', 'UPDATE'),
  ('ADMIN', 'TEAM', 'DELETE'),
  ('ADMIN', 'USER', 'CREATE'),
  ('ADMIN', 'USER', 'READ'),
  ('ADMIN', 'USER', 'UPDATE'),
  ('ADMIN', 'USER', 'DELETE'),
  ('ADMIN', 'CATALOG', 'CREATE'),
  ('ADMIN', 'CATALOG', 'READ'),
  ('ADMIN', 'CATALOG', 'UPDATE'),
  ('ADMIN', 'CATALOG', 'DELETE'),
  ('ADMIN', 'CATALOG', 'CANCEL'),
  ('ADMIN', 'CATALOG', 'FULFILL'),
  ('ADMIN', 'INVENTORY', 'CREATE'),
  ('ADMIN', 'INVENTORY', 'READ'),
  ('ADMIN', 'INVENTORY', 'UPDATE'),
  ('ADMIN', 'INVENTORY', 'DELETE'),
  ('ADMIN', 'INVENTORY', 'CANCEL'),
  ('ADMIN', 'INVENTORY', 'FULFILL'),
  ('ADMIN', 'RESERVATION', 'CREATE'),
  ('ADMIN', 'RESERVATION', 'READ'),
  ('ADMIN', 'RESERVATION', 'UPDATE'),
  ('ADMIN', 'RESERVATION', 'DELETE'),
  ('ADMIN', 'RESERVATION', 'CANCEL'),
  ('ADMIN', 'RESERVATION', 'FULFILL'),
  ('ADMIN', 'SALES_ORDER', 'CREATE'),
  ('ADMIN', 'SALES_ORDER', 'READ'),
  ('ADMIN', 'SALES_ORDER', 'UPDATE'),
  ('ADMIN', 'SALES_ORDER', 'DELETE'),
  ('ADMIN', 'SALES_ORDER', 'CANCEL'),
  ('ADMIN', 'SALES_ORDER', 'FULFILL'),
  ('ADMIN', 'SALES', 'CREATE'),
  ('ADMIN', 'SALES', 'READ'),
  ('ADMIN', 'SALES', 'UPDATE'),
  ('ADMIN', 'SALES', 'DELETE'),
  ('ADMIN', 'SALES', 'CANCEL'),
  ('ADMIN', 'SALES', 'FULFILL'),
  ('ADMIN', 'POS', 'CREATE'),
  ('ADMIN', 'POS', 'READ'),
  ('ADMIN', 'POS', 'UPDATE'),
  ('ADMIN', 'POS', 'DELETE'),
  ('ADMIN', 'POS', 'CANCEL'),
  ('ADMIN', 'POS', 'FULFILL'),
  ('ADMIN', 'PAYMENT', 'CREATE'),
  ('ADMIN', 'PAYMENT', 'READ'),
  ('ADMIN', 'PAYMENT', 'APPROVE'),
  ('ADMIN', 'RECEIPT', 'READ'),
  ('ADMIN', 'REPORT', 'READ'),
  ('ADMIN', 'PROCUREMENT', 'READ'),
  ('ADMIN', 'PROCUREMENT', 'CREATE'),
  ('ADMIN', 'PROCUREMENT', 'UPDATE'),
  ('MANAGER', 'CATALOG', 'CREATE'),
  ('MANAGER', 'CATALOG', 'READ'),
  ('MANAGER', 'CATALOG', 'UPDATE'),
  ('MANAGER', 'INVENTORY', 'CREATE'),
  ('MANAGER', 'INVENTORY', 'READ'),
  ('MANAGER', 'INVENTORY', 'UPDATE'),
  ('MANAGER', 'INVENTORY', 'CANCEL'),
  ('MANAGER', 'INVENTORY', 'FULFILL'),
  ('MANAGER', 'RESERVATION', 'CREATE'),
  ('MANAGER', 'RESERVATION', 'READ'),
  ('MANAGER', 'RESERVATION', 'UPDATE'),
  ('MANAGER', 'RESERVATION', 'CANCEL'),
  ('MANAGER', 'RESERVATION', 'FULFILL'),
  ('MANAGER', 'SALES_ORDER', 'CREATE'),
  ('MANAGER', 'SALES_ORDER', 'READ'),
  ('MANAGER', 'SALES_ORDER', 'UPDATE'),
  ('MANAGER', 'SALES_ORDER', 'CANCEL'),
  ('MANAGER', 'SALES_ORDER', 'FULFILL'),
  ('MANAGER', 'SALES', 'CREATE'),
  ('MANAGER', 'SALES', 'READ'),
  ('MANAGER', 'SALES', 'UPDATE'),
  ('MANAGER', 'SALES', 'CANCEL'),
  ('MANAGER', 'SALES', 'FULFILL'),
  ('MANAGER', 'POS', 'CREATE'),
  ('MANAGER', 'POS', 'READ'),
  ('MANAGER', 'POS', 'UPDATE'),
  ('MANAGER', 'POS', 'CANCEL'),
  ('MANAGER', 'POS', 'FULFILL'),
  ('MANAGER', 'PAYMENT', 'CREATE'),
  ('MANAGER', 'PAYMENT', 'READ'),
  ('MANAGER', 'PAYMENT', 'APPROVE'),
  ('MANAGER', 'RECEIPT', 'READ'),
  ('MANAGER', 'REPORT', 'READ'),
  ('MANAGER', 'PROCUREMENT', 'READ'),
  ('MANAGER', 'PROCUREMENT', 'CREATE'),
  ('STAFF', 'CATALOG', 'READ'),
  ('STAFF', 'INVENTORY', 'READ'),
  ('STAFF', 'SALES', 'READ'),
  ('STAFF', 'SALES', 'CREATE'),
  ('STAFF', 'POS', 'CREATE'),
  ('STAFF', 'POS', 'READ'),
  ('STAFF', 'POS', 'UPDATE'),
  ('STAFF', 'SALES_ORDER', 'CREATE'),
  ('STAFF', 'SALES_ORDER', 'READ'),
  ('STAFF', 'SALES_ORDER', 'UPDATE'),
  ('STAFF', 'RESERVATION', 'CREATE'),
  ('STAFF', 'RESERVATION', 'READ'),
  ('STAFF', 'RESERVATION', 'UPDATE'),
  ('STAFF', 'PAYMENT', 'CREATE'),
  ('STAFF', 'PAYMENT', 'READ'),
  ('STAFF', 'RECEIPT', 'READ');

-- 1. Every permission the matrix uses exists and is active.
INSERT INTO "public"."permissions" ("id", "resource", "action", "status", "updated_at")
SELECT gen_random_uuid(), "matrix"."resource", "matrix"."action", 'ACTIVE', CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "resource", "action" FROM "role_permission_matrix") AS "matrix"
ON CONFLICT ("resource", "action") DO NOTHING;

UPDATE "public"."permissions" AS "permission"
SET "status" = 'ACTIVE', "updated_at" = CURRENT_TIMESTAMP
WHERE "permission"."status" <> 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "role_permission_matrix" AS "matrix"
    WHERE "matrix"."resource" = "permission"."resource"
      AND "matrix"."action" = "permission"."action"
  );

-- 2. Remove grants that are not in the matrix.
DELETE FROM "public"."role_permissions" AS "grant"
USING "public"."permissions" AS "permission"
WHERE "grant"."permission_id" = "permission"."id"
  AND NOT EXISTS (
    SELECT 1 FROM "role_permission_matrix" AS "matrix"
    WHERE "matrix"."role" = "grant"."role"
      AND "matrix"."resource" = "permission"."resource"
      AND "matrix"."action" = "permission"."action"
  );

-- 3. Add missing grants.
INSERT INTO "public"."role_permissions" ("id", "role", "permission_id", "status", "updated_at")
SELECT gen_random_uuid(), "matrix"."role", "permission"."id", 'ACTIVE', CURRENT_TIMESTAMP
FROM "role_permission_matrix" AS "matrix"
JOIN "public"."permissions" AS "permission"
  ON "permission"."resource" = "matrix"."resource"
 AND "permission"."action" = "matrix"."action"
ON CONFLICT ("role", "permission_id") DO NOTHING;

-- 4. Re-activate matrix grants that were switched off.
UPDATE "public"."role_permissions" AS "grant"
SET "status" = 'ACTIVE', "updated_at" = CURRENT_TIMESTAMP
FROM "public"."permissions" AS "permission"
WHERE "grant"."permission_id" = "permission"."id"
  AND "grant"."status" <> 'ACTIVE';

DROP TABLE "role_permission_matrix";
