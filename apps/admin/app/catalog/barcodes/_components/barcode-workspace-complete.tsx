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
  ArchiveRestore,
  Barcode,
  Boxes,
  Check,
  ChevronRight,
  Download,
  LoaderCircle,
  PackageSearch,
  RefreshCw,
  ScanBarcode,
  Search,
  ShieldAlert,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import styles from "./barcode-management.module.css";
import edge from "./barcode-edge-states.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type VariantRow = {
  activeBarcode: VariantBarcodeContract | null;
  inactiveBarcodes: VariantBarcodeContract[];
  variant: ProductVariantContract;
};

type BarcodeFilter = "all" | "assigned" | "missing";

type PendingAction = {
  barcode: VariantBarcodeContract;
  mode: "deactivate" | "reactivate";
  sku: string;
  variantId: string;
};

type ScanState =
  | { kind: "idle" }
  | { kind: "found"; result: BarcodeLookupContract; value: string }
  | { kind: "not-found"; value: string }
  | { kind: "error"; message: string; value: string };

export function BarcodeWorkspaceComplete({
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
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [changingStatus, setChangingStatus] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setError("");
    try {
      const result = await client.listProducts();
      const availableProducts = result.data.filter(
        (product) => product.status !== "ARCHIVED",
      );
      setProducts(availableProducts);
      setSelectedProductId((current) =>
        current && availableProducts.some((item) => item.id === current)
          ? current
          : (availableProducts[0]?.id ?? ""),
      );
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
      setSelectedVariantIds([]);
      return;
    }
    setLoadingProduct(true);
    setError("");
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
          inactiveBarcodes: barcodes
            .filter((barcode) => barcode.status === "INACTIVE")
            .sort(
              (left, right) =>
                Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
            ),
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
    (row) => selectedVariantIds.includes(row.variant.id) && !row.activeBarcode,
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

  function requestRowAction(row: VariantRow) {
    if (!canUpdate) return;
    if (row.activeBarcode) {
      setPendingAction({
        barcode: row.activeBarcode,
        mode: "deactivate",
        sku: row.variant.sku,
        variantId: row.variant.id,
      });
      return;
    }
    const previous = row.inactiveBarcodes[0];
    if (previous) {
      setPendingAction({
        barcode: previous,
        mode: "reactivate",
        sku: row.variant.sku,
        variantId: row.variant.id,
      });
    }
  }

  async function confirmStatusChange() {
    if (!pendingAction || changingStatus) return;
    setChangingStatus(true);
    setError("");
    setNotice("");
    try {
      if (pendingAction.mode === "reactivate") {
        const latest = (
          await client.listVariantBarcodes(pendingAction.variantId)
        ).data;
        const currentActive = latest.find(
          (barcode) => barcode.status === "ACTIVE",
        );
        if (currentActive) {
          setPendingAction(null);
          setError(
            `This variant already has active barcode ${currentActive.value}. Refresh before changing barcode identity.`,
          );
          await loadSelectedProduct(selectedProductId);
          return;
        }
      }

      const nextStatus =
        pendingAction.mode === "deactivate" ? "INACTIVE" : "ACTIVE";
      await client.updateBarcodeStatus({
        barcodeId: pendingAction.barcode.id,
        status: nextStatus,
      });
      setNotice(
        pendingAction.mode === "deactivate"
          ? `${pendingAction.barcode.value} was deactivated. The variant can now receive a new barcode or restore this previous one.`
          : `${pendingAction.barcode.value} was restored as the active barcode for ${pendingAction.sku}.`,
      );
      setPendingAction(null);
      await loadSelectedProduct(selectedProductId);
    } catch (caught) {
      const suffix =
        pendingAction.mode === "reactivate"
          ? " The backend may have detected another active barcode or a concurrent change."
          : "";
      setError(`${messageFor(caught)}${suffix}`);
    } finally {
      setChangingStatus(false);
    }
  }

  function exportCurrentProduct() {
    if (!details) return;
    const header = [
      "Product",
      "Product Code",
      "SKU",
      "Active Barcode",
      "Barcode Type",
      "Previous Barcode Count",
      "Status",
    ];
    const lines = rows.map((row) => [
      details.product.name,
      details.product.productCode,
      row.variant.sku,
      row.activeBarcode?.value ?? "",
      row.activeBarcode?.type ?? "",
      String(row.inactiveBarcodes.length),
      row.activeBarcode ? "Assigned" : "No active barcode",
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
          <p>
            Assign, verify and prepare scan codes for real product variants.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryButton}
            onClick={() => setScanOpen(true)}
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
        <Feedback tone="error" onClose={() => setError("")}>
          {error}
        </Feedback>
      ) : null}
      {notice ? (
        <Feedback tone="success" onClose={() => setNotice("")}>
          {notice}
        </Feedback>
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
          meta={
            rows.length
              ? `${Math.round((assignedCount / rows.length) * 100)}% ready`
              : "No variants"
          }
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
              <RefreshCw
                className={loadingProducts ? styles.spin : ""}
                size={15}
              />
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
                onChange={(event) =>
                  setFilter(event.target.value as BarcodeFilter)
                }
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
              <Link href={`/catalog/products/${details.product.id}`}>
                Open product
              </Link>
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
                            filteredRows.filter((row) => !row.activeBarcode)
                              .length > 0 &&
                            filteredRows
                              .filter((row) => !row.activeBarcode)
                              .every((row) =>
                                selectedVariantIds.includes(row.variant.id),
                              )
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
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const previousBarcode = row.inactiveBarcodes[0] ?? null;
                      return (
                        <tr key={row.variant.id}>
                          <td className={styles.checkboxCell}>
                            <input
                              aria-label={`Select ${row.variant.sku}`}
                              checked={selectedVariantIds.includes(
                                row.variant.id,
                              )}
                              disabled={Boolean(row.activeBarcode)}
                              onChange={(event) =>
                                setSelectedVariantIds((current) =>
                                  event.target.checked
                                    ? [...current, row.variant.id]
                                    : current.filter(
                                        (id) => id !== row.variant.id,
                                      ),
                                )
                              }
                              type="checkbox"
                            />
                          </td>
                          <td>
                            <div className={styles.variantIdentity}>
                              <span
                                className={styles.variantGlyph}
                                aria-hidden="true"
                              >
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
                              <span className={styles.barcodeValue}>
                                {row.activeBarcode.value}
                              </span>
                            ) : previousBarcode ? (
                              <span className={edge.previousBarcode}>
                                <span>—</span>
                                <small>Previous: {previousBarcode.value}</small>
                              </span>
                            ) : (
                              <span className={styles.mutedDash}>—</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`${styles.statusPill} ${row.activeBarcode ? styles.statusAssigned : styles.statusMissing}`}
                            >
                              {row.activeBarcode
                                ? "Assigned"
                                : previousBarcode
                                  ? "Inactive barcode"
                                  : "No barcode"}
                            </span>
                          </td>
                          <td>
                            {formatRelative(
                              row.activeBarcode?.updatedAt ??
                                previousBarcode?.updatedAt ??
                                row.variant.updatedAt,
                            )}
                          </td>
                          <td>
                            {canUpdate &&
                            (row.activeBarcode || previousBarcode) ? (
                              <button
                                aria-label={
                                  row.activeBarcode
                                    ? `Deactivate ${row.activeBarcode.value}`
                                    : `Reactivate ${previousBarcode!.value}`
                                }
                                className={`${styles.rowAction} ${edge.intentAction}`}
                                onClick={() => requestRowAction(row)}
                                title={
                                  row.activeBarcode
                                    ? "Deactivate barcode"
                                    : "Reactivate previous barcode"
                                }
                                type="button"
                              >
                                {row.activeBarcode ? (
                                  <ShieldAlert size={16} />
                                ) : (
                                  <ArchiveRestore size={16} />
                                )}
                              </button>
                            ) : (
                              <span className={styles.rowActionPlaceholder} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <footer className={styles.tableFooter}>
                <span>
                  {missingCount
                    ? `${missingCount} variant${missingCount === 1 ? "" : "s"} need an active barcode.`
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

      <section
        className={styles.workflowStrip}
        aria-label="Barcode workflow guidance"
      >
        <WorkflowItem
          icon={<Barcode size={17} />}
          title="One active barcode per variant"
          text="Backend uniqueness rules prevent duplicate active identity."
        />
        <WorkflowItem
          icon={<ScanBarcode size={17} />}
          title="Fast scanner lookup"
          text="A scan resolves the real product variant through the API."
        />
        <WorkflowItem
          icon={<Undo2 size={17} />}
          title="Safe identity recovery"
          text="Inactive barcode history can be restored only when no other active identity exists."
        />
      </section>

      {scanOpen ? <ScanDialog onClose={() => setScanOpen(false)} /> : null}
      {pendingAction ? (
        <BarcodeStatusDialog
          action={pendingAction}
          busy={changingStatus}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void confirmStatusChange()}
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
  icon: ReactNode;
  label: string;
  meta: string;
  tone?: "attention" | "default" | "success";
  value: string;
}) {
  return (
    <article className={styles.metricCard}>
      <span className={`${styles.metricIcon} ${styles[`metricIcon_${tone}`]}`}>
        {icon}
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small
          className={
            tone === "attention"
              ? styles.attentionText
              : tone === "success"
                ? styles.successText
                : ""
          }
        >
          {meta}
        </small>
      </div>
    </article>
  );
}

function WorkflowItem({
  icon,
  text,
  title,
}: {
  icon: ReactNode;
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

function Feedback({
  children,
  onClose,
  tone,
}: {
  children: ReactNode;
  onClose: () => void;
  tone: "error" | "success";
}) {
  return (
    <div
      className={`${styles.feedback} ${tone === "error" ? styles.feedbackError : ""}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" ? (
        <AlertTriangle aria-hidden="true" size={16} />
      ) : (
        <Check aria-hidden="true" size={16} />
      )}
      <span>{children}</span>
      <button aria-label="Dismiss message" onClick={onClose} type="button">
        <X size={15} />
      </button>
    </div>
  );
}

function BarcodeStatusDialog({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: PendingAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const deactivate = action.mode === "deactivate";
  return (
    <div className={edge.backdrop} role="presentation" onMouseDown={onCancel}>
      <section
        aria-labelledby="barcode-action-title"
        aria-modal="true"
        className={edge.confirmDialog}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <span
          className={`${edge.confirmIcon} ${deactivate ? edge.confirmIconDanger : edge.confirmIconRestore}`}
        >
          {deactivate ? (
            <ShieldAlert size={22} />
          ) : (
            <ArchiveRestore size={22} />
          )}
        </span>
        <p className={styles.eyebrow}>
          {deactivate ? "Barcode identity change" : "Restore barcode identity"}
        </p>
        <h2 id="barcode-action-title">
          {deactivate ? "Deactivate this barcode?" : "Reactivate this barcode?"}
        </h2>
        <p>
          {deactivate
            ? "The barcode stops resolving as the active identity for this variant. Historical barcode data is kept, and inventory quantities are not changed."
            : "SENVO will first verify that this variant still has no active barcode. The backend uniqueness rule remains authoritative."}
        </p>
        <dl className={edge.actionFacts}>
          <div>
            <dt>SKU</dt>
            <dd>{action.sku}</dd>
          </div>
          <div>
            <dt>Barcode</dt>
            <dd>{action.barcode.value}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{action.barcode.type}</dd>
          </div>
        </dl>
        {deactivate ? (
          <div className={edge.safetyNote}>
            <AlertTriangle size={16} />
            <span>
              Existing printed labels with this value should no longer be used
              for new scans after deactivation.
            </span>
          </div>
        ) : null}
        <div className={edge.dialogActions}>
          <button
            className={styles.secondaryButton}
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className={deactivate ? edge.dangerButton : edge.restoreButton}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? <LoaderCircle className={styles.spin} size={16} /> : null}
            {deactivate ? "Deactivate barcode" : "Reactivate barcode"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ScanDialog({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [scanState, setScanState] = useState<ScanState>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const raw = formData.get("barcode");
    if (typeof raw !== "string" || !raw.trim()) return;
    const value = raw.trim();
    setLoading(true);
    setScanState({ kind: "idle" });
    try {
      const result = (await client.lookupBarcode(value)).data;
      setScanState({ kind: "found", result, value });
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 404) {
        setScanState({ kind: "not-found", value });
      } else {
        setScanState({
          kind: "error",
          message: messageFor(caught),
          value,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={styles.dialogBackdrop}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        aria-labelledby="scan-title"
        aria-modal="true"
        className={`${styles.dialog} ${edge.scanDialog}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <p className={styles.eyebrow}>Scanner lookup</p>
            <h2 id="scan-title">Scan or enter a barcode</h2>
            <p>
              A keyboard-style USB/Bluetooth scanner can type directly into this
              field and submit with Enter.
            </p>
          </div>
          <button
            aria-label="Close scan dialog"
            className={styles.iconButton}
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>

        <form
          className={styles.scanForm}
          onSubmit={(event) => void submit(event)}
        >
          <label>
            <ScanBarcode aria-hidden="true" size={18} />
            <span className="sr-only">Barcode value</span>
            <input
              autoFocus
              autoComplete="off"
              name="barcode"
              placeholder="Scan barcode…"
              required
            />
          </label>
          <button
            className={styles.primaryButton}
            disabled={loading}
            type="submit"
          >
            {loading ? (
              <LoaderCircle className={styles.spin} size={16} />
            ) : (
              <Search size={16} />
            )}
            Look up
          </button>
        </form>

        {scanState.kind === "idle" ? (
          <div className={edge.scanIdle}>
            <ScanBarcode size={18} />
            <span>
              SENVO looks up the active barcode only. Inactive historical values
              are intentionally not treated as sellable scan identity.
            </span>
          </div>
        ) : null}

        {scanState.kind === "found" ? (
          <div className={`${edge.scanState} ${edge.scanFound}`}>
            <span className={edge.scanStateIcon}>
              <Check size={20} />
            </span>
            <div>
              <p className={edge.scanStateLabel}>Active barcode found</p>
              <strong>{scanState.result.productName}</strong>
              <span>{scanState.result.sku}</span>
              <small>
                {scanState.result.color} · {scanState.result.size}
              </small>
              <code>{scanState.value}</code>
            </div>
          </div>
        ) : null}

        {scanState.kind === "not-found" ? (
          <div className={`${edge.scanState} ${edge.scanNotFound}`}>
            <span className={edge.scanStateIcon}>
              <PackageSearch size={20} />
            </span>
            <div>
              <p className={edge.scanStateLabel}>No active barcode matched</p>
              <strong>{scanState.value}</strong>
              <span>
                Check the label, confirm the scanner sent the full value, or
                generate/restore a barcode for the intended variant.
              </span>
            </div>
          </div>
        ) : null}

        {scanState.kind === "error" ? (
          <div className={`${edge.scanState} ${edge.scanFailed}`} role="alert">
            <span className={edge.scanStateIcon}>
              <AlertTriangle size={20} />
            </span>
            <div>
              <p className={edge.scanStateLabel}>Lookup could not complete</p>
              <strong>{scanState.value}</strong>
              <span>{scanState.message}</span>
            </div>
          </div>
        ) : null}
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
