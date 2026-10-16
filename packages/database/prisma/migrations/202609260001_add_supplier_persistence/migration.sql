CREATE TYPE "public"."SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "public"."suppliers" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "contact_person" VARCHAR(160),
  "phone" VARCHAR(40),
  "email" VARCHAR(254),
  "address" VARCHAR(255),
  "notes" TEXT,
  "status" "public"."SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppliers_id_organization_id_key" ON "public"."suppliers"("id", "organization_id");
CREATE UNIQUE INDEX "suppliers_organization_id_code_key" ON "public"."suppliers"("organization_id", "code");
CREATE INDEX "suppliers_organization_id_status_idx" ON "public"."suppliers"("organization_id", "status");
CREATE INDEX "suppliers_organization_id_name_idx" ON "public"."suppliers"("organization_id", "name");

ALTER TABLE "public"."suppliers"
  ADD CONSTRAINT "suppliers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
