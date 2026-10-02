"use client";

import type {
  BarcodeLookupContract,
  ProductInventorySummaryContract,
  StockLocationReadContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Layers,
  Loader2,
  MapPin,
  Package,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  ScanBarcode,
  Search,
  SlidersHorizontal,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  canAccessPath,
  type AdminPermissionKey,
} from "../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";
import { useAdminPermissions } from "../../admin-shell";
import { InventoryScanDialog } from "./inventory-scan-dialog";
import { ProductHistoryModal } from "./product-history-modal";
import { ProductInventoryDrawer } from "./product-inventory-drawer";
import styles from "./inventory-overview.module.css";

const client = new AdminApiClient();

type StockStatusFilter = "ALL" | "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export function InventoryOverview({
  permissions: propsPermissions,
}: {
  permissions?: readonly AdminPermissionKey[];
} = {}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const canRead = permissions.includes("INVENTORY:READ");
  const canCreate = permissions.includes("INVENTORY:CREATE");
  const canUpdate = permissions.includes("INVENTORY:UPDATE");

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ProductInventorySummaryContract[]>([]);
  const [locations, setLocations] = useState<StockLocationReadContract[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>("ALL");

  // Dialogs and Drawers
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<ProductInventorySummaryContract | null>(null);
  const [historyProduct, setHistoryProduct] =
    useState<ProductInventorySummaryContract | null>(null);

  // Fetch Inventory and Locations
  const loadData = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");

    try {
      const [productsRes, locationsRes] = await Promise.all([
        client.listInventoryProducts({
          locationId: selectedLocationId || undefined,
          lowStockThreshold: 5,
          pageSize: 100,
        }),
        client.listStockLocations({ pageSize: 100 }),
      ]);

      setItems(productsRes.data.items);
      setLocations(locationsRes.data.items);
    } catch (caught: unknown) {
      if (caught instanceof AdminApiError) {
        setError(caught.message);
      } else {
        setError(
          "Failed to connect to inventory service. Please check connection.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [canRead, selectedLocationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Client-side search and status filter
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((item) => {
      // 1. Stock Status Filter
      if (statusFilter === "OUT_OF_STOCK" && item.availableToSell > 0) {
        return false;
      }
      if (
        statusFilter === "LOW_STOCK" &&
        (item.availableToSell <= 0 || item.availableToSell > 5)
      ) {
        return false;
      }
      if (statusFilter === "IN_STOCK" && item.availableToSell <= 5) {
        return false;
      }

      // 2. Search query (Product name, Product code, Variant SKU)
      if (q) {
        const matchName = item.product.name.toLowerCase().includes(q);
        const matchCode = item.product.productCode.toLowerCase().includes(q);
        const matchSku = item.variants.some((v) =>
          v.variant.sku.toLowerCase().includes(q),
        );
        if (!matchName && !matchCode && !matchSku) {
          return false;
        }
      }

      return true;
    });
  }, [items, search, statusFilter]);

  // Overall Warehouse Metrics (from all fetched items)
  const metrics = useMemo(() => {
    const totalProducts = items.length;
    let totalStockUnits = 0;
    let needRestockCount = 0;
    let outOfStockCount = 0;

    for (const item of items) {
      totalStockUnits += item.onHand;
      if (item.availableToSell <= 0) {
        outOfStockCount++;
      } else if (item.availableToSell <= 5) {
        needRestockCount++;
      }
    }

    return {
      needRestockCount,
      outOfStockCount,
      totalProducts,
      totalStockUnits,
    };
  }, [items]);

  // Handler for quick scanner resolution
  function handleBarcodeResolved(
    barcodeValue: string,
    lookup: BarcodeLookupContract,
  ) {
    // Check if the product already exists in current loaded list
    const matched = items.find(
      (p) =>
        p.product.name.toLowerCase() === lookup.productName.toLowerCase() ||
        p.variants.some((v) => v.variant.sku === lookup.sku),
    );

    if (matched) {
      setSelectedProduct(matched);
    } else {
      // Set the search field so the user can see any matching results
      setSearch(lookup.sku);
    }
  }

  if (!canRead) {
    return (
      <main className={styles.page}>
        <div className={styles.errorState} role="alert">
          <AlertCircle size={32} />
          <strong>Access Restricted / অনুমতি নেই</strong>
          <p>You do not have permission to view inventory records.</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {/* ------------------------------------------------------------------
          Top Section: Page Header
          ------------------------------------------------------------------ */}
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>
            Warehouse & Storefront / ওয়্যারহাউস ও শোরুম
          </p>
          <h1 className={styles.pageTitle}>Inventory</h1>
          <p className={styles.pageSubtitle}>
            Real-time garment stock, warehouse positions, and availability
            across all stores.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            aria-label="Refresh stock"
            className={styles.iconButton}
            disabled={loading}
            onClick={() => void loadData()}
            title="Refresh Stock"
            type="button"
          >
            <RefreshCw className={loading ? styles.spin : ""} size={16} />
          </button>

          <Link className={styles.secondaryButton} href="/inventory/locations">
            <MapPin size={15} />
            <span>Locations</span>
          </Link>

          {canCreate ? (
            <>
              <Link
                className={styles.secondaryButton}
                href="/inventory/transfer"
              >
                <Truck size={15} />
                <span>Transfer Stock</span>
              </Link>
              <Link
                className={styles.secondaryButton}
                href="/inventory/receive"
              >
                <PackagePlus size={15} />
                <span>Receive Stock</span>
              </Link>
              {canAccessPath(permissions, "/inventory/intake") ? (
                <Link className={styles.primaryButton} href="/inventory/intake">
                  <PackagePlus size={16} />
                  <span>নতুন মাল তুলুন</span>
                </Link>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      {/* ------------------------------------------------------------------
          Screen 1: Summary Cards Strip
          ------------------------------------------------------------------ */}
      <section aria-label="Inventory summary" className={styles.summaryGrid}>
        {/* Card 1: Total Products */}
        <article className={styles.summaryCard}>
          <div className={styles.summaryIconWrap}>
            <Boxes size={22} />
          </div>
          <div className={styles.summaryContent}>
            <span className={styles.summaryLabel}>Total Products</span>
            <strong className={styles.summaryValue}>
              {metrics.totalProducts}
            </strong>
            <span className={styles.summarySubtext}>Active catalog styles</span>
          </div>
        </article>

        {/* Card 2: Total Stock Units */}
        <article className={styles.summaryCard}>
          <div
            className={`${styles.summaryIconWrap} ${styles.summaryIconWrap_success}`}
          >
            <Layers size={22} />
          </div>
          <div className={styles.summaryContent}>
            <span className={styles.summaryLabel}>Total Stock Units</span>
            <strong className={styles.summaryValue}>
              {metrics.totalStockUnits.toLocaleString()} pcs
            </strong>
            <span className={styles.summarySubtext}>
              Physical units on hand
            </span>
          </div>
        </article>

        {/* Card 3: Need Restock (Shop-owner friendly!) */}
        <article className={styles.summaryCard}>
          <div
            className={`${styles.summaryIconWrap} ${styles.summaryIconWrap_warning}`}
          >
            <AlertTriangle size={22} />
          </div>
          <div className={styles.summaryContent}>
            <span className={styles.summaryLabel}>Need Restock</span>
            <strong
              className={`${styles.summaryValue} ${
                metrics.needRestockCount > 0 ? styles.textAmber : ""
              }`}
            >
              {metrics.needRestockCount}
            </strong>
            <span className={styles.summarySubtext}>Available ≤ 5 pieces</span>
          </div>
        </article>

        {/* Card 4: Out of Stock */}
        <article className={styles.summaryCard}>
          <div
            className={`${styles.summaryIconWrap} ${styles.summaryIconWrap_danger}`}
          >
            <XCircle size={22} />
          </div>
          <div className={styles.summaryContent}>
            <span className={styles.summaryLabel}>Out of Stock</span>
            <strong
              className={`${styles.summaryValue} ${
                metrics.outOfStockCount > 0 ? styles.textDanger : ""
              }`}
            >
              {metrics.outOfStockCount}
            </strong>
            <span className={styles.summarySubtext}>0 available to sell</span>
          </div>
        </article>
      </section>

      {/* ------------------------------------------------------------------
          Search & Filters Toolbar
          ------------------------------------------------------------------ */}
      <section aria-label="Inventory filters" className={styles.filterToolbar}>
        <div className={styles.filterTopRow}>
          {/* Search Box */}
          <div className={styles.searchBoxWrap}>
            <Search className={styles.searchIcon} size={18} />
            <input
              className={styles.searchInput}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, SKU, barcode…"
              type="text"
              value={search}
            />
            {search ? (
              <button
                aria-label="Clear search"
                className={styles.clearSearchBtn}
                onClick={() => setSearch("")}
                type="button"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>

          {/* Quick Barcode Scanner Button (Near Search as requested!) */}
          <button
            className={styles.scanQuickBtn}
            onClick={() => setScannerOpen(true)}
            title="Scan barcode with handheld scanner or camera"
            type="button"
          >
            <ScanBarcode size={17} />
            <span>Scan Barcode</span>
          </button>

          {/* Location Filter */}
          <div className={styles.locationSelectWrap}>
            <select
              aria-label="Filter by stock location"
              className={styles.locationSelect}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              value={selectedLocationId}
            >
              <option value="">All Locations / সব লোকেশন</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stock Status Pills */}
        <div className={styles.filterPillsRow}>
          <span className={styles.filterPillsLabel}>Stock Status:</span>

          <button
            className={`${styles.statusPill} ${
              statusFilter === "ALL" ? styles.statusPill_active : ""
            }`}
            onClick={() => setStatusFilter("ALL")}
            type="button"
          >
            All Products ({items.length})
          </button>

          <button
            className={`${styles.statusPill} ${styles.statusPill_success} ${
              statusFilter === "IN_STOCK" ? styles.statusPill_active : ""
            }`}
            onClick={() => setStatusFilter("IN_STOCK")}
            type="button"
          >
            <CheckCircle2 size={13} />
            <span>
              In Stock ({items.filter((i) => i.availableToSell > 5).length})
            </span>
          </button>

          <button
            className={`${styles.statusPill} ${styles.statusPill_warning} ${
              statusFilter === "LOW_STOCK" ? styles.statusPill_active : ""
            }`}
            onClick={() => setStatusFilter("LOW_STOCK")}
            type="button"
          >
            <AlertTriangle size={13} />
            <span>Need Restock ({metrics.needRestockCount})</span>
          </button>

          <button
            className={`${styles.statusPill} ${styles.statusPill_danger} ${
              statusFilter === "OUT_OF_STOCK" ? styles.statusPill_active : ""
            }`}
            onClick={() => setStatusFilter("OUT_OF_STOCK")}
            type="button"
          >
            <XCircle size={13} />
            <span>Out of Stock ({metrics.outOfStockCount})</span>
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          Screen 2: Product Grid View
          ------------------------------------------------------------------ */}
      {loading ? (
        <section aria-label="Loading products" className={styles.loadingGrid}>
          {Array.from({ length: 6 }).map((_, idx) => (
            <div className={styles.skeletonCard} key={idx}>
              <div className={styles.skeletonHero} />
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLineShort} />
            </div>
          ))}
        </section>
      ) : error ? (
        <div className={styles.errorState} role="alert">
          <AlertCircle size={28} />
          <strong>Failed to load inventory</strong>
          <p>{error}</p>
          <button
            className={styles.primaryButton}
            onClick={() => void loadData()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className={styles.emptyState}>
          <Package size={36} />
          <strong>No products found</strong>
          <p>
            No inventory items matched your active search or filter criteria.
          </p>
          {search || selectedLocationId || statusFilter !== "ALL" ? (
            <button
              className={styles.secondaryButton}
              onClick={() => {
                setSearch("");
                setSelectedLocationId("");
                setStatusFilter("ALL");
              }}
              type="button"
            >
              Clear Filters
            </button>
          ) : null}
        </div>
      ) : (
        <section aria-label="Products inventory" className={styles.productGrid}>
          {filteredProducts.map((item) => {
            const isOutOfStock = item.availableToSell <= 0;
            const isLowStock = !isOutOfStock && item.availableToSell <= 5;
            const primarySku =
              item.variants[0]?.variant.sku || item.product.productCode;

            // Unique colors and sizes count
            const uniqueColors = new Set(
              item.variants.map((v) => v.variant.color).filter(Boolean),
            );
            const uniqueSizes = new Set(
              item.variants.map((v) => v.variant.size).filter(Boolean),
            );

            return (
              <article
                className={styles.productCard}
                key={item.product.id}
                onClick={() => setSelectedProduct(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedProduct(item);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {/* Hero / Thumbnail */}
                <div className={styles.cardHero}>
                  <div className={styles.cardImageFallback}>
                    <span>{item.product.name.charAt(0).toUpperCase()}</span>
                  </div>

                  <div className={styles.cardBadgePos}>
                    {isOutOfStock ? (
                      <span
                        className={`${styles.badge} ${styles.badge_danger}`}
                      >
                        <XCircle size={12} />
                        <span>Out of Stock</span>
                      </span>
                    ) : isLowStock ? (
                      <span
                        className={`${styles.badge} ${styles.badge_warning}`}
                      >
                        <AlertTriangle size={12} />
                        <span>Need Restock</span>
                      </span>
                    ) : (
                      <span
                        className={`${styles.badge} ${styles.badge_success}`}
                      >
                        <CheckCircle2 size={12} />
                        <span>In Stock</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className={styles.cardBody}>
                  <div className={styles.cardMetaRow}>
                    <span className={styles.codeBadge}>
                      {item.product.productCode}
                    </span>
                    <span className={styles.skuMuted}>SKU: {primarySku}</span>
                  </div>

                  <h3 className={styles.cardTitle}>{item.product.name}</h3>

                  {/* Stock Summary Strip */}
                  <div className={styles.stockStrip}>
                    <div className={styles.stockCol}>
                      <small>Total</small>
                      <strong>{item.onHand}</strong>
                    </div>
                    <div className={styles.stockCol}>
                      <small>Reserved</small>
                      <strong
                        className={item.reserved > 0 ? styles.textAmber : ""}
                      >
                        {item.reserved}
                      </strong>
                    </div>
                    <div className={styles.stockCol}>
                      <small>Available</small>
                      <strong
                        className={
                          isOutOfStock
                            ? styles.textDanger
                            : isLowStock
                              ? styles.textAmber
                              : styles.textSuccess
                        }
                      >
                        {item.availableToSell}
                      </strong>
                    </div>
                  </div>

                  {/* Variant summary tag */}
                  <div className={styles.cardVariantsSummary}>
                    <Boxes size={13} />
                    <span>
                      {uniqueColors.size} color
                      {uniqueColors.size !== 1 ? "s" : ""} · {uniqueSizes.size}{" "}
                      size{uniqueSizes.size !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* ------------------------------------------------------------------
          Screen 3: Product Detail Drawer
          ------------------------------------------------------------------ */}
      {selectedProduct ? (
        <ProductInventoryDrawer
          canCreate={canCreate}
          canUpdate={canUpdate}
          item={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onViewHistory={() => {
            setHistoryProduct(selectedProduct);
          }}
        />
      ) : null}

      {/* ------------------------------------------------------------------
          Screen 4: Product History Modal
          ------------------------------------------------------------------ */}
      {historyProduct ? (
        <ProductHistoryModal
          onClose={() => setHistoryProduct(null)}
          productCode={historyProduct.product.productCode}
          productId={historyProduct.product.id}
          productName={historyProduct.product.name}
        />
      ) : null}

      {/* ------------------------------------------------------------------
          Quick Barcode Scanner Dialog
          ------------------------------------------------------------------ */}
      {scannerOpen ? (
        <InventoryScanDialog
          onApply={handleBarcodeResolved}
          onClose={() => setScannerOpen(false)}
        />
      ) : null}
    </main>
  );
}
