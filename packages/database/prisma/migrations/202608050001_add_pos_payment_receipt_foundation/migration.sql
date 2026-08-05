ALTER TYPE "public"."PermissionResource" ADD VALUE 'PAYMENT' BEFORE 'REPORT';
ALTER TYPE "public"."PermissionResource" ADD VALUE 'RECEIPT' BEFORE 'REPORT';

CREATE TYPE "public"."PaymentMethod" AS ENUM (
  'CASH',
  'CARD',
  'MOBILE_BANKING',
  'BANK_TRANSFER'
);

CREATE TYPE "public"."PaymentBalanceStatus" AS ENUM (
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID'
);

CREATE TABLE "public"."payment_batches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "checkout_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "sales_session_id" UUID NOT NULL,
  "counter_id" UUID NOT NULL,
  "staff_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(64) NOT NULL,
  "request_signature" TEXT NOT NULL,
  "currency_code" VARCHAR(3) NOT NULL,
  "payable_minor" INTEGER NOT NULL,
  "paid_minor" INTEGER NOT NULL,
  "outstanding_minor" INTEGER NOT NULL,
  "status" "public"."PaymentBalanceStatus" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_batches_amounts_check" CHECK (
    "payable_minor" >= 0 AND
    "paid_minor" >= 0 AND
    "outstanding_minor" >= 0 AND
    "paid_minor" + "outstanding_minor" = "payable_minor"
  ),
  CONSTRAINT "payment_batches_status_check" CHECK (
    ("status" = 'PAID' AND "paid_minor" = "payable_minor") OR
    ("status" = 'UNPAID' AND "paid_minor" = 0 AND "outstanding_minor" > 0) OR
    ("status" = 'PARTIALLY_PAID' AND "paid_minor" > 0 AND "outstanding_minor" > 0)
  ),
  CONSTRAINT "payment_batches_currency_check" CHECK ("currency_code" = 'BDT')
);

CREATE TABLE "public"."payment_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "payment_batch_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "method" "public"."PaymentMethod" NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "reference" VARCHAR(120),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_lines_values_check" CHECK (
    "line_number" > 0 AND "amount_minor" > 0
  ),
  CONSTRAINT "payment_lines_reference_check" CHECK (
    ("method" = 'CASH') OR
    ("reference" IS NOT NULL AND LENGTH(BTRIM("reference")) > 0)
  )
);

CREATE TABLE "public"."sales_receipts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "checkout_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "payment_batch_id" UUID NOT NULL,
  "receipt_number" VARCHAR(64) NOT NULL,
  "organization_name" VARCHAR(160) NOT NULL,
  "organization_phone" VARCHAR(40),
  "organization_email" VARCHAR(254),
  "organization_address_line_1" VARCHAR(240),
  "organization_address_line_2" VARCHAR(240),
  "organization_city" VARCHAR(120),
  "organization_district" VARCHAR(120),
  "organization_postal_code" VARCHAR(120),
  "order_number" VARCHAR(64) NOT NULL,
  "counter_name" VARCHAR(160) NOT NULL,
  "counter_code" VARCHAR(64) NOT NULL,
  "sales_channel" "public"."SalesOrderChannel" NOT NULL,
  "source_name" VARCHAR(240) NOT NULL,
  "staff_name" VARCHAR(254) NOT NULL,
  "currency_code" VARCHAR(3) NOT NULL,
  "customer_name" VARCHAR(160),
  "customer_phone" VARCHAR(40),
  "customer_email" VARCHAR(254),
  "subtotal_minor" INTEGER NOT NULL,
  "discount_minor" INTEGER NOT NULL,
  "delivery_minor" INTEGER NOT NULL,
  "total_minor" INTEGER NOT NULL,
  "paid_minor" INTEGER NOT NULL,
  "outstanding_minor" INTEGER NOT NULL,
  "payment_status" "public"."PaymentBalanceStatus" NOT NULL,
  "issued_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sales_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_receipts_amounts_check" CHECK (
    "subtotal_minor" >= 0 AND
    "discount_minor" >= 0 AND
    "delivery_minor" >= 0 AND
    "total_minor" >= 0 AND
    "paid_minor" >= 0 AND
    "outstanding_minor" >= 0 AND
    "subtotal_minor" - "discount_minor" + "delivery_minor" = "total_minor" AND
    "paid_minor" + "outstanding_minor" = "total_minor"
  ),
  CONSTRAINT "sales_receipts_currency_check" CHECK ("currency_code" = 'BDT')
);

CREATE TABLE "public"."sales_receipt_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "receipt_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "product_name" VARCHAR(160) NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "color" VARCHAR(160),
  "size" VARCHAR(160),
  "quantity" INTEGER NOT NULL,
  "unit_price_minor" INTEGER NOT NULL,
  "discount_minor" INTEGER NOT NULL,
  "line_total_minor" INTEGER NOT NULL,
  CONSTRAINT "sales_receipt_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receipt_lines_amounts_check" CHECK (
    "line_number" > 0 AND
    "quantity" > 0 AND
    "unit_price_minor" >= 0 AND
    "discount_minor" >= 0 AND
    "line_total_minor" >= 0
  )
);

CREATE TABLE "public"."sales_receipt_payments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "receipt_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "method" "public"."PaymentMethod" NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "reference" VARCHAR(120),
  CONSTRAINT "sales_receipt_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receipt_payments_values_check" CHECK (
    "line_number" > 0 AND "amount_minor" > 0
  ),
  CONSTRAINT "receipt_payments_reference_check" CHECK (
    ("method" = 'CASH') OR
    ("reference" IS NOT NULL AND LENGTH(BTRIM("reference")) > 0)
  )
);

CREATE UNIQUE INDEX "payment_batches_id_org_key" ON "public"."payment_batches"("id", "organization_id");
CREATE UNIQUE INDEX "payment_batches_checkout_org_key" ON "public"."payment_batches"("checkout_id", "organization_id");
CREATE UNIQUE INDEX "payment_batches_order_org_key" ON "public"."payment_batches"("sales_order_id", "organization_id");
CREATE UNIQUE INDEX "payment_batches_org_session_idem_key" ON "public"."payment_batches"("organization_id", "sales_session_id", "idempotency_key");
CREATE INDEX "payment_batches_org_created_id_idx" ON "public"."payment_batches"("organization_id", "created_at", "id");
CREATE INDEX "payment_batches_org_counter_created_idx" ON "public"."payment_batches"("organization_id", "counter_id", "created_at");

CREATE UNIQUE INDEX "payment_lines_id_org_key" ON "public"."payment_lines"("id", "organization_id");
CREATE UNIQUE INDEX "payment_lines_batch_line_key" ON "public"."payment_lines"("payment_batch_id", "line_number");
CREATE INDEX "payment_lines_org_method_created_idx" ON "public"."payment_lines"("organization_id", "method", "created_at");

CREATE UNIQUE INDEX "sales_receipts_id_org_key" ON "public"."sales_receipts"("id", "organization_id");
CREATE UNIQUE INDEX "sales_receipts_org_number_key" ON "public"."sales_receipts"("organization_id", "receipt_number");
CREATE UNIQUE INDEX "sales_receipts_checkout_org_key" ON "public"."sales_receipts"("checkout_id", "organization_id");
CREATE UNIQUE INDEX "sales_receipts_order_org_key" ON "public"."sales_receipts"("sales_order_id", "organization_id");
CREATE UNIQUE INDEX "sales_receipts_payment_org_key" ON "public"."sales_receipts"("payment_batch_id", "organization_id");
CREATE INDEX "sales_receipts_org_issued_id_idx" ON "public"."sales_receipts"("organization_id", "issued_at", "id");

CREATE UNIQUE INDEX "receipt_lines_receipt_line_key" ON "public"."sales_receipt_lines"("receipt_id", "line_number");
CREATE INDEX "receipt_lines_org_receipt_idx" ON "public"."sales_receipt_lines"("organization_id", "receipt_id");

CREATE UNIQUE INDEX "receipt_payments_receipt_line_key" ON "public"."sales_receipt_payments"("receipt_id", "line_number");
CREATE INDEX "receipt_payments_org_receipt_idx" ON "public"."sales_receipt_payments"("organization_id", "receipt_id");

ALTER TABLE "public"."payment_batches" ADD CONSTRAINT "payment_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."payment_batches" ADD CONSTRAINT "payment_batches_checkout_org_fkey" FOREIGN KEY ("checkout_id", "organization_id") REFERENCES "public"."pos_checkout_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."payment_batches" ADD CONSTRAINT "payment_batches_order_org_fkey" FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "public"."sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."payment_batches" ADD CONSTRAINT "payment_batches_session_org_fkey" FOREIGN KEY ("sales_session_id", "organization_id") REFERENCES "public"."sales_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."payment_batches" ADD CONSTRAINT "payment_batches_counter_org_fkey" FOREIGN KEY ("counter_id", "organization_id") REFERENCES "public"."sales_counters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."payment_batches" ADD CONSTRAINT "payment_batches_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."payment_batches" ADD CONSTRAINT "payment_batches_staff_org_fkey" FOREIGN KEY ("staff_id", "organization_id") REFERENCES "public"."organization_memberships"("user_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."payment_lines" ADD CONSTRAINT "payment_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."payment_lines" ADD CONSTRAINT "payment_lines_batch_org_fkey" FOREIGN KEY ("payment_batch_id", "organization_id") REFERENCES "public"."payment_batches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."sales_receipts" ADD CONSTRAINT "sales_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_receipts" ADD CONSTRAINT "sales_receipts_checkout_org_fkey" FOREIGN KEY ("checkout_id", "organization_id") REFERENCES "public"."pos_checkout_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_receipts" ADD CONSTRAINT "sales_receipts_order_org_fkey" FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "public"."sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_receipts" ADD CONSTRAINT "sales_receipts_payment_org_fkey" FOREIGN KEY ("payment_batch_id", "organization_id") REFERENCES "public"."payment_batches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."sales_receipt_lines" ADD CONSTRAINT "sales_receipt_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_org_fkey" FOREIGN KEY ("receipt_id", "organization_id") REFERENCES "public"."sales_receipts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."sales_receipt_payments" ADD CONSTRAINT "sales_receipt_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."sales_receipt_payments" ADD CONSTRAINT "receipt_payments_receipt_org_fkey" FOREIGN KEY ("receipt_id", "organization_id") REFERENCES "public"."sales_receipts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
