"use client";

import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  storefrontApi,
  type StorefrontCatalog,
  type StorefrontProduct,
} from "../_lib/storefront-api";
import { HeroCarousel } from "./hero-carousel";
import { Reveal } from "./motion-primitives";
import { ProductCard as PremiumProductCard } from "./product-card";
import { ProductQuickView } from "./product-quick-view";

const campaignImages = [
  "/senvo-hero.png",
  "/senvo-hero-urban.png",
  "/senvo-hero-summer.png",
] as const;

export function CatalogWorkspace() {
  const [catalog, setCatalog] = useState<StorefrontCatalog | null>(null);
  const [facets, setFacets] = useState<
    Pick<StorefrontCatalog, "categories" | "collections">
  >({ categories: [], collections: [] });
  const [category, setCategory] = useState("");
  const [collection, setCollection] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [quickView, setQuickView] = useState<StorefrontProduct | null>(null);
  const [toast, setToast] = useState("");
  const categoryRail = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (page = 1, append = false) => {
      const requestId = ++requestSequence.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const next = await storefrontApi.catalog({
          category: category || undefined,
          collection: collection || undefined,
          page: String(page),
          pageSize: "12",
          search: appliedSearch || undefined,
        });
        if (requestId !== requestSequence.current) return;
        setFacets((current) => ({
          categories:
            next.categories.length > 0 ? next.categories : current.categories,
          collections:
            next.collections.length > 0
              ? next.collections
              : current.collections,
        }));
        setCatalog((current) =>
          append && current
            ? { ...next, products: [...current.products, ...next.products] }
            : next,
        );
      } catch {
        if (requestId !== requestSequence.current) return;
        setError("We could not load the collection. Please try again.");
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [appliedSearch, category, collection],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectCategory = (code: string) => {
    setCategory(code);
    document
      .getElementById("collection")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="storefront-home">
      <HeroCarousel />

      <section
        aria-labelledby="categories-heading"
        className="editorial-section category-section"
        id="categories"
      >
        <Reveal className="section-heading">
          <div>
            <p className="eyebrow">Find your form</p>
            <h2 id="categories-heading">Shop by category</h2>
          </div>
          <div className="rail-buttons">
            <button
              aria-label="Previous categories"
              onClick={() =>
                categoryRail.current?.scrollBy({
                  behavior: "smooth",
                  left: -360,
                })
              }
            >
              <ArrowLeft size={17} />
            </button>
            <button
              aria-label="Next categories"
              onClick={() =>
                categoryRail.current?.scrollBy({
                  behavior: "smooth",
                  left: 360,
                })
              }
            >
              <ArrowRight size={17} />
            </button>
          </div>
        </Reveal>
        <div className="category-rail" ref={categoryRail}>
          {facets.categories.length > 0
            ? facets.categories.map((item, index) => (
                <button
                  aria-pressed={category === item.code}
                  className={`category-tile${
                    category === item.code ? " selected" : ""
                  }`}
                  key={item.id}
                  onClick={() => selectCategory(item.code)}
                  type="button"
                >
                  <span
                    className="category-campaign"
                    style={{
                      backgroundImage: `url(${campaignImages[index % campaignImages.length]})`,
                    }}
                  />
                  <span className="category-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong>{item.name}</strong>
                  <small>Explore the edit</small>
                </button>
              ))
            : [1, 2, 3, 4].map((item) => (
                <div className="category-tile skeleton-tile" key={item} />
              ))}
        </div>
      </section>

      <section
        aria-labelledby="collection-heading"
        className="editorial-section collection-section"
        id="collection"
      >
        <Reveal className="section-heading collection-heading">
          <div>
            <p className="eyebrow">Curated for now</p>
            <h2 id="collection-heading">The SENVO edit</h2>
          </div>
          <div className="collection-pills" aria-label="Filter by collection">
            <button
              aria-pressed={!collection}
              className={!collection ? "active" : ""}
              onClick={() => setCollection("")}
            >
              All pieces
            </button>
            {facets.collections.map((item) => (
              <button
                aria-pressed={collection === item.code}
                className={collection === item.code ? "active" : ""}
                key={item.id}
                onClick={() => setCollection(item.code)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="catalog-filter-bar" aria-label="Catalog filters">
          <label>
            <Search size={18} />
            <input
              aria-label="Search products"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search the collection"
              value={search}
            />
          </label>
          <label>
            <SlidersHorizontal size={17} />
            <span className="sr-only">Filter by category</span>
            <select
              aria-label="Filter by category"
              onChange={(event) => setCategory(event.target.value)}
              value={category}
            >
              <option value="">All categories</option>
              {facets.categories.map((item) => (
                <option key={item.id} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {(category || collection || search) && (
            <button
              className="clear-filters"
              onClick={() => {
                setCategory("");
                setCollection("");
                setSearch("");
              }}
              type="button"
            >
              Clear filters
            </button>
          )}
        </div>

        {error ? (
          <div className="catalog-state error" role="alert">
            <h3>The collection paused for a moment.</h3>
            <p>{error}</p>
            <button onClick={() => void load()} type="button">
              <RefreshCw size={17} /> Try again
            </button>
          </div>
        ) : null}
        {loading ? (
          <div className="premium-product-grid" aria-label="Loading products">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div className="product-card-skeleton" key={item}>
                <i />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : null}
        {!loading && !error && catalog?.products.length === 0 ? (
          <div className="catalog-state">
            <h3>No pieces found.</h3>
            <p>Try a different search, category or collection.</p>
            <button
              onClick={() => {
                setCategory("");
                setCollection("");
                setSearch("");
              }}
              type="button"
            >
              View all pieces
            </button>
          </div>
        ) : null}
        {!loading && catalog?.products.length ? (
          <div className="premium-product-grid">
            {catalog.products.map((product) => (
              <PremiumProductCard
                key={product.id}
                onAdded={(item) => setToast(`${item.name} added to your bag.`)}
                onQuickView={setQuickView}
                product={product}
              />
            ))}
          </div>
        ) : null}
        {catalog?.hasMore ? (
          <button
            className="load-more"
            disabled={loadingMore}
            onClick={() => void load(catalog.page + 1, true)}
            type="button"
          >
            {loadingMore ? "Loading more..." : "Load more pieces"}
          </button>
        ) : null}
      </section>

      <section className="campaign-editorial" id="journal">
        <div className="campaign-editorial-image" />
        <Reveal className="campaign-editorial-copy">
          <p className="eyebrow light">SENVO journal / Vol. 01</p>
          <h2>Style that speaks softly.</h2>
          <p>
            Designed in Dhaka, inspired by the pace, warmth and effortless
            confidence of the city.
          </p>
          <a href="#collection">
            Discover the edit <ArrowRight size={17} />
          </a>
        </Reveal>
      </section>

      <ProductQuickView
        onAdded={(item) => setToast(`${item.name} added to your bag.`)}
        onClose={() => setQuickView(null)}
        product={quickView}
      />
      <div
        aria-live="polite"
        className={`storefront-toast${toast ? " show" : ""}`}
      >
        {toast}
      </div>
    </main>
  );
}

export const ProductCard = PremiumProductCard;
