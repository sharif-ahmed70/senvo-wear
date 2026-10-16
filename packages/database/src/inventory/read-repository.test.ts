import { describe, expect, it, vi } from "vitest";
import { PrismaInventoryReadRepository } from "./read-repository.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const secondProductId = "33333333-3333-4333-8333-333333333333";

function row(overrides: Record<string, unknown> = {}) {
  return {
    product_id: productId,
    product_name: "Shirt",
    product_code: "SHIRT",
    variant_id: "variant-1",
    sku: "SHIRT-S",
    color_name: "Red",
    size_name: "S",
    location_id: "location-1",
    location_name: "Showroom",
    location_code: "SHOWROOM",
    on_hand: 10n,
    reserved: 3n,
    available_to_sell: 7n,
    ...overrides,
  };
}

function repository(rows: ReturnType<typeof row>[]) {
  const query = vi.fn().mockResolvedValue(rows);
  const client = { $queryRaw: query } as unknown as ConstructorParameters<
    typeof PrismaInventoryReadRepository
  >[0];
  return { query, read: new PrismaInventoryReadRepository(client) };
}

describe("product inventory read projection", () => {
  it("sums each variant/location once and never truncates a product's breakdown", async () => {
    const { read } = repository([
      row(),
      row({
        location_id: "location-2",
        on_hand: 2n,
        reserved: 0n,
        available_to_sell: 2n,
      }),
      row({
        variant_id: "variant-2",
        sku: "SHIRT-M",
        on_hand: 4n,
        reserved: 1n,
        available_to_sell: 3n,
      }),
      row({
        product_id: secondProductId,
        product_code: "ZERO",
        variant_id: "",
        location_id: "",
      }),
    ]);
    const page = await read.listProductSummaries({
      organizationId,
      pageSize: 1,
      lowStockThreshold: 12,
    });
    expect(page.items).toHaveLength(1);
    expect(page).toMatchObject({
      hasMore: true,
      nextCursor: `inventory-products-v1|SHIRT|${productId}`,
    });
    expect(page.items[0]).toMatchObject({
      onHand: 16,
      reserved: 4,
      availableToSell: 12,
      isLowStock: true,
    });
    expect(page.items[0]!.variants).toMatchObject([
      {
        onHand: 12,
        reserved: 3,
        availableToSell: 9,
        locations: [{ onHand: 10 }, { onHand: 2 }],
      },
      { onHand: 4, reserved: 1, availableToSell: 3 },
    ]);
    expect(page.items[0]!.locations).toMatchObject([
      { onHand: 14, reserved: 4, availableToSell: 10 },
      { onHand: 2, reserved: 0, availableToSell: 2 },
    ]);
  });

  it("keeps never-stocked variants and products without variants with zero totals", async () => {
    const { read } = repository([
      row({
        location_id: "",
        on_hand: 0n,
        reserved: 0n,
        available_to_sell: 0n,
      }),
      row({ product_id: secondProductId, variant_id: "", location_id: "" }),
    ]);
    const page = await read.listProductSummaries({
      organizationId,
      pageSize: 25,
    });
    expect(page).toMatchObject({ hasMore: false, nextCursor: null });
    expect(page.items).toMatchObject([
      {
        onHand: 0,
        reserved: 0,
        availableToSell: 0,
        lowStockThreshold: null,
        isLowStock: null,
        locations: [],
        variants: [{ onHand: 0, locations: [] }],
      },
      { onHand: 0, variants: [], locations: [], isLowStock: null },
    ]);
    const flagged = await read.listProductSummaries({
      organizationId,
      pageSize: 25,
      lowStockThreshold: 0,
    });
    expect(flagged.items.every((item) => item.isLowStock)).toBe(true);
  });

  it("preserves negative availability and the strict threshold boundary", async () => {
    const { read } = repository([
      row({ on_hand: 1n, reserved: 3n, available_to_sell: -2n }),
    ]);
    expect(
      (
        await read.listProductSummaries({
          organizationId,
          pageSize: 25,
          lowStockThreshold: 0,
        })
      ).items[0],
    ).toMatchObject({ availableToSell: -2, isLowStock: true });
    const above = repository([row()]);
    expect(
      (
        await above.read.listProductSummaries({
          organizationId,
          pageSize: 25,
          lowStockThreshold: 6,
        })
      ).items[0]!.isLowStock,
    ).toBe(false);
  });

  it("rejects malformed cursors before querying and handles empty results", async () => {
    const { read, query } = repository([]);
    for (const cursor of [
      "bad",
      `inventory-products-v1|%ZZ|${productId}`,
      `inventory-products-v1|SHIRT|${productId}|extra`,
    ]) {
      await expect(
        read.listProductSummaries({ organizationId, pageSize: 25, cursor }),
      ).rejects.toThrow("cursor is invalid");
    }
    expect(query).not.toHaveBeenCalled();
    expect(
      await read.listProductSummaries({ organizationId, pageSize: 25 }),
    ).toEqual({ hasMore: false, items: [], nextCursor: null });
  });
});
