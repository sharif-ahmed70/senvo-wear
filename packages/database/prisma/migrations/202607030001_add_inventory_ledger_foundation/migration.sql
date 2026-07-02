CREATE TYPE "InventoryMovementType" AS ENUM (
  'OPENING',
  'RECEIPT',
  'ISSUE',
  'TRANSFER',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT'
);

CREATE TYPE "InventoryMovementStatus" AS ENUM (
  'DRAFT',
  'POSTED'
);

ALTER TABLE "stock_locations"
  ADD CONSTRAINT "stock_locations_id_organization_id_key" UNIQUE ("id", "organization_id");

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_id_organization_id_key" UNIQUE ("id", "organization_id");

CREATE TABLE "inventory_movements" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "movement_number" VARCHAR(64) NOT NULL,
  "type" "InventoryMovementType" NOT NULL,
  "status" "InventoryMovementStatus" NOT NULL DEFAULT 'DRAFT',
  "source_location_id" UUID,
  "destination_location_id" UUID,
  "reference_type" VARCHAR(80),
  "reference_id" VARCHAR(120),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "payload_signature" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "posted_at" TIMESTAMPTZ(6),
  "note" VARCHAR(1000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movements_location_shape_check" CHECK (
    (
      "type" IN ('OPENING', 'RECEIPT', 'ADJUSTMENT_IN')
      AND "source_location_id" IS NULL
      AND "destination_location_id" IS NOT NULL
    )
    OR (
      "type" IN ('ISSUE', 'ADJUSTMENT_OUT')
      AND "source_location_id" IS NOT NULL
      AND "destination_location_id" IS NULL
    )
    OR (
      "type" = 'TRANSFER'
      AND "source_location_id" IS NOT NULL
      AND "destination_location_id" IS NOT NULL
      AND "source_location_id" <> "destination_location_id"
    )
  ),
  CONSTRAINT "inventory_movements_posted_at_status_check" CHECK (
    ("status" = 'POSTED' AND "posted_at" IS NOT NULL)
    OR ("status" = 'DRAFT' AND "posted_at" IS NULL)
  ),
  CONSTRAINT "inventory_movements_version_positive_check" CHECK ("version" >= 1),
  CONSTRAINT "inventory_movements_reference_pair_check" CHECK (
    ("reference_type" IS NULL AND "reference_id" IS NULL)
    OR ("reference_type" IS NOT NULL AND "reference_id" IS NOT NULL)
  )
);

CREATE TABLE "inventory_movement_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "movement_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "line_number" INTEGER NOT NULL,
  "note" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_movement_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movement_lines_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_movement_lines_line_number_positive_check" CHECK ("line_number" > 0)
);

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_source_location_id_organization_id_fkey"
  FOREIGN KEY ("source_location_id", "organization_id")
  REFERENCES "stock_locations"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_destination_location_id_organization_i_fkey"
  FOREIGN KEY ("destination_location_id", "organization_id")
  REFERENCES "stock_locations"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "inventory_movement_lines"
  ADD CONSTRAINT "inventory_movement_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "inventory_movements_id_organization_id_key"
  ON "inventory_movements"("id", "organization_id");

ALTER TABLE "inventory_movement_lines"
  ADD CONSTRAINT "inventory_movement_lines_movement_id_organization_id_fkey"
  FOREIGN KEY ("movement_id", "organization_id")
  REFERENCES "inventory_movements"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "inventory_movement_lines"
  ADD CONSTRAINT "inventory_movement_lines_product_variant_id_organization_i_fkey"
  FOREIGN KEY ("product_variant_id", "organization_id")
  REFERENCES "product_variants"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "inventory_movements_organization_id_movement_number_key"
  ON "inventory_movements"("organization_id", "movement_number");

CREATE UNIQUE INDEX "inventory_movements_organization_id_idempotency_key_key"
  ON "inventory_movements"("organization_id", "idempotency_key");

CREATE UNIQUE INDEX "inventory_movement_lines_movement_id_product_variant_id_key"
  ON "inventory_movement_lines"("movement_id", "product_variant_id");

CREATE UNIQUE INDEX "inventory_movement_lines_movement_id_line_number_key"
  ON "inventory_movement_lines"("movement_id", "line_number");

CREATE INDEX "inventory_movements_organization_id_status_occurred_at_id_idx"
  ON "inventory_movements"("organization_id", "status", "occurred_at", "id");

CREATE INDEX "inventory_movements_organization_id_type_occurred_at_id_idx"
  ON "inventory_movements"("organization_id", "type", "occurred_at", "id");

CREATE INDEX "inventory_movements_organization_id_source_location_id_occu_idx"
  ON "inventory_movements"("organization_id", "source_location_id", "occurred_at");

CREATE INDEX "inventory_movements_organization_id_destination_location_id_idx"
  ON "inventory_movements"("organization_id", "destination_location_id", "occurred_at");

CREATE INDEX "inventory_movement_lines_organization_id_product_variant_id_idx"
  ON "inventory_movement_lines"("organization_id", "product_variant_id");

CREATE INDEX "inventory_movement_lines_movement_id_idx"
  ON "inventory_movement_lines"("movement_id");
