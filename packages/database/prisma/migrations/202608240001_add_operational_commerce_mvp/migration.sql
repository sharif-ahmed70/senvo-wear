CREATE TYPE "CommercePartyStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');

ALTER TABLE "products"
ADD COLUMN "brand" VARCHAR(160);

ALTER TABLE "product_variants"
ADD COLUMN "cost_price_minor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "product_variants"
ADD CONSTRAINT "product_variants_cost_price_nonnegative_check"
CHECK ("cost_price_minor" >= 0);

CREATE TABLE "customers" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "phone" VARCHAR(40) NOT NULL,
  "email" VARCHAR(254),
  "address" VARCHAR(500),
  "status" "CommercePartyStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customers_version_positive_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "customers_id_organization_id_key"
ON "customers"("id", "organization_id");
CREATE UNIQUE INDEX "customers_organization_id_phone_key"
ON "customers"("organization_id", "phone");
CREATE INDEX "customers_organization_id_status_name_id_idx"
ON "customers"("organization_id", "status", "name", "id");

CREATE TABLE "vendors" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "phone" VARCHAR(40),
  "location" VARCHAR(160),
  "address" VARCHAR(500),
  "status" "CommercePartyStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "vendors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendors_version_positive_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "vendors_id_organization_id_key"
ON "vendors"("id", "organization_id");
CREATE UNIQUE INDEX "vendors_organization_id_name_key"
ON "vendors"("organization_id", "name");
CREATE INDEX "vendors_organization_id_status_name_id_idx"
ON "vendors"("organization_id", "status", "name", "id");

CREATE TABLE "purchase_orders" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "destination_location_id" UUID NOT NULL,
  "inventory_movement_id" UUID,
  "purchase_number" VARCHAR(64) NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "total_minor" INTEGER NOT NULL,
  "paid_minor" INTEGER NOT NULL DEFAULT 0,
  "note" VARCHAR(1000),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "payload_signature" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "ordered_at" TIMESTAMPTZ(6) NOT NULL,
  "received_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_orders_amounts_check"
    CHECK ("total_minor" >= 0 AND "paid_minor" >= 0 AND "paid_minor" <= "total_minor"),
  CONSTRAINT "purchase_orders_version_positive_check" CHECK ("version" > 0),
  CONSTRAINT "purchase_orders_receipt_state_check"
    CHECK (
      ("status" = 'RECEIVED' AND "received_at" IS NOT NULL AND "inventory_movement_id" IS NOT NULL)
      OR
      ("status" <> 'RECEIVED' AND "received_at" IS NULL AND "inventory_movement_id" IS NULL)
    )
);

CREATE UNIQUE INDEX "purchase_orders_id_organization_id_key"
ON "purchase_orders"("id", "organization_id");
CREATE UNIQUE INDEX "purchase_orders_organization_id_purchase_number_key"
ON "purchase_orders"("organization_id", "purchase_number");
CREATE UNIQUE INDEX "purchase_orders_organization_id_idempotency_key_key"
ON "purchase_orders"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "purchase_orders_inventory_movement_id_organization_id_key"
ON "purchase_orders"("inventory_movement_id", "organization_id");
CREATE INDEX "purchase_orders_organization_id_vendor_id_ordered_at_id_idx"
ON "purchase_orders"("organization_id", "vendor_id", "ordered_at", "id");
CREATE INDEX "purchase_orders_organization_id_status_ordered_at_id_idx"
ON "purchase_orders"("organization_id", "status", "ordered_at", "id");

CREATE TABLE "purchase_order_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost_minor" INTEGER NOT NULL,
  "line_total_minor" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_order_lines_values_check"
    CHECK (
      "line_number" > 0
      AND "quantity" > 0
      AND "unit_cost_minor" >= 0
      AND "line_total_minor" = "quantity" * "unit_cost_minor"
    )
);

CREATE UNIQUE INDEX "purchase_order_lines_purchase_order_id_line_number_key"
ON "purchase_order_lines"("purchase_order_id", "line_number");
CREATE UNIQUE INDEX "purchase_order_lines_purchase_order_id_product_variant_id_key"
ON "purchase_order_lines"("purchase_order_id", "product_variant_id");
CREATE INDEX "purchase_order_lines_organization_id_product_variant_id_idx"
ON "purchase_order_lines"("organization_id", "product_variant_id");

CREATE TABLE "vendor_payments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "purchase_order_id" UUID,
  "amount_minor" INTEGER NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "reference" VARCHAR(120),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "paid_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_payments_amount_positive_check" CHECK ("amount_minor" > 0)
);

CREATE UNIQUE INDEX "vendor_payments_id_organization_id_key"
ON "vendor_payments"("id", "organization_id");
CREATE UNIQUE INDEX "vendor_payments_organization_id_idempotency_key_key"
ON "vendor_payments"("organization_id", "idempotency_key");
CREATE INDEX "vendor_payments_organization_id_vendor_id_paid_at_id_idx"
ON "vendor_payments"("organization_id", "vendor_id", "paid_at", "id");
CREATE INDEX "vendor_payments_organization_id_purchase_order_id_idx"
ON "vendor_payments"("organization_id", "purchase_order_id");

ALTER TABLE "customers"
ADD CONSTRAINT "customers_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendors"
ADD CONSTRAINT "vendors_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_vendor_id_organization_id_fkey"
FOREIGN KEY ("vendor_id", "organization_id") REFERENCES "vendors"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_destination_location_id_organization_id_fkey"
FOREIGN KEY ("destination_location_id", "organization_id") REFERENCES "stock_locations"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_inventory_movement_id_organization_id_fkey"
FOREIGN KEY ("inventory_movement_id", "organization_id") REFERENCES "inventory_movements"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_lines"
ADD CONSTRAINT "purchase_order_lines_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_lines"
ADD CONSTRAINT "purchase_order_lines_purchase_order_id_organization_id_fkey"
FOREIGN KEY ("purchase_order_id", "organization_id") REFERENCES "purchase_orders"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_lines"
ADD CONSTRAINT "purchase_order_lines_product_variant_id_organization_id_fkey"
FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "product_variants"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendor_payments"
ADD CONSTRAINT "vendor_payments_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendor_payments"
ADD CONSTRAINT "vendor_payments_vendor_id_organization_id_fkey"
FOREIGN KEY ("vendor_id", "organization_id") REFERENCES "vendors"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendor_payments"
ADD CONSTRAINT "vendor_payments_purchase_order_id_organization_id_fkey"
FOREIGN KEY ("purchase_order_id", "organization_id") REFERENCES "purchase_orders"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_orders"
ADD COLUMN "customer_id" UUID;

ALTER TABLE "sales_orders"
ADD CONSTRAINT "sales_orders_customer_id_organization_id_fkey"
FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "sales_orders_organization_id_customer_id_created_at_id_idx"
ON "sales_orders"("organization_id", "customer_id", "created_at", "id");
