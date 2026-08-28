"use client";

import type {
  BarcodeLookupContract,
  ProductContract,
  ProductDetailsContract,
  ProductVariantContract,
  VariantBarcodeContract,
} from "@senvo/contracts";
import {
  AlertTriangle,
  Barcode,
  Boxes,
  Check,
  ChevronRight,
  Download,
  LoaderCircle,
  MoreHorizontal,
  PackageSearch,
  RefreshCw,
  ScanBarcode,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import styles from "./barcode-management.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type VariantRow = {
  activeBarcode: VariantBarcodeContract | null;
  allBarcodes: VariantBarcodeContract[];
  variant: ProductVariantContract;
};

type BarcodeFilter = "all" | "assigned" | "missing";

export function BarcodeWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canCreate = permissions.includes("CATALOG:CREATE");
  const canUpdate = permissions.includes("CATALOG:UPDATE");
  const canRead = permissions.includes("CATALOG:READ");

  const [products, setProducts] = useState<ProductContract[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [details, setDetails] = useState<ProductDetailsContract | null>(null);
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [filter, setFilter] = useState<BarcodeFilter>("all");
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState<BarcodeLookupContract | null>(null);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setError("");
    try {
      const result = await client.listProducts();
      const activeProducts = result.data.filter(
        (product) => product.status !== "ARCHIVED",
      );
      setProducts(activeProducts);
      setSelectedProductId((current) => current || activeProducts[0]?.id || "");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const loadSelectedProduct = useCallback(async (productId: string) => {
    if (!productId) {
      setDetails(null);
      setRows([]);
      return;
    }
    setLoadingProduct(true);
    setError("");
    setNotice("");
    try {
      const productDetails = (await client.getProduct(productId)).data;
      const barcodeSets = await Promise.all(
        productDetails.variants.map(async (variant) => ({
          barcodes: (await client.listVariantBarcodes(variant.id)).data,
          variant,
        })),
      );
      setDetails(productDetails);
      setRows(
        barcodeSets.map(({ barcodes, variant }) => ({
          activeBarcode:
            barcodes.find((barcode) => barcode.status === "ACTIVE") ?? null,
          allBarcodes: barcodes,
          variant,
        })),
      );
      setSelectedVariantIds([]);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoadingProduct(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (selectedProductId) void loadSelectedProduct(selectedProductId);
  }, [loadSelectedProduct, selectedProductId]);

  const visibleProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      `${product.name} ${product.productCode}`.toLowerCase().includes(query),
    );
  }, [productQuery, products]);

  const filteredRows = useMemo(() => {
    if (filter === "assigned") return rows.filter((row) => row.activeBarcode);
    if (filter === "missing") return rows.filter((row) => !row.activeBarcode);
    return rows;
  }, [filter, rows]);

  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  );
  const assignedCount = rows.filter((row) => row.activeBarcode).length;
  const missingCount = rows.length - assignedCount;
  const selectedMissingCount = rows.filter(
    (row) =>
      selectedVariantIds.includes(row.variant.id) && !row.activeBarcode,
  ).length;

  if (!canRead) {
    return (
      <section className={styles.statePanel}>
        <Barcode size={24} />
        <h1>Catalog access is restricted</h1>
        <p>Your role does not have permission to view product barcodes.</p>
      </section>
    );
  }

  async function changeStatus(barcode: VariantBarcodeContract) {
    if (!canUpdate) return;
    setError("");
    setNotice("");
    try {
      const nextStatus = barcode.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await client.updateBarcodeStatus({ barcodeId: barcode.id, status: nextStatus });
      setNotice(
        `${barcode.value} is now ${nextStatus === "ACTIVE" ? "active" : "inactive"}.`,
      );
      await loadSelectedProduct(selectedProductId);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

  function exportCurrentProduct() {
    if (!details) return;
    const header = ["Product", "Product Code", "SKU", "Barcode", "Barcode Type", "Status"];
    const lines = rows.map((row) => [
      details.product.name,
      details.product.productCode,
      row.variant.sku,
      row.activeBarcode?.value ?? "",
      row.activeBarcode?.type ?? "",
      row.activeBarcode ? "Assigned" : "No barcode",
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map(csvCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${details.product.productCode}-barcodes.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Catalog operations</p>
          <h1>Barcode Management</h1>
          <p>Assign, verify and prepare scan codes for real product variants.</p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryButton}
            onClick={() => {
              setScanResult(null);
              setScanOpen(true);
            }}
            type="button"
          >
            <ScanBarcode aria-hidden="true" size={16} />
            Scan Barcode
          </button>
          <Link
            aria-disabled={!canCreate || !selectedProductId}
            className={`${styles.primaryButton} ${!canCreate || !selectedProductId ? styles.disabledLink : ""}`}
            href={
              canCreate && selectedProductId
                ? `/catalog/barcodes/generate?productId=${encodeURIComponent(selectedProductId)}`
                : "/catalog/barcodes"
            }
          >
            <Barcode aria-hidden="true" size={16} />
            Generate Barcodes
          </Link>
        </div>
      </header>

      {error ? (
        <div className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          <span>{error}</span>
          <button onClick={() => setError("")} type="button" aria-label="Dismiss error">
            <X size={15} />
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className={styles.feedback} role="status">
          <Check aria-hidden="true" size={16} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")} type="button" aria-label="Dismiss message">
            <X size={15} />
          </button>
        </div>
      ) : null}

      <section className={styles.metrics} aria-label="Barcode readiness">
        <MetricCard
          icon={<Boxes size={18} />}
          label="Catalog Products"
          meta="Available to manage"
          value={loadingProducts ? "—" : String(products.length)}
        />
        <MetricCard
          icon={<PackageSearch size={18} />}
          label="Product Variants"
          meta={selectedProduct?.name ?? "Select a product"}
          value={loadingProduct ? "—" : String(rows.length)}
        />
        <MetricCard
          icon={<Barcode size={18} />}
          label="Barcoded Variants"
          meta={rows.length ? `${Math.round((assignedCount / rows.length) * 100)}% ready` : "No variants"}
          value={loadingProduct ? "—" : String(assignedCount)}
          tone="success"
        />
        <MetricCard
          icon={<AlertTriangle size={18} />}
          label="Needs Barcodes"
          meta={missingCount ? "Action recommended" : "All variants identified"}
          value={loadingProduct ? "—" : String(missingCount)}
          tone={missingCount ? "attention" : "success"}
        />
      </section>

      <section className={styles.workspace}>
        <aside className={styles.productRail}>
          <div className={styles.railHeader}>
            <div>
              <h2>Find Product</h2>
              <p>Select a product to manage its variants.</p>
            </div>
            <button
              aria-label="Refresh catalog products"
              className={styles.iconButton}
              disabled={loadingProducts}
              onClick={() => void loadProducts()}
              type="button"
            >
              <RefreshCw className={loadingProducts ? styles.spin : ""} size={15} />
            </button>
          </div>
          <label className={styles.searchBox}>
            <Search aria-hidden="true" size={15} />
            <span className="sr-only">Search products</span>
            <input
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Search product or code..."
              value={productQuery}
            />
          </label>
          <div className={styles.productList}>
            {loadingProducts ? (
              <RailLoading />
            ) : visibleProducts.length ? (
              visibleProducts.map((product) => (
                <button
                  aria-pressed={selectedProductId === product.id}
                  className={`${styles.productItem} ${selectedProductId === product.id ? styles.productItemActive : ""}`}
                  key={product.id}
                  onClick={() => setSelectedProductId(product.id)}
                  type="button"
                >
                  <span className={styles.productGlyph} aria-hidden="true">
                    {product.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className={styles.productCopy}>
                    <strong>{product.name}</strong>
                    <small>{product.productCode}</small>
                  </span>
                  <ChevronRight aria-hidden="true" size={15} />
                </button>
              ))
            ) : (
              <div className={styles.railEmpty}>No matching products.</div>
            )}
          </div>
          <Link className={styles.railLink} href="/catalog">
            View catalog
            <ChevronRight aria-hidden="true" size={14} />
          </Link>
        </aside>

        <section className={styles.variantPanel}>
          <div className={styles.variantHeader}>
            <div>
              <p>{selectedProduct?.productCode ?? "Product"}</p>
              <h2>{selectedProduct?.name ?? "Choose a product"}</h2>
              <span>{rows.length} variants</span>
            </div>
            <div className={styles.variantActions}>
              <select
                aria-label="Filter barcode status"
                onChange={(event) => setFilter(event.target.value as BarcodeFilter)}
                value={filter}
              >
                <option value="all">All variants</option>
                <option value="assigned">Assigned</option>
                <option value="missing">Needs barcode</option>
              </select>
              <button
                className={styles.secondaryButton}
                disabled={!details || rows.length === 0}
                onClick={exportCurrentProduct}
                type="button"
              >
                <Download aria-hidden="true" size={15} />
                Export
              </button>
            </div>
          </div>

          {loadingProduct ? (
            <div className={styles.loadingState}>
              <LoaderCircle className={styles.spin} size={22} />
              <span>Loading product variants and barcodes…</span>
            </div>
          ) : !details ? (
            <div className={styles.emptyState}>
              <PackageSearch size={24} />
              <strong>Select a product</strong>
              <span>Its sellable variants will appear here.</span>
            </div>
          ) : rows.length === 0 ? (
            <div className={styles.emptyState}>
              <Barcode size={24} />
              <strong>No variants yet</strong>
              <span>Create product variants before assigning barcodes.</span>
              <Link href={`/catalog/products/${details.product.id}`}>Open product</Link>
            </div>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.checkboxCell}>
                        <input
                          aria-label="Select all visible variants needing barcode"
                          checked={
                            filteredRows.filter((row) => !row.activeBarcode).length > 0 &&
                            filteredRows
                              .filter((row) => !row.activeBarcode)
                              .every((row) => selectedVariantIds.includes(row.variant.id))
                          }
                          onChange={(event) => {
                            const ids = filteredRows
                              .filter((row) => !row.activeBarcode)
                              .map((row) => row.variant.id);
                            setSelectedVariantIds((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, ...ids]))
                                : current.filter((id) => !ids.includes(id)),
                            );
                          }}
                          type="checkbox"
                        />
                      </th>
                      <th>SKU / Variant</th>
                      <th>Barcode</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.variant.id}>
                        <td className={styles.checkboxCell}>
                          <input
                            aria-label={`Select ${row.variant.sku}`}
                            checked={selectedVariantIds.includes(row.variant.id)}
                            disabled={Boolean(row.activeBarcode)}
                            onChange={(event) =>
                              setSelectedVariantIds((current) =>
                                event.target.checked
                                  ? [...current, row.variant.id]
                                  : current.filter((id) => id !== row.variant.id),
                              )
                            }
                            type="checkbox"
                          />
                        </td>
                        <td>
                          <div className={styles.variantIdentity}>
                            <span className={styles.variantGlyph} aria-hidden="true">
                              {row.variant.sku.slice(-2).toUpperCase()}
                            </span>
                            <span>
                              <strong>{row.variant.sku}</strong>
                              <small>Sellable variant</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          {row.activeBarcode ? (
                            <span className={styles.barcodeValue}>{row.activeBarcode.value}</span>
                          ) : (
                            <span className={styles.mutedDash}>—</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`${styles.statusPill} ${row.activeBarcode ? styles.statusAssigned : styles.statusMissing}`}
                          >
                            {row.activeBarcode ? "Assigned" : "No barcode"}
                          </span>
                        </td>
                        <td>{formatRelative(row.activeBarcode?.updatedAt ?? row.variant.updatedAt)}</td>
                        <td>
                          {row.activeBarcode && canUpdate ? (
                            <button
                              aria-label={`Deactivate ${row.activeBarcode.value}`}
                              className={styles.rowAction}
                              onClick={() => void changeStatus(row.activeBarcode!)}
                              title="Deactivate barcode"
                              type="button"
                            >
                              <MoreHorizontal size={17} />
                            </button>
                          ) : (
                            <span className={styles.rowActionPlaceholder} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <footer className={styles.tableFooter}>
                <span>
                  {missingCount
                    ? `${missingCount} variant${missingCount === 1 ? "" : "s"} need barcode identification.`
                    : "Every variant in this product has an active barcode."}
                </span>
                <Link
                  aria-disabled={!canCreate || selectedMissingCount === 0}
                  className={`${styles.primaryButton} ${!canCreate || selectedMissingCount === 0 ? styles.disabledLink : ""}`}
                  href={
                    canCreate && selectedMissingCount > 0
                      ? `/catalog/barcodes/generate?productId=${encodeURIComponent(selectedProductId)}&variantIds=${encodeURIComponent(selectedVariantIds.join(","))}`
                      : "/catalog/barcodes"
                  }
                >
                  Generate Selected ({selectedMissingCount})
                </Link>
              </footer>
            </>
          )}
        </section>
      </section>

      <section className={styles.workflowStrip} aria-label="Barcode workflow guidance">
        <WorkflowItem icon={<Barcode size={17} />} title="One active barcode per variant" text="Backend uniqueness rules prevent duplicate active identity." />
        <WorkflowItem icon={<ScanBarcode size={17} />} title="Fast scanner lookup" text="A scan resolves the real product variant through the API." />
        <WorkflowItem icon={<Boxes size={17} />} title="Inventory ready" text="The same identity can be used when receiving and selling stock." />
      </section>

      {scanOpen ? (
        <ScanDialog
          onClose={() => {
            setScanOpen(false);
            setScanResult(null);
          }}
          onError={setError}
          result={scanResult}
          setResult={setScanResult}
        />
      ) : null}
    </main>
  );
}

function MetricCard({
  icon,
  label,
  meta,
  tone = "default",
  value,
}: {
  icon: React.ReactNode;
  label: string;
  meta: string;
  tone?: "attention" | "default" | "success";
  value: string;
}) {
  return (
    <article className={styles.metricCard}>
      <span className={`${styles.metricIcon} ${styles[`metricIcon_${tone}`]}`}>{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small className={tone === "attention" ? styles.attentionText : tone === "success" ? styles.successText : ""}>{meta}</small>
      </div>
    </article>
  );
}

function WorkflowItem({
  icon,
  text,
  title,
}: {
  icon: React.ReactNode;
  text: string;
  title: string;
}) {
  return (
    <article>
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
    </article>
  );
}

function ScanDialog({
  onClose,
  onError,
  result,
  setResult,
}: {
  onClose: () => void;
  onError: (message: string) => void;
  result: BarcodeLookupContract | null;
  setResult: (result: BarcodeLookupContract | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const value = formData.get("barcode");
    if (typeof value !== "string" || !value.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      setResult((await client.lookupBarcode(value.trim())).data);
    } catch (caught) {
      onError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="scan-title"
        aria-modal="true"
        className={styles.dialog}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <p className={styles.eyebrow}>Scanner lookup</p>
            <h2 id="scan-title">Scan or enter a barcode</h2>
            <p>Use a connected keyboard-style scanner or type the value manually.</p>
          </div>
          <button aria-label="Close scan dialog" className={styles.iconButton} onClick={onClose} type="button">
            <X size={17} />
          </button>
        </header>
        <form className={styles.scanForm} onSubmit={(event) => void submit(event)}>
          <label>
            <ScanBarcode aria-hidden="true" size={18} />
            <span className="sr-only">Barcode value</span>
            <input autoFocus autoComplete="off" name="barcode" placeholder="Scan barcode…" required />
          </label>
          <button className={styles.primaryButton} disabled={loading} type="submit">
            {loading ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
            Look up
          </button>
        </form>
        {result ? (
          <div className={styles.scanResult}>
            <span className={styles.scanSuccessIcon}><Check size={18} /></span>
            <div>
              <strong>{result.productName}</strong>
              <p>{result.sku}</p>
              <span>{result.color} · {result.size}</span>
            </div>
          </div>
        ) : (
          <div className={styles.scanHint}>Scanner input submits automatically when Enter is sent.</div>
        )}
      </section>
    </div>
  );
}

function RailLoading() {
  return (
    <div className={styles.railLoading}>
      <LoaderCircle className={styles.spin} size={19} />
      Loading products…
    </div>
  );
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function formatRelative(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function messageFor(error: unknown) {
  return error instanceof AdminApiError
    ? `${error.message} Request ID: ${error.requestId}`
    : "Something went wrong. Please try again.";
}
