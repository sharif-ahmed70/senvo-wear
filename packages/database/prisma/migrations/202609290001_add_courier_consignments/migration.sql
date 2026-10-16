CREATE TYPE "public"."CourierProvider" AS ENUM ('STEADFAST', 'PATHAO', 'REDX', 'PAPERFLY', 'IN_HOUSE');

CREATE TYPE "public"."ShipmentStatus" AS ENUM ('DRAFT', 'BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'RETURNED_TO_ORIGIN', 'CANCELLED');

CREATE TABLE "public"."courier_consignments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "consignment_number" VARCHAR(64) NOT NULL,
  "courier_provider" "public"."CourierProvider" NOT NULL,
  "status" "public"."ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
  "tracking_code" VARCHAR(128),
  "tracking_url" VARCHAR(500),
  "cod_amount_minor" INTEGER NOT NULL DEFAULT 0,
  "delivery_fee_minor" INTEGER NOT NULL DEFAULT 0,
  "recipient_name" VARCHAR(160) NOT NULL,
  "recipient_phone" VARCHAR(40) NOT NULL,
  "recipient_email" VARCHAR(254),
  "delivery_address_line_1" VARCHAR(240) NOT NULL,
  "delivery_address_line_2" VARCHAR(240),
  "delivery_city" VARCHAR(120),
  "delivery_district" VARCHAR(120),
  "delivery_postal_code" VARCHAR(120),
  "item_weight_gram" INTEGER,
  "note" VARCHAR(1000),
  "dispatched_at" TIMESTAMPTZ(6),
  "delivered_at" TIMESTAMPTZ(6),
  "returned_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "courier_consignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "courier_consignments_id_org_key" ON "public"."courier_consignments"("id", "organization_id");
CREATE UNIQUE INDEX "courier_consignments_org_consignment_number_key" ON "public"."courier_consignments"("organization_id", "consignment_number");
CREATE INDEX "courier_consignments_org_order_idx" ON "public"."courier_consignments"("organization_id", "sales_order_id");
CREATE INDEX "courier_consignments_org_status_created_idx" ON "public"."courier_consignments"("organization_id", "status", "created_at");
CREATE INDEX "courier_consignments_org_courier_status_idx" ON "public"."courier_consignments"("organization_id", "courier_provider", "status");
CREATE INDEX "courier_consignments_org_tracking_idx" ON "public"."courier_consignments"("organization_id", "tracking_code");

ALTER TABLE "public"."courier_consignments"
  ADD CONSTRAINT "courier_consignments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."courier_consignments"
  ADD CONSTRAINT "courier_consignments_order_org_fkey"
  FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "public"."sales_orders"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
