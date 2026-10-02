import type { ProductContract } from "@senvo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  fetchProductDetails,
  ProductCard,
  productsToFetch,
} from "./_components/catalog-overview";

vi.mock("next/navigation", () => ({
  usePathname: () => "/catalog",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const product = (id: string, name: string): ProductContract => ({
  categoryId: "10000000-0000-4000-8000-000000000009",
  createdAt: "2026-10-01T00:00:00.000Z",
  description: null,
  id,
  name,
  organizationId: "10000000-0000-4000-8000-000000000008",
  productCode: `CODE-${name}`,
  slug: name.toLowerCase(),
  status: "ACTIVE",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

const good = product("10000000-0000-4000-8000-000000000001", "Polo");
const broken = product("10000000-0000-4000-8000-000000000002", "Saree");
const other = product("10000000-0000-4000-8000-000000000003", "Panjabi");

describe("catalog product details batching", () => {
  it("does not refetch after one getProduct rejects, even across many renders", async () => {
    const getProduct = vi.fn((id: string) =>
      id === broken.id
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ id }),
    );
    const requested = new Set<string>();
    const visible = [good, broken, other];

    // Simulate the effect running on many re-renders (spinner on/off, state
    // updates): only the first run may fetch.
    const results = [];
    for (let render = 0; render < 5; render += 1) {
      const missing = productsToFetch(visible, requested);
      missing.forEach((item) => requested.add(item.id));
      if (missing.length) {
        results.push(await fetchProductDetails(missing, getProduct));
      }
    }

    expect(getProduct).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(1);
    expect(results[0]?.failed).toEqual([broken.id]);
    expect(Object.keys(results[0]?.details ?? {}).sort()).toEqual(
      [good.id, other.id].sort(),
    );
  });

  it("only fetches products that newly appear after a page or filter change", () => {
    const requested = new Set([good.id, broken.id]);
    expect(productsToFetch([good, broken, other], requested)).toEqual([other]);
  });

  it("renders the failed row as unavailable and the other rows normally", () => {
    const shared = {
      category: "Men",
      colorMap: new Map(),
      sizeMap: new Map(),
    };
    const failedHtml = renderToStaticMarkup(
      <ProductCard {...shared} detailsUnavailable product={broken} />,
    );
    expect(failedHtml).toContain("Details unavailable");
    expect(failedHtml).toContain("cardPlaceholder");
    expect(failedHtml).toContain("Saree");

    const okHtml = renderToStaticMarkup(
      <ProductCard {...shared} product={good} />,
    );
    expect(okHtml).toContain("Polo");
    expect(okHtml).not.toContain("Details unavailable");
  });
});
