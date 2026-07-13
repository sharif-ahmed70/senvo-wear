CREATE TYPE "public"."PermissionResource" AS ENUM ('ORGANIZATION', 'USER', 'CATALOG', 'INVENTORY', 'RESERVATION', 'SALES_ORDER', 'REPORT');

CREATE TYPE "public"."PermissionAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE', 'CANCEL', 'FULFILL');

CREATE TYPE "public"."PermissionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "public"."permissions" (
    "id" UUID NOT NULL,
    "resource" "public"."PermissionResource" NOT NULL,
    "action" "public"."PermissionAction" NOT NULL,
    "description" VARCHAR(240),
    "status" "public"."PermissionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."role_permissions" (
    "id" UUID NOT NULL,
    "role" "public"."Role" NOT NULL,
    "permission_id" UUID NOT NULL,
    "status" "public"."PermissionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_resource_action_key" ON "public"."permissions"("resource", "action");
CREATE INDEX "permissions_status_idx" ON "public"."permissions"("status");
CREATE UNIQUE INDEX "role_permissions_role_permission_id_key" ON "public"."role_permissions"("role", "permission_id");
CREATE INDEX "role_permissions_permission_id_idx" ON "public"."role_permissions"("permission_id");
CREATE INDEX "role_permissions_role_status_idx" ON "public"."role_permissions"("role", "status");

ALTER TABLE "public"."role_permissions"
  ADD CONSTRAINT "role_permissions_permission_id_fkey"
  FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
