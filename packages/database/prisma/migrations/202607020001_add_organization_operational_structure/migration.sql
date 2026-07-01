-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BranchType" AS ENUM ('SHOWROOM', 'WAREHOUSE', 'OFFICE', 'FULFILMENT', 'HYBRID');

-- CreateEnum
CREATE TYPE "StockLocationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StockLocationType" AS ENUM ('WAREHOUSE', 'SHOWROOM', 'QC_HOLD', 'DAMAGE_HOLD', 'RETURN_HOLD', 'TRANSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "PosCounterStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "type" "BranchType" NOT NULL DEFAULT 'SHOWROOM',
    "phone" VARCHAR(40),
    "email" VARCHAR(254),
    "address_line_1" VARCHAR(240),
    "address_line_2" VARCHAR(240),
    "city" VARCHAR(120),
    "district" VARCHAR(120),
    "postal_code" VARCHAR(120),
    "country_code" VARCHAR(2) NOT NULL DEFAULT 'BD',
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'Asia/Dhaka',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "type" "StockLocationType" NOT NULL DEFAULT 'WAREHOUSE',
    "status" "StockLocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_sellable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_counters" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "status" "PosCounterStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branches_organization_id_status_idx" ON "branches"("organization_id", "status");

-- CreateIndex
CREATE INDEX "branches_organization_id_type_idx" ON "branches"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "branches_id_organization_id_key" ON "branches"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_code_key" ON "branches"("organization_id", "code");

-- CreateIndex
CREATE INDEX "stock_locations_organization_id_branch_id_idx" ON "stock_locations"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "stock_locations_organization_id_status_idx" ON "stock_locations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "stock_locations_organization_id_type_idx" ON "stock_locations"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_organization_id_code_key" ON "stock_locations"("organization_id", "code");

-- CreateIndex
CREATE INDEX "pos_counters_organization_id_branch_id_idx" ON "pos_counters"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "pos_counters_organization_id_status_idx" ON "pos_counters"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos_counters_organization_id_code_key" ON "pos_counters"("organization_id", "code");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_counters" ADD CONSTRAINT "pos_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_counters" ADD CONSTRAINT "pos_counters_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
