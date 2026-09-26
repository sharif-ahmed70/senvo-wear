import { ConflictError, ValidationApplicationError } from "../../errors.js";
import type { CatalogProductVariantManagementRepository } from "../repositories/catalog-repositories.js";

export function assertSellingPriceMinor(value: number): void {
  if (!Number.isInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new ValidationApplicationError(
      "Selling price must be a positive integer in BDT minor units, at most 2147483647.",
    );
  }
}

export async function updateVariantPrice(
  repository: Pick<CatalogProductVariantManagementRepository, "updatePrice">,
  input: {
    organizationId: string;
    variantId: string;
    sellingPriceMinor: number;
    expectedSellingPriceMinor: number;
  },
) {
  assertSellingPriceMinor(input.sellingPriceMinor);
  if (
    !Number.isInteger(input.expectedSellingPriceMinor) ||
    input.expectedSellingPriceMinor < 0 ||
    input.expectedSellingPriceMinor > 2_147_483_647
  ) {
    throw new ValidationApplicationError("Expected selling price is invalid.");
  }
  const updated = await repository.updatePrice(input);
  if (!updated) {
    throw new ConflictError(
      "The variant price changed or the variant is unavailable. Reload the product and review its current price.",
    );
  }
  return updated;
}
