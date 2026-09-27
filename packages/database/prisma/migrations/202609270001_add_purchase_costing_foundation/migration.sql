ALTER TYPE "public"."PermissionResource" ADD VALUE 'PROCUREMENT';

CREATE TYPE "public"."PurchaseStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');
CREATE TYPE "public"."CostUnknownReason" AS ENUM ('OPENING_STOCK_UNKNOWN', 'PENDING_PURCHASE_RECEIPT', 'MANUAL_HOLD', 'LEGACY_UNSPECIFIED');
CREATE TYPE "public"."InventoryCostEventType" AS ENUM ('PURCHASE_RECEIPT', 'INVENTORY_ADJUSTMENT', 'OPENING_BALANCE', 'PURCHASE_REVERSAL', 'COST_CORRECTION');
CREATE TYPE "public"."CostingMethod" AS ENUM ('MOVING_WEIGHTED_AVERAGE');

CREATE TABLE "public"."purchases" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "purchase_number" VARCHAR(64) NOT NULL,
  "supplier_id" UUID NOT NULL,
  "destination_location_id" UUID NOT NULL,
  "status" "public"."PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
  "purchase_date" TIMESTAMPTZ(6) NOT NULL,
  "expected_delivery_date" TIMESTAMPTZ(6),
  "notes" TEXT,
  "idempotency_key" VARCHAR(128),
  "total_cost_minor" BIGINT NOT NULL DEFAULT 0,
  "receipt_movement_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchases_id_organization_id_key" ON "public"."purchases"("id", "organization_id");
CREATE UNIQUE INDEX "purchases_organization_id_purchase_number_key" ON "public"."purchases"("organization_id", "purchase_number");
CREATE UNIQUE INDEX "purchases_organization_id_idempotency_key_key" ON "public"."purchases"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "purchases_receipt_movement_org_key" ON "public"."purchases"("receipt_movement_id", "organization_id");
CREATE INDEX "purchases_organization_id_status_purchase_date_idx" ON "public"."purchases"("organization_id", "status", "purchase_date");
CREATE INDEX "purchases_organization_id_supplier_id_idx" ON "public"."purchases"("organization_id", "supplier_id");
CREATE INDEX "purchases_organization_id_destination_location_id_idx" ON "public"."purchases"("organization_id", "destination_location_id");

ALTER TABLE "public"."purchases"
  ADD CONSTRAINT "purchases_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."purchases"
  ADD CONSTRAINT "purchases_supplier_id_organization_id_fkey"
  FOREIGN KEY ("supplier_id", "organization_id") REFERENCES "public"."suppliers"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."purchases"
  ADD CONSTRAINT "purchases_destination_location_id_organization_id_fkey"
  FOREIGN KEY ("destination_location_id", "organization_id") REFERENCES "public"."stock_locations"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."purchases"
  ADD CONSTRAINT "purchases_receipt_movement_id_organization_id_fkey"
  FOREIGN KEY ("receipt_movement_id", "organization_id") REFERENCES "public"."inventory_movements"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "public"."purchase_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost_minor" INTEGER NOT NULL,
  "total_cost_minor" BIGINT NOT NULL,
  "product_name" VARCHAR(160) NOT NULL,
  "variant_name" VARCHAR(160),
  "sku" VARCHAR(80) NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_lines_id_organization_id_key" ON "public"."purchase_lines"("id", "organization_id");
CREATE UNIQUE INDEX "purchase_lines_purchase_id_line_number_key" ON "public"."purchase_lines"("purchase_id", "line_number");
CREATE UNIQUE INDEX "purchase_lines_purchase_id_product_variant_id_key" ON "public"."purchase_lines"("purchase_id", "product_variant_id");
CREATE INDEX "purchase_lines_organization_id_product_variant_id_idx" ON "public"."purchase_lines"("organization_id", "product_variant_id");

ALTER TABLE "public"."purchase_lines"
  ADD CONSTRAINT "purchase_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."purchase_lines"
  ADD CONSTRAINT "purchase_lines_purchase_id_organization_id_fkey"
  FOREIGN KEY ("purchase_id", "organization_id") REFERENCES "public"."purchases"("id", "organization_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."purchase_lines"
  ADD CONSTRAINT "purchase_lines_product_variant_id_organization_id_fkey"
  FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "public"."product_variants"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "public"."variant_cost_states" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "inventory_value_minor" BIGINT NOT NULL DEFAULT 0,
  "average_cost_minor" INTEGER,
  "is_cost_known" BOOLEAN NOT NULL DEFAULT FALSE,
  "cost_unknown_reason" "public"."CostUnknownReason",
  "version" INTEGER NOT NULL DEFAULT 1,
  "last_cost_event_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "variant_cost_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "variant_cost_states_id_organization_id_key" ON "public"."variant_cost_states"("id", "organization_id");
CREATE UNIQUE INDEX "variant_cost_states_variant_org_key" ON "public"."variant_cost_states"("product_variant_id", "organization_id");
CREATE INDEX "variant_cost_states_organization_id_is_cost_known_idx" ON "public"."variant_cost_states"("organization_id", "is_cost_known");

ALTER TABLE "public"."variant_cost_states"
  ADD CONSTRAINT "variant_cost_states_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."variant_cost_states"
  ADD CONSTRAINT "variant_cost_states_product_variant_id_organization_id_fkey"
  FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "public"."product_variants"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "public"."inventory_cost_entries" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "event_type" "public"."InventoryCostEventType" NOT NULL,
  "quantity_change" INTEGER NOT NULL,
  "value_change_minor" BIGINT NOT NULL,
  "before_quantity" INTEGER NOT NULL,
  "after_quantity" INTEGER NOT NULL,
  "before_value_minor" BIGINT NOT NULL,
  "after_value_minor" BIGINT NOT NULL,
  "before_average_cost_minor" INTEGER,
  "after_average_cost_minor" INTEGER,
  "source_purchase_id" UUID,
  "source_movement_id" UUID,
  "reference" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_cost_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_cost_entries_id_organization_id_key" ON "public"."inventory_cost_entries"("id", "organization_id");
CREATE INDEX "inventory_cost_entries_organization_id_product_variant_id_cr_idx" ON "public"."inventory_cost_entries"("organization_id", "product_variant_id", "created_at");
CREATE INDEX "inventory_cost_entries_organization_id_event_type_created_idx" ON "public"."inventory_cost_entries"("organization_id", "event_type", "created_at");
CREATE INDEX "inventory_cost_entries_organization_id_source_purchase_id_idx" ON "public"."inventory_cost_entries"("organization_id", "source_purchase_id");
CREATE INDEX "inventory_cost_entries_organization_id_source_movement_id_idx" ON "public"."inventory_cost_entries"("organization_id", "source_movement_id");

ALTER TABLE "public"."inventory_cost_entries"
  ADD CONSTRAINT "inventory_cost_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."inventory_cost_entries"
  ADD CONSTRAINT "inventory_cost_entries_product_variant_id_organization_fkey"
  FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "public"."product_variants"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."inventory_cost_entries"
  ADD CONSTRAINT "inventory_cost_entries_source_purchase_id_organization_fkey"
  FOREIGN KEY ("source_purchase_id", "organization_id") REFERENCES "public"."purchases"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."inventory_cost_entries"
  ADD CONSTRAINT "inventory_cost_entries_source_movement_id_organization_fkey"
  FOREIGN KEY ("source_movement_id", "organization_id") REFERENCES "public"."inventory_movements"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "public"."sale_line_cost_snapshots" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_order_line_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost_minor" INTEGER,
  "total_cost_minor" BIGINT,
  "is_cost_known" BOOLEAN NOT NULL DEFAULT FALSE,
  "cost_unknown_reason" "public"."CostUnknownReason",
  "costing_method" "public"."CostingMethod" NOT NULL DEFAULT 'MOVING_WEIGHTED_AVERAGE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_line_cost_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_line_cost_snapshots_id_organization_id_key" ON "public"."sale_line_cost_snapshots"("id", "organization_id");
CREATE UNIQUE INDEX "sale_line_cost_snapshots_order_line_org_key" ON "public"."sale_line_cost_snapshots"("sales_order_line_id", "organization_id");
CREATE INDEX "sale_line_cost_snapshots_organization_id_product_variant_idx" ON "public"."sale_line_cost_snapshots"("organization_id", "product_variant_id");

ALTER TABLE "public"."sale_line_cost_snapshots"
  ADD CONSTRAINT "sale_line_cost_snapshots_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."sale_line_cost_snapshots"
  ADD CONSTRAINT "sale_line_cost_snapshots_sales_order_line_id_organiza_fkey"
  FOREIGN KEY ("sales_order_line_id", "organization_id") REFERENCES "public"."sales_order_lines"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."sale_line_cost_snapshots"
  ADD CONSTRAINT "sale_line_cost_snapshots_product_variant_id_organizati_fkey"
  FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "public"."product_variants"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
