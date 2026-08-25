ALTER TYPE "public"."IdentityProvider" ADD VALUE 'EMAIL_OTP';
ALTER TYPE "public"."IdentityProvider" ADD VALUE 'PHONE_OTP';

CREATE TYPE "public"."CustomerAccountStatus" AS ENUM (
  'ACTIVE',
  'PENDING_VERIFICATION',
  'SUSPENDED',
  'DISABLED'
);

CREATE TYPE "public"."AuthenticationChallengeType" AS ENUM (
  'EMAIL_OTP',
  'PHONE_OTP',
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'GOOGLE_OAUTH_STATE'
);

CREATE TYPE "public"."AuthenticationChallengeStatus" AS ENUM (
  'ACTIVE',
  'CONSUMED',
  'INVALIDATED'
);

CREATE TYPE "public"."AuthenticationSessionStatus" AS ENUM (
  'ACTIVE',
  'REVOKED'
);

CREATE TABLE "public"."customer_accounts" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "first_name" VARCHAR(80) NOT NULL,
  "last_name" VARCHAR(80) NOT NULL,
  "phone" VARCHAR(32),
  "email_verified_at" TIMESTAMPTZ(6),
  "phone_verified_at" TIMESTAMPTZ(6),
  "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
  "terms_accepted_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "public"."CustomerAccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."authentication_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "csrf_token_hash" VARCHAR(64) NOT NULL,
  "status" "public"."AuthenticationSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "remember_me" BOOLEAN NOT NULL DEFAULT false,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "last_used_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "authentication_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."authentication_challenges" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "organization_id" UUID NOT NULL,
  "type" "public"."AuthenticationChallengeType" NOT NULL,
  "destination" VARCHAR(320) NOT NULL,
  "secret_hash" VARCHAR(64) NOT NULL,
  "status" "public"."AuthenticationChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "resend_count" INTEGER NOT NULL DEFAULT 0,
  "next_resend_at" TIMESTAMPTZ(6) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "authentication_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."authentication_rate_limits" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "key_hash" VARCHAR(64) NOT NULL,
  "window_started_at" TIMESTAMPTZ(6) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "blocked_until" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "authentication_rate_limits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_accounts_user_id_organization_id_key"
  ON "public"."customer_accounts"("user_id", "organization_id");
CREATE UNIQUE INDEX "customer_accounts_organization_id_phone_key"
  ON "public"."customer_accounts"("organization_id", "phone");
CREATE INDEX "customer_accounts_organization_id_status_idx"
  ON "public"."customer_accounts"("organization_id", "status");
CREATE INDEX "customer_accounts_user_id_status_idx"
  ON "public"."customer_accounts"("user_id", "status");

CREATE UNIQUE INDEX "authentication_sessions_token_hash_key"
  ON "public"."authentication_sessions"("token_hash");
CREATE INDEX "authentication_sessions_user_id_organization_id_status_idx"
  ON "public"."authentication_sessions"("user_id", "organization_id", "status");
CREATE INDEX "authentication_sessions_organization_id_expires_at_idx"
  ON "public"."authentication_sessions"("organization_id", "expires_at");

CREATE UNIQUE INDEX "authentication_challenges_secret_hash_key"
  ON "public"."authentication_challenges"("secret_hash");
CREATE INDEX "auth_challenges_org_type_dest_status_created_idx"
  ON "public"."authentication_challenges"(
    "organization_id",
    "type",
    "destination",
    "status",
    "created_at"
  );
CREATE INDEX "authentication_challenges_user_id_status_idx"
  ON "public"."authentication_challenges"("user_id", "status");
CREATE INDEX "authentication_challenges_expires_at_status_idx"
  ON "public"."authentication_challenges"("expires_at", "status");

CREATE UNIQUE INDEX "authentication_rate_limits_organization_id_action_key_hash_key"
  ON "public"."authentication_rate_limits"("organization_id", "action", "key_hash");
CREATE INDEX "authentication_rate_limits_organization_id_blocked_until_idx"
  ON "public"."authentication_rate_limits"("organization_id", "blocked_until");

ALTER TABLE "public"."customer_accounts"
  ADD CONSTRAINT "customer_accounts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."customer_accounts"
  ADD CONSTRAINT "customer_accounts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."authentication_sessions"
  ADD CONSTRAINT "authentication_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."authentication_sessions"
  ADD CONSTRAINT "authentication_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."authentication_challenges"
  ADD CONSTRAINT "authentication_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."authentication_challenges"
  ADD CONSTRAINT "authentication_challenges_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."authentication_rate_limits"
  ADD CONSTRAINT "authentication_rate_limits_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
