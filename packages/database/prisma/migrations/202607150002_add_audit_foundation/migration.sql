CREATE TABLE "public"."audit_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "resource" VARCHAR(120) NOT NULL,
    "resource_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_entries_organization_id_created_at_id_idx"
  ON "public"."audit_entries"("organization_id", "created_at", "id");
CREATE INDEX "audit_entries_organization_id_resource_resource_id_idx"
  ON "public"."audit_entries"("organization_id", "resource", "resource_id");
CREATE INDEX "audit_entries_user_id_created_at_idx"
  ON "public"."audit_entries"("user_id", "created_at");

ALTER TABLE "public"."audit_entries"
  ADD CONSTRAINT "audit_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."audit_entries"
  ADD CONSTRAINT "audit_entries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
