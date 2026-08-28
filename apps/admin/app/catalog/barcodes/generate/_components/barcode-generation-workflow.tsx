"use client";

import type {
  BarcodeType,
  ColorContract,
  ProductContract,
  ProductDetailsContract,
  ProductVariantContract,
  SizeContract,
  VariantBarcodeContract,
} from "@senvo/contracts";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Barcode,
  Check,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  PackageSearch,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import styles from "./barcode-generation.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const BARCODE_TYPE: BarcodeType = "CODE128";

type Step = 1 | 2 | 3;

type VariantBarcodeState = {
  activeBarcode: VariantBarcodeContract | null;
  inactiveBarcodes: VariantBarcodeContract[];
  variant: ProductVariantContract;
};

type GeneratedBarcode = {
  barcode: VariantBarcodeContract;
  colorName: string;
  sizeName: string;
  variant: ProductVariantContract;
};

type CandidateBarcode = {
  colorName: string;
  sizeName: string;
  value: string;
  variant: ProductVariantContract;
};

type LabelSize = "40x30" | "50x30" | "50x40";

type PrintSettings = {
  copies: number;
  labelSize: LabelSize;
  showProduct: boolean;
  showSku: boolean;
};

export function BarcodeGenerationWorkflow({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const searchParams = useSearchParams();
  const requestedProductId = searchParams.get("productId") ?? "";
  const requestedVariantIds = useMemo(
    () =>
      (searchParams.get("variantIds") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [searchParams],
  );

  const canCreate = permissions.includes("CATALOG:CREATE");
  const canRead = permissions.includes("CATALOG:READ");

  const [step, setStep] = useState<Step>(1);
  const [products, setProducts] = useState<ProductContract[]>([]);
  const [colors, setColors] = useState<ColorContract[]>([]);
  const [sizes, setSizes] = useState<SizeContract[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [details, setDetails] = useState<ProductDetailsContract | null>(null);
  const [rows, setRows] = useState<VariantBarcodeState[]>([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<CandidateBarcode[]>([]);
  const [generated, setGenerated] = useState<GeneratedBarcode[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [printSettings, setPrintSettings] = useState<PrintSettings>({
    copies: 1,
    labelSize: "40x30",
    showProduct: true,
    showSku: true,
  });

  const colorNames = useMemo(
    () => new Map(colors.map((color) => [color.id, color.name])),
    [colors],
  );
  const sizeNames = useMemo(
    () => new Map(sizes.map((size) => [size.id, size.name])),
    [sizes],
  );

  const loadFoundation = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [productResult, colorResult, sizeResult] = await Promise.all([
        client.listProducts(),
        client.listColors(),
        client.listSizes(),
      ]);
      const activeProducts = productResult.data.filter(
        (product) => product.status !== "ARCHIVED",
      );
      setProducts(activeProducts);
      setColors(colorResult.data);
      setSizes(sizeResult.data);
      setSelectedProductId((current) => {
        if (current) return current;
        if (
          requestedProductId &&
          activeProducts.some((product) => product.id === requestedProductId)
        ) {
          return requestedProductId;
        }
        return activeProducts[0]?.id ?? "";
      });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [requestedProductId]);

  const loadProduct = useCallback(
    async (productId: string) => {
      if (!productId) {
        setDetails(null);
        setRows([]);
        setSelectedVariantIds([]);
        return;
      }
      setLoadingProduct(true);
      setError("");
      setNotice("");
      setStep(1);
      setGenerated([]);
      setCandidates([]);
      try {
        const productDetails = (await client.getProduct(productId)).data;
        const barcodeSets = await Promise.all(
          productDetails.variants.map(async (variant) => ({
            barcodes: (await client.listVariantBarcodes(variant.id)).data,
            variant,
          })),
        );
        const nextRows = barcodeSets.map(({ barcodes, variant }) => ({
          activeBarcode:
            barcodes.find((barcode) => barcode.status === "ACTIVE") ?? null,
          inactiveBarcodes: barcodes.filter(
            (barcode) => barcode.status === "INACTIVE",
          ),
          variant,
        }));
        const selectable = nextRows.filter((row) => !row.activeBarcode);
        const requested = new Set(requestedVariantIds);
        const requestedSelection = selectable
          .filter((row) => requested.has(row.variant.id))
          .map((row) => row.variant.id);

        setDetails(productDetails);
        setRows(nextRows);
        setSelectedVariantIds(
          requestedSelection.length
            ? requestedSelection
            : selectable.map((row) => row.variant.id),
        );
      } catch (caught) {
        setError(messageFor(caught));
      } finally {
        setLoadingProduct(false);
      }
    },
    [requestedVariantIds],
  );

  useEffect(() => {
    void loadFoundation();
  }, [loadFoundation]);

  useEffect(() => {
    if (selectedProductId) void loadProduct(selectedProductId);
  }, [loadProduct, selectedProductId]);

  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  );

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => {
      const color = colorNames.get(row.variant.colorId) ?? "";
      const size = sizeNames.get(row.variant.sizeId) ?? "";
      return `${row.variant.sku} ${color} ${size}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [colorNames, query, rows, sizeNames]);

  const selectableRows = rows.filter((row) => !row.activeBarcode);
  const selectedRows = rows.filter(
    (row) =>
      !row.activeBarcode && selectedVariantIds.includes(row.variant.id),
  );

  function continueToReview() {
    if (!selectedRows.length) return;
    const nextCandidates = selectedRows.map((row) => ({
      colorName: colorNames.get(row.variant.colorId) ?? "Color",
      sizeName: sizeNames.get(row.variant.sizeId) ?? "Size",
      value: generateCode128Value(),
      variant: row.variant,
    }));
    setCandidates(nextCandidates);
    setStep(2);
    setError("");
    setNotice("");
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  async function generateBarcodes() {
    if (!candidates.length || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const completed: GeneratedBarcode[] = [];

    try {
      for (const candidate of candidates) {
        const barcode = await createBarcodeWithConflictRetry(
          candidate.variant.id,
          candidate.value,
        );
        completed.push({
          barcode,
          colorName: candidate.colorName,
          sizeName: candidate.sizeName,
          variant: candidate.variant,
        });
      }
      setGenerated(completed);
      setStep(3);
      setNotice(
        `${completed.length} barcode${completed.length === 1 ? "" : "s"} created successfully.`,
      );
      window.scrollTo({ behavior: "smooth", top: 0 });
    } catch (caught) {
      if (completed.length) {
        setGenerated(completed);
        setNotice(
          `${completed.length} barcode${completed.length === 1 ? "" : "s"} were created before the operation stopped.`,
        );
      }
      setError(
        `${messageFor(caught)} No completed barcode was rolled back; refresh the product before retrying.`,
      );
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <StatePanel
        icon={<Barcode size={28} />}
        title="Catalog access is restricted"
        text="Your role does not have permission to view barcode operations."
      />
    );
  }

  if (!canCreate) {
    return (
      <StatePanel
        icon={<ShieldCheck size={28} />}
        title="Barcode creation requires permission"
        text="You can review existing barcodes, but your role cannot create new ones."
      />
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <Link className={styles.backLink} href="/catalog/barcodes">
            <ArrowLeft aria-hidden="true" size={14} />
            Barcode Management
          </Link>
          <p className={styles.eyebrow}>Guided barcode setup</p>
          <h1>Generate Barcodes</h1>
          <p>
            Identify product variants once, then print labels ready for stock
            receiving and POS scanning.
          </p>
        </div>
        <div className={styles.headerMeta}>
          <ShieldCheck aria-hidden="true" size={17} />
          <span>Backend uniqueness enforced</span>
        </div>
      </header>

      <StepRail step={step} />

      {error ? (
        <Feedback message={error} onClose={() => setError("")} tone="error" />
      ) : null}
      {notice ? (
        <Feedback message={notice} onClose={() => setNotice("")} tone="success" />
      ) : null}

      {loading ? (
        <LoadingPanel text="Loading catalog and barcode settings…" />
      ) : products.length === 0 ? (
        <StatePanel
          icon={<PackageSearch size={28} />}
          title="Create a product first"
          text="Barcodes belong to product variants. Add a catalog product and its variants before generating labels."
          action={<Link href="/catalog/products/new">Add Product</Link>}
        />
      ) : step === 1 ? (
        <SelectStep
          colorNames={colorNames}
          filteredRows={filteredRows}
          loadingProduct={loadingProduct}
          onContinue={continueToReview}
          products={products}
          query={query}
          selectedProductId={selectedProductId}
          selectedVariantIds={selectedVariantIds}
          setQuery={setQuery}
          setSelectedProductId={setSelectedProductId}
          setSelectedVariantIds={setSelectedVariantIds}
          sizeNames={sizeNames}
        />
      ) : step === 2 ? (
        <ReviewStep
          candidates={candidates}
          onBack={() => setStep(1)}
          onGenerate={() => void generateBarcodes()}
          product={selectedProduct ?? null}
          saving={saving}
        />
      ) : (
        <PrintStep
          generated={generated}
          onBack={() => setStep(2)}
          product={selectedProduct ?? null}
          settings={printSettings}
          setSettings={setPrintSettings}
        />
      )}

      <section className={styles.guidance} aria-label="Barcode workflow principles">
        <GuidanceItem
          icon={<Barcode size={18} />}
          title="One active identity"
          text="The database prevents more than one active barcode per variant."
        />
        <GuidanceItem
          icon={<Sparkles size={18} />}
          title="Collision-safe generation"
          text="SENVO retries a generated CODE128 value only when the backend reports a conflict."
        />
        <GuidanceItem
          icon={<Printer size={18} />}
          title="Print without changing stock"
          text="Printing labels never mutates inventory quantities or movement history."
        />
      </section>
    </main>
  );
}

function StepRail({ step }: { step: Step }) {
  const steps = [
    [1, "Select Variants"],
    [2, "Review & Confirm"],
    [3, "Print Labels"],
  ] as const;
  return (
    <nav aria-label="Barcode generation progress" className={styles.stepRail}>
      {steps.map(([number, label], index) => {
        const complete = number < step;
        const active = number === step;
        return (
          <div className={styles.stepGroup} key={number}>
            <span
              aria-current={active ? "step" : undefined}
              className={`${styles.step} ${active ? styles.stepActive : ""} ${complete ? styles.stepComplete : ""}`}
            >
              <span className={styles.stepNumber}>
                {complete ? <Check size={14} /> : number}
              </span>
              <span>{label}</span>
            </span>
            {index < steps.length - 1 ? (
              <span className={styles.stepConnector} aria-hidden="true" />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function SelectStep({
  colorNames,
  filteredRows,
  loadingProduct,
  onContinue,
  products,
  query,
  selectedProductId,
  selectedVariantIds,
  setQuery,
  setSelectedProductId,
  setSelectedVariantIds,
  sizeNames,
}: {
  colorNames: Map<string, string>;
  filteredRows: VariantBarcodeState[];
  loadingProduct: boolean;
  onContinue: () => void;
  products: ProductContract[];
  query: string;
  selectedProductId: string;
  selectedVariantIds: string[];
  setQuery: (value: string) => void;
  setSelectedProductId: (value: string) => void;
  setSelectedVariantIds: React.Dispatch<React.SetStateAction<string[]>>;
  sizeNames: Map<string, string>;
}) {
  const selectableVisible = filteredRows.filter((row) => !row.activeBarcode);
  const selectedVisibleCount = selectableVisible.filter((row) =>
    selectedVariantIds.includes(row.variant.id),
  ).length;
  const allSelectableChecked =
    selectableVisible.length > 0 &&
    selectedVisibleCount === selectableVisible.length;

  return (
    <section className={styles.workflowCard}>
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Step 1</p>
          <h2>Select variants</h2>
          <p>
            Variants with an active barcode are protected from accidental
            duplication.
          </p>
        </div>
        <label className={styles.productSelect}>
          <span>Product</span>
          <span className={styles.selectShell}>
            <select
              onChange={(event) => setSelectedProductId(event.target.value)}
              value={selectedProductId}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {product.productCode}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" size={15} />
          </span>
        </label>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Filter variants</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search SKU, color or size…"
            value={query}
          />
        </label>
        <span className={styles.selectionCount}>
          {selectedVariantIds.length} selected
        </span>
      </div>

      {loadingProduct ? (
        <LoadingPanel compact text="Checking existing barcodes…" />
      ) : filteredRows.length === 0 ? (
        <StatePanel
          compact
          icon={<PackageSearch size={24} />}
          title="No matching variants"
          text="Try a different search, or add variants from the product page."
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkboxCell}>
                  <input
                    aria-label="Select all visible variants without an active barcode"
                    checked={allSelectableChecked}
                    disabled={!selectableVisible.length}
                    onChange={(event) => {
                      const visibleIds = selectableVisible.map(
                        (row) => row.variant.id,
                      );
                      setSelectedVariantIds((current) =>
                        event.target.checked
                          ? Array.from(new Set([...current, ...visibleIds]))
                          : current.filter((id) => !visibleIds.includes(id)),
                      );
                    }}
                    type="checkbox"
                  />
                </th>
                <th>Variant</th>
                <th>SKU</th>
                <th>Current barcode</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const color = colorNames.get(row.variant.colorId) ?? "Color";
                const size = sizeNames.get(row.variant.sizeId) ?? "Size";
                const selected = selectedVariantIds.includes(row.variant.id);
                return (
                  <tr key={row.variant.id}>
                    <td className={styles.checkboxCell}>
                      <input
                        aria-label={`Select ${row.variant.sku}`}
                        checked={selected}
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
                        <span className={styles.variantSwatch} aria-hidden="true">
                          {color.slice(0, 1)}
                        </span>
                        <span>
                          <strong>{color} / {size}</strong>
                          <small>
                            {row.inactiveBarcodes.length
                              ? `${row.inactiveBarcodes.length} inactive historical barcode${row.inactiveBarcodes.length === 1 ? "" : "s"}`
                              : "Sellable variant"}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td className={styles.mono}>{row.variant.sku}</td>
                    <td className={styles.mono}>
                      {row.activeBarcode?.value ?? "—"}
                    </td>
                    <td>
                      <span
                        className={`${styles.statusPill} ${row.activeBarcode ? styles.statusAssigned : styles.statusMissing}`}
                      >
                        {row.activeBarcode ? "Assigned" : "Needs barcode"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className={styles.workflowFooter}>
        <div>
          <strong>{selectedVariantIds.length} variant{selectedVariantIds.length === 1 ? "" : "s"} selected</strong>
          <span>Only unassigned variants can continue.</span>
        </div>
        <button
          className={styles.primaryButton}
          disabled={!selectedVariantIds.length || loadingProduct}
          onClick={onContinue}
          type="button"
        >
          Review Selection
          <ArrowRight aria-hidden="true" size={16} />
        </button>
      </footer>
    </section>
  );
}

function ReviewStep({
  candidates,
  onBack,
  onGenerate,
  product,
  saving,
}: {
  candidates: CandidateBarcode[];
  onBack: () => void;
  onGenerate: () => void;
  product: ProductContract | null;
  saving: boolean;
}) {
  return (
    <section className={styles.workflowCard}>
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Step 2</p>
          <h2>Review & confirm</h2>
          <p>
            SENVO will create one active CODE128 barcode for each selected
            variant.
          </p>
        </div>
        <span className={styles.reviewBadge}>
          <ShieldCheck size={15} />
          {candidates.length} new barcode{candidates.length === 1 ? "" : "s"}
        </span>
      </header>

      <div className={styles.reviewLayout}>
        <div className={styles.reviewList}>
          {candidates.map((candidate) => (
            <article className={styles.reviewRow} key={candidate.variant.id}>
              <div className={styles.reviewIdentity}>
                <span className={styles.variantSwatch} aria-hidden="true">
                  {candidate.colorName.slice(0, 1)}
                </span>
                <div>
                  <strong>{candidate.colorName} / {candidate.sizeName}</strong>
                  <small>{candidate.variant.sku}</small>
                </div>
              </div>
              <div className={styles.reviewBarcode}>
                <Code128Barcode value={candidate.value} />
                <span>{candidate.value}</span>
              </div>
            </article>
          ))}
        </div>

        <aside className={styles.reviewAside}>
          <span className={styles.reviewIcon}>
            <Sparkles size={20} />
          </span>
          <h3>Ready to create</h3>
          <p>
            These values are generated in the browser, but the database remains
            authoritative for global uniqueness and one-active-barcode rules.
          </p>
          <dl>
            <div><dt>Product</dt><dd>{product?.name ?? "Catalog product"}</dd></div>
            <div><dt>Barcode type</dt><dd>CODE128</dd></div>
            <div><dt>Selected</dt><dd>{candidates.length}</dd></div>
          </dl>
        </aside>
      </div>

      <footer className={styles.workflowFooter}>
        <button className={styles.secondaryButton} disabled={saving} onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={16} />
          Back
        </button>
        <button className={styles.primaryButton} disabled={saving || !candidates.length} onClick={onGenerate} type="button">
          {saving ? <LoaderCircle className={styles.spin} size={16} /> : <Barcode size={16} />}
          {saving ? "Creating…" : `Generate ${candidates.length} Barcode${candidates.length === 1 ? "" : "s"}`}
        </button>
      </footer>
    </section>
  );
}

function PrintStep({
  generated,
  onBack,
  product,
  settings,
  setSettings,
}: {
  generated: GeneratedBarcode[];
  onBack: () => void;
  product: ProductContract | null;
  settings: PrintSettings;
  setSettings: React.Dispatch<React.SetStateAction<PrintSettings>>;
}) {
  const repeated = useMemo(
    () =>
      generated.flatMap((item) =>
        Array.from({ length: settings.copies }, (_, index) => ({
          ...item,
          copyKey: `${item.barcode.id}-${index}`,
        })),
      ),
    [generated, settings.copies],
  );
  const labelDimensions = dimensionsFor(settings.labelSize);
  const printStyle = {
    "--label-height": `${labelDimensions.height}mm`,
    "--label-width": `${labelDimensions.width}mm`,
  } as CSSProperties;

  return (
    <section className={styles.workflowCard}>
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Step 3</p>
          <h2>Print labels</h2>
          <p>
            The barcodes are saved. Printing now is optional and does not change
            inventory or barcode state.
          </p>
        </div>
        <span className={`${styles.reviewBadge} ${styles.reviewBadgeSuccess}`}>
          <CheckCircle2 size={15} />
          {generated.length} saved
        </span>
      </header>

      {generated.length ? (
        <div className={styles.printLayout}>
          <div className={styles.previewPanel}>
            <div className={styles.previewToolbar}>
              <div>
                <strong>Label preview</strong>
                <span>{repeated.length} label{repeated.length === 1 ? "" : "s"} · A4 print sheet</span>
              </div>
            </div>
            <div className={styles.printArea} style={printStyle}>
              {repeated.map((item) => (
                <article className={styles.label} key={item.copyKey}>
                  {settings.showProduct ? (
                    <strong>{product?.name ?? "SENVO Wear"}</strong>
                  ) : null}
                  <span className={styles.labelVariant}>{item.colorName} / {item.sizeName}</span>
                  {settings.showSku ? <small>{item.variant.sku}</small> : null}
                  <Code128Barcode value={item.barcode.value} />
                  <span className={styles.labelValue}>{item.barcode.value}</span>
                </article>
              ))}
            </div>
          </div>

          <aside className={styles.printSettings}>
            <h3>Print settings</h3>
            <label>
              <span>Label size</span>
              <select
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    labelSize: event.target.value as LabelSize,
                  }))
                }
                value={settings.labelSize}
              >
                <option value="40x30">40mm × 30mm</option>
                <option value="50x30">50mm × 30mm</option>
                <option value="50x40">50mm × 40mm</option>
              </select>
            </label>
            <label>
              <span>Copies per variant</span>
              <input
                max={10}
                min={1}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    copies: clamp(Number(event.target.value) || 1, 1, 10),
                  }))
                }
                type="number"
                value={settings.copies}
              />
            </label>
            <label className={styles.checkLabel}>
              <input
                checked={settings.showProduct}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    showProduct: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Show product name</span>
            </label>
            <label className={styles.checkLabel}>
              <input
                checked={settings.showSku}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    showSku: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Show SKU</span>
            </label>
            <button className={styles.primaryButton} onClick={() => window.print()} type="button">
              <Printer aria-hidden="true" size={16} />
              Print {repeated.length} Label{repeated.length === 1 ? "" : "s"}
            </button>
            <p>
              Use 100% print scale for best scanner accuracy. Browser headers and
              footers should be disabled in the print dialog.
            </p>
          </aside>
        </div>
      ) : (
        <StatePanel
          compact
          icon={<AlertTriangle size={24} />}
          title="No completed barcodes to print"
          text="Return to review and finish barcode creation first."
        />
      )}

      <footer className={styles.workflowFooter}>
        <button className={styles.secondaryButton} onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={16} />
          Review
        </button>
        <div className={styles.footerActions}>
          <Link className={styles.secondaryButton} href="/catalog/barcodes">
            Done
          </Link>
          <Link className={styles.primaryButton} href="/inventory">
            Continue to Inventory
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </footer>
    </section>
  );
}

function Code128Barcode({ value }: { value: string }) {
  const encoded = useMemo(() => encodeCode128B(value), [value]);
  return (
    <svg
      aria-label={`CODE128 barcode ${value}`}
      className={styles.barcodeSvg}
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${encoded.width} 50`}
    >
      <rect fill="#fff" height="50" width={encoded.width} x="0" y="0" />
      {encoded.bars.map((bar, index) => (
        <rect
          fill="#111"
          height="46"
          key={`${bar.x}-${index}`}
          width={bar.width}
          x={bar.x}
          y="2"
        />
      ))}
    </svg>
  );
}

function Feedback({
  message,
  onClose,
  tone,
}: {
  message: string;
  onClose: () => void;
  tone: "error" | "success";
}) {
  return (
    <div
      className={`${styles.feedback} ${tone === "error" ? styles.feedbackError : styles.feedbackSuccess}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" ? <AlertTriangle size={16} /> : <Check size={16} />}
      <span>{message}</span>
      <button aria-label="Dismiss message" onClick={onClose} type="button">
        <X size={15} />
      </button>
    </div>
  );
}

function LoadingPanel({ compact = false, text }: { compact?: boolean; text: string }) {
  return (
    <div className={`${styles.loadingPanel} ${compact ? styles.loadingPanelCompact : ""}`}>
      <LoaderCircle className={styles.spin} size={21} />
      <span>{text}</span>
    </div>
  );
}

function StatePanel({
  action,
  compact = false,
  icon,
  text,
  title,
}: {
  action?: ReactNode;
  compact?: boolean;
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <section className={`${styles.statePanel} ${compact ? styles.statePanelCompact : ""}`}>
      <span className={styles.stateIcon}>{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action ? <div className={styles.stateAction}>{action}</div> : null}
    </section>
  );
}

function GuidanceItem({
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

async function createBarcodeWithConflictRetry(
  variantId: string,
  preferredValue: string,
): Promise<VariantBarcodeContract> {
  let value = preferredValue;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return (
        await client.createVariantBarcode({
          type: BARCODE_TYPE,
          value,
          variantId,
        })
      ).data;
    } catch (caught) {
      if (
        caught instanceof AdminApiError &&
        caught.category === "CONFLICT" &&
        attempt < 3
      ) {
        value = generateCode128Value();
        continue;
      }
      throw caught;
    }
  }
  throw new Error("Unable to generate a unique barcode.");
}

function generateCode128Value() {
  const time = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `SV-${time}-${random}`;
}

const code128Patterns = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112",
] as const;

function encodeCode128B(value: string) {
  const safeValue = Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join("");
  const codes = Array.from(safeValue).map(
    (character) => character.charCodeAt(0) - 32,
  );
  const startCode = 104;
  const checksum =
    (startCode + codes.reduce((sum, code, index) => sum + code * (index + 1), 0)) %
    103;
  const symbols = [startCode, ...codes, checksum, 106];
  const quiet = 10;
  const bars: { width: number; x: number }[] = [];
  let x = quiet;

  for (const symbol of symbols) {
    const pattern = code128Patterns[symbol];
    if (!pattern) continue;
    for (let index = 0; index < pattern.length; index += 1) {
      const width = Number(pattern[index]);
      if (index % 2 === 0) bars.push({ width, x });
      x += width;
    }
  }

  return { bars, width: x + quiet };
}

function dimensionsFor(size: LabelSize) {
  if (size === "50x30") return { height: 30, width: 50 };
  if (size === "50x40") return { height: 40, width: 50 };
  return { height: 30, width: 40 };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function messageFor(error: unknown) {
  return error instanceof AdminApiError
    ? `${error.message} Request ID: ${error.requestId}`
    : error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
}
