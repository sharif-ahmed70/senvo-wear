ALTER TABLE "inventory_reservations"
  ADD COLUMN "consumed_by_movement_id" UUID;

ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "inventory_reservations_consumption_status_check"
  CHECK ("consumed_by_movement_id" IS NULL OR "status" = 'CONFIRMED');

CREATE UNIQUE INDEX "inventory_reservations_consumed_by_movement_id_organization_key"
  ON "inventory_reservations"("consumed_by_movement_id", "organization_id");

ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "inventory_reservations_consumed_by_movement_org_fkey"
  FOREIGN KEY ("consumed_by_movement_id", "organization_id")
  REFERENCES "inventory_movements"("id", "organization_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
