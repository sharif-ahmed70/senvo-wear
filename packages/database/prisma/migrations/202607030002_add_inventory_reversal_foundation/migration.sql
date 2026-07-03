ALTER TABLE "inventory_movements"
  ADD COLUMN "reverses_movement_id" UUID,
  ADD COLUMN "reversal_reason" VARCHAR(1000);

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_reversal_reason_check" CHECK (
    ("reverses_movement_id" IS NULL AND "reversal_reason" IS NULL)
    OR ("reverses_movement_id" IS NOT NULL AND "reversal_reason" IS NOT NULL)
  );

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_reversal_not_self_check" CHECK (
    "reverses_movement_id" IS NULL OR "reverses_movement_id" <> "id"
  );

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_reverses_movement_id_organizat_fkey"
  FOREIGN KEY ("reverses_movement_id", "organization_id")
  REFERENCES "inventory_movements"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "inventory_movements_organization_id_reverses_movement_id_key"
  ON "inventory_movements"("organization_id", "reverses_movement_id");

CREATE INDEX "inventory_movements_organization_id_reverses_movement_id_idx"
  ON "inventory_movements"("organization_id", "reverses_movement_id");
