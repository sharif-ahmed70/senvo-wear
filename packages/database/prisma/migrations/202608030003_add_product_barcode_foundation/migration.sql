CREATE TYPE "public"."BarcodeType" AS ENUM ('EAN13', 'CODE128', 'UPC', 'INTERNAL');
CREATE TYPE "public"."BarcodeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "public"."variant_barcodes" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "value" VARCHAR(80) NOT NULL,
  "type" "public"."BarcodeType" NOT NULL,
  "status" "public"."BarcodeStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "variant_barcodes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "variant_barcodes_value_key"
  ON "public"."variant_barcodes"("value");
CREATE UNIQUE INDEX "variant_barcodes_one_active_per_variant_key"
  ON "public"."variant_barcodes"("product_variant_id")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "variant_barcodes_organization_id_product_variant_id_created_idx"
  ON "public"."variant_barcodes"("organization_id", "product_variant_id", "created_at");
CREATE INDEX "variant_barcodes_organization_id_status_idx"
  ON "public"."variant_barcodes"("organization_id", "status");

ALTER TABLE "public"."variant_barcodes"
  ADD CONSTRAINT "variant_barcodes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."variant_barcodes"
  ADD CONSTRAINT "variant_barcodes_product_variant_id_organization_id_fkey"
  FOREIGN KEY ("product_variant_id", "organization_id")
  REFERENCES "public"."product_variants"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
