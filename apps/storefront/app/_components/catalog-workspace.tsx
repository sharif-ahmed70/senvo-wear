"use client";

import {
  ArrowRight,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
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

export interface CatalogWorkspaceProps {
  initialCatalog?: StorefrontCatalog | null;
  initialCategory?: string;
  initialCollection?: string;
}

export function CatalogWorkspace({
  initialCatalog = null,
  initialCategory = "",
  initialCollection = "",
}: CatalogWorkspaceProps = {}) {
  const [catalog, setCatalog] = useState<StorefrontCatalog | null>(
    initialCatalog,
  );
  const [facets, setFacets] = useState<
    Pick<StorefrontCatalog, "categories" | "collections">
  >({
    categories: initialCatalog?.categories ?? [],
    collections: initialCatalog?.collections ?? [],
  });
  const [category, setCategory] = useState(initialCategory);
  const [collection, setCollection] = useState(initialCollection);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initialCatalog);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [quickView, setQuickView] = useState<StorefrontProduct | null>(null);
  const [toast, setToast] = useState("");
  const requestSequence = useRef(0);
  const isFirstMount = useRef(true);

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
    if (isFirstMount.current) {
      isFirstMount.current = false;
      if (initialCatalog) {
        return;
      }
    }
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, initialCatalog]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <main className="storefront-home">
      <HeroCarousel />

      <ul aria-label="Shopping with SENVO" className="home-assurances">
        <li>
          <Truck aria-hidden="true" size={18} />
          Cash on delivery across Bangladesh
        </li>
        <li>
          <ShieldCheck aria-hidden="true" size={18} />
          Stock and price confirmed before you order
        </li>
        <li>
          <MapPin aria-hidden="true" size={18} />
          Designed in Dhaka
        </li>
      </ul>

      <section
        aria-labelledby="collection-heading"
        className="editorial-section collection-section"
        id="collection"
      >
        <div className="section-heading collection-heading">
          <div className="home-heading">
            <h2 id="collection-heading">The SENVO edit</h2>
            <p>New pieces, priced and stocked from our live catalogue.</p>
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
        </div>

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

      <section
        aria-labelledby="journal-heading"
        className="campaign-editorial"
        id="journal"
      >
        <div className="campaign-editorial-image" role="presentation" />
        <Reveal className="campaign-editorial-copy">
          <p className="campaign-editorial-kicker">The SENVO journal</p>
          <h2 id="journal-heading">Style that speaks softly.</h2>
          <p>
            Designed in Dhaka, inspired by the pace, warmth and effortless
            confidence of the city. Every piece is cut for long days, humid
            evenings and the people you spend them with.
          </p>
          <a href="#collection">
            Shop the edit <ArrowRight size={17} />
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
