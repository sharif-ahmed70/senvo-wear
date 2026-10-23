-- Keep the supplier's original price per piece next to the landed cost.
-- unit_cost_minor stays the landed cost (supplier price + extra charges per
-- piece) used for stock value and profit. Older rows keep NULL.
ALTER TABLE "purchase_lines"
  ADD COLUMN "supplier_unit_cost_minor" INTEGER,
  ADD COLUMN "extra_cost_per_unit_minor" INTEGER;

ALTER TABLE "purchase_lines"
  ADD CONSTRAINT "purchase_lines_cost_breakdown_check" CHECK (
    ("supplier_unit_cost_minor" IS NULL AND "extra_cost_per_unit_minor" IS NULL)
    OR (
      "supplier_unit_cost_minor" >= 0
      AND "extra_cost_per_unit_minor" >= 0
      AND "supplier_unit_cost_minor" + "extra_cost_per_unit_minor" = "unit_cost_minor"
    )
  );
