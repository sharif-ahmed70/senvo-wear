"use client";

import type {
  CategoryContract,
  ProductContract,
  ProductDetailsContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  Barcode,
  Boxes,
  CheckCircle2,
  CircleDashed,
  Eye,
  ImageIcon,
  LoaderCircle,
  PackagePlus,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminApiClient } from "../../_lib/api-client";
import styles from "./catalog-overview.module.css";

const PAGE_SIZE = 8;
const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

type ProductRowDetail = {
  barcodeVariantCount: number;
  details: ProductDetailsContract;
};

type LoadState = "error" | "loading" | "ready";

export function CatalogOverview() {
  const [products, setProducts] = useState<ProductContract[]>([]);
  const [categories, setCategories] = useState<CategoryContract[]>([]);
  const [rowDetails, setRowDetails] = useState<Record<string, ProductRowDetail>>({});
  const [state, setState] = useState<LoadState>("loading");
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const [productResult, categoryResult] = await Promise.all([
        client.listProducts(),
        client.listCategories(),
      ]);
      setProducts(productResult.data);
      setCategories(categoryResult.data);
      setState("ready");
    } catch (caught) {
      setError(messageFor(caught));
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        !normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.productCode.toLowerCase().includes(normalizedQuery) ||
        (categoryMap.get(product.categoryId) ?? "")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesCategory =
        categoryId === "ALL" || product.categoryId === categoryId;
      const matchesStatus = status === "ALL" || product.status === status;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [categoryId, categoryMap, products, query, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleProducts = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  useEffect(() => {
    if (visibleProducts.length === 0) return;
    let active = true;
    const missing = visibleProducts.filter((product) => !rowDetails[product.id]);
    if (missing.length === 0) return;

    setDetailLoading(true);
    void Promise.all(
      missing.map(async (product) => {
        const detailsResult = await client.getProduct(product.id);
        const barcodeLists = await Promise.all(
          detailsResult.data.variants.map((variant) =>
            client
              .listVariantBarcodes(variant.id)
              .then((result) => result.data)
              .catch(() => []),
          ),
        );
        const barcodeVariantCount = barcodeLists.filter((barcodes) =>
          barcodes.some((barcode) => barcode.status === "ACTIVE"),
        ).length;
        return [
          product.id,
          { barcodeVariantCount, details: detailsResult.data },
        ] as const;
      }),
    )
      .then((entries) => {
        if (!active) return;
        setRowDetails((current) => ({ ...current, ...Object.fromEntries(entries) }));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [rowDetails, visibleProducts]);

  useEffect(() => {
    setPage(1);
  }, [categoryId, query, status]);

  const counts = useMemo(
    () => ({
      active: products.filter((product) => product.status === "ACTIVE").length,
      archived: products.filter((product) => product.status === "ARCHIVED").length,
      draft: products.filter((product) => product.status === "DRAFT").length,
      inactive: products.filter((product) => product.status === "INACTIVE").length,
      total: products.length,
    }),
    [products],
  );

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Merchandising workspace</p>
          <h1>Catalog</h1>
          <p>Manage what SENVO sells — products, variants, media and identity.</p>
        </div>
        <Link className={styles.primaryAction} href="/catalog/products/new">
          <PackagePlus aria-hidden="true" size={17} />
          Add product
        </Link>
      </header>

      <section className={styles.metrics} aria-label="Catalog summary">
        <Metric label="Total products" value={counts.total} icon={Sparkles} tone="brand" />
        <Metric label="Active" value={counts.active} icon={CheckCircle2} tone="healthy" />
        <Metric label="Draft" value={counts.draft} icon={CircleDashed} tone="neutral" />
        <Metric label="Inactive" value={counts.inactive} icon={AlertCircle} tone="attention" />
        <Metric label="Archived" value={counts.archived} icon={Archive} tone="muted" />
      </section>

      <div className={styles.workspaceGrid}>
        <section className={styles.catalogPanel} aria-labelledby="catalog-products-heading">
          <div className={styles.panelHeader}>
            <div>
              <h2 id="catalog-products-heading">Products</h2>
              <span>{filtered.length} matching products</span>
            </div>
            <span className={styles.liveHint}>
              {detailLoading ? <LoaderCircle aria-hidden="true" className={styles.spin} size={14} /> : null}
              Product detail hydrates from the real catalog API
            </span>
          </div>

          <div className={styles.filters}>
            <label className={styles.searchBox}>
              <Search aria-hidden="true" size={16} />
              <span className={styles.srOnly}>Search products</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product, code or category…"
                value={query}
              />
            </label>
            <label>
              <span className={styles.srOnly}>Category</span>
              <select onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
                <option value="ALL">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={styles.srOnly}>Status</span>
              <select onChange={(event) => setStatus(event.target.value)} value={status}>
                <option value="ALL">All status</option>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <span className={styles.filterLabel}>
              <SlidersHorizontal aria-hidden="true" size={15} />
              Simple filters
            </span>
          </div>

          {state === "loading" ? (
            <LoadingState />
          ) : state === "error" ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : filtered.length === 0 ? (
            <EmptyState hasProducts={products.length > 0} />
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Variants</th>
                      <th>Barcodes</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((product) => (
                      <ProductRow
                        category={categoryMap.get(product.categoryId) ?? "Uncategorized"}
                        detail={rowDetails[product.id]}
                        key={product.id}
                        product={product}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <footer className={styles.pagination}>
                <span>
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div>
                  <button disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
                    Previous
                  </button>
                  <span>Page {safePage} of {totalPages}</span>
                  <button disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">
                    Next
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>

        <aside className={styles.rail} aria-label="Catalog shortcuts">
          <section className={styles.railCard}>
            <p className={styles.railEyebrow}>Catalog at a glance</p>
            <h2>Keep setup flowing</h2>
            <p>Move naturally from merchandise setup to identification and stock.</p>
            <Shortcut href="/catalog/products/new" icon={PackagePlus} label="Add product" detail="Create product, variants and media" />
            <Shortcut href="/catalog/barcodes" icon={Barcode} label="Generate barcodes" detail="Identify sellable variants" />
            <Shortcut href="/inventory" icon={Boxes} label="Receive stock" detail="Post incoming units to inventory" />
          </section>
          <section className={styles.railCard}>
            <p className={styles.railEyebrow}>Merchandising setup</p>
            <Shortcut href="/catalog/categories" icon={ArrowRight} label="Categories" detail="Organize the product hierarchy" compact />
            <Shortcut href="/catalog/collections" icon={ArrowRight} label="Collections" detail="Curate storefront groups" compact />
            <Shortcut href="/catalog/colors" icon={ArrowRight} label="Colors" detail="Reusable color definitions" compact />
            <Shortcut href="/catalog/sizes" icon={ArrowRight} label="Sizes" detail="Reusable ordered sizes" compact />
          </section>
        </aside>
      </div>

      <section className={styles.footerCallout}>
        <div>
          <span className={styles.calloutIcon}><ImageIcon aria-hidden="true" size={20} /></span>
          <div>
            <strong>Use real product media.</strong>
            <p>Primary and variant imagery uploaded in SENVO becomes the product identity used across operations.</p>
          </div>
        </div>
        <Link href="/catalog/products/new">Add a product <ArrowRight aria-hidden="true" size={15} /></Link>
      </section>
    </div>
  );
}

function ProductRow({
  category,
  detail,
  product,
}: {
  category: string;
  detail?: ProductRowDetail;
  product: ProductContract;
}) {
  const variantCount = detail?.details.variants.length;
  const barcodeVariantCount = detail?.barcodeVariantCount;
  const image = detail?.details.primaryImage;
  return (
    <tr>
      <td>
        <div className={styles.productIdentity}>
          <span className={styles.productImage}>
            {image ? (
              <Image alt={image.altText} height={48} src={image.url} unoptimized width={40} />
            ) : (
              <ImageIcon aria-hidden="true" size={18} />
            )}
          </span>
          <span>
            <Link href={`/catalog/products/${product.id}`}>{product.name}</Link>
            <small>Code: {product.productCode}</small>
          </span>
        </div>
      </td>
      <td>{category}</td>
      <td>
        {variantCount === undefined ? <span className={styles.skeletonText}>Loading…</span> : <><strong>{variantCount}</strong><small>{variantCount === 1 ? " variant" : " variants"}</small></>}
      </td>
      <td>
        {variantCount === undefined || barcodeVariantCount === undefined ? (
          <span className={styles.skeletonText}>Loading…</span>
        ) : variantCount === 0 ? (
          <span className={styles.muted}>No variants</span>
        ) : (
          <span className={styles.barcodeReadiness}>
            <strong>{barcodeVariantCount} / {variantCount}</strong>
            <small>{Math.round((barcodeVariantCount / variantCount) * 100)}% ready</small>
          </span>
        )}
      </td>
      <td><StatusPill status={product.status} /></td>
      <td>{relativeTime(product.updatedAt)}</td>
      <td>
        <Link aria-label={`View ${product.name}`} className={styles.rowAction} href={`/catalog/products/${product.id}`}>
          <Eye aria-hidden="true" size={16} />
        </Link>
      </td>
    </tr>
  );
}

function Metric({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof Sparkles;
  label: string;
  tone: "attention" | "brand" | "healthy" | "muted" | "neutral";
  value: number;
}) {
  return (
    <article className={`${styles.metric} ${styles[`metric_${tone}`]}`}>
      <span><Icon aria-hidden="true" size={18} /></span>
      <div><small>{label}</small><strong>{value}</strong></div>
    </article>
  );
}

function Shortcut({
  compact = false,
  detail,
  href,
  icon: Icon,
  label,
}: {
  compact?: boolean;
  detail: string;
  href: string;
  icon: typeof PackagePlus;
  label: string;
}) {
  return (
    <Link className={`${styles.shortcut} ${compact ? styles.shortcutCompact : ""}`} href={href}>
      <span><Icon aria-hidden="true" size={16} /></span>
      <span><strong>{label}</strong><small>{detail}</small></span>
      <ArrowRight aria-hidden="true" size={14} />
    </Link>
  );
}

function StatusPill({ status }: { status: ProductContract["status"] }) {
  return <span className={`${styles.status} ${styles[`status_${status.toLowerCase()}`]}`}>{titleCase(status)}</span>;
}

function LoadingState() {
  return (
    <div className={styles.statePanel} role="status">
      <LoaderCircle aria-hidden="true" className={styles.spin} size={22} />
      <div><strong>Loading your catalog</strong><p>Fetching real product records from SENVO.</p></div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.statePanel} role="alert">
      <AlertCircle aria-hidden="true" size={22} />
      <div><strong>Catalog could not be loaded</strong><p>{message}</p><button onClick={onRetry} type="button">Try again</button></div>
    </div>
  );
}

function EmptyState({ hasProducts }: { hasProducts: boolean }) {
  return (
    <div className={styles.emptyState}>
      <PackagePlus aria-hidden="true" size={24} />
      <div>
        <strong>{hasProducts ? "No products match these filters" : "Your catalog is ready for its first product"}</strong>
        <p>{hasProducts ? "Clear or change the filters to see more products." : "Create the product first; barcode and stock workflows come next."}</p>
      </div>
      {!hasProducts ? <Link href="/catalog/products/new">Add product</Link> : null}
    </div>
  );
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/^./u, (character) => character.toUpperCase());
}

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  const diffMinutes = Math.round((Date.now() - timestamp) / 60_000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function messageFor(caught: unknown) {
  return caught instanceof Error ? caught.message : "The admin service could not be reached.";
}
