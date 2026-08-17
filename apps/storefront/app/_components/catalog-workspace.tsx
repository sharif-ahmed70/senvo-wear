"use client";
import { Search, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { addToCart, readCart, writeCart } from "../_lib/cart";
import {
  storefrontApi,
  taka,
  type StorefrontCatalog,
  type StorefrontProduct,
} from "../_lib/storefront-api";
export function CatalogWorkspace() {
  const [catalog, setCatalog] = useState<StorefrontCatalog | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  useEffect(() => {
    let active = true;
    void storefrontApi
      .catalog({ category: category || undefined, search: search || undefined })
      .then((data) => {
        if (active) {
          setCatalog(data);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("We could not load the shop. Please try again.");
      });
    return () => {
      active = false;
    };
  }, [category, search]);
  return (
    <main>
      <section className="shop-intro">
        <p className="eyebrow">SENVO Wear online</p>
        <h1>Made to move through your day.</h1>
        <p>Easy essentials, clear prices, and delivery across Bangladesh.</p>
      </section>
      <section className="catalog-tools" aria-label="Catalog filters">
        <label>
          <Search size={18} />
          <input
            aria-label="Search products"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the collection"
            value={search}
          />
        </label>
        <select
          aria-label="Filter by category"
          onChange={(event) => setCategory(event.target.value)}
          value={category}
        >
          <option value="">All categories</option>
          {catalog?.categories.map((item) => (
            <option key={item.id} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </section>
      {error ? <p className="notice error">{error}</p> : null}
      {!catalog && !error ? (
        <div className="product-grid" aria-label="Loading products">
          {[1, 2, 3].map((item) => (
            <div className="skeleton" key={item} />
          ))}
        </div>
      ) : null}
      {catalog?.products.length === 0 ? (
        <div className="empty">
          <ShoppingBag />
          <h2>No pieces found</h2>
          <p>Try a different search or category.</p>
        </div>
      ) : null}
      <div className="product-grid">
        {catalog?.products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </main>
  );
}
function ProductCard({ product }: { product: StorefrontProduct }) {
  const first =
    product.variants.find((variant) => variant.availability === "IN_STOCK") ??
    product.variants[0];
  const add = () => {
    if (first)
      writeCart(
        window.localStorage,
        addToCart(readCart(window.localStorage), first),
      );
  };
  return (
    <article className="product-card">
      <a
        className="product-visual"
        href={`/products/${product.slug}`}
        aria-label={`View ${product.name}`}
      >
        <span>{product.category.name}</span>
      </a>
      <div className="product-copy">
        <div>
          <a href={`/products/${product.slug}`}>
            <h2>{product.name}</h2>
          </a>
          <p>{first ? taka(first.sellingPriceMinor) : "Unavailable"}</p>
        </div>
        <button
          disabled={!first || first.availability !== "IN_STOCK"}
          onClick={add}
          type="button"
        >
          <ShoppingBag size={17} /> Add
        </button>
      </div>
    </article>
  );
}
