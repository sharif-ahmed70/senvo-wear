import { describe, expect, it, vi } from "vitest";
import { updateVariantPrice } from "../application/variant-pricing-use-cases.js";
import { createProductVariant } from "../application/create-use-cases.js";
import type { ProductVariant } from "../domain/models.js";

const input = {
  organizationId: "org",
  variantId: "variant",
  expectedSellingPriceMinor: 0,
  sellingPriceMinor: 12550,
};
describe("variant price updates", () => {
  it("passes the tenant and expected price unchanged", async () => {
    const record = {
      id: "variant",
      sellingPriceMinor: 12550,
    } as ProductVariant;
    const updatePrice = vi.fn().mockResolvedValue(record);
    expect(await updateVariantPrice({ updatePrice }, input)).toBe(record);
    expect(updatePrice).toHaveBeenCalledWith(input);
  });
  it("conflicts on a stale or unavailable variant without retrying", async () => {
    const updatePrice = vi.fn().mockResolvedValue(null);
    await expect(updateVariantPrice({ updatePrice }, input)).rejects.toThrow(
      "Reload the product",
    );
    expect(updatePrice).toHaveBeenCalledTimes(1);
  });
  it.each([0, -1, 1.1, 2_147_483_648, NaN, Infinity])(
    "rejects invalid price %s before persistence",
    async (sellingPriceMinor) => {
      const updatePrice = vi.fn();
      await expect(
        updateVariantPrice({ updatePrice }, { ...input, sellingPriceMinor }),
      ).rejects.toThrow("positive integer");
      expect(updatePrice).not.toHaveBeenCalled();
      await expect(
        createProductVariant({} as Parameters<typeof createProductVariant>[0], {
          ...input,
          sellingPriceMinor,
          productId: "p",
          colorId: "c",
          sizeId: "s",
          sku: "SKU",
        }),
      ).rejects.toThrow("positive integer");
    },
  );
  it.each([-1, 1.1, 2_147_483_648])(
    "rejects invalid expected price %s",
    async (expectedSellingPriceMinor) => {
      const updatePrice = vi.fn();
      await expect(
        updateVariantPrice(
          { updatePrice },
          { ...input, expectedSellingPriceMinor },
        ),
      ).rejects.toThrow("Expected selling price");
      expect(updatePrice).not.toHaveBeenCalled();
    },
  );
});
