import type {
  ProductInventorySummaryContract,
  ProductVariantContract,
  SizeContract,
} from "@senvo/contracts";
import {
  normalizeName,
  variantKey,
  type ExistingVariant,
  type QuantityGrid,
} from "./intake-draft";

export type RestockSetup = {
  existing: Map<string, ExistingVariant>;
  grid: QuantityGrid;
  lockedColorIds: Set<string>;
  lockedSizes: Set<string>;
};

/**
 * Builds the restock grid from the inventory summary (names and current
 * stock) and the catalog variants (status and selling price). Only active
 * variants can be restocked.
 */
export function restockSetupFrom(
  summary: ProductInventorySummaryContract,
  variants: readonly ProductVariantContract[],
  sizes: readonly SizeContract[],
): RestockSetup {
  const catalog = new Map(variants.map((variant) => [variant.id, variant]));
  const sizeOrder = new Map(
    sizes.map((size) => [normalizeName(size.name), size.sortOrder]),
  );
  const existing = new Map<string, ExistingVariant>();
  const colorNames: string[] = [];
  const sizeNames: string[] = [];

  for (const row of summary.variants) {
    const variant = catalog.get(row.variant.id);
    if (!variant || variant.status !== "ACTIVE") continue;
    const colorName = row.variant.color;
    const sizeName = row.variant.size;
    existing.set(variantKey(colorName, sizeName), {
      colorName,
      onHand: row.onHand,
      sellingPriceMinor: variant.sellingPriceMinor,
      sizeName,
      variantId: variant.id,
    });
    if (
      !colorNames.some(
        (name) => normalizeName(name) === normalizeName(colorName),
      )
    ) {
      colorNames.push(colorName);
    }
    if (
      !sizeNames.some((name) => normalizeName(name) === normalizeName(sizeName))
    ) {
      sizeNames.push(sizeName);
    }
  }

  sizeNames.sort(
    (a, b) =>
      (sizeOrder.get(normalizeName(a)) ?? Number.MAX_SAFE_INTEGER) -
      (sizeOrder.get(normalizeName(b)) ?? Number.MAX_SAFE_INTEGER),
  );

  const colors = colorNames.map((name) => ({
    id: `existing:${normalizeName(name)}`,
    name,
    quantities: {},
  }));
  return {
    existing,
    grid: { colors, sizes: sizeNames, sizesCustomized: true },
    lockedColorIds: new Set(colors.map((color) => color.id)),
    lockedSizes: new Set(sizeNames.map(normalizeName)),
  };
}
