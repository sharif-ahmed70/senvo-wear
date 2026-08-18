ALTER TYPE "CommercePaymentPreference" ADD VALUE 'ONLINE_PAYMENT';
ALTER TYPE "PaymentMethod" ADD VALUE 'ONLINE_GATEWAY';

CREATE TYPE "OnlinePaymentProvider" AS ENUM ('SSLCOMMERZ');
CREATE TYPE "OnlinePaymentAttemptStatus" AS ENUM (
  'CREATED', 'SESSION_READY', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'
);
CREATE TYPE "OnlinePaymentResolutionStatus" AS ENUM (
  'NORMAL', 'REVIEW_REQUIRED', 'REFUND_REQUIRED'
);
CREATE TYPE "ProviderNotificationProcessingStatus" AS ENUM (
  'RECEIVED', 'PROCESSED', 'REJECTED', 'FAILED'
);
CREATE TYPE "PaymentReconciliationOutcome" AS ENUM ('MATCHED', 'MISMATCH');
CREATE TYPE "ProviderRefundStatus" AS ENUM (
  'CREATED', 'PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'
);

ALTER TABLE "payment_batches"
  ALTER COLUMN "checkout_id" DROP NOT NULL,
  ALTER COLUMN "sales_session_id" DROP NOT NULL,
  ALTER COLUMN "counter_id" DROP NOT NULL,
  ALTER COLUMN "staff_id" DROP NOT NULL,
  ADD COLUMN "payment_attempt_id" UUID;

ALTER TABLE "payment_batches"
  ADD CONSTRAINT "payment_batches_source_check" CHECK (
    (
      "payment_attempt_id" IS NULL
      AND "checkout_id" IS NOT NULL
      AND "sales_session_id" IS NOT NULL
      AND "counter_id" IS NOT NULL
      AND "staff_id" IS NOT NULL
    ) OR (
      "payment_attempt_id" IS NOT NULL
      AND "checkout_id" IS NULL
      AND "sales_session_id" IS NULL
      AND "counter_id" IS NULL
      AND "staff_id" IS NULL
    )
  );

CREATE TABLE "online_payment_attempts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "provider" "OnlinePaymentProvider" NOT NULL,
  "status" "OnlinePaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
  "resolution_status" "OnlinePaymentResolutionStatus" NOT NULL DEFAULT 'NORMAL',
  "amount_minor" INTEGER NOT NULL,
  "currency_code" VARCHAR(3) NOT NULL,
  "idempotency_key" VARCHAR(64) NOT NULL,
  "request_signature" TEXT NOT NULL,
  "public_token" VARCHAR(64) NOT NULL,
  "provider_transaction_id" VARCHAR(64) NOT NULL,
  "provider_session_id" VARCHAR(160),
  "redirect_url" VARCHAR(1000),
  "validation_id" VARCHAR(120),
  "bank_transaction_id" VARCHAR(160),
  "failure_code" VARCHAR(80),
  "expires_at" TIMESTAMPTZ(6),
  "confirmed_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "online_payment_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "online_payment_attempts_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "online_payment_attempts_currency_check" CHECK ("currency_code" = 'BDT'),
  CONSTRAINT "online_payment_attempts_redirect_check" CHECK (
    "redirect_url" IS NULL OR "redirect_url" LIKE 'https://%'
  )
);

CREATE TABLE "provider_notifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "payment_attempt_id" UUID NOT NULL,
  "provider" "OnlinePaymentProvider" NOT NULL,
  "dedupe_key" VARCHAR(64) NOT NULL,
  "provider_transaction_id" VARCHAR(64) NOT NULL,
  "validation_id" VARCHAR(120),
  "event_type" VARCHAR(40) NOT NULL,
  "processing_status" "ProviderNotificationProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "error_code" VARCHAR(80),
  "received_at" TIMESTAMPTZ(6) NOT NULL,
  "processed_at" TIMESTAMPTZ(6),
  CONSTRAINT "provider_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_reconciliations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "payment_attempt_id" UUID NOT NULL,
  "expected_status" "OnlinePaymentAttemptStatus" NOT NULL,
  "observed_status" VARCHAR(40) NOT NULL,
  "expected_amount_minor" INTEGER NOT NULL,
  "observed_amount_minor" INTEGER,
  "expected_currency_code" VARCHAR(3) NOT NULL,
  "observed_currency_code" VARCHAR(3),
  "provider_reference" VARCHAR(160),
  "outcome" "PaymentReconciliationOutcome" NOT NULL,
  "reason_code" VARCHAR(80),
  "resolved_by_user_id" UUID,
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_reconciliations_amount_check" CHECK (
    "expected_amount_minor" > 0
    AND ("observed_amount_minor" IS NULL OR "observed_amount_minor" >= 0)
  ),
  CONSTRAINT "payment_reconciliations_resolution_check" CHECK (
    ("resolved_by_user_id" IS NULL AND "resolved_at" IS NULL)
    OR ("resolved_by_user_id" IS NOT NULL AND "resolved_at" IS NOT NULL)
  )
);

CREATE TABLE "provider_refunds" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "payment_attempt_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "requested_by_user_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(64) NOT NULL,
  "request_signature" TEXT NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency_code" VARCHAR(3) NOT NULL,
  "provider_refund_transaction_id" VARCHAR(64) NOT NULL,
  "provider_refund_reference" VARCHAR(160),
  "status" "ProviderRefundStatus" NOT NULL DEFAULT 'CREATED',
  "failure_code" VARCHAR(80),
  "confirmed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "provider_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_refunds_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "provider_refunds_currency_check" CHECK ("currency_code" = 'BDT')
);

ALTER TABLE "payment_refunds"
  ALTER COLUMN "checkout_id" DROP NOT NULL,
  ADD COLUMN "provider_refund_id" UUID,
  ADD CONSTRAINT "payment_refunds_source_check" CHECK (
    ("checkout_id" IS NOT NULL AND "provider_refund_id" IS NULL)
    OR ("checkout_id" IS NULL AND "provider_refund_id" IS NOT NULL)
  );

CREATE UNIQUE INDEX "online_payment_attempts_id_org_key"
  ON "online_payment_attempts"("id", "organization_id");
CREATE UNIQUE INDEX "online_payment_attempts_public_token_key"
  ON "online_payment_attempts"("public_token");
CREATE UNIQUE INDEX "online_payment_attempts_org_order_idem_key"
  ON "online_payment_attempts"("organization_id", "sales_order_id", "idempotency_key");
CREATE UNIQUE INDEX "online_payment_attempts_org_provider_transaction_key"
  ON "online_payment_attempts"("organization_id", "provider", "provider_transaction_id");
CREATE UNIQUE INDEX "online_payment_attempts_one_success_per_order"
  ON "online_payment_attempts"("organization_id", "sales_order_id")
  WHERE "status" = 'SUCCEEDED';
CREATE INDEX "online_payment_attempts_org_order_created_idx"
  ON "online_payment_attempts"("organization_id", "sales_order_id", "created_at", "id");
CREATE INDEX "online_payment_attempts_org_status_updated_idx"
  ON "online_payment_attempts"("organization_id", "status", "updated_at", "id");

CREATE UNIQUE INDEX "provider_notifications_id_org_key"
  ON "provider_notifications"("id", "organization_id");
CREATE UNIQUE INDEX "provider_notifications_org_provider_dedupe_key"
  ON "provider_notifications"("organization_id", "provider", "dedupe_key");
CREATE INDEX "provider_notifications_org_attempt_received_idx"
  ON "provider_notifications"("organization_id", "payment_attempt_id", "received_at", "id");

CREATE UNIQUE INDEX "payment_reconciliations_id_org_key"
  ON "payment_reconciliations"("id", "organization_id");
CREATE INDEX "payment_reconciliations_org_outcome_created_idx"
  ON "payment_reconciliations"("organization_id", "outcome", "created_at", "id");
CREATE INDEX "payment_reconciliations_org_attempt_created_idx"
  ON "payment_reconciliations"("organization_id", "payment_attempt_id", "created_at", "id");

CREATE UNIQUE INDEX "provider_refunds_id_org_key"
  ON "provider_refunds"("id", "organization_id");
CREATE UNIQUE INDEX "provider_refunds_org_attempt_idem_key"
  ON "provider_refunds"("organization_id", "payment_attempt_id", "idempotency_key");
CREATE UNIQUE INDEX "provider_refunds_org_transaction_key"
  ON "provider_refunds"("organization_id", "provider_refund_transaction_id");
CREATE INDEX "provider_refunds_org_attempt_created_idx"
  ON "provider_refunds"("organization_id", "payment_attempt_id", "created_at", "id");
CREATE INDEX "provider_refunds_org_status_updated_idx"
  ON "provider_refunds"("organization_id", "status", "updated_at", "id");

CREATE UNIQUE INDEX "payment_batches_attempt_org_key"
  ON "payment_batches"("payment_attempt_id", "organization_id");
CREATE UNIQUE INDEX "payment_refunds_provider_refund_org_key"
  ON "payment_refunds"("provider_refund_id", "organization_id");

ALTER TABLE "online_payment_attempts" ADD CONSTRAINT "online_payment_attempts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "online_payment_attempts" ADD CONSTRAINT "online_payment_attempts_order_org_fkey"
  FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_batches" ADD CONSTRAINT "payment_batches_attempt_org_fkey"
  FOREIGN KEY ("payment_attempt_id", "organization_id") REFERENCES "online_payment_attempts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "provider_notifications" ADD CONSTRAINT "provider_notifications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_notifications" ADD CONSTRAINT "provider_notifications_attempt_org_fkey"
  FOREIGN KEY ("payment_attempt_id", "organization_id") REFERENCES "online_payment_attempts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_attempt_org_fkey"
  FOREIGN KEY ("payment_attempt_id", "organization_id") REFERENCES "online_payment_attempts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_resolver_org_fkey"
  FOREIGN KEY ("resolved_by_user_id", "organization_id") REFERENCES "organization_memberships"("user_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "provider_refunds" ADD CONSTRAINT "provider_refunds_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_refunds" ADD CONSTRAINT "provider_refunds_attempt_org_fkey"
  FOREIGN KEY ("payment_attempt_id", "organization_id") REFERENCES "online_payment_attempts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_refunds" ADD CONSTRAINT "provider_refunds_order_org_fkey"
  FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_refunds" ADD CONSTRAINT "provider_refunds_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_refunds" ADD CONSTRAINT "provider_refunds_requester_org_fkey"
  FOREIGN KEY ("requested_by_user_id", "organization_id") REFERENCES "organization_memberships"("user_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_provider_refund_org_fkey"
  FOREIGN KEY ("provider_refund_id", "organization_id") REFERENCES "provider_refunds"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
