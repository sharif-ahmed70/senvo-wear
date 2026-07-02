-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "stock_locations" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "pos_counters" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AddCheckConstraint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_sellability_status_type_check" CHECK (
    "is_sellable" = false
    OR (
        "status" = 'ACTIVE'
        AND "type" NOT IN ('QC_HOLD', 'DAMAGE_HOLD', 'RETURN_HOLD', 'TRANSIT')
    )
);
