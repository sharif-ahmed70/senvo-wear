CREATE TYPE "InventoryReservationStatus" AS ENUM (
  'ACTIVE',
  'CONFIRMED',
  'RELEASED',
  'EXPIRED'
);

CREATE TABLE "inventory_reservations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "reservation_number" VARCHAR(64) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "payload_signature" TEXT NOT NULL,
  "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "stock_location_id" UUID NOT NULL,
  "reference_type" VARCHAR(80),
  "reference_id" VARCHAR(120),
  "expires_at" TIMESTAMPTZ(6),
  "confirmed_at" TIMESTAMPTZ(6),
  "released_at" TIMESTAMPTZ(6),
  "expired_at" TIMESTAMPTZ(6),
  "note" VARCHAR(1000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_reservations_version_positive_check" CHECK ("version" >= 1),
  CONSTRAINT "inventory_reservations_reference_pair_check" CHECK (
    ("reference_type" IS NULL AND "reference_id" IS NULL)
    OR ("reference_type" IS NOT NULL AND "reference_id" IS NOT NULL)
  ),
  CONSTRAINT "inventory_reservations_status_timestamp_check" CHECK (
    (
      "status" = 'ACTIVE'
      AND "confirmed_at" IS NULL
      AND "released_at" IS NULL
      AND "expired_at" IS NULL
    )
    OR (
      "status" = 'CONFIRMED'
      AND "confirmed_at" IS NOT NULL
      AND "released_at" IS NULL
      AND "expired_at" IS NULL
    )
    OR (
      "status" = 'RELEASED'
      AND "confirmed_at" IS NULL
      AND "released_at" IS NOT NULL
      AND "expired_at" IS NULL
    )
    OR (
      "status" = 'EXPIRED'
      AND "confirmed_at" IS NULL
      AND "released_at" IS NULL
      AND "expired_at" IS NOT NULL
    )
  )
);

CREATE TABLE "inventory_reservation_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "line_number" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_reservation_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_reservation_lines_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_reservation_lines_line_number_positive_check" CHECK ("line_number" > 0)
);

ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "inventory_reservations_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "inventory_reservations_stock_location_id_organization_id_fkey"
  FOREIGN KEY ("stock_location_id", "organization_id")
  REFERENCES "stock_locations"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "inventory_reservations_id_organization_id_key"
  ON "inventory_reservations"("id", "organization_id");

ALTER TABLE "inventory_reservation_lines"
  ADD CONSTRAINT "inventory_reservation_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "inventory_reservation_lines"
  ADD CONSTRAINT "inventory_reservation_lines_reservation_id_organization_id_fkey"
  FOREIGN KEY ("reservation_id", "organization_id")
  REFERENCES "inventory_reservations"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "inventory_reservation_lines"
  ADD CONSTRAINT "inventory_reservation_lines_product_variant_id_organizatio_fkey"
  FOREIGN KEY ("product_variant_id", "organization_id")
  REFERENCES "product_variants"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "inventory_reservations_organization_id_reservation_number_key"
  ON "inventory_reservations"("organization_id", "reservation_number");

CREATE UNIQUE INDEX "inventory_reservations_organization_id_idempotency_key_key"
  ON "inventory_reservations"("organization_id", "idempotency_key");

CREATE UNIQUE INDEX "inventory_reservation_lines_reservation_id_product_variant_id_key"
  ON "inventory_reservation_lines"("reservation_id", "product_variant_id");

CREATE UNIQUE INDEX "inventory_reservation_lines_reservation_id_line_number_key"
  ON "inventory_reservation_lines"("reservation_id", "line_number");

CREATE INDEX "inventory_reservations_organization_id_status_created_at_id_idx"
  ON "inventory_reservations"("organization_id", "status", "created_at", "id");

CREATE INDEX "inventory_reservations_organization_id_stock_location_id_status_idx"
  ON "inventory_reservations"("organization_id", "stock_location_id", "status");

CREATE INDEX "inventory_reservations_organization_id_reference_type_reference_id_idx"
  ON "inventory_reservations"("organization_id", "reference_type", "reference_id");

CREATE INDEX "inventory_reservation_lines_organization_id_product_variant_id_idx"
  ON "inventory_reservation_lines"("organization_id", "product_variant_id");

CREATE INDEX "inventory_reservation_lines_reservation_id_idx"
  ON "inventory_reservation_lines"("reservation_id");
