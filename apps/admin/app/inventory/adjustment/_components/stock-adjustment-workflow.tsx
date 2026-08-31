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
  PackageMinus,
  PackagePlus,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
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
import { useAdminPermissions } from "../../../admin-shell";
import styles from "../../receive/_components/receive-stock-workflow.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const MAX_QTY = 999_999;

type Step = 1 | 2 | 3 | 4;
type Direction = "IN" | "OUT";

type AdjustmentLine = {
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
  destinationLocationId: string | null;
  idempotencyKey: string;
  lines: Array<{
    productVariantId: string;
    quantity: number;
  }>;
  movementNumber: string;
  note: string;
  occurredAt: string;
  referenceId: string;
  referenceType: string;
  sourceLocationId: string | null;
  type: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
};

export function StockAdjustmentWorkflow({
  permissions: propsPermissions,
}: {
  permissions?: readonly AdminPermissionKey[];
} = {}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const canReadInventory = permissions.includes("INVENTORY:READ");
  const canCreateInventory = permissions.includes("INVENTORY:CREATE");
  const canReadCatalog = permissions.includes("CATALOG:READ");

  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<Direction>("IN");
  const [locations, setLocations] = useState<StockLocationReadContract[]>([]);
  const [products, setProducts] = useState<ProductContract[]>([]);
  const [colors, setColors] = useState<ColorContract[]>([]);
  const [sizes, setSizes] = useState<SizeContract[]>([]);
  const [locationId, setLocationId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productDetails, setProductDetails] =
    useState<ProductDetailsContract | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [lines, setLines] = useState<AdjustmentLine[]>([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [outAcknowledged, setOutAcknowledged] = useState(false);
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
  const [adjustmentId, setAdjustmentId] = useState(() => crypto.randomUUID());

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
      setLocationId((current) => current || activeLocations[0]?.id || "");

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
    (location) => location.id === locationId,
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
        title="Stock adjustment requires permission"
        text="Your role can view inventory, but it cannot create inventory movements."
      />
    );
  }

  function changeDirection(next: Direction) {
    if (next === direction) return;
    setDirection(next);
    setLines([]);
    setReason("");
    setNotes("");
    setOutAcknowledged(false);
    setDraftMovement(null);
    setPostedMovement(null);
    setNotice(
      "Selected items were cleared because the adjustment direction changed.",
    );
  }

  function changeLocation(nextLocationId: string) {
    if (nextLocationId === locationId) return;
    setLocationId(nextLocationId);
    setLines([]);
    setDraftMovement(null);
    setPostedMovement(null);
    setNotice(
      "Selected items were cleared because the stock location changed.",
    );
  }

  async function currentAvailability(
    variantId: string,
    sku: string,
  ): Promise<InventoryAvailabilityReadContract | null> {
    if (!locationId) return null;
    const result = await client.listInventoryAvailability({
      locationId,
      pageSize: 100,
      search: sku,
    });
    return (
      result.data.items.find(
        (item) =>
          item.variant.id === variantId && item.location.id === locationId,
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
    if (!locationId) {
      setError("Choose a stock location before adding adjustment items.");
      return;
    }
    setAddingVariantId(input.variantId);
    setError("");
    try {
      const availability = await currentAvailability(
        input.variantId,
        input.sku,
      );
      const onHand = availability?.onHand ?? 0;
      const reserved = availability?.reserved ?? 0;
      const availableToSell = availability?.availableToSell ?? 0;

      if (direction === "OUT" && availableToSell <= 0) {
        setError(
          `${input.productName} · ${input.color} / ${input.size} has no unreserved stock available to adjust out at ${selectedLocation?.name ?? "this location"}. Resolve reservations first if the physical count is lower.`,
        );
        return;
      }

      setLines((current) => {
        const existing = current.find(
          (line) => line.variantId === input.variantId,
        );
        const maximum = direction === "OUT" ? availableToSell : MAX_QTY;
        if (existing) {
          return current.map((line) =>
            line.variantId === input.variantId
              ? {
                  ...line,
                  availableToSell,
                  onHand,
                  quantity: Math.min(line.quantity + 1, maximum),
                  reserved,
                }
              : line,
          );
        }
        return [
          ...current,
          {
            ...input,
            availableToSell,
            onHand,
            quantity: 1,
            reserved,
          },
        ];
      });
      setNotice(
        direction === "OUT"
          ? `${input.productName} added. Up to ${availableToSell} unreserved unit(s) can be adjusted out.`
          : `${input.productName} added. Current on-hand is ${onHand}.`,
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
      current.map((line) => {
        if (line.variantId !== variantId) return line;
        const maximum = direction === "OUT" ? line.availableToSell : MAX_QTY;
        return { ...line, quantity: clampQty(quantity, maximum) };
      }),
    );
    setDraftMovement(null);
  }

  function removeLine(variantId: string) {
    setLines((current) =>
      current.filter((line) => line.variantId !== variantId),
    );
    setDraftMovement(null);
  }

  async function revalidateOutLines(): Promise<AdjustmentLine[]> {
    if (direction !== "OUT") return lines;
    const refreshed = await Promise.all(
      lines.map(async (line) => {
        const availability = await currentAvailability(
          line.variantId,
          line.sku,
        );
        if (!availability) {
          throw new Error(
            `${line.sku} no longer has stock at the selected location.`,
          );
        }
        if (line.quantity > availability.availableToSell) {
          throw new Error(
            `${line.productName} · ${line.color} / ${line.size} now has only ${availability.availableToSell} unreserved unit(s). Review the quantity before confirming.`,
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

  async function confirmAdjustment() {
    if (!locationId || !lines.length || saving) return;
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3) {
      setError("Enter a clear adjustment reason before posting.");
      return;
    }
    if (direction === "OUT" && !outAcknowledged) {
      setError(
        "Confirm that the physical stock difference was checked before adjusting stock out.",
      );
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    setIntegrationPending(false);

    try {
      const validatedLines = await revalidateOutLines();
      let draft = draftMovement;
      if (!draft) {
        const movementType =
          direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
        const note = notes.trim()
          ? `Reason: ${normalizedReason}\nDetails: ${notes.trim()}`
          : `Reason: ${normalizedReason}`;
        const payload: DraftCreateInput = {
          destinationLocationId: direction === "IN" ? locationId : null,
          idempotencyKey: `admin-adjustment:${adjustmentId}`,
          lines: validatedLines.map((line) => ({
            productVariantId: line.variantId,
            quantity: line.quantity,
          })),
          movementNumber: movementNumber(adjustmentId),
          note,
          occurredAt: new Date().toISOString(),
          referenceId: adjustmentId,
          referenceType: "ADMIN_STOCK_ADJUSTMENT",
          sourceLocationId: direction === "OUT" ? locationId : null,
          type: movementType,
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
              "The Stock Adjustment frontend is ready, but this environment has not wired the inventory draft-creation HTTP endpoint yet.",
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
        `${totalUnits} unit(s) were ${direction === "IN" ? "added to" : "removed from"} ${selectedLocation?.name ?? "the selected location"} through the inventory ledger.`,
      );
      window.scrollTo({ behavior: "smooth", top: 0 });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  function resetAdjustment() {
    setStep(1);
    setDirection("IN");
    setLines([]);
    setReason("");
    setNotes("");
    setOutAcknowledged(false);
    setScanValue("");
    setSelectedProductId("");
    setProductDetails(null);
    setDraftMovement(null);
    setPostedMovement(null);
    setIntegrationPending(false);
    setError("");
    setNotice("");
    setAdjustmentId(crypto.randomUUID());
  }

  if (loading) {
    return (
      <StatePanel
        icon={<LoaderCircle className={styles.spin} size={27} />}
        title="Preparing stock adjustment"
        text="Loading stock locations and catalog identity…"
      />
    );
  }

  if (!locations.length) {
    return (
      <StatePanel
        action={<Link href="/store-locations">Review store locations</Link>}
        icon={<MapPin size={27} />}
        title="No active stock location is available"
        text="A stock adjustment must belong to a real active location."
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
          <p className={styles.eyebrow}>Inventory correction</p>
          <h1>Stock Adjustment</h1>
          <p>
            Correct a verified physical stock difference without overwriting the
            inventory balance or hiding history.
          </p>
        </div>
        <div className={styles.headerBadge}>
          <ShieldCheck size={17} /> Audit-safe correction
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
              domain <code>createInventoryMovement</code> use case. Do not write
              stock balances directly.
            </p>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <SetupStep
          direction={direction}
          locations={locations}
          locationId={locationId}
          onContinue={() => setStep(2)}
          onDirectionChange={changeDirection}
          onLocationChange={changeLocation}
        />
      ) : null}

      {step === 2 ? (
        <ItemsStep
          addingVariantId={addingVariantId}
          canReadCatalog={canReadCatalog}
          colorNames={colorNames}
          direction={direction}
          filteredProducts={filteredProducts}
          lines={lines}
          loadingProduct={loadingProduct}
          locationName={selectedLocation?.name ?? "Selected location"}
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
          sizeNames={sizeNames}
        />
      ) : null}

      {step === 3 ? (
        <ReviewStep
          direction={direction}
          draftMovement={draftMovement}
          lines={lines}
          locationName={selectedLocation?.name ?? "Selected location"}
          notes={notes}
          onBack={() => setStep(2)}
          onConfirm={() => void confirmAdjustment()}
          outAcknowledged={outAcknowledged}
          reason={reason}
          saving={saving}
          setNotes={setNotes}
          setOutAcknowledged={setOutAcknowledged}
          setReason={setReason}
          totalUnits={totalUnits}
        />
      ) : null}

      {step === 4 && postedMovement ? (
        <SuccessStep
          direction={direction}
          locationName={selectedLocation?.name ?? "Selected location"}
          movement={postedMovement}
          onReset={resetAdjustment}
          totalUnits={totalUnits}
        />
      ) : null}

      <section className={styles.principles} aria-label="Adjustment safeguards">
        <Principle
          icon={<ClipboardCheck size={18} />}
          title="Reason required"
          text="Every correction explains why the physical stock differs."
        />
        <Principle
          icon={<ShieldCheck size={18} />}
          title="Reserved stock protected"
          text="Adjustment Out only uses unreserved availability in this workflow."
        />
        <Principle
          icon={<CheckCircle2 size={18} />}
          title="Append-only history"
          text="The ledger records the correction instead of replacing a stock number."
        />
      </section>
    </main>
  );
}

function SetupStep({
  direction,
  locations,
  locationId,
  onContinue,
  onDirectionChange,
  onLocationChange,
}: {
  direction: Direction;
  locations: StockLocationReadContract[];
  locationId: string;
  onContinue: () => void;
  onDirectionChange: (direction: Direction) => void;
  onLocationChange: (locationId: string) => void;
}) {
  return (
    <section className={styles.workflowCard}>
      <div className={styles.sectionIntro}>
        <p className={styles.eyebrow}>Step 1</p>
        <h2>What kind of correction is this?</h2>
        <p>
          Add stock only when physical units exist but SENVO is short. Remove
          stock only after the physical shortage, damage or loss is verified.
        </p>
      </div>

      <div className={styles.locationGrid}>
        <button
          aria-pressed={direction === "IN"}
          className={`${styles.locationCard} ${direction === "IN" ? styles.locationCardActive : ""}`}
          onClick={() => onDirectionChange("IN")}
          type="button"
        >
          <span className={styles.locationIcon}>
            <PackagePlus size={19} />
          </span>
          <span>
            <strong>Adjustment In</strong>
            <small>Physical stock is higher than SENVO currently shows.</small>
          </span>
          {direction === "IN" ? <Check size={17} /> : null}
        </button>
        <button
          aria-pressed={direction === "OUT"}
          className={`${styles.locationCard} ${direction === "OUT" ? styles.locationCardActive : ""}`}
          onClick={() => onDirectionChange("OUT")}
          type="button"
        >
          <span className={styles.locationIcon}>
            <PackageMinus size={19} />
          </span>
          <span>
            <strong>Adjustment Out</strong>
            <small>
              Physical stock is lower because of damage, loss or count
              correction.
            </small>
          </span>
          {direction === "OUT" ? <Check size={17} /> : null}
        </button>
      </div>

      <div className={styles.sectionIntro} style={{ marginTop: 24 }}>
        <p className={styles.eyebrow}>Location</p>
        <h2>Which stock location is being corrected?</h2>
      </div>
      <div className={styles.locationGrid}>
        {locations.map((location) => (
          <button
            aria-pressed={locationId === location.id}
            className={`${styles.locationCard} ${locationId === location.id ? styles.locationCardActive : ""}`}
            key={location.id}
            onClick={() => onLocationChange(location.id)}
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
            {locationId === location.id ? <Check size={17} /> : null}
          </button>
        ))}
      </div>

      <div className={styles.footerActions}>
        <Link className={styles.textLink} href="/inventory">
          Cancel
        </Link>
        <button
          className={styles.primaryButton}
          disabled={!locationId}
          onClick={onContinue}
          type="button"
        >
          Choose items <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

function ItemsStep({
  addingVariantId,
  canReadCatalog,
  colorNames,
  direction,
  filteredProducts,
  lines,
  loadingProduct,
  locationName,
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
  addingVariantId: string;
  canReadCatalog: boolean;
  colorNames: Map<string, string>;
  direction: Direction;
  filteredProducts: ProductContract[];
  lines: AdjustmentLine[];
  loadingProduct: boolean;
  locationName: string;
  onAddVariant: (variant: ProductVariantContract) => Promise<void>;
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
        <h2>Which items need correction?</h2>
        <p>
          {direction === "OUT"
            ? `SENVO will show current unreserved availability at ${locationName} before allowing stock out.`
            : `Add only the physical units that are missing from SENVO at ${locationName}.`}
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
                        disabled={addingVariantId === variant.id}
                        key={variant.id}
                        onClick={() => void onAddVariant(variant)}
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

      {lines.length === 0 ? (
        <div className={styles.linesEmpty}>
          {direction === "IN" ? (
            <PackagePlus size={22} />
          ) : (
            <PackageMinus size={22} />
          )}
          <strong>No adjustment items yet</strong>
          <span>Scan a barcode or choose a product variant.</span>
        </div>
      ) : (
        <div className={styles.linesSection}>
          <div className={styles.linesHeader}>
            <div>
              <p className={styles.eyebrow}>Adjustment lines</p>
              <h3>{lines.length} variant(s)</h3>
            </div>
            <span>
              {lines.reduce((sum, line) => sum + line.quantity, 0)} unit(s)
            </span>
          </div>
          <div className={styles.lineList}>
            {lines.map((line) => (
              <div className={styles.lineItem} key={line.variantId}>
                <span className={styles.lineGlyph}>
                  {line.productName.slice(0, 1).toUpperCase()}
                </span>
                <span className={styles.lineIdentity}>
                  <strong>
                    {line.productName} · {line.color} / {line.size}
                  </strong>
                  <span>{line.sku}</span>
                  <small>
                    On hand {line.onHand} · Reserved {line.reserved} · Available{" "}
                    {line.availableToSell}
                  </small>
                </span>
                <span className={styles.qtyControl}>
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
                    aria-label={`Adjustment quantity for ${line.sku}`}
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
                    onClick={() =>
                      onUpdateQuantity(line.variantId, line.quantity + 1)
                    }
                    type="button"
                  >
                    <Plus size={14} />
                  </button>
                </span>
                <button
                  aria-label={`Remove ${line.sku}`}
                  className={styles.removeButton}
                  onClick={() => onRemoveLine(line.variantId)}
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {direction === "OUT" ? (
        <div className={styles.postWarning}>
          <AlertTriangle size={18} />
          <div>
            <strong>Reserved units are intentionally protected</strong>
            <p>
              If the physical shortage affects units already reserved for
              orders, resolve those reservations first instead of silently
              reducing them.
            </p>
          </div>
        </div>
      ) : null}

      <div className={styles.footerActions}>
        <button className={styles.textButton} onClick={onBack} type="button">
          Back
        </button>
        <button
          className={styles.primaryButton}
          disabled={!lines.length}
          onClick={onContinue}
          type="button"
        >
          Review adjustment <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

function ReviewStep({
  direction,
  draftMovement,
  lines,
  locationName,
  notes,
  onBack,
  onConfirm,
  outAcknowledged,
  reason,
  saving,
  setNotes,
  setOutAcknowledged,
  setReason,
  totalUnits,
}: {
  direction: Direction;
  draftMovement: InventoryMovementContract | null;
  lines: AdjustmentLine[];
  locationName: string;
  notes: string;
  onBack: () => void;
  onConfirm: () => void;
  outAcknowledged: boolean;
  reason: string;
  saving: boolean;
  setNotes: (value: string) => void;
  setOutAcknowledged: (value: boolean) => void;
  setReason: (value: string) => void;
  totalUnits: number;
}) {
  const ready =
    reason.trim().length >= 3 && (direction === "IN" || outAcknowledged);
  return (
    <section className={styles.workflowCard}>
      <div className={styles.sectionIntro}>
        <p className={styles.eyebrow}>Step 3</p>
        <h2>Review before posting</h2>
        <p>
          This will create an immutable{" "}
          {direction === "IN" ? "Adjustment In" : "Adjustment Out"} movement for{" "}
          {locationName}.
        </p>
      </div>

      <div className={styles.reviewGrid}>
        <div className={styles.reviewCard}>
          <span>Location</span>
          <strong>{locationName}</strong>
          <small>Inventory ledger location</small>
        </div>
        <div className={styles.reviewCard}>
          <span>Direction</span>
          <strong>{direction === "IN" ? "Stock in" : "Stock out"}</strong>
          <small>
            {direction === "IN" ? "Increase on-hand" : "Decrease on-hand"}
          </small>
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
              <strong>
                {line.productName} · {line.color} / {line.size}
              </strong>
              <small>
                {line.sku} · Current on-hand {line.onHand} · Reserved{" "}
                {line.reserved}
              </small>
            </span>
            <b>
              {direction === "IN" ? "+" : "−"}
              {line.quantity}
            </b>
          </div>
        ))}
      </div>

      <label className={styles.noteField}>
        <span>
          Reason <small>Required</small>
        </span>
        <textarea
          maxLength={240}
          onChange={(event) => setReason(event.target.value)}
          placeholder={
            direction === "IN"
              ? "Example: cycle count found 3 units not recorded"
              : "Example: damaged during handling / physical count shortage"
          }
          rows={3}
          value={reason}
        />
      </label>
      <label className={styles.noteField}>
        <span>
          Additional details <small>Optional</small>
        </span>
        <textarea
          maxLength={650}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Reference, count sheet, damage note or internal context…"
          rows={3}
          value={notes}
        />
      </label>

      {direction === "OUT" ? (
        <label className={styles.postWarning}>
          <input
            checked={outAcknowledged}
            onChange={(event) => setOutAcknowledged(event.target.checked)}
            type="checkbox"
          />
          <div>
            <strong>I checked the physical difference</strong>
            <p>
              I understand this posts a real stock reduction and that reserved
              units are not being silently removed by this workflow.
            </p>
          </div>
        </label>
      ) : null}

      {draftMovement ? (
        <div className={styles.draftNotice}>
          <CheckCircle2 size={17} />
          <span>
            Draft {draftMovement.movementNumber} already exists. A retry will
            post this same draft instead of creating a duplicate correction.
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
          Back
        </button>
        <button
          className={styles.primaryButton}
          disabled={!ready || saving}
          onClick={onConfirm}
          type="button"
        >
          {saving ? (
            <LoaderCircle className={styles.spin} size={16} />
          ) : (
            <ClipboardCheck size={16} />
          )}
          Post adjustment
        </button>
      </div>
    </section>
  );
}

function SuccessStep({
  direction,
  locationName,
  movement,
  onReset,
  totalUnits,
}: {
  direction: Direction;
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
      <p className={styles.eyebrow}>Step 4 · Complete</p>
      <h2>Stock adjustment posted</h2>
      <p>
        {totalUnits} unit(s) were{" "}
        {direction === "IN" ? "added to" : "removed from"} {locationName}. SENVO
        preserved the correction as movement history.
      </p>
      <div className={styles.successMeta}>
        <span>Movement</span>
        <strong>{movement.movementNumber}</strong>
        <span>Status</span>
        <strong>{movement.status}</strong>
        <span>Type</span>
        <strong>{humanize(movement.type)}</strong>
      </div>
      <div className={styles.successActions}>
        <Link className={styles.secondaryButton} href="/inventory">
          Back to Inventory
        </Link>
        <Link className={styles.secondaryButton} href="/inventory/movements">
          Movement History
        </Link>
        <button
          className={styles.primaryButton}
          onClick={onReset}
          type="button"
        >
          New adjustment
        </button>
      </div>
    </section>
  );
}

function StepRail({ step }: { step: Step }) {
  const steps = ["Setup", "Items", "Review", "Complete"];
  return (
    <nav aria-label="Stock adjustment progress" className={styles.stepRail}>
      {steps.map((label, index) => {
        const number = (index + 1) as Step;
        const complete = number < step;
        const active = number === step;
        return (
          <div className={styles.stepGroup} key={label}>
            <span
              className={`${styles.step} ${active ? styles.stepActive : ""} ${complete ? styles.stepComplete : ""}`}
            >
              <span className={styles.stepNumber}>
                {complete ? <Check size={13} /> : number}
              </span>
              {label}
            </span>
            {number < 4 ? <span className={styles.stepLine} /> : null}
          </div>
        );
      })}
    </nav>
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
      {tone === "error" ? (
        <AlertTriangle size={17} />
      ) : (
        <CheckCircle2 size={17} />
      )}
      <span>{message}</span>
      <button aria-label="Dismiss message" onClick={onClose} type="button">
        ×
      </button>
    </div>
  );
}

function InlineLoading({ text }: { text: string }) {
  return (
    <div className={styles.inlineLoading}>
      <LoaderCircle className={styles.spin} size={15} /> {text}
    </div>
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
    <section className={styles.statePanel}>
      <span>{icon}</span>
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
        {action ? <div className={styles.stateAction}>{action}</div> : null}
      </div>
    </section>
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

function clampQty(value: number, maximum: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.trunc(value), Math.max(1, maximum)));
}

function movementNumber(id: string) {
  return `ADJ-${id.replace(/-/gu, "").slice(0, 12).toUpperCase()}`;
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function messageFor(error: unknown) {
  if (error instanceof AdminApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The stock adjustment could not be completed.";
}
