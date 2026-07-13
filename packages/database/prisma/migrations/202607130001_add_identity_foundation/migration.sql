CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

CREATE TYPE "public"."OrganizationMembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TYPE "public"."Role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'STAFF');

CREATE TABLE "public"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(160),
    "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."organization_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" "public"."Role" NOT NULL,
    "status" "public"."OrganizationMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");
CREATE INDEX "users_status_idx" ON "public"."users"("status");
CREATE UNIQUE INDEX "organization_memberships_user_id_organization_id_key" ON "public"."organization_memberships"("user_id", "organization_id");
CREATE UNIQUE INDEX "organization_memberships_id_organization_id_key" ON "public"."organization_memberships"("id", "organization_id");
CREATE INDEX "organization_memberships_organization_id_role_idx" ON "public"."organization_memberships"("organization_id", "role");
CREATE INDEX "organization_memberships_organization_id_status_idx" ON "public"."organization_memberships"("organization_id", "status");
CREATE INDEX "organization_memberships_user_id_status_idx" ON "public"."organization_memberships"("user_id", "status");

ALTER TABLE "public"."organization_memberships"
  ADD CONSTRAINT "organization_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."organization_memberships"
  ADD CONSTRAINT "organization_memberships_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
