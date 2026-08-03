CREATE TYPE "public"."PosCheckoutStatus" AS ENUM ('COMPLETED');

CREATE TABLE "public"."pos_checkout_records" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "cart_id" UUID NOT NULL,
  "sales_session_id" UUID NOT NULL,
  "counter_id" UUID NOT NULL,
  "staff_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(64) NOT NULL,
  "status" "public"."PosCheckoutStatus" NOT NULL DEFAULT 'COMPLETED',
  "subtotal_minor" INTEGER NOT NULL,
  "total_minor" INTEGER NOT NULL,
  "completed_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pos_checkout_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_checkout_records_totals_check" CHECK (
    "subtotal_minor" >= 0 AND "total_minor" >= 0
  )
);

CREATE UNIQUE INDEX "pos_checkout_records_id_organization_id_key" ON "public"."pos_checkout_records"("id", "organization_id");
CREATE UNIQUE INDEX "pos_checkout_records_cart_id_organization_id_key" ON "public"."pos_checkout_records"("cart_id", "organization_id");
CREATE UNIQUE INDEX "pos_checkout_records_sales_order_id_organization_id_key" ON "public"."pos_checkout_records"("sales_order_id", "organization_id");
CREATE UNIQUE INDEX "pos_checkout_records_organization_id_sales_session_id_idemp_key" ON "public"."pos_checkout_records"("organization_id", "sales_session_id", "idempotency_key");
CREATE INDEX "pos_checkout_records_organization_id_completed_at_id_idx" ON "public"."pos_checkout_records"("organization_id", "completed_at", "id");
CREATE INDEX "pos_checkout_records_organization_id_counter_id_completed_a_idx" ON "public"."pos_checkout_records"("organization_id", "counter_id", "completed_at");
CREATE INDEX "pos_checkout_records_organization_id_staff_id_completed_at_idx" ON "public"."pos_checkout_records"("organization_id", "staff_id", "completed_at");

ALTER TABLE "public"."pos_checkout_records" ADD CONSTRAINT "pos_checkout_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pos_checkout_records" ADD CONSTRAINT "pos_checkout_records_cart_id_organization_id_fkey" FOREIGN KEY ("cart_id", "organization_id") REFERENCES "public"."pos_carts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pos_checkout_records" ADD CONSTRAINT "pos_checkout_records_sales_session_id_organization_id_fkey" FOREIGN KEY ("sales_session_id", "organization_id") REFERENCES "public"."sales_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pos_checkout_records" ADD CONSTRAINT "pos_checkout_records_counter_id_organization_id_fkey" FOREIGN KEY ("counter_id", "organization_id") REFERENCES "public"."sales_counters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pos_checkout_records" ADD CONSTRAINT "pos_checkout_records_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pos_checkout_records" ADD CONSTRAINT "pos_checkout_records_staff_id_organization_id_fkey" FOREIGN KEY ("staff_id", "organization_id") REFERENCES "public"."organization_memberships"("user_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pos_checkout_records" ADD CONSTRAINT "pos_checkout_records_sales_order_id_organization_id_fkey" FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "public"."sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
