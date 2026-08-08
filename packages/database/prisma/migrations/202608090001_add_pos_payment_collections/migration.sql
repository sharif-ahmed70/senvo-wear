CREATE TABLE "payment_collections" (
    "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "checkout_id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL, "payment_batch_id" UUID NOT NULL,
    "accepted_by_user_id" UUID NOT NULL, "idempotency_key" VARCHAR(64) NOT NULL,
    "request_signature" TEXT NOT NULL, "currency_code" VARCHAR(3) NOT NULL,
    "amount_minor" INTEGER NOT NULL, "balance_before_minor" INTEGER NOT NULL,
    "balance_after_minor" INTEGER NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "payment_collections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_collections_currency_check" CHECK ("currency_code" = 'BDT'),
    CONSTRAINT "payment_collections_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "payment_collections_balance_before_check" CHECK ("balance_before_minor" > 0),
    CONSTRAINT "payment_collections_balance_after_check" CHECK ("balance_after_minor" >= 0),
    CONSTRAINT "payment_collections_balance_equation_check" CHECK ("amount_minor" + "balance_after_minor" = "balance_before_minor")
);

CREATE TABLE "payment_collection_lines" (
    "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "collection_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL, "method" "PaymentMethod" NOT NULL,
    "amount_minor" INTEGER NOT NULL, "reference" VARCHAR(120), "created_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "payment_collection_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_collection_lines_number_check" CHECK ("line_number" > 0),
    CONSTRAINT "payment_collection_lines_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "payment_collection_lines_reference_check" CHECK (("method" = 'CASH' AND "reference" IS NULL) OR ("method" <> 'CASH' AND "reference" IS NOT NULL AND length(btrim("reference")) > 0))
);

CREATE TABLE "payment_collection_receipts" (
    "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "collection_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL, "sales_order_id" UUID NOT NULL, "receipt_number" VARCHAR(64) NOT NULL,
    "organization_name" VARCHAR(160) NOT NULL, "organization_phone" VARCHAR(40),
    "organization_email" VARCHAR(254), "organization_address_line_1" VARCHAR(240),
    "organization_address_line_2" VARCHAR(240), "organization_city" VARCHAR(120),
    "organization_district" VARCHAR(120), "organization_postal_code" VARCHAR(120),
    "order_number" VARCHAR(64) NOT NULL, "accepted_by_name" VARCHAR(254) NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL, "amount_minor" INTEGER NOT NULL,
    "total_minor" INTEGER NOT NULL, "cumulative_paid_minor" INTEGER NOT NULL,
    "outstanding_minor" INTEGER NOT NULL, "payment_status" "PaymentBalanceStatus" NOT NULL,
    "collected_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "payment_collection_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_collection_receipts_currency_check" CHECK ("currency_code" = 'BDT'),
    CONSTRAINT "payment_collection_receipts_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "payment_collection_receipts_total_check" CHECK ("total_minor" >= 0),
    CONSTRAINT "payment_collection_receipts_paid_check" CHECK ("cumulative_paid_minor" >= 0 AND "cumulative_paid_minor" <= "total_minor"),
    CONSTRAINT "payment_collection_receipts_outstanding_check" CHECK ("outstanding_minor" >= 0),
    CONSTRAINT "payment_collection_receipts_balance_check" CHECK ("cumulative_paid_minor" + "outstanding_minor" = "total_minor")
);

CREATE UNIQUE INDEX "payment_collections_id_org_key" ON "payment_collections"("id", "organization_id");
CREATE UNIQUE INDEX "payment_collections_org_checkout_idem_key" ON "payment_collections"("organization_id", "checkout_id", "idempotency_key");
CREATE INDEX "payment_collections_org_checkout_created_idx" ON "payment_collections"("organization_id", "checkout_id", "created_at", "id");
CREATE INDEX "payment_collections_org_staff_created_idx" ON "payment_collections"("organization_id", "accepted_by_user_id", "created_at");
CREATE UNIQUE INDEX "payment_collection_lines_collection_line_key" ON "payment_collection_lines"("collection_id", "line_number");
CREATE INDEX "payment_collection_lines_org_collection_idx" ON "payment_collection_lines"("organization_id", "collection_id");
CREATE UNIQUE INDEX "payment_collection_receipts_id_org_key" ON "payment_collection_receipts"("id", "organization_id");
CREATE UNIQUE INDEX "payment_collection_receipts_collection_org_key" ON "payment_collection_receipts"("collection_id", "organization_id");
CREATE UNIQUE INDEX "payment_collection_receipts_org_number_key" ON "payment_collection_receipts"("organization_id", "receipt_number");
CREATE INDEX "payment_collection_receipts_org_collected_idx" ON "payment_collection_receipts"("organization_id", "collected_at", "id");

ALTER TABLE "payment_collections" ADD CONSTRAINT "payment_collections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_collections" ADD CONSTRAINT "payment_collections_checkout_org_fkey" FOREIGN KEY ("checkout_id", "organization_id") REFERENCES "pos_checkout_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_collections" ADD CONSTRAINT "payment_collections_order_org_fkey" FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_collections" ADD CONSTRAINT "payment_collections_batch_org_fkey" FOREIGN KEY ("payment_batch_id", "organization_id") REFERENCES "payment_batches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_collections" ADD CONSTRAINT "payment_collections_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_collections" ADD CONSTRAINT "payment_collections_staff_org_fkey" FOREIGN KEY ("accepted_by_user_id", "organization_id") REFERENCES "organization_memberships"("user_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_collection_lines" ADD CONSTRAINT "payment_collection_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_collection_lines" ADD CONSTRAINT "payment_collection_lines_collection_org_fkey" FOREIGN KEY ("collection_id", "organization_id") REFERENCES "payment_collections"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_collection_receipts" ADD CONSTRAINT "payment_collection_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_collection_receipts" ADD CONSTRAINT "payment_collection_receipts_collection_org_fkey" FOREIGN KEY ("collection_id", "organization_id") REFERENCES "payment_collections"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_collection_receipts" ADD CONSTRAINT "payment_collection_receipts_checkout_org_fkey" FOREIGN KEY ("checkout_id", "organization_id") REFERENCES "pos_checkout_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_collection_receipts" ADD CONSTRAINT "payment_collection_receipts_order_org_fkey" FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
