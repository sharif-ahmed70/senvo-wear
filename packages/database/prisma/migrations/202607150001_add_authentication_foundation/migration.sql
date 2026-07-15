CREATE TYPE "public"."IdentityProvider" AS ENUM ('PASSWORD', 'GOOGLE', 'MICROSOFT');

CREATE TYPE "public"."CredentialStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "public"."user_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "public"."IdentityProvider" NOT NULL,
    "identifier" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(1000),
    "status" "public"."CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_credentials_provider_identifier_key" ON "public"."user_credentials"("provider", "identifier");
CREATE INDEX "user_credentials_user_id_status_idx" ON "public"."user_credentials"("user_id", "status");
CREATE INDEX "user_credentials_status_idx" ON "public"."user_credentials"("status");

ALTER TABLE "public"."user_credentials"
  ADD CONSTRAINT "user_credentials_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
