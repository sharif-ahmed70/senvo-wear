ALTER TYPE "public"."SalesOrderChannel" ADD VALUE 'OFFLINE_STORE' BEFORE 'POS';
ALTER TYPE "public"."SalesOrderChannel" ADD VALUE 'EVENT_BOOTH' BEFORE 'POS';
ALTER TYPE "public"."PermissionResource" ADD VALUE 'SALES' BEFORE 'REPORT';

CREATE TYPE "public"."SalesBoothStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "public"."sales_booths" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "location" VARCHAR(240) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "responsible_staff_id" UUID NOT NULL,
  "status" "public"."SalesBoothStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sales_booths_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_booths_date_order_check" CHECK ("end_date" >= "start_date")
);

CREATE UNIQUE INDEX "sales_booths_id_organization_id_key"
  ON "public"."sales_booths"("id", "organization_id");
CREATE INDEX "sales_booths_organization_id_status_start_date_id_idx"
  ON "public"."sales_booths"("organization_id", "status", "start_date", "id");
CREATE INDEX "sales_booths_organization_id_responsible_staff_id_idx"
  ON "public"."sales_booths"("organization_id", "responsible_staff_id");

ALTER TABLE "public"."sales_booths"
  ADD CONSTRAINT "sales_booths_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_booths"
  ADD CONSTRAINT "sales_booths_responsible_staff_id_fkey"
  FOREIGN KEY ("responsible_staff_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_booths"
  ADD CONSTRAINT "sales_booths_responsible_staff_id_organization_id_fkey"
  FOREIGN KEY ("responsible_staff_id", "organization_id")
  REFERENCES "public"."organization_memberships"("user_id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."sales_orders" ADD COLUMN "booth_id" UUID;
CREATE INDEX "sales_orders_organization_id_booth_id_created_at_id_idx"
  ON "public"."sales_orders"("organization_id", "booth_id", "created_at", "id");
ALTER TABLE "public"."sales_orders"
  ADD CONSTRAINT "sales_orders_booth_id_organization_id_fkey"
  FOREIGN KEY ("booth_id", "organization_id")
  REFERENCES "public"."sales_booths"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_orders"
  ADD CONSTRAINT "sales_orders_channel_booth_integrity_check"
  CHECK (
    ("channel" = 'EVENT_BOOTH' AND "booth_id" IS NOT NULL)
    OR ("channel" <> 'EVENT_BOOTH' AND "booth_id" IS NULL)
  );
