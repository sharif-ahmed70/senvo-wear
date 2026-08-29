"use client";

import type {
  BarcodeLookupContract,
  ColorContract,
  InventoryAvailabilityReadContract,
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
  PackageSearch,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
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
import styles from "../../receive/_components/receive-stock-workflow.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const MAX_QTY = 999_999;
type Step = 1 | 2 | 3 | 4;

type TransferLine = {
  availableToSell: number;
  color: string;
  onHand: number;
  productName: string;
  quantity: number;
  reserved: number;
  size: string;
  sku: string;
  variantId: string;
};

type DraftCreateInput = {
  destinationLocationId: string;
  idempotencyKey: string;
  lines: Array<{ productVariantId: string; quantity: number }>;
  movementNumber: string;
  note?: string | null;
  occurredAt: string;
  referenceType: string;
  sourceLocationId: string;
  type: "TRANSFER";
};

export function TransferStockWorkflow({
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
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productDetails, setProductDetails] =
    useState<ProductDetailsContract | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [addingVariantId, setAddingVariantId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [integrationPending, setIntegrationPending] = useState(false);
  const [draftMovement, setDraftMovement] =
    useState<InventoryMovementContract | null>(null);
  const [postedMovement, setPostedMovement] =
    useState<InventoryMovementContract | null>(null);
  const [transferId, setTransferId] = useState(() => crypto.randomUUID());

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
      setSourceLocationId((current) => current || activeLocations[0]?.id || "");
      setDestinationLocationId((current) => {
        if (current) return current;
        return (
          activeLocations.find(
            (location) => location.id !== activeLocations[0]?.id,
          )?.id ?? ""
        );
      });

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
  const sourceLocation = locations.find(
    (location) => location.id === sourceLocationId,
  );
  const destinationLocation = locations.find(
    (location) => location.id === destinationLocationId,
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
        title="Transferring stock requires permission"
        text="Your role can view inventory, but it cannot create stock movements."
      />
    );
  }

  function changeSource(value: string) {
    if (value === sourceLocationId) return;
    setSourceLocationId(value);
    if (destinationLocationId === value) setDestinationLocationId("");
    if (lines.length) {
      setLines([]);
      setNotice(
        "Transfer items were cleared because the source location changed.",
      );
    }
    setDraftMovement(null);
    setPostedMovement(null);
  }

  function changeDestination(value: string) {
    if (value === sourceLocationId) {
      setError("Source and destination must be different stock locations.");
      return;
    }
    setDestinationLocationId(value);
    setDraftMovement(null);
    setPostedMovement(null);
  }

  async function sourceAvailability(
    variantId: string,
    sku: string,
  ): Promise<InventoryAvailabilityReadContract | null> {
    if (!sourceLocationId) return null;
    const result = await client.listInventoryAvailability({
      locationId: sourceLocationId,
      pageSize: 100,
      search: sku,
    });
    return (
      result.data.items.find(
        (item) =>
          item.variant.id === variantId &&
          item.location.id === sourceLocationId,
      ) ?? null
    );
  }

  async function addResolvedVariant(input: {
    color: string;
    productName: string;
    size: string;
    sku: string;
    variantId: string;
  }) {
    if (!sourceLocationId) {
      setError("Choose a source location before adding transfer items.");
      return;
    }
    setAddingVariantId(input.variantId);
    setError("");
    try {
      const availability = await sourceAvailability(input.variantId, input.sku);
      if (!availability || availability.availableToSell <= 0) {
        setError(
          `${input.productName} · ${input.color} / ${input.size} has no transferable stock at ${sourceLocation?.name ?? "the source location"}. Reserved units are protected.`,
        );
        return;
      }
      setLines((current) => {
        const existing = current.find(
          (line) => line.variantId === input.variantId,
        );
        if (existing) {
          return current.map((line) =>
            line.variantId === input.variantId
              ? {
                  ...line,
                  availableToSell: availability.availableToSell,
                  onHand: availability.onHand,
                  quantity: Math.min(
                    line.quantity + 1,
                    availability.availableToSell,
                  ),
                  reserved: availability.reserved,
                }
              : line,
          );
        }
        return [
          ...current,
          {
            ...input,
            availableToSell: availability.availableToSell,
            onHand: availability.onHand,
            quantity: 1,
            reserved: availability.reserved,
          },
        ];
      });
      setNotice(
        `${input.productName} added. Up to ${availability.availableToSell} unit(s) can be transferred from this location.`,
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setAddingVariantId("");
    }
  }

  async function addVariant(variant: ProductVariantContract) {
    if (!productDetails) return;
    await addResolvedVariant({
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
      await addResolvedVariant(fromBarcode(result));
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
          ? { ...line, quantity: clampQty(quantity, line.availableToSell) }
          : line,
      ),
    );
    setDraftMovement(null);
  }

  function removeLine(variantId: string) {
    setLines((current) =>
      current.filter((line) => line.variantId !== variantId),
    );
    setDraftMovement(null);
  }

  async function revalidateLines(): Promise<TransferLine[]> {
    const refreshed = await Promise.all(
      lines.map(async (line) => {
        const availability = await sourceAvailability(line.variantId, line.sku);
        if (!availability) {
          throw new Error(
            `${line.sku} is no longer available at the source location.`,
          );
        }
        if (line.quantity > availability.availableToSell) {
          throw new Error(
            `${line.productName} · ${line.color} / ${line.size} now has only ${availability.availableToSell} transferable unit(s). Review the quantity before confirming.`,
          );
        }
        return {
          ...line,
          availableToSell: availability.availableToSell,
          onHand: availability.onHand,
          reserved: availability.reserved,
        };
      }),
    );
    setLines(refreshed);
    return refreshed;
  }

  async function confirmTransfer() {
    if (
      !sourceLocationId ||
      !destinationLocationId ||
      sourceLocationId === destinationLocationId ||
      lines.length === 0 ||
      saving
    ) {
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    setIntegrationPending(false);

    try {
      const validatedLines = await revalidateLines();
      let draft = draftMovement;
      if (!draft) {
        const payload: DraftCreateInput = {
          destinationLocationId,
          idempotencyKey: `admin-transfer:${transferId}`,
          lines: validatedLines.map((line) => ({
            productVariantId: line.variantId,
            quantity: line.quantity,
          })),
          movementNumber: movementNumber(transferId),
          note: note.trim() || null,
          occurredAt: new Date().toISOString(),
          referenceType: "ADMIN_TRANSFER",
          sourceLocationId,
          type: "TRANSFER",
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
              "The Transfer Stock frontend is ready, but this environment has not wired the inventory draft-creation HTTP endpoint yet.",
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
        `${totalUnits} unit(s) transferred from ${sourceLocation?.name ?? "source"} to ${destinationLocation?.name ?? "destination"}.`,
      );
      window.scrollTo({ behavior: "smooth", top: 0 });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  function resetTransfer() {
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
    setTransferId(crypto.randomUUID());
  }

  if (loading) {
    return (
      <StatePanel
        icon={<LoaderCircle className={styles.spin} size={27} />}
        title="Preparing stock transfer"
        text="Loading active stock locations and catalog identity…"
      />
    );
  }

  if (locations.length < 2) {
    return (
      <StatePanel
        action={<Link href="/store-locations">Review store locations</Link>}
        icon={<MapPin size={27} />}
        title="Two active stock locations are required"
        text="A transfer needs one source and one different destination location."
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
          <p className={styles.eyebrow}>Location-to-location movement</p>
          <h1>Transfer Stock</h1>
          <p>
            Move physical units between SENVO locations while protecting stock
            already reserved for customer demand.
          </p>
        </div>
        <div className={styles.headerBadge}>
          <ShieldCheck size={17} /> Reservation-aware transfer
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
              domain <code>createInventoryMovement</code> use case. The payload
              already uses <code>type: TRANSFER</code> with source and
              destination location IDs. Do not mutate stock balances directly.
            </p>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <RouteStep
          destinationLocationId={destinationLocationId}
          locations={locations}
          onContinue={() => setStep(2)}
          setDestinationLocationId={changeDestination}
          setSourceLocationId={changeSource}
          sourceLocationId={sourceLocationId}
        />
      ) : null}

      {step === 2 ? (
        <ItemsStep
          addingVariantId={addingVariantId}
          canReadCatalog={canReadCatalog}
          colorNames={colorNames}
          filteredProducts={filteredProducts}
          lines={lines}
          loadingProduct={loadingProduct}
          onAddVariant={(variant) => void addVariant(variant)}
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
          sizeNames={sizeNames}
          sourceName={sourceLocation?.name ?? "Source location"}
        />
      ) : null}

      {step === 3 ? (
        <ReviewStep
          destinationName={destinationLocation?.name ?? "Destination"}
          draftMovement={draftMovement}
          lines={lines}
          note={note}
          onBack={() => setStep(2)}
          onConfirm={() => void confirmTransfer()}
          saving={saving}
          setNote={setNote}
          sourceName={sourceLocation?.name ?? "Source"}
          totalUnits={totalUnits}
        />
      ) : null}

      {step === 4 && postedMovement ? (
        <SuccessStep
          destinationName={destinationLocation?.name ?? "Destination"}
          movement={postedMovement}
          onReset={resetTransfer}
          sourceName={sourceLocation?.name ?? "Source"}
          totalUnits={totalUnits}
        />
      ) : null}

      <section className={styles.principles} aria-label="Transfer safeguards">
        <Principle
          icon={<PackageSearch size={18} />}
          title="Availability checked"
          text="Reserved units are excluded before a transfer quantity can be confirmed."
        />
        <Principle
          icon={<ClipboardCheck size={18} />}
          title="Revalidated at confirm"
          text="Source availability is checked again immediately before posting."
        />
        <Principle
          icon={<ShieldCheck size={18} />}
          title="One ledger movement"
          text="A transfer records both source and destination; it never overwrites stock totals."
        />
      </section>
    </main>
  );
}

function RouteStep({
  destinationLocationId,
  locations,
  onContinue,
  setDestinationLocationId,
  setSourceLocationId,
  sourceLocationId,
}: {
  destinationLocationId: string;
  locations: StockLocationReadContract[];
  onContinue: () => void;
  setDestinationLocationId: (value: string) => void;
  setSourceLocationId: (value: string) => void;
  sourceLocationId: string;
}) {
  const source = locations.find((location) => location.id === sourceLocationId);
  const destination = locations.find(
    (location) => location.id === destinationLocationId,
  );
  return (
    <section className={styles.workflowCard}>
      <div className={styles.sectionIntro}>
        <p className={styles.eyebrow}>Step 1</p>
        <h2>Where is the stock moving?</h2>
        <p>
          Choose a source that physically holds the units and a different
          destination.
        </p>
      </div>

      <div className={styles.itemEntryGrid}>
        <article className={styles.entryPanel}>
          <div className={styles.entryHeading}>
            <span className={styles.entryIcon}>
              <MapPin size={19} />
            </span>
            <div>
              <strong>From</strong>
              <small>Current physical location</small>
            </div>
          </div>
          <label className={styles.selectShell}>
            <span>Source location</span>
            <select
              value={sourceLocationId}
              onChange={(event) => setSourceLocationId(event.target.value)}
            >
              <option value="">Choose source</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} · {location.branch.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>
        </article>

        <article className={styles.entryPanel}>
          <div className={styles.entryHeading}>
            <span className={styles.entryIcon}>
              <Truck size={19} />
            </span>
            <div>
              <strong>To</strong>
              <small>Receiving SENVO location</small>
            </div>
          </div>
          <label className={styles.selectShell}>
            <span>Destination</span>
            <select
              value={destinationLocationId}
              onChange={(event) => setDestinationLocationId(event.target.value)}
            >
              <option value="">Choose destination</option>
              {locations
                .filter((location) => location.id !== sourceLocationId)
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} · {location.branch.name}
                  </option>
                ))}
            </select>
            <ChevronDown size={15} />
          </label>
        </article>
      </div>

      {source && destination ? (
        <div className={styles.selectionSummary}>
          <Truck size={16} />
          <span>
            <strong>{source.name}</strong> → <strong>{destination.name}</strong>
          </span>
        </div>
      ) : null}

      <div className={styles.footerActions}>
        <Link className={styles.textLink} href="/inventory">
          Cancel
        </Link>
        <button
          className={styles.primaryButton}
          disabled={
            !sourceLocationId ||
            !destinationLocationId ||
            sourceLocationId === destinationLocationId
          }
          onClick={onContinue}
          type="button"
        >
          Choose transfer items <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

function ItemsStep({
  addingVariantId,
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
  sourceName,
}: {
  addingVariantId: string;
  canReadCatalog: boolean;
  colorNames: Map<string, string>;
  filteredProducts: ProductContract[];
  lines: TransferLine[];
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
  sourceName: string;
}) {
  return (
    <section className={styles.workflowCard}>
      <div className={styles.sectionIntro}>
        <p className={styles.eyebrow}>Step 2</p>
        <h2>What should move from {sourceName}?</h2>
        <p>
          Scan labels or choose variants manually. SENVO checks transferable
          availability before adding a line.
        </p>
      </div>

      <div className={styles.itemEntryGrid}>
        <article className={styles.entryPanel}>
          <div className={styles.entryHeading}>
            <span className={styles.entryIcon}>
              <Barcode size={19} />
            </span>
            <div>
              <strong>Scan barcode</strong>
              <small>Fastest on the shop floor</small>
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
                        disabled={addingVariantId === variant.id}
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
                        {addingVariantId === variant.id ? (
                          <LoaderCircle className={styles.spin} size={15} />
                        ) : (
                          <Plus size={15} />
                        )}
                      </button>
                    ))}
                </div>
              ) : null}
            </>
          )}
        </article>
      </div>

      <div className={styles.linesSection}>
        <div className={styles.linesHeader}>
          <div>
            <p className={styles.eyebrow}>Transfer list</p>
            <h3>{lines.length} variant(s) selected</h3>
          </div>
          <span>Reserved stock stays protected</span>
        </div>

        {lines.length === 0 ? (
          <div className={styles.linesEmpty}>
            <PackageSearch size={22} />
            <strong>No transfer items yet</strong>
            <span>Add at least one variant with available stock.</span>
          </div>
        ) : (
          <div className={styles.lineList}>
            {lines.map((line) => (
              <article className={styles.lineItem} key={line.variantId}>
                <span className={styles.lineGlyph}>↔</span>
                <div className={styles.lineIdentity}>
                  <strong>{line.productName}</strong>
                  <span>
                    {line.color} / {line.size}
                  </span>
                  <small>
                    {line.sku} · On hand {line.onHand} · Reserved{" "}
                    {line.reserved} · {line.availableToSell} transferable
                  </small>
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
                    aria-label={`Transfer quantity for ${line.sku}`}
                    max={line.availableToSell}
                    min={1}
                    onChange={(event) =>
                      onUpdateQuantity(
                        line.variantId,
                        Number(event.target.value),
                      )
                    }
                    type="number"
                    value={line.quantity}
                  />
                  <button
                    aria-label={`Increase ${line.sku}`}
                    disabled={line.quantity >= line.availableToSell}
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
                  onClick={() => onRemoveLine(line.variantId)}
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className={styles.footerActions}>
        <button className={styles.textButton} onClick={onBack} type="button">
          <ArrowLeft size={14} /> Back
        </button>
        <button
          className={styles.primaryButton}
          disabled={lines.length === 0}
          onClick={onContinue}
          type="button"
        >
          Review transfer <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

function ReviewStep({
  destinationName,
  draftMovement,
  lines,
  note,
  onBack,
  onConfirm,
  saving,
  setNote,
  sourceName,
  totalUnits,
}: {
  destinationName: string;
  draftMovement: InventoryMovementContract | null;
  lines: TransferLine[];
  note: string;
  onBack: () => void;
  onConfirm: () => void;
  saving: boolean;
  setNote: (value: string) => void;
  sourceName: string;
  totalUnits: number;
}) {
  return (
    <section className={styles.workflowCard}>
      <div className={styles.sectionIntro}>
        <p className={styles.eyebrow}>Step 3</p>
        <h2>Review before stock moves</h2>
        <p>Availability will be checked one more time when you confirm.</p>
      </div>

      <div className={styles.reviewGrid}>
        <div className={styles.reviewCard}>
          <span>From</span>
          <strong>{sourceName}</strong>
          <small>Physical source</small>
        </div>
        <div className={styles.reviewCard}>
          <span>To</span>
          <strong>{destinationName}</strong>
          <small>Physical destination</small>
        </div>
        <div className={styles.reviewCard}>
          <span>Total units</span>
          <strong>{totalUnits}</strong>
          <small>{lines.length} variant(s)</small>
        </div>
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
            <span>
              <b>{line.quantity}</b>
              <small>of {line.availableToSell} available</small>
            </span>
          </div>
        ))}
      </div>

      <label className={styles.noteField}>
        <span>
          Transfer note <small>Optional</small>
        </span>
        <textarea
          maxLength={1000}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Reason, dispatch note, vehicle/courier reference…"
          value={note}
        />
      </label>

      {draftMovement ? (
        <div className={styles.draftNotice}>
          <Check size={16} />
          <span>
            Draft movement {draftMovement.movementNumber} already exists. Retry
            will post the same draft instead of creating a duplicate.
          </span>
        </div>
      ) : null}

      <div className={styles.footerActions}>
        <button
          className={styles.textButton}
          disabled={saving}
          onClick={onBack}
          type="button"
        >
          <ArrowLeft size={14} /> Back
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
            <Truck size={16} />
          )}
          {draftMovement ? "Retry posting transfer" : "Confirm transfer"}
        </button>
      </div>
    </section>
  );
}

function SuccessStep({
  destinationName,
  movement,
  onReset,
  sourceName,
  totalUnits,
}: {
  destinationName: string;
  movement: InventoryMovementContract;
  onReset: () => void;
  sourceName: string;
  totalUnits: number;
}) {
  return (
    <section className={styles.successCard}>
      <span className={styles.successIcon}>
        <CheckCircle2 size={28} />
      </span>
      <p className={styles.eyebrow}>Transfer posted</p>
      <h2>{totalUnits} unit(s) moved successfully</h2>
      <p>
        <strong>{sourceName}</strong> → <strong>{destinationName}</strong>.
        SENVO recorded movement <code>{movement.movementNumber}</code> in the
        inventory ledger.
      </p>
      <div className={styles.successMeta}>
        <span>Movement</span>
        <strong>{movement.movementNumber}</strong>
        <span>Status</span>
        <strong>{movement.status}</strong>
      </div>
      <div className={styles.successActions}>
        <Link className={styles.secondaryButton} href="/inventory">
          Back to inventory
        </Link>
        <Link className={styles.secondaryButton} href="/inventory/movements">
          View movement history
        </Link>
        <button
          className={styles.primaryButton}
          onClick={onReset}
          type="button"
        >
          Transfer more stock
        </button>
      </div>
    </section>
  );
}

function StepRail({ step }: { step: Step }) {
  const labels = ["Route", "Items", "Review", "Complete"];
  return (
    <ol className={styles.stepRail} aria-label="Transfer stock progress">
      {labels.map((label, index) => {
        const number = (index + 1) as Step;
        const done = step > number;
        return (
          <li className={styles.stepGroup} key={label}>
            <div
              className={`${styles.step} ${
                step === number
                  ? styles.stepActive
                  : done
                    ? styles.stepComplete
                    : ""
              }`}
            >
              <span className={styles.stepNumber}>
                {done ? <Check size={14} /> : number}
              </span>
              <strong>{label}</strong>
            </div>
            {index < labels.length - 1 ? (
              <span className={styles.stepLine} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Principle({
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
      className={`${styles.feedback} ${
        tone === "error" ? styles.feedbackError : styles.feedbackSuccess
      }`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span>
        {tone === "error" ? (
          <AlertTriangle size={17} />
        ) : (
          <CheckCircle2 size={17} />
        )}
        {message}
      </span>
      <button aria-label="Dismiss message" onClick={onClose} type="button">
        ×
      </button>
    </div>
  );
}

function InlineLoading({ text }: { text: string }) {
  return (
    <div className={styles.inlineLoading}>
      <LoaderCircle className={styles.spin} size={16} /> {text}
    </div>
  );
}

function StatePanel({
  action,
  icon,
  text,
  title,
}: {
  action?: ReactNode;
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel}>
        <span>{icon}</span>
        <div>
          <h1>{title}</h1>
          <p>{text}</p>
          {action ? <div className={styles.stateAction}>{action}</div> : null}
        </div>
      </section>
    </main>
  );
}

function fromBarcode(result: BarcodeLookupContract) {
  return {
    color: result.color,
    productName: result.productName,
    size: result.size,
    sku: result.sku,
    variantId: result.variantId,
  };
}

function clampQty(value: number, available: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(1, Math.trunc(value)), Math.min(MAX_QTY, available));
}

function movementNumber(id: string) {
  return `TRF-${id.replace(/-/gu, "").slice(0, 20).toUpperCase()}`;
}

function messageFor(error: unknown) {
  if (error instanceof AdminApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The transfer could not be completed. Please try again.";
}
