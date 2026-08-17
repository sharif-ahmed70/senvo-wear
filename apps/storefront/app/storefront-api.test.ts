import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  storefrontApi,
  storefrontApiBaseUrl,
  type StorefrontCatalog,
} from "./_lib/storefront-api";

const page = (current: number, hasMore: boolean): StorefrontCatalog => ({
  categories: [],
  collections: [],
  hasMore,
  page: current,
  pageSize: 48,
  products: [
    {
      category: { code: "tops", id: "category-1", name: "Tops" },
      collection: null,
      description: null,
      id: `product-${current}`,
      name: `Product ${current}`,
      productCode: `PRODUCT-${current}`,
      slug: `product-${current}`,
      variants: [],
    },
  ],
});

describe("storefront API catalog hydration", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_SENVO_API_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SENVO_API_URL = "https://api.senvo.test/";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SENVO_API_URL = originalApiUrl;
    vi.unstubAllGlobals();
  });

  it("requires canonical API configuration without a localhost fallback", () => {
    delete process.env.NEXT_PUBLIC_SENVO_API_URL;
    expect(() => storefrontApiBaseUrl()).toThrow(
      "NEXT_PUBLIC_SENVO_API_URL is required",
    );
    expect(storefrontApiBaseUrl("https://api.senvo.test/")).toBe(
      "https://api.senvo.test",
    );
  });

  it("loads every catalog page before hydrating a guest cart", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: page(1, true),
            requestId: "request-1",
            success: true,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: page(2, false),
            requestId: "request-2",
            success: true,
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await storefrontApi.fullCatalog();

    expect(catalog.products.map(({ id }) => id)).toEqual([
      "product-1",
      "product-2",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://api.senvo.test/storefront/catalog",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "page=2&pageSize=48",
    );
  });
});
