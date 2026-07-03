CREATE TYPE "InventoryAllocationPolicyStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED'
);

CREATE TYPE "InventoryAllocationStrategy" AS ENUM (
  'PRIORITY_ORDER'
);

CREATE TABLE "inventory_allocation_policies" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "status" "InventoryAllocationPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
  "strategy" "InventoryAllocationStrategy" NOT NULL DEFAULT 'PRIORITY_ORDER',
  "require_sellable_location" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "inventory_allocation_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_allocation_policies_version_positive_check" CHECK ("version" >= 1)
);

CREATE TABLE "inventory_allocation_policy_locations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "policy_id" UUID NOT NULL,
  "stock_location_id" UUID NOT NULL,
  "priority" INTEGER NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "inventory_allocation_policy_locations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_allocation_policy_locations_priority_positive_check" CHECK ("priority" > 0)
);

CREATE UNIQUE INDEX "inventory_allocation_policies_id_organization_id_key"
  ON "inventory_allocation_policies"("id", "organization_id");

CREATE UNIQUE INDEX "inventory_allocation_policies_organization_id_code_key"
  ON "inventory_allocation_policies"("organization_id", "code");

CREATE INDEX "inventory_allocation_policies_organization_id_status_create_idx"
  ON "inventory_allocation_policies"("organization_id", "status", "created_at", "id");

CREATE UNIQUE INDEX "inventory_allocation_policy_locations_policy_id_stock_locat_key"
  ON "inventory_allocation_policy_locations"("policy_id", "stock_location_id");

CREATE UNIQUE INDEX "inventory_allocation_policy_locations_policy_id_priority_key"
  ON "inventory_allocation_policy_locations"("policy_id", "priority");

CREATE INDEX "inventory_allocation_policy_locations_organization_id_polic_idx"
  ON "inventory_allocation_policy_locations"("organization_id", "policy_id", "priority");

CREATE INDEX "inventory_allocation_policy_locations_organization_id_stock_idx"
  ON "inventory_allocation_policy_locations"("organization_id", "stock_location_id");

ALTER TABLE "inventory_allocation_policies"
  ADD CONSTRAINT "inventory_allocation_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "inventory_allocation_policy_locations"
  ADD CONSTRAINT "inventory_allocation_policy_locations_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "inventory_allocation_policy_locations"
  ADD CONSTRAINT "inventory_allocation_policy_locations_policy_id_organizati_fkey"
  FOREIGN KEY ("policy_id", "organization_id")
  REFERENCES "inventory_allocation_policies"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "inventory_allocation_policy_locations"
  ADD CONSTRAINT "inventory_allocation_policy_locations_stock_location_id_or_fkey"
  FOREIGN KEY ("stock_location_id", "organization_id")
  REFERENCES "stock_locations"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
