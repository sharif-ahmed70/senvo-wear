CREATE TYPE "public"."PosSettlementStatus" AS ENUM ('BALANCED', 'SHORTAGE', 'OVERAGE');

ALTER TABLE "public"."sales_sessions"
  ADD COLUMN "opening_float_minor" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "public"."pos_register_settlements" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_session_id" UUID NOT NULL,
  "counter_id" UUID NOT NULL,
  "closed_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "opening_float_minor" INTEGER NOT NULL,
  "expected_cash_minor" INTEGER NOT NULL,
  "actual_cash_minor" INTEGER NOT NULL,
  "cash_discrepancy_minor" INTEGER NOT NULL,
  "expected_mobile_banking_minor" INTEGER NOT NULL,
  "actual_mobile_banking_minor" INTEGER NOT NULL,
  "mobile_banking_discrepancy_minor" INTEGER NOT NULL,
  "expected_card_minor" INTEGER NOT NULL,
  "actual_card_minor" INTEGER NOT NULL,
  "card_discrepancy_minor" INTEGER NOT NULL,
  "expected_bank_transfer_minor" INTEGER NOT NULL,
  "actual_bank_transfer_minor" INTEGER NOT NULL,
  "bank_transfer_discrepancy_minor" INTEGER NOT NULL,
  "expected_total_minor" INTEGER NOT NULL,
  "actual_total_minor" INTEGER NOT NULL,
  "total_discrepancy_minor" INTEGER NOT NULL,
  "denomination_breakdown" JSONB,
  "discrepancy_reason" VARCHAR(1000),
  "closing_notes" VARCHAR(1000),
  "status" "public"."PosSettlementStatus" NOT NULL,
  "closed_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_register_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_register_settlements_id_org_key" ON "public"."pos_register_settlements"("id", "organization_id");
CREATE UNIQUE INDEX "pos_register_settlements_session_org_key" ON "public"."pos_register_settlements"("sales_session_id", "organization_id");
CREATE INDEX "pos_register_settlements_org_counter_closed_idx" ON "public"."pos_register_settlements"("organization_id", "counter_id", "closed_at");
CREATE INDEX "pos_register_settlements_org_staff_closed_idx" ON "public"."pos_register_settlements"("organization_id", "closed_by_user_id", "closed_at");

ALTER TABLE "public"."pos_register_settlements"
  ADD CONSTRAINT "pos_register_settlements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."pos_register_settlements"
  ADD CONSTRAINT "pos_register_settlements_session_org_fkey"
  FOREIGN KEY ("sales_session_id", "organization_id") REFERENCES "public"."sales_sessions"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."pos_register_settlements"
  ADD CONSTRAINT "pos_register_settlements_counter_org_fkey"
  FOREIGN KEY ("counter_id", "organization_id") REFERENCES "public"."sales_counters"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."pos_register_settlements"
  ADD CONSTRAINT "pos_register_settlements_closed_by_fkey"
  FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."pos_register_settlements"
  ADD CONSTRAINT "pos_register_settlements_approved_by_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
