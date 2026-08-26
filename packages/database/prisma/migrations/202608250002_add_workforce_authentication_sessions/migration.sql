CREATE TABLE "public"."workforce_authentication_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "csrf_token_hash" VARCHAR(64) NOT NULL,
  "status" "public"."AuthenticationSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "remember_me" BOOLEAN NOT NULL DEFAULT FALSE,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "last_used_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "workforce_authentication_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workforce_authentication_sessions_token_hash_key"
  ON "public"."workforce_authentication_sessions"("token_hash");
CREATE INDEX "workforce_sessions_user_org_status_idx"
  ON "public"."workforce_authentication_sessions"("user_id", "organization_id", "status");
CREATE INDEX "workforce_sessions_org_expires_idx"
  ON "public"."workforce_authentication_sessions"("organization_id", "expires_at");

ALTER TABLE "public"."workforce_authentication_sessions"
  ADD CONSTRAINT "workforce_authentication_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."workforce_authentication_sessions"
  ADD CONSTRAINT "workforce_authentication_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."workforce_authentication_sessions"
  ADD CONSTRAINT "workforce_sessions_membership_fkey"
  FOREIGN KEY ("user_id", "organization_id")
  REFERENCES "public"."organization_memberships"("user_id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
