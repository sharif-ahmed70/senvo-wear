CREATE TYPE "SalesOrderStatus" AS ENUM (
  'DRAFT',
  'RESERVED',
  'CONFIRMED',
  'CANCELLED',
  'FULFILLED'
);

CREATE TYPE "SalesOrderChannel" AS ENUM (
  'ONLINE',
  'POS',
  'MANUAL'
);

CREATE TABLE "sales_orders" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "order_number" VARCHAR(64) NOT NULL,
  "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "channel" "SalesOrderChannel" NOT NULL,
  "currency_code" VARCHAR(3) NOT NULL,
  "subtotal_minor" INTEGER NOT NULL,
  "discount_minor" INTEGER NOT NULL DEFAULT 0,
  "delivery_minor" INTEGER NOT NULL DEFAULT 0,
  "total_minor" INTEGER NOT NULL,
  "customer_name" VARCHAR(160),
  "customer_phone" VARCHAR(40),
  "customer_email" VARCHAR(254),
  "delivery_address_line_1" VARCHAR(240),
  "delivery_address_line_2" VARCHAR(240),
  "delivery_city" VARCHAR(120),
  "delivery_district" VARCHAR(120),
  "delivery_postal_code" VARCHAR(120),
  "allocation_policy_id" UUID,
  "inventory_reservation_id" UUID,
  "fulfillment_movement_id" UUID,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "payload_signature" TEXT NOT NULL,
  "note" VARCHAR(1000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "reserved_at" TIMESTAMPTZ(6),
  "confirmed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "fulfilled_at" TIMESTAMPTZ(6),

  CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_orders_version_positive_check" CHECK ("version" >= 1),
  CONSTRAINT "sales_orders_currency_code_check" CHECK ("currency_code" = 'BDT'),
  CONSTRAINT "sales_orders_money_non_negative_check" CHECK (
    "subtotal_minor" >= 0
    AND "discount_minor" >= 0
    AND "delivery_minor" >= 0
    AND "total_minor" >= 0
  ),
  CONSTRAINT "sales_orders_total_formula_check" CHECK (
    "total_minor" = "subtotal_minor" - "discount_minor" + "delivery_minor"
  ),
  CONSTRAINT "sales_orders_status_shape_check" CHECK (
    (
      "status" = 'DRAFT'
      AND "inventory_reservation_id" IS NULL
      AND "fulfillment_movement_id" IS NULL
      AND "reserved_at" IS NULL
      AND "confirmed_at" IS NULL
      AND "cancelled_at" IS NULL
      AND "fulfilled_at" IS NULL
    )
    OR (
      "status" = 'RESERVED'
      AND "inventory_reservation_id" IS NOT NULL
      AND "fulfillment_movement_id" IS NULL
      AND "reserved_at" IS NOT NULL
      AND "confirmed_at" IS NULL
      AND "cancelled_at" IS NULL
      AND "fulfilled_at" IS NULL
    )
    OR (
      "status" = 'CONFIRMED'
      AND "inventory_reservation_id" IS NOT NULL
      AND "fulfillment_movement_id" IS NULL
      AND "reserved_at" IS NOT NULL
      AND "confirmed_at" IS NOT NULL
      AND "cancelled_at" IS NULL
      AND "fulfilled_at" IS NULL
    )
    OR (
      "status" = 'CANCELLED'
      AND "fulfillment_movement_id" IS NULL
      AND "cancelled_at" IS NOT NULL
      AND "fulfilled_at" IS NULL
    )
    OR (
      "status" = 'FULFILLED'
      AND "inventory_reservation_id" IS NOT NULL
      AND "fulfillment_movement_id" IS NOT NULL
      AND "reserved_at" IS NOT NULL
      AND "confirmed_at" IS NOT NULL
      AND "cancelled_at" IS NULL
      AND "fulfilled_at" IS NOT NULL
    )
  )
);

CREATE TABLE "sales_order_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "product_name_snapshot" VARCHAR(160) NOT NULL,
  "sku_snapshot" VARCHAR(80) NOT NULL,
  "color_snapshot" VARCHAR(160),
  "size_snapshot" VARCHAR(160),
  "quantity" INTEGER NOT NULL,
  "unit_price_minor" INTEGER NOT NULL,
  "discount_minor" INTEGER NOT NULL DEFAULT 0,
  "line_total_minor" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_order_lines_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "sales_order_lines_line_number_positive_check" CHECK ("line_number" > 0),
  CONSTRAINT "sales_order_lines_money_non_negative_check" CHECK (
    "unit_price_minor" >= 0
    AND "discount_minor" >= 0
    AND "line_total_minor" >= 0
  ),
  CONSTRAINT "sales_order_lines_total_formula_check" CHECK (
    "line_total_minor" = ("quantity" * "unit_price_minor") - "discount_minor"
  )
);

CREATE UNIQUE INDEX "sales_orders_id_organization_id_key"
  ON "sales_orders"("id", "organization_id");

CREATE UNIQUE INDEX "sales_orders_organization_id_order_number_key"
  ON "sales_orders"("organization_id", "order_number");

CREATE UNIQUE INDEX "sales_orders_organization_id_idempotency_key_key"
  ON "sales_orders"("organization_id", "idempotency_key");

CREATE UNIQUE INDEX "sales_orders_inventory_reservation_id_organization_key"
  ON "sales_orders"("inventory_reservation_id", "organization_id");

CREATE UNIQUE INDEX "sales_orders_fulfillment_movement_id_organization_key"
  ON "sales_orders"("fulfillment_movement_id", "organization_id");

CREATE UNIQUE INDEX "sales_order_lines_sales_order_id_product_variant_id_key"
  ON "sales_order_lines"("sales_order_id", "product_variant_id");

CREATE UNIQUE INDEX "sales_order_lines_sales_order_id_line_number_key"
  ON "sales_order_lines"("sales_order_id", "line_number");

CREATE INDEX "sales_orders_organization_id_status_created_at_id_idx"
  ON "sales_orders"("organization_id", "status", "created_at", "id");

CREATE INDEX "sales_orders_organization_id_channel_created_at_id_idx"
  ON "sales_orders"("organization_id", "channel", "created_at", "id");

CREATE INDEX "sales_orders_organization_id_customer_phone_idx"
  ON "sales_orders"("organization_id", "customer_phone");

CREATE INDEX "sales_orders_organization_id_allocation_policy_id_idx"
  ON "sales_orders"("organization_id", "allocation_policy_id");

CREATE INDEX "sales_orders_organization_id_inventory_reservation_id_idx"
  ON "sales_orders"("organization_id", "inventory_reservation_id");

CREATE INDEX "sales_order_lines_organization_id_product_variant_id_idx"
  ON "sales_order_lines"("organization_id", "product_variant_id");

CREATE INDEX "sales_order_lines_sales_order_id_idx"
  ON "sales_order_lines"("sales_order_id");

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_allocation_policy_id_organization_id_fkey"
  FOREIGN KEY ("allocation_policy_id", "organization_id")
  REFERENCES "inventory_allocation_policies"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_inventory_reservation_id_organization_id_fkey"
  FOREIGN KEY ("inventory_reservation_id", "organization_id")
  REFERENCES "inventory_reservations"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_fulfillment_movement_id_organization_id_fkey"
  FOREIGN KEY ("fulfillment_movement_id", "organization_id")
  REFERENCES "inventory_movements"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "sales_order_lines"
  ADD CONSTRAINT "sales_order_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "sales_order_lines"
  ADD CONSTRAINT "sales_order_lines_sales_order_id_organization_id_fkey"
  FOREIGN KEY ("sales_order_id", "organization_id")
  REFERENCES "sales_orders"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "sales_order_lines"
  ADD CONSTRAINT "sales_order_lines_product_variant_id_organization_id_fkey"
  FOREIGN KEY ("product_variant_id", "organization_id")
  REFERENCES "product_variants"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
