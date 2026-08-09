CREATE TABLE "payment_refunds" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "accepted_by_user_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL,
    "request_signature" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_refunds_amount_check" CHECK ("amount_minor" > 0)
);

CREATE TABLE "payment_refund_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "reference" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "payment_refund_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_refund_lines_number_check" CHECK ("line_number" > 0),
    CONSTRAINT "payment_refund_lines_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "payment_refund_lines_reference_check" CHECK (
      ("method" = 'CASH' AND "reference" IS NULL)
      OR ("method" <> 'CASH' AND LENGTH(TRIM("reference")) > 0)
    )
);

CREATE TABLE "payment_refund_receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "receipt_number" VARCHAR(64) NOT NULL,
    "original_receipt_number" VARCHAR(64),
    "organization_name" VARCHAR(160) NOT NULL,
    "organization_phone" VARCHAR(40),
    "organization_email" VARCHAR(254),
    "organization_address_line_1" VARCHAR(240),
    "organization_address_line_2" VARCHAR(240),
    "organization_city" VARCHAR(120),
    "organization_district" VARCHAR(120),
    "organization_postal_code" VARCHAR(120),
    "order_number" VARCHAR(64) NOT NULL,
    "accepted_by_name" VARCHAR(254) NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "original_payable_minor" INTEGER NOT NULL,
    "return_credit_minor" INTEGER NOT NULL,
    "adjusted_payable_minor" INTEGER NOT NULL,
    "gross_received_minor" INTEGER NOT NULL,
    "cumulative_refunded_minor" INTEGER NOT NULL,
    "net_received_minor" INTEGER NOT NULL,
    "outstanding_minor" INTEGER NOT NULL,
    "refundable_minor" INTEGER NOT NULL,
    "settlement_status" "CheckoutSettlementStatus" NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "payment_refund_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_refund_receipts_amounts_check" CHECK (
      "amount_minor" > 0
      AND "original_payable_minor" >= 0
      AND "return_credit_minor" >= 0
      AND "return_credit_minor" <= "original_payable_minor"
      AND "adjusted_payable_minor" = "original_payable_minor" - "return_credit_minor"
      AND "gross_received_minor" >= 0
      AND "cumulative_refunded_minor" >= "amount_minor"
      AND "cumulative_refunded_minor" <= "gross_received_minor"
      AND "net_received_minor" = "gross_received_minor" - "cumulative_refunded_minor"
      AND "outstanding_minor" = GREATEST("adjusted_payable_minor" - "net_received_minor", 0)
      AND "refundable_minor" = GREATEST("net_received_minor" - "adjusted_payable_minor", 0)
      AND "settlement_status" <> 'UNRECORDED'
    )
);

CREATE UNIQUE INDEX "payment_refunds_id_org_key" ON "payment_refunds"("id", "organization_id");
CREATE UNIQUE INDEX "payment_refunds_org_checkout_idem_key" ON "payment_refunds"("organization_id", "checkout_id", "idempotency_key");
CREATE INDEX "payment_refunds_org_checkout_issued_idx" ON "payment_refunds"("organization_id", "checkout_id", "issued_at", "id");
CREATE INDEX "payment_refunds_org_staff_issued_idx" ON "payment_refunds"("organization_id", "accepted_by_user_id", "issued_at");
CREATE UNIQUE INDEX "payment_refund_lines_refund_line_key" ON "payment_refund_lines"("refund_id", "line_number");
CREATE INDEX "payment_refund_lines_org_refund_idx" ON "payment_refund_lines"("organization_id", "refund_id");
CREATE UNIQUE INDEX "payment_refund_receipts_id_org_key" ON "payment_refund_receipts"("id", "organization_id");
CREATE UNIQUE INDEX "payment_refund_receipts_refund_org_key" ON "payment_refund_receipts"("refund_id", "organization_id");
CREATE UNIQUE INDEX "payment_refund_receipts_org_number_key" ON "payment_refund_receipts"("organization_id", "receipt_number");
CREATE INDEX "payment_refund_receipts_org_issued_idx" ON "payment_refund_receipts"("organization_id", "issued_at", "id");

ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_checkout_org_fkey" FOREIGN KEY ("checkout_id", "organization_id") REFERENCES "pos_checkout_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_order_org_fkey" FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_staff_org_fkey" FOREIGN KEY ("accepted_by_user_id", "organization_id") REFERENCES "organization_memberships"("user_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refund_lines" ADD CONSTRAINT "payment_refund_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refund_lines" ADD CONSTRAINT "payment_refund_lines_refund_org_fkey" FOREIGN KEY ("refund_id", "organization_id") REFERENCES "payment_refunds"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refund_receipts" ADD CONSTRAINT "payment_refund_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refund_receipts" ADD CONSTRAINT "payment_refund_receipts_refund_org_fkey" FOREIGN KEY ("refund_id", "organization_id") REFERENCES "payment_refunds"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refund_receipts" ADD CONSTRAINT "payment_refund_receipts_checkout_org_fkey" FOREIGN KEY ("checkout_id", "organization_id") REFERENCES "pos_checkout_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refund_receipts" ADD CONSTRAINT "payment_refund_receipts_order_org_fkey" FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_return_receipts"
  ADD COLUMN "cumulative_refunded_minor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "net_received_minor" INTEGER NOT NULL DEFAULT 0;
UPDATE "pos_return_receipts"
SET "net_received_minor" = "cumulative_received_minor";
ALTER TABLE "pos_return_receipts"
  ALTER COLUMN "cumulative_refunded_minor" DROP DEFAULT,
  ALTER COLUMN "net_received_minor" DROP DEFAULT,
  DROP CONSTRAINT "pos_return_receipts_amounts_check",
  ADD CONSTRAINT "pos_return_receipts_amounts_check" CHECK (
    "original_total_minor" >= 0 AND "total_credit_minor" >= 0
    AND "cumulative_return_credit_minor" >= "total_credit_minor"
    AND "cumulative_return_credit_minor" <= "original_total_minor"
    AND "adjusted_payable_minor" = "original_total_minor" - "cumulative_return_credit_minor"
    AND "cumulative_received_minor" >= 0
    AND "cumulative_refunded_minor" >= 0
    AND "cumulative_refunded_minor" <= "cumulative_received_minor"
    AND "net_received_minor" = "cumulative_received_minor" - "cumulative_refunded_minor"
    AND "outstanding_minor" >= 0 AND "refundable_minor" >= 0
    AND "outstanding_minor" = GREATEST("adjusted_payable_minor" - "net_received_minor", 0)
    AND "refundable_minor" = GREATEST("net_received_minor" - "adjusted_payable_minor", 0)
  );
