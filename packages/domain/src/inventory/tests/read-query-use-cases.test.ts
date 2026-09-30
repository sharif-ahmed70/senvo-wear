import { describe, expect, it } from "vitest";
import {
  getVariantAvailability,
  listInventoryAvailability,
  listProductInventorySummaries,
  listInventoryMovementHistory,
  listInventoryStockLocations,
  type InventoryReadRepository,
} from "../../index.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const variantId = "22222222-2222-4222-8222-222222222222";

describe("inventory read query use cases", () => {
  it("normalizes product queries and validates optional thresholds", async () => {
    const repository = new FakeInventoryReadRepository();
    await listProductInventorySummaries(repository, {
      organizationId,
      search: "  Shirt  ",
      lowStockThreshold: 0,
    });
    expect(repository.productFilter).toMatchObject({
      organizationId,
      pageSize: 25,
      search: "Shirt",
      lowStockThreshold: 0,
    });
    for (const lowStockThreshold of [-1, 1.5, NaN, Infinity, 2_147_483_648]) {
      expect(() =>
        listProductInventorySummaries(repository, {
          organizationId,
          lowStockThreshold,
        }),
      ).toThrow("lowStockThreshold");
    }
  });
  it("normalizes pagination and keeps organization scope", async () => {
    const repository = new FakeInventoryReadRepository();

    const page = await listInventoryAvailability(repository, {
      organizationId,
      search: "  SKU  ",
    });

    expect(page.items).toEqual([]);
    expect(repository.availabilityFilter).toMatchObject({
      organizationId,
      pageSize: 25,
      search: "SKU",
    });
  });

  it("rejects invalid pagination and organization identifiers", () => {
    const repository = new FakeInventoryReadRepository();

    expect(() =>
      listInventoryMovementHistory(repository, {
        organizationId,
        pageSize: 101,
      }),
    ).toThrow("pageSize must be between");
    expect(() =>
      listInventoryStockLocations(repository, {
        organizationId: "not-an-id",
      }),
    ).toThrow("organizationId must be a valid UUID");
  });

  it("returns safe not-found behavior for cross-organization variants", async () => {
    const repository = new FakeInventoryReadRepository();

    await expect(
      getVariantAvailability(repository, { organizationId, variantId }),
    ).rejects.toThrow("Product variant was not found");
    expect(repository.variantInput).toEqual({ organizationId, variantId });
  });
});

class FakeInventoryReadRepository implements InventoryReadRepository {
  productFilter:
    Parameters<InventoryReadRepository["listProductSummaries"]>[0] | undefined;
  listProductSummaries(
    filter: Parameters<InventoryReadRepository["listProductSummaries"]>[0],
  ) {
    this.productFilter = filter;
    return Promise.resolve({ hasMore: false, items: [], nextCursor: null });
  }

  availabilityFilter:
    Parameters<InventoryReadRepository["listAvailability"]>[0] | undefined;
  variantInput:
    | Parameters<InventoryReadRepository["getVariantAvailability"]>[0]
    | undefined;

  getVariantAvailability(
    input: Parameters<InventoryReadRepository["getVariantAvailability"]>[0],
  ) {
    this.variantInput = input;
    return Promise.resolve(null);
  }

  listAvailability(
    filter: Parameters<InventoryReadRepository["listAvailability"]>[0],
  ) {
    this.availabilityFilter = filter;
    return Promise.resolve({ hasMore: false, items: [], nextCursor: null });
  }

  listLocations() {
    return Promise.resolve({ hasMore: false, items: [], nextCursor: null });
  }

  listMovements() {
    return Promise.resolve({ hasMore: false, items: [], nextCursor: null });
  }
}
