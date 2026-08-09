CREATE TYPE "PosReturnReasonCode" AS ENUM ('SIZE_OR_FIT', 'DEFECTIVE', 'WRONG_ITEM', 'CHANGED_MIND', 'OTHER');
CREATE TYPE "CheckoutSettlementStatus" AS ENUM ('UNRECORDED', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUND_DUE', 'SETTLED');

CREATE UNIQUE INDEX "sales_order_lines_id_org_key" ON "sales_order_lines"("id", "organization_id");

CREATE TABLE "pos_sale_returns" (
    "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "checkout_id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL, "destination_location_id" UUID NOT NULL,
    "accepted_by_user_id" UUID NOT NULL, "inventory_movement_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL, "request_signature" TEXT NOT NULL,
    "reason_code" "PosReturnReasonCode" NOT NULL, "reason_note" VARCHAR(1000),
    "total_credit_minor" INTEGER NOT NULL, "returned_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "pos_sale_returns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_sale_returns_credit_check" CHECK ("total_credit_minor" >= 0)
);

CREATE TABLE "pos_sale_return_lines" (
    "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "return_id" UUID NOT NULL,
    "sales_order_line_id" UUID NOT NULL, "product_variant_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL, "product_name_snapshot" VARCHAR(160) NOT NULL,
    "sku_snapshot" VARCHAR(80) NOT NULL, "color_snapshot" VARCHAR(160),
    "size_snapshot" VARCHAR(160), "quantity" INTEGER NOT NULL,
    "unit_price_minor" INTEGER NOT NULL, "line_credit_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "pos_sale_return_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_sale_return_lines_number_check" CHECK ("line_number" > 0),
    CONSTRAINT "pos_sale_return_lines_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "pos_sale_return_lines_price_check" CHECK ("unit_price_minor" >= 0),
    CONSTRAINT "pos_sale_return_lines_credit_check" CHECK ("line_credit_minor" >= 0)
);

CREATE TABLE "pos_return_receipts" (
    "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "return_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL, "sales_order_id" UUID NOT NULL,
    "receipt_number" VARCHAR(64) NOT NULL, "original_receipt_number" VARCHAR(64),
    "organization_name" VARCHAR(160) NOT NULL, "organization_phone" VARCHAR(40),
    "organization_email" VARCHAR(254), "organization_address_line_1" VARCHAR(240),
    "organization_address_line_2" VARCHAR(240), "organization_city" VARCHAR(120),
    "organization_district" VARCHAR(120), "organization_postal_code" VARCHAR(120),
    "order_number" VARCHAR(64) NOT NULL, "accepted_by_name" VARCHAR(254) NOT NULL,
    "destination_location_name" VARCHAR(160) NOT NULL,
    "reason_code" "PosReturnReasonCode" NOT NULL, "reason_note" VARCHAR(1000),
    "original_total_minor" INTEGER NOT NULL, "total_credit_minor" INTEGER NOT NULL,
    "cumulative_return_credit_minor" INTEGER NOT NULL, "adjusted_payable_minor" INTEGER NOT NULL,
    "cumulative_received_minor" INTEGER NOT NULL, "outstanding_minor" INTEGER NOT NULL,
    "refundable_minor" INTEGER NOT NULL, "settlement_status" "CheckoutSettlementStatus" NOT NULL,
    "returned_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "pos_return_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_return_receipts_amounts_check" CHECK (
      "original_total_minor" >= 0 AND "total_credit_minor" >= 0
      AND "cumulative_return_credit_minor" >= "total_credit_minor"
      AND "cumulative_return_credit_minor" <= "original_total_minor"
      AND "adjusted_payable_minor" = "original_total_minor" - "cumulative_return_credit_minor"
      AND "cumulative_received_minor" >= 0 AND "outstanding_minor" >= 0 AND "refundable_minor" >= 0
      AND "outstanding_minor" = GREATEST("adjusted_payable_minor" - "cumulative_received_minor", 0)
      AND "refundable_minor" = GREATEST("cumulative_received_minor" - "adjusted_payable_minor", 0)
    )
);

CREATE UNIQUE INDEX "pos_sale_returns_id_org_key" ON "pos_sale_returns"("id", "organization_id");
CREATE UNIQUE INDEX "pos_sale_returns_org_checkout_idem_key" ON "pos_sale_returns"("organization_id", "checkout_id", "idempotency_key");
CREATE UNIQUE INDEX "pos_sale_returns_movement_org_key" ON "pos_sale_returns"("inventory_movement_id", "organization_id");
CREATE INDEX "pos_sale_returns_org_checkout_returned_idx" ON "pos_sale_returns"("organization_id", "checkout_id", "returned_at", "id");
CREATE INDEX "pos_sale_returns_org_order_returned_idx" ON "pos_sale_returns"("organization_id", "sales_order_id", "returned_at");
CREATE INDEX "pos_sale_returns_org_destination_returned_idx" ON "pos_sale_returns"("organization_id", "destination_location_id", "returned_at");
CREATE INDEX "pos_sale_returns_org_staff_returned_idx" ON "pos_sale_returns"("organization_id", "accepted_by_user_id", "returned_at");
CREATE UNIQUE INDEX "pos_sale_return_lines_return_line_key" ON "pos_sale_return_lines"("return_id", "line_number");
CREATE UNIQUE INDEX "pos_sale_return_lines_return_order_line_key" ON "pos_sale_return_lines"("return_id", "sales_order_line_id");
CREATE INDEX "pos_sale_return_lines_org_order_line_idx" ON "pos_sale_return_lines"("organization_id", "sales_order_line_id");
CREATE UNIQUE INDEX "pos_return_receipts_id_org_key" ON "pos_return_receipts"("id", "organization_id");
CREATE UNIQUE INDEX "pos_return_receipts_return_org_key" ON "pos_return_receipts"("return_id", "organization_id");
CREATE UNIQUE INDEX "pos_return_receipts_org_number_key" ON "pos_return_receipts"("organization_id", "receipt_number");
CREATE INDEX "pos_return_receipts_org_returned_idx" ON "pos_return_receipts"("organization_id", "returned_at", "id");

ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_checkout_org_fkey" FOREIGN KEY ("checkout_id", "organization_id") REFERENCES "pos_checkout_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_order_org_fkey" FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_destination_org_fkey" FOREIGN KEY ("destination_location_id", "organization_id") REFERENCES "stock_locations"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_staff_org_fkey" FOREIGN KEY ("accepted_by_user_id", "organization_id") REFERENCES "organization_memberships"("user_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_movement_org_fkey" FOREIGN KEY ("inventory_movement_id", "organization_id") REFERENCES "inventory_movements"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_return_lines" ADD CONSTRAINT "pos_sale_return_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_return_lines" ADD CONSTRAINT "pos_sale_return_lines_return_org_fkey" FOREIGN KEY ("return_id", "organization_id") REFERENCES "pos_sale_returns"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_return_lines" ADD CONSTRAINT "pos_sale_return_lines_order_line_org_fkey" FOREIGN KEY ("sales_order_line_id", "organization_id") REFERENCES "sales_order_lines"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_return_lines" ADD CONSTRAINT "pos_sale_return_lines_variant_org_fkey" FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "product_variants"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_return_receipts" ADD CONSTRAINT "pos_return_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_return_receipts" ADD CONSTRAINT "pos_return_receipts_return_org_fkey" FOREIGN KEY ("return_id", "organization_id") REFERENCES "pos_sale_returns"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_return_receipts" ADD CONSTRAINT "pos_return_receipts_checkout_org_fkey" FOREIGN KEY ("checkout_id", "organization_id") REFERENCES "pos_checkout_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_return_receipts" ADD CONSTRAINT "pos_return_receipts_order_org_fkey" FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
