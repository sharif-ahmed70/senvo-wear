"use client";

import type {
  InventoryMovementHistoryContract,
  StockLocationReadContract,
} from "@senvo/contracts";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Barcode,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  Eye,
  LoaderCircle,
  MapPin,
  PackageMinus,
  PackagePlus,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
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
import styles from "./movement-history-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const PAGE_SIZE = 25;
const movementTypes = [
  "OPENING",
  "RECEIPT",
  "ISSUE",
  "TRANSFER",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
] as const;

type MovementType = (typeof movementTypes)[number];
type MovementStatus = "DRAFT" | "POSTED";
type ApiPage = {
  hasMore: boolean;
  items: InventoryMovementHistoryContract[];
  nextCursor: string | null;
};

type Filters = {
  locationId: string;
  status: "" | MovementStatus;
  type: "" | MovementType;
};

export function MovementHistoryWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("INVENTORY:READ");
  const [locations, setLocations] = useState<StockLocationReadContract[]>([]);
  const [locationId, setLocationId] = useState("");
  const [type, setType] = useState<"" | MovementType>("");
  const [status, setStatus] = useState<"" | MovementStatus>("");
  const [filters, setFilters] = useState<Filters>({ locationId: "", status: "", type: "" });
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [page, setPage] = useState<ApiPage>({ hasMore: false, items: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedKey, setSelectedKey] = useState("");

  const loadLocations = useCallback(async () => {
    if (!canRead) return;
    try {
      const result = await client.listStockLocations({ pageSize: 100 });
      setLocations(result.data.items);
    } catch {
      setLocations([]);
    }
  }, [canRead]);

  const loadMovements = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      const result = await client.listInventoryMovements({
        cursor: cursors[cursorIndex],
        locationId: filters.locationId || undefined,
        pageSize: PAGE_SIZE,
        status: filters.status || undefined,
        type: filters.type || undefined,
      });
      setPage(result.data);
      setSelectedKey((current) => {
        if (current && result.data.items.some((item, index) => rowKey(item, index) === current)) {
          return current;
        }
        const first = result.data.items[0];
        return first ? rowKey(first, 0) : "";
      });
    } catch (caught) {
      setError(messageFor(caught));
      setPage({ hasMore: false, items: [], nextCursor: null });
      setSelectedKey("");
    } finally {
      setLoading(false);
    }
  }, [canRead, cursorIndex, cursors, filters, reloadKey]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return page.items;
    return page.items.filter((movement) =>
      [
        movement.id,
        movement.type,
        movement.status,
        movement.variant.productName,
        movement.variant.sku,
        movement.variant.color,
        movement.variant.size,
        movement.sourceLocation?.name ?? "",
        movement.destinationLocation?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [page.items, search]);

  const selected = useMemo(() => {
    const indexed = page.items.map((item, index) => ({ item, key: rowKey(item, index) }));
    return indexed.find((entry) => entry.key === selectedKey)?.item ?? visibleItems[0] ?? null;
  }, [page.items, selectedKey, visibleItems]);

  const pageMetrics = useMemo(() => {
    let receipts = 0;
    let transfers = 0;
    let adjustments = 0;
    let reversals = 0;
    for (const item of page.items) {
      if (item.type === "RECEIPT") receipts += 1;
      if (item.type === "TRANSFER") transfers += 1;
      if (item.type === "ADJUSTMENT_IN" || item.type === "ADJUSTMENT_OUT") adjustments += 1;
      // The read contract does not expose isReversal, so reversal count is intentionally unavailable.
    }
    return { adjustments, loaded: page.items.length, receipts, reversals, transfers };
  }, [page.items]);

  if (!canRead) {
    return (
      <StatePanel
        icon={<ShieldCheck size={28} />}
        title="Movement history is restricted"
        text="Your role does not have permission to read inventory movements."
      />
    );
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCursors([undefined]);
    setCursorIndex(0);
    setFilters({ locationId, status, type });
  }

  function clearFilters() {
    setLocationId("");
    setType("");
    setStatus("");
    setSearch("");
    setCursors([undefined]);
    setCursorIndex(0);
    setFilters({ locationId: "", status: "", type: "" });
  }

  function previousPage() {
    if (cursorIndex === 0) return;
    setCursorIndex((current) => Math.max(0, current - 1));
  }

  function nextPage() {
    if (!page.nextCursor) return;
    setCursors((current) => [
      ...current.slice(0, cursorIndex + 1),
      page.nextCursor ?? undefined,
    ]);
    setCursorIndex((current) => current + 1);
  }

  function exportCsv() {
    if (visibleItems.length === 0) return;
    const header = ["movement_id", "occurred_at", "type", "status", "product", "sku", "variant", "source", "destination", "quantity"];
    const rows = visibleItems.map((item) => [
      item.id,
      item.occurredAt,
      item.type,
      item.status,
      item.variant.productName,
      item.variant.sku,
      `${item.variant.color} / ${item.variant.size}`,
      item.sourceLocation?.name ?? "External",
      item.destinationLocation?.name ?? "External",
      String(item.quantity),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `senvo-inventory-movements-page-${cursorIndex + 1}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.breadcrumbs}>
            <Link href="/inventory">Inventory</Link>
            <span>/</span>
            <span>Movement History</span>
          </div>
          <h1>Movement History</h1>
          <p>Track receipts, transfers, adjustments and other inventory ledger movements across SENVO locations.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/catalog/barcodes">
            <Barcode size={16} /> Scan Barcode
          </Link>
          <Link className={styles.primaryButton} href="/inventory/receive">
            <PackagePlus size={16} /> Receive Stock
          </Link>
        </div>
      </header>

      <section className={styles.metricGrid} aria-label="Current page movement summary">
        <Metric icon={<ClipboardList size={20} />} label="Loaded movements" value={pageMetrics.loaded} note={`Page ${cursorIndex + 1}`} />
        <Metric icon={<PackagePlus size={20} />} label="Receipts on page" value={pageMetrics.receipts} note="Current API page" tone="green" />
        <Metric icon={<ArrowRightLeft size={20} />} label="Transfers on page" value={pageMetrics.transfers} note="Current API page" tone="blue" />
        <Metric icon={<SlidersHorizontal size={20} />} label="Adjustments on page" value={pageMetrics.adjustments} note="Current API page" tone="amber" />
      </section>

      <form className={styles.filterBar} onSubmit={applyFilters}>
        <label className={styles.searchField}>
          <Search size={16} />
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search this page by product, SKU or location…"
            value={search}
          />
          {search ? (
            <button aria-label="Clear search" onClick={() => setSearch("")} type="button">
              <X size={14} />
            </button>
          ) : null}
        </label>
        <SelectField label="Location">
          <select onChange={(event) => setLocationId(event.target.value)} value={locationId}>
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </SelectField>
        <SelectField label="Type">
          <select onChange={(event) => setType(event.target.value as "" | MovementType)} value={type}>
            <option value="">All types</option>
            {movementTypes.map((movementType) => (
              <option key={movementType} value={movementType}>{humanize(movementType)}</option>
            ))}
          </select>
        </SelectField>
        <SelectField label="Status">
          <select onChange={(event) => setStatus(event.target.value as "" | MovementStatus)} value={status}>
            <option value="">All statuses</option>
            <option value="POSTED">Posted</option>
            <option value="DRAFT">Draft</option>
          </select>
        </SelectField>
        <button className={styles.filterButton} type="submit">Apply</button>
        <button className={styles.clearButton} onClick={clearFilters} type="button">Reset</button>
        <button className={styles.exportButton} disabled={visibleItems.length === 0} onClick={exportCsv} type="button">
          <Download size={15} /> Export page
        </button>
      </form>

      <div className={styles.workspaceGrid}>
        <section className={styles.tableCard}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Ledger activity</p>
              <h2>Recent Movements</h2>
            </div>
            <span>{visibleItems.length} visible · {page.items.length} loaded</span>
          </div>

          {loading ? (
            <InlineState icon={<LoaderCircle className={styles.spin} size={22} />} title="Loading movement history" text="Reading the inventory movement ledger…" />
          ) : error ? (
            <InlineState
              action={<button onClick={() => setReloadKey((current) => current + 1)} type="button">Retry</button>}
              icon={<RotateCcw size={21} />}
              title="Movement history is unavailable"
              text={error}
            />
          ) : visibleItems.length === 0 ? (
            <InlineState icon={<Boxes size={22} />} title="No movements match this view" text="Try another filter or clear the page search." />
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date & time</th>
                    <th>Type</th>
                    <th>Product / SKU</th>
                    <th>Route</th>
                    <th>Qty</th>
                    <th>Status</th>
                    <th><span className={styles.srOnly}>Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((movement) => {
                    const originalIndex = page.items.indexOf(movement);
                    const key = rowKey(movement, originalIndex);
                    const isSelected = selectedKey === key;
                    return (
                      <tr className={isSelected ? styles.rowSelected : undefined} key={key}>
                        <td>{formatDateTime(movement.occurredAt)}</td>
                        <td><TypeBadge type={movement.type as MovementType} /></td>
                        <td>
                          <div className={styles.productCell}>
                            <span className={styles.productGlyph}>{initials(movement.variant.productName)}</span>
                            <span>
                              <strong>{movement.variant.productName}</strong>
                              <small>{movement.variant.color} / {movement.variant.size}</small>
                              <code>{movement.variant.sku}</code>
                            </span>
                          </div>
                        </td>
                        <td><MovementRoute movement={movement} /></td>
                        <td><Quantity movement={movement} /></td>
                        <td><StatusBadge status={movement.status as MovementStatus} /></td>
                        <td>
                          <button
                            aria-label={`Inspect ${movement.variant.sku} movement`}
                            className={styles.inspectButton}
                            onClick={() => setSelectedKey(key)}
                            title="Inspect movement"
                            type="button"
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.pagination}>
            <span>Page {cursorIndex + 1} · cursor pagination</span>
            <div>
              <button aria-label="Previous page" disabled={cursorIndex === 0 || loading} onClick={previousPage} type="button">
                <ArrowLeft size={16} />
              </button>
              <button aria-label="Next page" disabled={!page.hasMore || !page.nextCursor || loading} onClick={nextPage} type="button">
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>

        <aside className={styles.sideColumn}>
          <MovementPreview movement={selected} />
          <section className={styles.quickCard}>
            <div className={styles.sideHeading}>
              <p className={styles.eyebrow}>Operational shortcuts</p>
              <h2>Quick Actions</h2>
            </div>
            <QuickAction href="/inventory/receive" icon={<PackagePlus size={18} />} title="Receive Stock" text="Add physically received units" />
            <QuickAction href="/inventory/transfer" icon={<ArrowRightLeft size={18} />} title="Transfer Stock" text="Move available stock between locations" />
            <QuickAction href="/inventory/adjustment" icon={<SlidersHorizontal size={18} />} title="Stock Adjustment" text="Correct a verified stock difference" />
            <QuickAction href="/inventory" icon={<Boxes size={18} />} title="View Inventory" text="Check On Hand, Reserved and Available" />
          </section>
        </aside>
      </div>
    </main>
  );
}

function MovementPreview({ movement }: { movement: InventoryMovementHistoryContract | null }) {
  if (!movement) {
    return (
      <section className={styles.previewCard}>
        <InlineState icon={<Eye size={22} />} title="Select a movement" text="Choose a row to inspect the data currently exposed by the inventory read API." />
      </section>
    );
  }
  return (
    <section className={styles.previewCard}>
      <div className={styles.previewHeader}>
        <div>
          <p className={styles.eyebrow}>Selected line</p>
          <h2>Movement Detail</h2>
        </div>
        <StatusBadge status={movement.status as MovementStatus} />
      </div>
      <div className={styles.previewHero}>
        <span className={styles.previewIcon}>{iconForType(movement.type as MovementType)}</span>
        <div>
          <TypeBadge type={movement.type as MovementType} />
          <strong>{shortId(movement.id)}</strong>
          <small>{formatDateTime(movement.occurredAt)}</small>
        </div>
      </div>
      <div className={styles.routePanel}>
        <PreviewLocation label="From location" location={movement.sourceLocation?.name ?? "External / none"} />
        <PreviewLocation label="To location" location={movement.destinationLocation?.name ?? "External / none"} />
      </div>
      <div className={styles.previewItem}>
        <span className={styles.productGlyph}>{initials(movement.variant.productName)}</span>
        <div>
          <strong>{movement.variant.productName}</strong>
          <span>{movement.variant.color} / {movement.variant.size}</span>
          <code>{movement.variant.sku}</code>
        </div>
        <Quantity movement={movement} />
      </div>
      <div className={styles.recordMeta}>
        <span>Movement ID</span>
        <code title={movement.id}>{movement.id}</code>
      </div>
      <p className={styles.integrationNote}>
        Reference, notes, reversal metadata and full movement lines are intentionally not invented here. The current read contract does not expose them; a future detail endpoint can hydrate this same panel without redesigning it.
      </p>
    </section>
  );
}

function Metric({ icon, label, note, tone = "neutral", value }: { icon: ReactNode; label: string; note: string; tone?: "neutral" | "green" | "blue" | "amber"; value: number }) {
  return (
    <article className={styles.metricCard}>
      <span className={`${styles.metricIcon} ${styles[`metric_${tone}`]}`}>{icon}</span>
      <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </article>
  );
}

function SelectField({ children, label }: { children: ReactNode; label: string }) {
  return <label className={styles.selectField}><span className={styles.srOnly}>{label}</span>{children}<ChevronDown size={14} /></label>;
}

function TypeBadge({ type }: { type: MovementType }) {
  return <span className={`${styles.badge} ${styles[`type_${type}`]}`}>{humanize(type)}</span>;
}

function StatusBadge({ status }: { status: MovementStatus }) {
  return <span className={`${styles.statusBadge} ${status === "POSTED" ? styles.posted : styles.draft}`}>{status === "POSTED" ? <CheckCircle2 size={12} /> : null}{humanize(status)}</span>;
}

function MovementRoute({ movement }: { movement: InventoryMovementHistoryContract }) {
  if (movement.type === "TRANSFER") {
    return (
      <span className={styles.routeText}>
        <span>{movement.sourceLocation?.name ?? "Unknown source"}</span>
        <ArrowRight size={13} />
        <span>{movement.destinationLocation?.name ?? "Unknown destination"}</span>
      </span>
    );
  }
  return (
    <span className={styles.routeText}>
      <MapPin size={13} />
      <span>{movement.destinationLocation?.name ?? movement.sourceLocation?.name ?? "External"}</span>
    </span>
  );
}

function Quantity({ movement }: { movement: InventoryMovementHistoryContract }) {
  const type = movement.type as MovementType;
  const incoming = type === "OPENING" || type === "RECEIPT" || type === "ADJUSTMENT_IN";
  const outgoing = type === "ISSUE" || type === "ADJUSTMENT_OUT";
  return (
    <span className={`${styles.quantity} ${incoming ? styles.quantityIn : outgoing ? styles.quantityOut : styles.quantityMove}`}>
      {incoming ? "+" : outgoing ? "−" : "↔"}{movement.quantity}
    </span>
  );
}

function PreviewLocation({ label, location }: { label: string; location: string }) {
  return <div><span><MapPin size={15} /></span><div><small>{label}</small><strong>{location}</strong></div></div>;
}

function QuickAction({ href, icon, text, title }: { href: string; icon: ReactNode; text: string; title: string }) {
  return <Link className={styles.quickAction} href={href}><span>{icon}</span><div><strong>{title}</strong><small>{text}</small></div><ArrowRight size={15} /></Link>;
}

function InlineState({ action, icon, text, title }: { action?: ReactNode; icon: ReactNode; text: string; title: string }) {
  return <div className={styles.inlineState}>{icon}<strong>{title}</strong><p>{text}</p>{action ? <div>{action}</div> : null}</div>;
}

function StatePanel({ icon, text, title }: { icon: ReactNode; text: string; title: string }) {
  return <main className={styles.page}><section className={styles.statePanel}><span>{icon}</span><div><h1>{title}</h1><p>{text}</p><Link href="/">Back to dashboard</Link></div></section></main>;
}

function iconForType(type: MovementType) {
  if (type === "RECEIPT" || type === "OPENING") return <PackagePlus size={20} />;
  if (type === "TRANSFER") return <ArrowRightLeft size={20} />;
  if (type === "ISSUE" || type === "ADJUSTMENT_OUT") return <PackageMinus size={20} />;
  return <SlidersHorizontal size={20} />;
}

function rowKey(movement: InventoryMovementHistoryContract, index: number) {
  return `${movement.id}:${movement.variant.id}:${index}`;
}

function shortId(id: string) {
  return `MOV-${id.slice(0, 8).toUpperCase()}`;
}

function initials(value: string) {
  return value.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "SW";
}

function humanize(value: string) {
  return value.toLowerCase().replace(/_/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function csvCell(value: string) {
  return `"${value.replace(/"/gu, '""')}"`;
}

function messageFor(caught: unknown) {
  if (caught instanceof AdminApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return "Movement history could not be loaded.";
}
