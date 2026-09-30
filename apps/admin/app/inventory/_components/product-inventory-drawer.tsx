"use client";

import type {
  ProductDetailsContract,
  ProductInventorySummaryContract,
  VariantBarcodeContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Copy,
  History,
  Layers,
  MapPin,
  Package,
  PackageCheck,
  RefreshCw,
  ScanBarcode,
  SlidersHorizontal,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminApiClient } from "../../_lib/api-client";
import styles from "./inventory-overview.module.css";

const client = new AdminApiClient();

export function ProductInventoryDrawer({
  canCreate,
  canUpdate,
  item,
  onClose,
  onViewHistory,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  item: ProductInventorySummaryContract;
  onClose: () => void;
  onViewHistory: () => void;
}) {
  const [productDetail, setProductDetail] =
    useState<ProductDetailsContract | null>(null);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);
  const [variantBarcodes, setVariantBarcodes] = useState<
    Record<string, VariantBarcodeContract[]>
  >({});

  // Group variants by Color for Garment UX
  const colorGroups = useMemo(() => {
    const map = new Map<
      string,
      Array<(typeof item.variants)[number]>
    >();

    for (const v of item.variants) {
      const color = v.variant.color || "Standard";
      const existing = map.get(color) ?? [];
      existing.push(v);
      map.set(color, existing);
    }

    return Array.from(map.entries()).map(([color, variants]) => ({
      color,
      variants,
    }));
  }, [item.variants]);

  // Load product detail for primary image and barcodes
  useEffect(() => {
    let cancelled = false;

    async function loadExtra() {
      try {
        const detailRes = await client.getProduct(item.product.id);
        if (!cancelled && detailRes.data) {
          setProductDetail(detailRes.data);
        }
      } catch {
        // Silently keep fallback image if detail is unavailable
      }

      // Fetch barcodes for each variant
      for (const v of item.variants) {
        try {
          const barcodeRes = await client.listVariantBarcodes(v.variant.id);
          if (!cancelled && barcodeRes.data) {
            setVariantBarcodes((prev) => ({
              ...prev,
              [v.variant.id]: barcodeRes.data,
            }));
          }
        } catch {
          // Keep empty if none
        }
      }
    }

    void loadExtra();
    return () => {
      cancelled = true;
    };
  }, [item.product.id, item.variants]);

  // Handle ESC key to close drawer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function copyToClipboard(val: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(val);
      setCopiedBarcode(val);
      setTimeout(() => setCopiedBarcode(null), 2000);
    }
  }

  // Determine stock tone
  const isOutOfStock = item.availableToSell <= 0;
  const isLowStock = !isOutOfStock && item.availableToSell <= 5;

  const firstBarcode = Object.values(variantBarcodes)
    .flat()
    .find((b) => b.status === "ACTIVE")?.value;

  const primaryImage = productDetail?.primaryImage;

  return (
    <div
      className={styles.drawerBackdrop}
      onClick={onClose}
      role="presentation"
    >
      <aside
        aria-labelledby="drawer-product-title"
        aria-modal="true"
        className={styles.drawer}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {/* Drawer Header */}
        <header className={styles.drawerHeader}>
          <div className={styles.drawerProductHero}>
            <div className={styles.drawerThumbWrap}>
              {primaryImage ? (
                <img
                  alt={primaryImage.altText || item.product.name}
                  className={styles.drawerThumb}
                  src={primaryImage.url}
                />
              ) : (
                <div className={styles.drawerThumbPlaceholder}>
                  <span>{item.product.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
            </div>
            <div className={styles.drawerHeroText}>
              <div className={styles.drawerBadgeRow}>
                {isOutOfStock ? (
                  <span className={`${styles.badge} ${styles.badge_danger}`}>
                    <XCircle size={13} />
                    <span>Out of Stock</span>
                  </span>
                ) : isLowStock ? (
                  <span className={`${styles.badge} ${styles.badge_warning}`}>
                    <AlertTriangle size={13} />
                    <span>Need Restock</span>
                  </span>
                ) : (
                  <span className={`${styles.badge} ${styles.badge_success}`}>
                    <CheckCircle2 size={13} />
                    <span>In Stock</span>
                  </span>
                )}
                <span className={styles.codeBadge}>
                  {item.product.productCode}
                </span>
              </div>
              <h2 id="drawer-product-title">{item.product.name}</h2>
              <div className={styles.heroSubRow}>
                <span className={styles.skuText}>
                  SKU: {item.variants[0]?.variant.sku || item.product.productCode}
                </span>
                {firstBarcode ? (
                  <button
                    className={styles.barcodeCopyChip}
                    onClick={() => copyToClipboard(firstBarcode)}
                    title="Click to copy barcode"
                    type="button"
                  >
                    <ScanBarcode size={13} />
                    <code>{firstBarcode}</code>
                    {copiedBarcode === firstBarcode ? (
                      <span className={styles.copiedText}>Copied!</span>
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <button
            aria-label="Close drawer"
            className={styles.drawerCloseButton}
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        {/* Drawer Scroll Body */}
        <div className={styles.drawerBody}>
          {/* Section 1: Stock Overview */}
          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHeader}>
              <Layers size={17} />
              <h3>Stock Overview / স্টক সামারি</h3>
            </div>
            <div className={styles.stockOverviewGrid}>
              <div className={styles.stockStatTile}>
                <small>Total On Hand</small>
                <strong>{item.onHand}</strong>
                <span>Physical Pieces</span>
              </div>
              <div className={styles.stockStatTile}>
                <small>Reserved Stock</small>
                <strong className={item.reserved > 0 ? styles.textAmber : ""}>
                  {item.reserved}
                </strong>
                <span>Orders & Cart</span>
              </div>
              <div
                className={`${styles.stockStatTile} ${
                  isOutOfStock
                    ? styles.stockStatTile_danger
                    : isLowStock
                      ? styles.stockStatTile_warning
                      : styles.stockStatTile_success
                }`}
              >
                <small>Available to Sell</small>
                <strong>{item.availableToSell}</strong>
                <span>Ready for Purchase</span>
              </div>
            </div>
          </section>

          {/* Section 2: Variant Breakdown (Garment UX) */}
          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHeader}>
              <Boxes size={17} />
              <div>
                <h3>Variant Breakdown / সাইজ ও কালার</h3>
                <p className={styles.sectionSubtitle}>
                  Garment color groups with available size units
                </p>
              </div>
            </div>

            {colorGroups.length === 0 ? (
              <p className={styles.emptyNote}>No variants found.</p>
            ) : (
              <div className={styles.colorGroupsList}>
                {colorGroups.map(({ color, variants }) => (
                  <div className={styles.colorGroupCard} key={color}>
                    <div className={styles.colorGroupHeader}>
                      <span className={styles.colorDot} />
                      <h4>
                        Color: <strong>{color}</strong>
                      </h4>
                      <small>{variants.length} sizes</small>
                    </div>

                    <div className={styles.sizeChipsGrid}>
                      {variants.map((v) => {
                        const vOut = v.availableToSell <= 0;
                        const vLow = !vOut && v.availableToSell <= 3;
                        const bCodes = variantBarcodes[v.variant.id] || [];
                        const bCode = bCodes[0]?.value;

                        return (
                          <div
                            className={`${styles.sizeChipCard} ${
                              vOut
                                ? styles.sizeChipCard_out
                                : vLow
                                  ? styles.sizeChipCard_low
                                  : ""
                            }`}
                            key={v.variant.id}
                          >
                            <div className={styles.sizeChipTop}>
                              <span className={styles.sizeLabel}>
                                Size <strong>{v.variant.size}</strong>
                              </span>
                              <span
                                className={`${styles.sizeQty} ${
                                  vOut
                                    ? styles.textDanger
                                    : vLow
                                      ? styles.textAmber
                                      : styles.textSuccess
                                }`}
                              >
                                {v.availableToSell} pcs
                              </span>
                            </div>

                            <div className={styles.sizeChipMeta}>
                              <span>SKU: {v.variant.sku}</span>
                              {bCode ? (
                                <span
                                  className={styles.chipBarcode}
                                  onClick={() => copyToClipboard(bCode)}
                                  title="Copy barcode"
                                >
                                  <ScanBarcode size={11} />
                                  <code>{bCode}</code>
                                </span>
                              ) : null}
                            </div>

                            {/* Location tags for this variant */}
                            {v.locations.length > 0 ? (
                              <div className={styles.variantLocationList}>
                                {v.locations.map((loc) => (
                                  <span
                                    className={styles.locMiniBadge}
                                    key={loc.location.id}
                                  >
                                    {loc.location.name}: {loc.availableToSell}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 3: Location Breakdown */}
          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHeader}>
              <MapPin size={17} />
              <div>
                <h3>Location Breakdown / শাখা ও গুদাম</h3>
                <p className={styles.sectionSubtitle}>
                  Stock positions across warehouses and stores
                </p>
              </div>
            </div>

            {item.locations.length === 0 ? (
              <div className={styles.singleLocationNotice}>
                <MapPin size={18} />
                <div>
                  <strong>All stock currently in Main Stock</strong>
                  <p>No separate sub-location balances recorded.</p>
                </div>
              </div>
            ) : (
              <div className={styles.locationsList}>
                {item.locations.map((loc) => {
                  const percent =
                    item.onHand > 0
                      ? Math.min(
                          100,
                          Math.round((loc.onHand / item.onHand) * 100),
                        )
                      : 0;

                  return (
                    <div
                      className={styles.locationRowCard}
                      key={loc.location.id}
                    >
                      <div className={styles.locationInfo}>
                        <div className={styles.locationTitleWrap}>
                          <MapPin size={15} />
                          <strong>{loc.location.name}</strong>
                        </div>
                        <div className={styles.locationCounts}>
                          <span>
                            On hand: <strong>{loc.onHand}</strong>
                          </span>
                          <span>
                            Reserved: <strong>{loc.reserved}</strong>
                          </span>
                          <span className={styles.availableHighlight}>
                            Available: <strong>{loc.availableToSell}</strong>
                          </span>
                        </div>
                      </div>
                      <div className={styles.locationBarTrack}>
                        <div
                          className={styles.locationBarFill}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section 4: Quick Actions */}
          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHeader}>
              <SlidersHorizontal size={17} />
              <h3>Quick Actions / দ্রুত কাজ</h3>
            </div>

            <div className={styles.quickActionButtonsGrid}>
              <Link
                className={styles.actionBtnPrimary}
                href={`/inventory/receive?productId=${encodeURIComponent(
                  item.product.id,
                )}`}
              >
                <PackageCheck size={16} />
                <span>Receive Stock (পণ্য যুক্ত)</span>
                <ArrowRight size={14} />
              </Link>

              <Link
                className={styles.actionBtnSecondary}
                href={`/inventory/transfer?productId=${encodeURIComponent(
                  item.product.id,
                )}`}
              >
                <Truck size={16} />
                <span>Transfer Stock (স্থানান্তর)</span>
                <ArrowRight size={14} />
              </Link>

              <button
                className={styles.actionBtnSecondary}
                onClick={onViewHistory}
                type="button"
              >
                <History size={16} />
                <span>View Full History (ইতিহাস দেখুন)</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
