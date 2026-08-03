ALTER TYPE "public"."PermissionResource" ADD VALUE 'POS' BEFORE 'REPORT';

CREATE TYPE "public"."SalesCounterType" AS ENUM ('STORE', 'EVENT_BOOTH');
CREATE TYPE "public"."SalesCounterStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "public"."SalesSessionStatus" AS ENUM ('OPEN', 'CLOSED');

ALTER TABLE "public"."product_variants"
  ADD COLUMN "selling_price_minor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."product_variants"
  ADD CONSTRAINT "product_variants_selling_price_non_negative_check"
  CHECK ("selling_price_minor" >= 0);

CREATE TABLE "public"."sales_counters" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "branch_id" UUID,
  "booth_id" UUID,
  "name" VARCHAR(160) NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "type" "public"."SalesCounterType" NOT NULL,
  "status" "public"."SalesCounterStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sales_counters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_counters_source_shape_check" CHECK (
    ("type" = 'STORE' AND "branch_id" IS NOT NULL AND "booth_id" IS NULL)
    OR ("type" = 'EVENT_BOOTH' AND "booth_id" IS NOT NULL AND "branch_id" IS NULL)
  )
);

CREATE TABLE "public"."sales_sessions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "counter_id" UUID NOT NULL,
  "opened_by_user_id" UUID NOT NULL,
  "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMPTZ(6),
  "status" "public"."SalesSessionStatus" NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sales_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_sessions_status_time_check" CHECK (
    ("status" = 'OPEN' AND "closed_at" IS NULL)
    OR ("status" = 'CLOSED' AND "closed_at" IS NOT NULL AND "closed_at" >= "opened_at")
  )
);

CREATE TABLE "public"."pos_carts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_session_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pos_carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."pos_cart_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "cart_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price_minor" INTEGER NOT NULL,
  "line_subtotal_minor" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pos_cart_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_cart_lines_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "pos_cart_lines_price_non_negative_check" CHECK ("unit_price_minor" >= 0),
  CONSTRAINT "pos_cart_lines_subtotal_check" CHECK ("line_subtotal_minor" = "quantity" * "unit_price_minor")
);

CREATE UNIQUE INDEX "sales_counters_id_organization_id_key" ON "public"."sales_counters"("id", "organization_id");
CREATE UNIQUE INDEX "sales_counters_organization_id_code_key" ON "public"."sales_counters"("organization_id", "code");
CREATE INDEX "sales_counters_organization_id_status_type_idx" ON "public"."sales_counters"("organization_id", "status", "type");
CREATE INDEX "sales_counters_organization_id_branch_id_idx" ON "public"."sales_counters"("organization_id", "branch_id");
CREATE INDEX "sales_counters_organization_id_booth_id_idx" ON "public"."sales_counters"("organization_id", "booth_id");

CREATE UNIQUE INDEX "sales_sessions_id_organization_id_key" ON "public"."sales_sessions"("id", "organization_id");
CREATE UNIQUE INDEX "sales_sessions_one_open_per_counter_key" ON "public"."sales_sessions"("counter_id") WHERE "status" = 'OPEN';
CREATE INDEX "sales_sessions_organization_id_status_opened_at_idx" ON "public"."sales_sessions"("organization_id", "status", "opened_at");
CREATE INDEX "sales_sessions_organization_id_opened_by_user_id_idx" ON "public"."sales_sessions"("organization_id", "opened_by_user_id");

CREATE UNIQUE INDEX "pos_carts_sales_session_id_organization_id_key" ON "public"."pos_carts"("sales_session_id", "organization_id");
CREATE UNIQUE INDEX "pos_carts_id_organization_id_key" ON "public"."pos_carts"("id", "organization_id");
CREATE INDEX "pos_carts_organization_id_created_at_idx" ON "public"."pos_carts"("organization_id", "created_at");
CREATE UNIQUE INDEX "pos_cart_lines_cart_id_product_variant_id_key" ON "public"."pos_cart_lines"("cart_id", "product_variant_id");
CREATE INDEX "pos_cart_lines_organization_id_product_variant_id_idx" ON "public"."pos_cart_lines"("organization_id", "product_variant_id");
CREATE INDEX "pos_cart_lines_cart_id_idx" ON "public"."pos_cart_lines"("cart_id");

ALTER TABLE "public"."sales_counters" ADD CONSTRAINT "sales_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_counters" ADD CONSTRAINT "sales_counters_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "public"."branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_counters" ADD CONSTRAINT "sales_counters_booth_id_organization_id_fkey" FOREIGN KEY ("booth_id", "organization_id") REFERENCES "public"."sales_booths"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."sales_sessions" ADD CONSTRAINT "sales_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_sessions" ADD CONSTRAINT "sales_sessions_counter_id_organization_id_fkey" FOREIGN KEY ("counter_id", "organization_id") REFERENCES "public"."sales_counters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_sessions" ADD CONSTRAINT "sales_sessions_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_sessions" ADD CONSTRAINT "sales_sessions_opened_by_user_id_organization_id_fkey" FOREIGN KEY ("opened_by_user_id", "organization_id") REFERENCES "public"."organization_memberships"("user_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."pos_carts" ADD CONSTRAINT "pos_carts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pos_carts" ADD CONSTRAINT "pos_carts_sales_session_id_organization_id_fkey" FOREIGN KEY ("sales_session_id", "organization_id") REFERENCES "public"."sales_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."pos_cart_lines" ADD CONSTRAINT "pos_cart_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pos_cart_lines" ADD CONSTRAINT "pos_cart_lines_cart_id_organization_id_fkey" FOREIGN KEY ("cart_id", "organization_id") REFERENCES "public"."pos_carts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."pos_cart_lines" ADD CONSTRAINT "pos_cart_lines_product_variant_id_organization_id_fkey" FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "public"."product_variants"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
