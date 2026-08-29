"use client";

import type {
  BarcodeLookupContract,
  ColorContract,
  InventoryMovementContract,
  ProductContract,
  ProductDetailsContract,
  ProductVariantContract,
  SizeContract,
  StockLocationReadContract,
} from "@senvo/contracts";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Barcode,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  LoaderCircle,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
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
import styles from "./receive-stock-workflow.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const MAX_QTY = 999_999;

type Step = 1 | 2 | 3 | 4;

type ReceiptLine = {
  color: string;
  productName: string;
  quantity: number;
  size: string;
  sku: string;
  variantId: string;
};

type DraftCreateInput = {
  destinationLocationId: string;
  idempotencyKey: string;
  lines: Array<{
    productVariantId: string;
    quantity: number;
  }>;
  movementNumber: string;
  note?: string | null;
  occurredAt: string;
  referenceType: string;
  sourceLocationId: null;
  type: "RECEIPT";
};

export function ReceiveStockWorkflow({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canReadInventory = permissions.includes("INVENTORY:READ");
  const canCreateInventory = permissions.includes("INVENTORY:CREATE");
  const canReadCatalog = permissions.includes("CATALOG:READ");

  const [step, setStep] = useState<Step>(1);
  const [locations, setLocations] = useState<StockLocationReadContract[]>([]);
  const [products, setProducts] = useState<ProductContract[]>([]);
  const [colors, setColors] = useState<ColorContract[]>([]);
  const [sizes, setSizes] = useState<SizeContract[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productDetails, setProductDetails] =
    useState<ProductDetailsContract | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [integrationPending, setIntegrationPending] = useState(false);
  const [draftMovement, setDraftMovement] =
    useState<InventoryMovementContract | null>(null);
  const [postedMovement, setPostedMovement] =
    useState<InventoryMovementContract | null>(null);
  const [receiptId, setReceiptId] = useState(() => crypto.randomUUID());

  const loadFoundation = useCallback(async () => {
    if (!canReadInventory) return;
    setLoading(true);
    setError("");
    try {
      const locationResult = await client.listStockLocations({ pageSize: 100 });
      const activeLocations = locationResult.data.items.filter(
        (location) => location.status === "ACTIVE",
      );
      setLocations(activeLocations);
      setSelectedLocationId(
        (current) => current || activeLocations[0]?.id || "",
      );

      if (canReadCatalog) {
        const [productResult, colorResult, sizeResult] = await Promise.all([
          client.listProducts(),
          client.listColors(),
          client.listSizes(),
        ]);
        setProducts(
          productResult.data.filter((product) => product.status !== "ARCHIVED"),
        );
        setColors(colorResult.data);
        setSizes(sizeResult.data);
      }
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [canReadCatalog, canReadInventory]);

  useEffect(() => {
    void loadFoundation();
  }, [loadFoundation]);

  useEffect(() => {
    if (!selectedProductId) {
      setProductDetails(null);
      return;
    }
    setLoadingProduct(true);
    setError("");
    void client
      .getProduct(selectedProductId)
      .then((result) => setProductDetails(result.data))
      .catch((caught) => setError(messageFor(caught)))
      .finally(() => setLoadingProduct(false));
  }, [selectedProductId]);

  const colorNames = useMemo(
    () => new Map(colors.map((color) => [color.id, color.name])),
    [colors],
  );
  const sizeNames = useMemo(
    () => new Map(sizes.map((size) => [size.id, size.name])),
    [sizes],
  );
  const selectedLocation = locations.find(
    (location) => location.id === selectedLocationId,
  );
  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) return products.slice(0, 12);
    return products
      .filter((product) =>
        `${product.name} ${product.productCode}`.toLowerCase().includes(query),
      )
      .slice(0, 12);
  }, [productQuery, products]);
  const totalUnits = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  );

  if (!canReadInventory) {
    return (
      <StatePanel
        icon={<ShieldCheck size={28} />}
        title="Inventory access is restricted"
        text="Your role does not have permission to inspect inventory operations."
      />
    );
  }

  if (!canCreateInventory) {
    return (
      <StatePanel
        action={<Link href="/inventory">Back to inventory</Link>}
        icon={<ShieldCheck size={28} />}
        title="Receiving stock requires permission"
        text="Your role can view inventory, but it cannot create stock movements."
      />
    );
  }

  function addLine(line: Omit<ReceiptLine, "quantity">, quantity = 1) {
    setLines((current) => {
      const existing = current.find(
        (item) => item.variantId === line.variantId,
      );
      if (existing) {
        return current.map((item) =>
          item.variantId === line.variantId
            ? { ...item, quantity: clampQty(item.quantity + quantity) }
            : item,
        );
      }
      return [...current, { ...line, quantity: clampQty(quantity) }];
    });
    setNotice(
      `${line.productName} · ${line.color} / ${line.size} added to this receipt.`,
    );
  }

  function addVariant(variant: ProductVariantContract) {
    if (!productDetails) return;
    addLine({
      color: colorNames.get(variant.colorId) ?? "Color",
      productName: productDetails.product.name,
      size: sizeNames.get(variant.sizeId) ?? "Size",
      sku: variant.sku,
      variantId: variant.id,
    });
  }

  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = scanValue.trim();
    if (!value || scanning) return;
    setScanning(true);
    setError("");
    setNotice("");
    try {
      const result = (await client.lookupBarcode(value)).data;
      addLine(fromBarcode(result));
      setScanValue("");
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 404) {
        setError(
          `Barcode ${value} was not found. Check the label or choose the product manually.`,
        );
      } else {
        setError(messageFor(caught));
      }
    } finally {
      setScanning(false);
    }
  }

  function updateQuantity(variantId: string, quantity: number) {
    setLines((current) =>
      current.map((line) =>
        line.variantId === variantId
          ? { ...line, quantity: clampQty(quantity) }
          : line,
      ),
    );
  }

  function removeLine(variantId: string) {
    setLines((current) =>
      current.filter((line) => line.variantId !== variantId),
    );
  }

  async function confirmReceipt() {
    if (!selectedLocationId || lines.length === 0 || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    setIntegrationPending(false);

    try {
      let draft = draftMovement;
      if (!draft) {
        const payload: DraftCreateInput = {
          destinationLocationId: selectedLocationId,
          idempotencyKey: `admin-receive:${receiptId}`,
          lines: lines.map((line) => ({
            productVariantId: line.variantId,
            quantity: line.quantity,
          })),
          movementNumber: movementNumber(receiptId),
          note: note.trim() || null,
          occurredAt: new Date().toISOString(),
          referenceType: "ADMIN_RECEIPT",
          sourceLocationId: null,
          type: "RECEIPT",
        };
        try {
          draft = (
            await client.request<InventoryMovementContract>(
              "/inventory/movement-drafts",
              { body: payload, method: "POST" },
            )
          ).data;
        } catch (caught) {
          if (
            caught instanceof AdminApiError &&
            (caught.status === 404 || caught.status === 405)
          ) {
            setIntegrationPending(true);
            throw new Error(
              "The Receive Stock frontend is ready, but this environment has not wired the inventory draft-creation HTTP endpoint yet.",
            );
          }
          throw caught;
        }
        setDraftMovement(draft);
      }

      const posted = (
        await client.request<InventoryMovementContract>(
          "/inventory/movements",
          {
            body: { movementId: draft.id },
            method: "POST",
          },
        )
      ).data;
      setPostedMovement(posted);
      setStep(4);
      setNotice(
        `${totalUnits} units were received into ${selectedLocation?.name ?? "the selected location"}.`,
      );
      window.scrollTo({ behavior: "smooth", top: 0 });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  function resetReceipt() {
    setStep(1);
    setLines([]);
    setNote("");
    setScanValue("");
    setSelectedProductId("");
    setProductDetails(null);
    setDraftMovement(null);
    setPostedMovement(null);
    setIntegrationPending(false);
    setError("");
    setNotice("");
    setReceiptId(crypto.randomUUID());
  }

  if (loading) {
    return (
      <StatePanel
        icon={<LoaderCircle className={styles.spin} size={27} />}
        title="Preparing stock receipt"
        text="Loading stock locations and catalog identity…"
      />
    );
  }

  if (locations.length === 0) {
    return (
      <StatePanel
        action={<Link href="/store-locations">Review store locations</Link>}
        icon={<MapPin size={27} />}
        title="No active stock location is available"
        text="A receipt needs a real destination location before inventory can be posted."
      />
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <Link className={styles.backLink} href="/inventory">
            <ArrowLeft size={14} /> Inventory
          </Link>
          <p className={styles.eyebrow}>Incoming stock</p>
          <h1>Receive Stock</h1>
          <p>
            Record what physically arrived. SENVO will post a receipt movement
            instead of overwriting stock quantities.
          </p>
        </div>
        <div className={styles.headerBadge}>
          <ShieldCheck size={17} /> Ledger-safe receipt
        </div>
      </header>

      <StepRail step={step} />

      {error ? (
        <Feedback message={error} onClose={() => setError("")} tone="error" />
      ) : null}
      {notice ? (
        <Feedback
          message={notice}
          onClose={() => setNotice("")}
          tone="success"
        />
      ) : null}
      {integrationPending ? (
        <div className={styles.integrationGate} role="status">
          <AlertTriangle size={18} />
          <div>
            <strong>One backend binding remains</strong>
            <p>
              Wire <code>POST /inventory/movement-drafts</code> to the existing
              domain <code>createInventoryMovement</code> use case. Do not
              bypass the ledger or write stock balances directly.
            </p>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <LocationStep
          locations={locations}
          onContinue={() => setStep(2)}
          selectedLocationId={selectedLocationId}
          setSelectedLocationId={setSelectedLocationId}
        />
      ) : null}

      {step === 2 ? (
        <ItemsStep
          canReadCatalog={canReadCatalog}
          filteredProducts={filteredProducts}
          lines={lines}
          loadingProduct={loadingProduct}
          onAddVariant={addVariant}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
          onRemoveLine={removeLine}
          onScan={(event) => void scan(event)}
          onUpdateQuantity={updateQuantity}
          productDetails={productDetails}
          productQuery={productQuery}
          scanValue={scanValue}
          scanning={scanning}
          selectedProductId={selectedProductId}
          setProductQuery={setProductQuery}
          setScanValue={setScanValue}
          setSelectedProductId={setSelectedProductId}
          colorNames={colorNames}
          sizeNames={sizeNames}
        />
      ) : null}

      {step === 3 ? (
        <ReviewStep
          draftMovement={draftMovement}
          lines={lines}
          locationName={selectedLocation?.name ?? "Selected location"}
          note={note}
          onBack={() => setStep(2)}
          onConfirm={() => void confirmReceipt()}
          saving={saving}
          setNote={setNote}
          totalUnits={totalUnits}
        />
      ) : null}

      {step === 4 && postedMovement ? (
        <SuccessStep
          lines={lines}
          locationName={selectedLocation?.name ?? "Selected location"}
          movement={postedMovement}
          onReset={resetReceipt}
          totalUnits={totalUnits}
        />
      ) : null}

      <section className={styles.principles} aria-label="Receipt safeguards">
        <Principle
          icon={<Truck size={18} />}
          title="Physical receipt"
          text="Use this only when stock has actually arrived at the destination."
        />
        <Principle
          icon={<ClipboardCheck size={18} />}
          title="Review first"
          text="Variant, location and quantities stay visible before posting."
        />
        <Principle
          icon={<ShieldCheck size={18} />}
          title="Append-only history"
          text="Posting creates ledger history; it never replaces the stock total."
        />
      </section>
    </main>
  );
}

function LocationStep({
  locations,
  onContinue,
  selectedLocationId,
  setSelectedLocationId,
}: {
  locations: StockLocationReadContract[];
  onContinue: () => void;
  selectedLocationId: string;
  setSelectedLocationId: (value: string) => void;
}) {
  const selected = locations.find(
    (location) => location.id === selectedLocationId,
  );
  return (
    <section className={styles.workflowCard}>
      <div className={styles.sectionIntro}>
        <p className={styles.eyebrow}>Step 1</p>
        <h2>Where did the stock arrive?</h2>
        <p>
          Choose the physical SENVO location that will own the received units.
        </p>
      </div>
      <div className={styles.locationGrid}>
        {locations.map((location) => (
          <button
            aria-pressed={selectedLocationId === location.id}
            className={`${styles.locationCard} ${selectedLocationId === location.id ? styles.locationCardActive : ""}`}
            key={location.id}
            onClick={() => setSelectedLocationId(location.id)}
            type="button"
          >
            <span className={styles.locationIcon}>
              <MapPin size={19} />
            </span>
            <span>
              <strong>{location.name}</strong>
              <small>
                {location.branch.name} · {humanize(location.type)}
              </small>
            </span>
            {selectedLocationId === location.id ? <Check size={17} /> : null}
          </button>
        ))}
      </div>
      {selected ? (
        <div className={styles.selectionSummary}>
          <MapPin size={16} />
          <span>
            Receiving into <strong>{selected.name}</strong>
          </span>
        </div>
      ) : null}
      <div className={styles.footerActions}>
        <Link className={styles.textLink} href="/inventory">
          Cancel
        </Link>
        <button
          className={styles.primaryButton}
          disabled={!selectedLocationId}
          onClick={onContinue}
          type="button"
        >
          Add received items <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

function ItemsStep({
  canReadCatalog,
  colorNames,
  filteredProducts,
  lines,
  loadingProduct,
  onAddVariant,
  onBack,
  onContinue,
  onRemoveLine,
  onScan,
  onUpdateQuantity,
  productDetails,
  productQuery,
  scanValue,
  scanning,
  selectedProductId,
  setProductQuery,
  setScanValue,
  setSelectedProductId,
  sizeNames,
}: {
  canReadCatalog: boolean;
  colorNames: Map<string, string>;
  filteredProducts: ProductContract[];
  lines: ReceiptLine[];
  loadingProduct: boolean;
  onAddVariant: (variant: ProductVariantContract) => void;
  onBack: () => void;
  onContinue: () => void;
  onRemoveLine: (variantId: string) => void;
  onScan: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateQuantity: (variantId: string, quantity: number) => void;
  productDetails: ProductDetailsContract | null;
  productQuery: string;
  scanValue: string;
  scanning: boolean;
  selectedProductId: string;
  setProductQuery: (value: string) => void;
  setScanValue: (value: string) => void;
  setSelectedProductId: (value: string) => void;
  sizeNames: Map<string, string>;
}) {
  return (
    <section className={styles.workflowCard}>
      <div className={styles.sectionIntro}>
        <p className={styles.eyebrow}>Step 2</p>
        <h2>What arrived?</h2>
        <p>Scan labels for speed, or choose a product and variant manually.</p>
      </div>

      <div className={styles.itemEntryGrid}>
        <article className={styles.entryPanel}>
          <div className={styles.entryHeading}>
            <span className={styles.entryIcon}>
              <Barcode size={19} />
            </span>
            <div>
              <strong>Scan barcode</strong>
              <small>Fastest for labelled stock</small>
            </div>
          </div>
          <form className={styles.scanForm} onSubmit={onScan}>
            <label>
              <Barcode size={17} />
              <input
                autoComplete="off"
                disabled={!canReadCatalog}
                onChange={(event) => setScanValue(event.target.value)}
                placeholder="Scan or enter barcode…"
                value={scanValue}
              />
            </label>
            <button
              className={styles.secondaryButton}
              disabled={!scanValue.trim() || scanning || !canReadCatalog}
              type="submit"
            >
              {scanning ? (
                <LoaderCircle className={styles.spin} size={16} />
              ) : (
                <Plus size={16} />
              )}
              Add
            </button>
          </form>
        </article>

        <article className={styles.entryPanel}>
          <div className={styles.entryHeading}>
            <span className={styles.entryIcon}>
              <Search size={19} />
            </span>
            <div>
              <strong>Choose manually</strong>
              <small>Product → variant</small>
            </div>
          </div>
          {!canReadCatalog ? (
            <p className={styles.catalogGate}>
              Catalog read permission is required to resolve a product variant.
            </p>
          ) : (
            <>
              <label className={styles.productSearch}>
                <Search size={16} />
                <input
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder="Search product or code…"
                  value={productQuery}
                />
              </label>
              <label className={styles.selectShell}>
                <span>Product</span>
                <select
                  onChange={(event) => setSelectedProductId(event.target.value)}
                  value={selectedProductId}
                >
                  <option value="">Choose product</option>
                  {filteredProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {product.productCode}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </label>
              {loadingProduct ? (
                <InlineLoading text="Loading variants…" />
              ) : null}
              {productDetails ? (
                <div className={styles.variantPicker}>
                  {productDetails.variants
                    .filter((variant) => variant.status === "ACTIVE")
                    .map((variant) => (
                      <button
                        key={variant.id}
                        onClick={() => onAddVariant(variant)}
                        type="button"
                      >
                        <span>
                          <strong>
                            {colorNames.get(variant.colorId) ?? "Color"} /{" "}
                            {sizeNames.get(variant.sizeId) ?? "Size"}
                          </strong>
                          <small>{variant.sku}</small>
                        </span>
                        <Plus size={15} />
                      </button>
                    ))}
                </div>
              ) : null}
            </>
          )}
        </article>
      </div>

      <ReceiptLines
        lines={lines}
        onRemove={onRemoveLine}
        onUpdateQuantity={onUpdateQuantity}
      />

      <div className={styles.footerActions}>
        <button className={styles.textButton} onClick={onBack} type="button">
          <ArrowLeft size={14} /> Location
        </button>
        <button
          className={styles.primaryButton}
          disabled={lines.length === 0}
          onClick={onContinue}
          type="button"
        >
          Review receipt <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

function ReceiptLines({
  lines,
  onRemove,
  onUpdateQuantity,
}: {
  lines: ReceiptLine[];
  onRemove: (variantId: string) => void;
  onUpdateQuantity: (variantId: string, quantity: number) => void;
}) {
  if (!lines.length) {
    return (
      <div className={styles.linesEmpty}>
        <PackageCheck size={22} />
        <strong>No items added yet</strong>
        <span>Scan a label or choose a variant above.</span>
      </div>
    );
  }
  return (
    <div className={styles.linesSection}>
      <div className={styles.linesHeader}>
        <div>
          <p className={styles.eyebrow}>Receipt lines</p>
          <h3>
            {lines.length} variant{lines.length === 1 ? "" : "s"}
          </h3>
        </div>
        <span>
          {lines.reduce((sum, line) => sum + line.quantity, 0)} total units
        </span>
      </div>
      <div className={styles.lineList}>
        {lines.map((line) => (
          <article className={styles.lineItem} key={line.variantId}>
            <span className={styles.lineGlyph}>
              {line.productName.slice(0, 1).toUpperCase()}
            </span>
            <div className={styles.lineIdentity}>
              <strong>{line.productName}</strong>
              <span>
                {line.color} / {line.size}
              </span>
              <small>{line.sku}</small>
            </div>
            <div className={styles.qtyControl}>
              <button
                aria-label={`Decrease ${line.sku}`}
                onClick={() =>
                  onUpdateQuantity(line.variantId, line.quantity - 1)
                }
                type="button"
              >
                <Minus size={14} />
              </button>
              <input
                aria-label={`Quantity for ${line.sku}`}
                inputMode="numeric"
                min={1}
                max={MAX_QTY}
                onChange={(event) =>
                  onUpdateQuantity(line.variantId, Number(event.target.value))
                }
                type="number"
                value={line.quantity}
              />
              <button
                aria-label={`Increase ${line.sku}`}
                onClick={() =>
                  onUpdateQuantity(line.variantId, line.quantity + 1)
                }
                type="button"
              >
                <Plus size={14} />
              </button>
            </div>
            <button
              aria-label={`Remove ${line.sku}`}
              className={styles.removeButton}
              onClick={() => onRemove(line.variantId)}
              type="button"
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function ReviewStep({
  draftMovement,
  lines,
  locationName,
  note,
  onBack,
  onConfirm,
  saving,
  setNote,
  totalUnits,
}: {
  draftMovement: InventoryMovementContract | null;
  lines: ReceiptLine[];
  locationName: string;
  note: string;
  onBack: () => void;
  onConfirm: () => void;
  saving: boolean;
  setNote: (value: string) => void;
  totalUnits: number;
}) {
  return (
    <section className={styles.workflowCard}>
      <div className={styles.sectionIntro}>
        <p className={styles.eyebrow}>Step 3</p>
        <h2>Review before posting</h2>
        <p>
          Once posted, this receipt becomes part of the inventory movement
          history.
        </p>
      </div>
      <div className={styles.reviewGrid}>
        <article className={styles.reviewCard}>
          <span>Destination</span>
          <strong>{locationName}</strong>
          <small>Receipt movement</small>
        </article>
        <article className={styles.reviewCard}>
          <span>Variants</span>
          <strong>{lines.length}</strong>
          <small>Unique sellable variants</small>
        </article>
        <article className={styles.reviewCard}>
          <span>Total units</span>
          <strong>{totalUnits}</strong>
          <small>Incoming physical quantity</small>
        </article>
      </div>
      <div className={styles.reviewLines}>
        {lines.map((line) => (
          <div key={line.variantId}>
            <span>
              <strong>{line.productName}</strong>
              <small>
                {line.color} / {line.size} · {line.sku}
              </small>
            </span>
            <b>+{line.quantity}</b>
          </div>
        ))}
      </div>
      <label className={styles.noteField}>
        <span>
          Receipt note <small>optional</small>
        </span>
        <textarea
          maxLength={1000}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Supplier reference, delivery note, condition or receiving context…"
          rows={4}
          value={note}
        />
      </label>
      {draftMovement ? (
        <div className={styles.draftNotice}>
          <ClipboardCheck size={17} />
          <span>
            Draft {draftMovement.id} already exists. Confirm will retry posting
            this same draft rather than creating duplicate stock.
          </span>
        </div>
      ) : null}
      <div className={styles.postWarning}>
        <AlertTriangle size={17} />
        <div>
          <strong>Confirm physical quantities now</strong>
          <p>
            If a mistake is discovered after posting, correct it with an
            explicit adjustment/reversal workflow—not by editing the stock
            total.
          </p>
        </div>
      </div>
      <div className={styles.footerActions}>
        <button
          className={styles.textButton}
          disabled={saving}
          onClick={onBack}
          type="button"
        >
          <ArrowLeft size={14} /> Edit items
        </button>
        <button
          className={styles.primaryButton}
          disabled={saving}
          onClick={onConfirm}
          type="button"
        >
          {saving ? (
            <LoaderCircle className={styles.spin} size={16} />
          ) : (
            <PackageCheck size={16} />
          )}
          {draftMovement
            ? "Retry posting receipt"
            : `Receive ${totalUnits} units`}
        </button>
      </div>
    </section>
  );
}

function SuccessStep({
  lines,
  locationName,
  movement,
  onReset,
  totalUnits,
}: {
  lines: ReceiptLine[];
  locationName: string;
  movement: InventoryMovementContract;
  onReset: () => void;
  totalUnits: number;
}) {
  return (
    <section className={styles.successCard}>
      <span className={styles.successIcon}>
        <CheckCircle2 size={30} />
      </span>
      <p className={styles.eyebrow}>Stock received</p>
      <h2>{totalUnits} units are now in the ledger</h2>
      <p>
        {lines.length} variant{lines.length === 1 ? "" : "s"} received into{" "}
        <strong>{locationName}</strong>.
      </p>
      <div className={styles.successMeta}>
        <span>Movement</span>
        <strong>{movement.movementNumber}</strong>
        <span>Status</span>
        <strong>{humanize(movement.status)}</strong>
      </div>
      <div className={styles.successActions}>
        <Link className={styles.primaryButton} href="/inventory">
          View inventory <ArrowRight size={15} />
        </Link>
        <Link className={styles.secondaryButton} href="/inventory/movements">
          Movement history
        </Link>
        <button className={styles.textButton} onClick={onReset} type="button">
          <RotateCcw size={14} /> Receive another shipment
        </button>
      </div>
    </section>
  );
}

function StepRail({ step }: { step: Step }) {
  const steps = [
    [1, "Location"],
    [2, "Items"],
    [3, "Review"],
    [4, "Complete"],
  ] as const;
  return (
    <nav aria-label="Receive stock progress" className={styles.stepRail}>
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
                {complete ? <Check size={13} /> : number}
              </span>
              {label}
            </span>
            {index < steps.length - 1 ? (
              <span className={styles.stepLine} />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function Principle({
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

function StatePanel({
  action,
  icon,
  text,
  title,
}: {
  action?: React.ReactNode;
  icon: React.ReactNode;
  text: string;
  title: string;
}) {
  return (
    <main className={styles.statePanel}>
      <span>{icon}</span>
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
        {action ? <div className={styles.stateAction}>{action}</div> : null}
      </div>
    </main>
  );
}

function InlineLoading({ text }: { text: string }) {
  return (
    <div className={styles.inlineLoading}>
      <LoaderCircle className={styles.spin} size={16} /> {text}
    </div>
  );
}

function fromBarcode(
  result: BarcodeLookupContract,
): Omit<ReceiptLine, "quantity"> {
  return {
    color: result.color,
    productName: result.productName,
    size: result.size,
    sku: result.sku,
    variantId: result.variantId,
  };
}

function clampQty(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_QTY, Math.max(1, Math.trunc(value)));
}

function movementNumber(receiptId: string) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/gu, "")
    .slice(0, 14);
  return `RCV-${stamp}-${receiptId.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/gu, (letter) => letter.toUpperCase());
}

function messageFor(caught: unknown) {
  if (caught instanceof AdminApiError) {
    return `${caught.message}${caught.requestId ? ` Request ID: ${caught.requestId}` : ""}`;
  }
  return caught instanceof Error
    ? caught.message
    : "The stock receipt could not be completed.";
}
