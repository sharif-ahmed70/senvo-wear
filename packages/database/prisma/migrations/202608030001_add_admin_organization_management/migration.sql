ALTER TYPE "public"."PermissionResource" ADD VALUE 'TEAM';

ALTER TABLE "public"."organizations"
  ADD COLUMN "country_code" VARCHAR(2) NOT NULL DEFAULT 'BD',
  ADD COLUMN "timezone" VARCHAR(80) NOT NULL DEFAULT 'Asia/Dhaka',
  ADD COLUMN "phone" VARCHAR(40),
  ADD COLUMN "email" VARCHAR(254),
  ADD COLUMN "address_line_1" VARCHAR(240),
  ADD COLUMN "address_line_2" VARCHAR(240),
  ADD COLUMN "city" VARCHAR(120),
  ADD COLUMN "district" VARCHAR(120),
  ADD COLUMN "postal_code" VARCHAR(120),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
