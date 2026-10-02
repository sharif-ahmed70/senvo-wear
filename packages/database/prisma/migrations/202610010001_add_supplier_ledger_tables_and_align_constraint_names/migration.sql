-- CreateEnum
CREATE TYPE "SupplierPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_BANKING');

-- CreateEnum
CREATE TYPE "SupplierLedgerEntryType" AS ENUM ('BILL', 'PAYMENT', 'RETURN_CREDIT', 'OPENING_BALANCE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SupplierLedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "purchase_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "payment_date" TIMESTAMPTZ(6) NOT NULL,
    "payment_method" "SupplierPaymentMethod" NOT NULL,
    "reference" VARCHAR(160),
    "notes" TEXT,
    "idempotency_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_ledger_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "entry_type" "SupplierLedgerEntryType" NOT NULL,
    "direction" "SupplierLedgerDirection" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "balance_after_minor" BIGINT NOT NULL,
    "reference_id" VARCHAR(128),
    "reference_type" VARCHAR(64),
    "entry_date" TIMESTAMPTZ(6) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_payments_organization_id_supplier_id_payment_date_idx" ON "supplier_payments"("organization_id", "supplier_id", "payment_date");

-- CreateIndex
CREATE INDEX "supplier_payments_organization_id_purchase_id_idx" ON "supplier_payments"("organization_id", "purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_id_organization_id_key" ON "supplier_payments"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_organization_id_idempotency_key_key" ON "supplier_payments"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_organization_id_supplier_id_entry_d_idx" ON "supplier_ledger_entries"("organization_id", "supplier_id", "entry_date");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_organization_id_entry_type_entry_da_idx" ON "supplier_ledger_entries"("organization_id", "entry_type", "entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_ledger_entries_id_organization_id_key" ON "supplier_ledger_entries"("id", "organization_id");

-- RenameForeignKey
ALTER TABLE "courier_consignments" RENAME CONSTRAINT "courier_consignments_order_org_fkey" TO "courier_consignments_sales_order_id_organization_id_fkey";

-- RenameForeignKey
ALTER TABLE "inventory_cost_entries" RENAME CONSTRAINT "inventory_cost_entries_product_variant_id_organization_fkey" TO "inventory_cost_entries_product_variant_id_organization_id_fkey";

-- RenameForeignKey
ALTER TABLE "inventory_cost_entries" RENAME CONSTRAINT "inventory_cost_entries_source_movement_id_organization_fkey" TO "inventory_cost_entries_source_movement_id_organization_id_fkey";

-- RenameForeignKey
ALTER TABLE "inventory_cost_entries" RENAME CONSTRAINT "inventory_cost_entries_source_purchase_id_organization_fkey" TO "inventory_cost_entries_source_purchase_id_organization_id_fkey";

-- RenameForeignKey
ALTER TABLE "sale_line_cost_snapshots" RENAME CONSTRAINT "sale_line_cost_snapshots_product_variant_id_organizati_fkey" TO "sale_line_cost_snapshots_product_variant_id_organization_i_fkey";

-- RenameForeignKey
ALTER TABLE "sale_line_cost_snapshots" RENAME CONSTRAINT "sale_line_cost_snapshots_sales_order_line_id_organiza_fkey" TO "sale_line_cost_snapshots_sales_order_line_id_organization__fkey";

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_organization_id_fkey" FOREIGN KEY ("supplier_id", "organization_id") REFERENCES "suppliers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_id_organization_id_fkey" FOREIGN KEY ("purchase_id", "organization_id") REFERENCES "purchases"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_supplier_id_organization_id_fkey" FOREIGN KEY ("supplier_id", "organization_id") REFERENCES "suppliers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "courier_consignments_id_org_key" RENAME TO "courier_consignments_id_organization_id_key";

-- RenameIndex
ALTER INDEX "courier_consignments_org_consignment_number_key" RENAME TO "courier_consignments_organization_id_consignment_number_key";

-- RenameIndex
ALTER INDEX "courier_consignments_org_courier_status_idx" RENAME TO "courier_consignments_organization_id_courier_provider_statu_idx";

-- RenameIndex
ALTER INDEX "courier_consignments_org_order_idx" RENAME TO "courier_consignments_organization_id_sales_order_id_idx";

-- RenameIndex
ALTER INDEX "courier_consignments_org_status_created_idx" RENAME TO "courier_consignments_organization_id_status_created_at_idx";

-- RenameIndex
ALTER INDEX "courier_consignments_org_tracking_idx" RENAME TO "courier_consignments_organization_id_tracking_code_idx";

-- RenameIndex
ALTER INDEX "inventory_cost_entries_organization_id_event_type_created_idx" RENAME TO "inventory_cost_entries_organization_id_event_type_created_a_idx";

-- RenameIndex
ALTER INDEX "inventory_cost_entries_organization_id_product_variant_id_cr_id" RENAME TO "inventory_cost_entries_organization_id_product_variant_id_c_idx";

-- RenameIndex
ALTER INDEX "sale_line_cost_snapshots_organization_id_product_variant_idx" RENAME TO "sale_line_cost_snapshots_organization_id_product_variant_id_idx";

