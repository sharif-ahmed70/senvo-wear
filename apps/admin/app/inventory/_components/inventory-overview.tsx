"use client";

import type {
  BarcodeLookupContract,
  InventoryAvailabilityReadContract,
  InventoryMovementHistoryContract,
  StockLocationReadContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  MapPin,
  PackageCheck,
  RefreshCw,
  ScanBarcode,
  Search,
  ShieldCheck,
  SlidersHorizontal,
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
  type ReactNode,
} from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";
import { useAdminPermissions } from "../../admin-shell";
import styles from "./inventory-overview.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const PAGE_SIZE = 100;

type PageState<T> = {
  hasMore: boolean;
  items: T[];
  nextCursor: string | null;
};

type LoadState = "error" | "loading" | "ready";

type InventoryFilters = {
  locationId: string;
  search: string;
};

export function InventoryOverview({
  permissions: propsPermissions,
}: {
  permissions?: readonly AdminPermissionKey[];
} = {}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const canRead = permissions.includes("INVENTORY:READ");

  const canUpdate = permissions.includes("INVENTORY:UPDATE");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState<InventoryFilters>({
    locationId: "",
    search: "",
  });
  const [draftSearch, setDraftSearch] = useState("");
  const [draftLocationId, setDraftLocationId] = useState("");
  const [availability, setAvailability] = useState<
    PageState<InventoryAvailabilityReadContract>
  >({ hasMore: false, items: [], nextCursor: null });
  const [locations, setLocations] = useState<StockLocationReadContract[]>([]);
  const [movements, setMovements] = useState<
    InventoryMovementHistoryContract[]
  >([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState<BarcodeLookupContract | null>(
    null,
  );
  const [actionNotice, setActionNotice] = useState<
    null | "adjust" | "receive" | "transfer"
  >(null);

  const load = useCallback(async () => {
    if (!canRead) return;
    setState("loading");
    setError("");
    try {
      const [availabilityResult, locationResult, movementResult] =
        await Promise.all([
          client.listInventoryAvailability({
            locationId: filters.locationId || undefined,
            pageSize: PAGE_SIZE,
            search: filters.search || undefined,
          }),
          client.listStockLocations({ pageSize: PAGE_SIZE }),
          client.listInventoryMovements({ pageSize: 8 }),
        ]);
      setAvailability(availabilityResult.data);
      setLocations(locationResult.data.items);
      setMovements(movementResult.data.items);
      setState("ready");
    } catch (caught) {
      setError(messageFor(caught));
      setState("error");
    }
  }, [canRead, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const rows = availability.items;
    return {
      available: rows.reduce((sum, item) => sum + item.availableToSell, 0),
      fullyReserved: rows.filter(
        (item) => item.onHand > 0 && item.availableToSell === 0,
      ).length,
      onHand: rows.reduce((sum, item) => sum + item.onHand, 0),
      positions: rows.length,
      reserved: rows.reduce((sum, item) => sum + item.reserved, 0),
      zeroStock: rows.filter((item) => item.onHand === 0).length,
    };
  }, [availability.items]);

  const selectedLocation = locations.find(
    (location) => location.id === filters.locationId,
  );

  if (!canRead) {
    return (
      <StatePanel
        icon={<ShieldCheck size={28} />}
        title="Inventory access is restricted"
        text="Your role does not have permission to view inventory availability or movement history."
      />
    );
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({
      locationId: draftLocationId,
      search: draftSearch.trim(),
    });
  }

  function clearFilters() {
    setDraftLocationId("");
    setDraftSearch("");
    setFilters({ locationId: "", search: "" });
  }

  function applyScan(result: BarcodeLookupContract) {
    setScanResult(result);
    setDraftSearch(result.sku);
    setFilters((current) => ({ ...current, search: result.sku }));
    setNotice(
      `Showing inventory for ${result.productName} · ${result.color} / ${result.size}.`,
    );
    setScanOpen(false);
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Stock operations</p>
          <h1>Inventory</h1>
          <p>
            See what is physically on hand, what is reserved, and what can
            actually be sold across SENVO stock locations.
          </p>
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
          <button
            className={styles.primaryButton}
            onClick={() => setActionNotice("receive")}
            type="button"
          >
            <PackageCheck aria-hidden="true" size={16} />
            Receive Stock
          </button>
        </div>
      </header>

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

      <section className={styles.metrics} aria-label="Loaded inventory summary">
        <Metric
          icon={<Boxes size={18} />}
          label="On hand"
          meta={scopeText(availability.hasMore, selectedLocation?.name)}
          value={number(metrics.onHand)}
        />
        <Metric
          icon={<ClipboardList size={18} />}
          label="Reserved"
          meta="Committed to active demand"
          value={number(metrics.reserved)}
          tone="attention"
        />
        <Metric
          icon={<PackageCheck size={18} />}
          label="Available to sell"
          meta="On hand minus reservations"
          value={number(metrics.available)}
          tone="success"
        />
        <Metric
          icon={<AlertCircle size={18} />}
          label="Zero-stock positions"
          meta={`${metrics.fullyReserved} more fully reserved`}
          value={number(metrics.zeroStock)}
          tone={metrics.zeroStock ? "danger" : "success"}
        />
        <Metric
          icon={<MapPin size={18} />}
          label="Loaded locations"
          meta={
            locations.length === PAGE_SIZE
              ? "First 100 locations"
              : "Stock locations"
          }
          value={number(locations.length)}
        />
      </section>

      <section className={styles.overviewGrid}>
        <article className={styles.healthCard}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Availability health</p>
              <h2>Current loaded positions</h2>
            </div>
            <span className={styles.scopeBadge}>
              {availability.hasMore
                ? `First ${PAGE_SIZE} rows`
                : `${metrics.positions} rows`}
            </span>
          </div>
          <div className={styles.healthBody}>
            <HealthBar
              label="Sellable now"
              total={metrics.positions}
              value={
                availability.items.filter((item) => item.availableToSell > 0)
                  .length
              }
              tone="success"
            />
            <HealthBar
              label="Fully reserved"
              total={metrics.positions}
              value={metrics.fullyReserved}
              tone="attention"
            />
            <HealthBar
              label="Out of stock"
              total={metrics.positions}
              value={metrics.zeroStock}
              tone="danger"
            />
          </div>
          <p className={styles.truthNote}>
            SENVO does not invent valuation or low-stock thresholds here. This
            panel is derived only from the availability records returned by the
            backend.
          </p>
        </article>

        <article className={styles.activityCard}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Movement ledger</p>
              <h2>Recent activity</h2>
            </div>
            <Link href="/inventory/movements">
              View all
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className={styles.activityList}>
            {state === "loading" ? (
              <InlineLoading text="Loading movement history…" />
            ) : movements.length ? (
              movements
                .slice(0, 6)
                .map((movement, index) => (
                  <MovementItem
                    key={`${movement.id}:${movement.variant.id}:${index}`}
                    movement={movement}
                  />
                ))
            ) : (
              <div className={styles.emptyCompact}>
                <Truck size={20} />
                <span>No inventory movements yet.</span>
              </div>
            )}
          </div>
        </article>

        <article className={styles.quickCard}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Daily operations</p>
              <h2>Quick actions</h2>
            </div>
          </div>
          <div className={styles.quickList}>
            <QuickAction
              icon={<PackageCheck size={17} />}
              onClick={() => setActionNotice("receive")}
              subtitle="Add an incoming shipment without overwriting stock."
              title="Receive Stock"
            />
            <QuickAction
              icon={<Truck size={17} />}
              onClick={() => setActionNotice("transfer")}
              subtitle="Move stock between real SENVO locations."
              title="Transfer Stock"
            />
            <QuickAction
              icon={<SlidersHorizontal size={17} />}
              onClick={() => setActionNotice("adjust")}
              subtitle="Correct physical differences through ledger movement."
              title="Stock Adjustment"
            />
            <QuickAction
              icon={<ScanBarcode size={17} />}
              onClick={() => setScanOpen(true)}
              subtitle="Resolve a variant first, then inspect its availability."
              title="Scan to Find Stock"
            />
            <Link className={styles.quickLink} href="/inventory/locations">
              <span className={styles.quickIcon}>
                <MapPin size={17} />
              </span>
              <span>
                <strong>Stock Locations</strong>
                <small>Review warehouse, showroom and hold locations.</small>
              </span>
              <ArrowRight size={15} />
            </Link>
          </div>
          {!canUpdate ? (
            <p className={styles.permissionNote}>
              Your role can inspect inventory but cannot perform stock changes.
            </p>
          ) : null}
        </article>
      </section>

      <section className={styles.inventoryCard}>
        <div className={styles.cardHeaderLarge}>
          <div>
            <p className={styles.eyebrow}>Inventory at a glance</p>
            <h2>Real availability by variant and location</h2>
            <p>
              On hand comes from the movement ledger. Available to sell also
              accounts for active reservations.
            </p>
          </div>
          <button
            aria-label="Refresh inventory"
            className={styles.iconButton}
            disabled={state === "loading"}
            onClick={() => void load()}
            type="button"
          >
            <RefreshCw
              className={state === "loading" ? styles.spin : ""}
              size={16}
            />
          </button>
        </div>

        <form className={styles.filters} onSubmit={applyFilters}>
          <label className={styles.searchBox}>
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">Search product or SKU</span>
            <input
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Search product or SKU…"
              value={draftSearch}
            />
          </label>
          <label className={styles.selectShell}>
            <MapPin aria-hidden="true" size={15} />
            <span className="sr-only">Stock location</span>
            <select
              onChange={(event) => setDraftLocationId(event.target.value)}
              value={draftLocationId}
            >
              <option value="">All locations</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <button className={styles.secondaryButton} type="submit">
            <SlidersHorizontal size={15} />
            Apply filters
          </button>
          {filters.locationId || filters.search ? (
            <button
              className={styles.textButton}
              onClick={clearFilters}
              type="button"
            >
              Clear
            </button>
          ) : null}
        </form>

        {state === "loading" ? (
          <div className={styles.largeState}>
            <LoaderCircle className={styles.spin} size={24} />
            <span>Loading inventory availability…</span>
          </div>
        ) : state === "error" ? (
          <div className={styles.largeState} role="alert">
            <AlertCircle size={24} />
            <strong>Inventory data is unavailable</strong>
            <span>{error}</span>
            <button
              className={styles.secondaryButton}
              onClick={() => void load()}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : availability.items.length === 0 ? (
          <div className={styles.largeState}>
            <Boxes size={24} />
            <strong>No inventory positions match this view</strong>
            <span>Try another product/SKU or stock location.</span>
          </div>
        ) : (
          <AvailabilityTable items={availability.items} />
        )}

        <footer className={styles.tableFooter}>
          <span>
            {availability.hasMore
              ? `Showing the first ${availability.items.length} matching positions. Use filters to narrow the view.`
              : `${availability.items.length} matching inventory positions.`}
          </span>
          <Link href="/inventory/movements">
            Movement history
            <ArrowRight size={14} />
          </Link>
        </footer>
      </section>

      {scanOpen ? (
        <InventoryScanDialog
          onApply={applyScan}
          onClose={() => {
            setScanOpen(false);
            setScanResult(null);
          }}
          result={scanResult}
          setResult={setScanResult}
        />
      ) : null}

      {actionNotice ? (
        <ActionGateDialog
          action={actionNotice}
          canUpdate={canUpdate}
          onClose={() => setActionNotice(null)}
        />
      ) : null}
    </main>
  );
}

function AvailabilityTable({
  items,
}: {
  items: InventoryAvailabilityReadContract[];
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Product / Variant</th>
            <th>SKU</th>
            <th>Location</th>
            <th className={styles.numeric}>On hand</th>
            <th className={styles.numeric}>Reserved</th>
            <th className={styles.numeric}>Available</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const status = availabilityStatus(item);
            return (
              <tr key={`${item.variant.id}:${item.location.id}`}>
                <td>
                  <div className={styles.productIdentity}>
                    <span className={styles.productGlyph} aria-hidden="true">
                      {item.variant.productName.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <Link
                        href={`/catalog/products/${item.variant.productId}`}
                      >
                        {item.variant.productName}
                      </Link>
                      <small>
                        {item.variant.color} / {item.variant.size}
                      </small>
                    </span>
                  </div>
                </td>
                <td className={styles.mono}>{item.variant.sku}</td>
                <td>{item.location.name}</td>
                <td className={styles.numeric}>{number(item.onHand)}</td>
                <td className={styles.numeric}>{number(item.reserved)}</td>
                <td className={`${styles.numeric} ${styles.availableCell}`}>
                  {number(item.availableToSell)}
                </td>
                <td>
                  <span
                    className={`${styles.statusPill} ${styles[`status_${status.tone}`]}`}
                  >
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MovementItem({
  movement,
}: {
  movement: InventoryMovementHistoryContract;
}) {
  const direction = movement.destinationLocation?.name
    ? `to ${movement.destinationLocation.name}`
    : movement.sourceLocation?.name
      ? `from ${movement.sourceLocation.name}`
      : "external movement";
  return (
    <div className={styles.activityItem}>
      <span className={styles.activityIcon}>
        <Truck size={16} />
      </span>
      <span>
        <strong>{humanize(movement.type)}</strong>
        <small>
          {movement.variant.sku} · {movement.quantity} units · {direction}
        </small>
      </span>
      <time dateTime={movement.occurredAt}>
        {formatRelative(movement.occurredAt)}
      </time>
    </div>
  );
}

function Metric({
  icon,
  label,
  meta,
  tone = "default",
  value,
}: {
  icon: ReactNode;
  label: string;
  meta: string;
  tone?: "attention" | "danger" | "default" | "success";
  value: string;
}) {
  return (
    <article className={styles.metricCard}>
      <span className={`${styles.metricIcon} ${styles[`metricIcon_${tone}`]}`}>
        {icon}
      </span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em className={styles[`metricMeta_${tone}`]}>{meta}</em>
      </span>
    </article>
  );
}

function HealthBar({
  label,
  tone,
  total,
  value,
}: {
  label: string;
  tone: "attention" | "danger" | "success";
  total: number;
  value: number;
}) {
  const percentage = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className={styles.healthRow}>
      <div>
        <span>{label}</span>
        <strong>
          {value} <small>({percentage}%)</small>
        </strong>
      </div>
      <span className={styles.healthTrack}>
        <span
          className={styles[`healthFill_${tone}`]}
          style={{ width: `${percentage}%` }}
        />
      </span>
    </div>
  );
}

function QuickAction({
  icon,
  onClick,
  subtitle,
  title,
}: {
  icon: ReactNode;
  onClick: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <button className={styles.quickAction} onClick={onClick} type="button">
      <span className={styles.quickIcon}>{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <ArrowRight size={15} />
    </button>
  );
}

function InventoryScanDialog({
  onApply,
  onClose,
  result,
  setResult,
}: {
  onApply: (result: BarcodeLookupContract) => void;
  onClose: () => void;
  result: BarcodeLookupContract | null;
  setResult: (result: BarcodeLookupContract | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = data.get("barcode");
    if (typeof value !== "string" || !value.trim()) return;
    setLoading(true);
    setLocalError("");
    setResult(null);
    try {
      setResult((await client.lookupBarcode(value.trim())).data);
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 404) {
        setLocalError("No active product variant matches this barcode.");
      } else {
        setLocalError(messageFor(caught));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={styles.dialogBackdrop}
      onMouseDown={onClose}
      role="presentation"
    >
      <section
        aria-labelledby="inventory-scan-title"
        aria-modal="true"
        className={styles.dialog}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <p className={styles.eyebrow}>Inventory scanner</p>
            <h2 id="inventory-scan-title">Find stock by barcode</h2>
            <p>Scan with a keyboard-style scanner or type the label value.</p>
          </div>
          <button
            aria-label="Close"
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
            <ScanBarcode size={18} />
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
        {localError ? (
          <p className={styles.dialogError}>
            <AlertCircle size={15} />
            {localError}
          </p>
        ) : null}
        {result ? (
          <div className={styles.scanResult}>
            <span className={styles.scanSuccess}>
              <CheckCircle2 size={18} />
            </span>
            <span>
              <strong>{result.productName}</strong>
              <small>
                {result.color} / {result.size} · {result.sku}
              </small>
            </span>
            <button
              className={styles.secondaryButton}
              onClick={() => onApply(result)}
              type="button"
            >
              Show inventory
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ActionGateDialog({
  action,
  canUpdate,
  onClose,
}: {
  action: "adjust" | "receive" | "transfer";
  canUpdate: boolean;
  onClose: () => void;
}) {
  const copy = {
    adjust: {
      title: "Stock Adjustment",
      text: "Adjustments must create a ledger movement instead of overwriting quantity.",
    },
    receive: {
      title: "Receive Stock",
      text: "A receipt must create and post a real inventory movement into the selected stock location.",
    },
    transfer: {
      title: "Transfer Stock",
      text: "Transfers must move stock from one real location to another through the movement ledger.",
    },
  }[action];
  return (
    <div
      className={styles.dialogBackdrop}
      onMouseDown={onClose}
      role="presentation"
    >
      <section
        className={styles.dialog}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <p className={styles.eyebrow}>Safe stock operation</p>
            <h2>{copy.title}</h2>
            <p>{copy.text}</p>
          </div>
          <button
            aria-label="Close"
            className={styles.iconButton}
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>
        <div className={styles.integrationGate}>
          <ShieldCheck size={20} />
          <div>
            <strong>
              {canUpdate
                ? "Frontend is ready for the movement-create binding"
                : "Your role is read-only"}
            </strong>
            <p>
              {canUpdate
                ? "The current Admin HTTP surface can read inventory and post an existing draft movement, but it does not yet expose creation of a new movement. SENVO will not fake a successful stock change."
                : "Ask an Owner/Admin for inventory update permission before performing stock operations."}
            </p>
          </div>
        </div>
        <div className={styles.dialogActions}>
          <Link className={styles.secondaryButton} href="/inventory/movements">
            View movement history
          </Link>
          <button
            className={styles.primaryButton}
            onClick={onClose}
            type="button"
          >
            Got it
          </button>
        </div>
      </section>
    </div>
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
      className={`${styles.feedback} ${styles[`feedback_${tone}`]}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "success" ? (
        <CheckCircle2 size={16} />
      ) : (
        <AlertCircle size={16} />
      )}
      <span>{message}</span>
      <button aria-label="Dismiss" onClick={onClose} type="button">
        <X size={15} />
      </button>
    </div>
  );
}

function InlineLoading({ text }: { text: string }) {
  return (
    <div className={styles.inlineLoading}>
      <LoaderCircle className={styles.spin} size={18} />
      {text}
    </div>
  );
}

function StatePanel({
  icon,
  text,
  title,
}: {
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <section className={styles.statePanel}>
      {icon}
      <h1>{title}</h1>
      <p>{text}</p>
    </section>
  );
}

function availabilityStatus(item: InventoryAvailabilityReadContract) {
  if (item.onHand === 0)
    return { label: "Out of stock", tone: "danger" as const };
  if (item.availableToSell === 0)
    return { label: "Fully reserved", tone: "attention" as const };
  return { label: "Available", tone: "success" as const };
}

function scopeText(hasMore: boolean, location?: string) {
  if (location) return hasMore ? `${location} · first ${PAGE_SIZE}` : location;
  return hasMore ? `First ${PAGE_SIZE} positions` : "Current filtered scope";
}

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/gu, (letter) => letter.toUpperCase());
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
  return `${Math.floor(hours / 24)}d ago`;
}

function messageFor(error: unknown) {
  return error instanceof AdminApiError
    ? `${error.message} Request ID: ${error.requestId}`
    : error instanceof Error
      ? error.message
      : "Inventory data could not be loaded.";
}
