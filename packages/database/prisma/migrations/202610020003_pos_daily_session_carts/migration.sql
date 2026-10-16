-- Preserve all historical carts and checkout links; only ACTIVE carts are unique.
CREATE TYPE "public"."PosCartStatus" AS ENUM ('ACTIVE', 'CHECKED_OUT', 'ABANDONED');
ALTER TABLE "public"."pos_carts"
  ADD COLUMN "status" "public"."PosCartStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
UPDATE "public"."pos_carts" AS c SET "status" = 'CHECKED_OUT'
WHERE EXISTS (SELECT 1 FROM "public"."pos_checkout_records" AS x WHERE x."cart_id" = c."id" AND x."organization_id" = c."organization_id");
UPDATE "public"."pos_carts" AS c SET "status" = 'ABANDONED'
WHERE c."status" = 'ACTIVE' AND EXISTS (SELECT 1 FROM "public"."sales_sessions" AS s WHERE s."id" = c."sales_session_id" AND s."status" = 'CLOSED');
DROP INDEX "public"."pos_carts_sales_session_id_organization_id_key";
CREATE UNIQUE INDEX "pos_carts_one_active_per_session_key"
  ON "public"."pos_carts" ("sales_session_id", "organization_id") WHERE "status" = 'ACTIVE';
