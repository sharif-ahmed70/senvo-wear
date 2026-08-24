CREATE TABLE "public"."authentication_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" "public"."IdentityProvider" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "authentication_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "authentication_sessions_token_hash_key"
ON "public"."authentication_sessions"("token_hash");

CREATE INDEX "authentication_sessions_user_id_organization_id_expires_at_idx"
ON "public"."authentication_sessions"("user_id", "organization_id", "expires_at");

CREATE INDEX "authentication_sessions_organization_id_expires_at_idx"
ON "public"."authentication_sessions"("organization_id", "expires_at");

ALTER TABLE "public"."authentication_sessions"
ADD CONSTRAINT "authentication_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."authentication_sessions"
ADD CONSTRAINT "authentication_sessions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
