"use client";

import type { StockLocationReadContract } from "@senvo/contracts";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Boxes,
  Building2,
  CheckCircle2,
  CircleSlash2,
  Download,
  LoaderCircle,
  MapPin,
  PackagePlus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Warehouse,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import styles from "./stock-locations-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const PAGE_SIZE = 25;
const locationTypes = [
  "WAREHOUSE",
  "SHOWROOM",
  "QC_HOLD",
  "DAMAGE_HOLD",
  "RETURN_HOLD",
  "TRANSIT",
  "OTHER",
] as const;
const locationStatuses = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

type LocationType = (typeof locationTypes)[number];
type LocationStatus = (typeof locationStatuses)[number];
type ApiPage = {
  hasMore: boolean;
  items: StockLocationReadContract[];
  nextCursor: string | null;
};

export function StockLocationsWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("INVENTORY:READ");
  const [page, setPage] = useState<ApiPage>({
    hasMore: false,
    items: [],
    nextCursor: null,
  });
  const [cursors, setCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"" | LocationType>("");
  const [status, setStatus] = useState<"" | LocationStatus>("");
  const [branchId, setBranchId] = useState("");

  const load = useCallback(async () => {
    void reloadKey;
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      const result = await client.listStockLocations({
        cursor: cursors[cursorIndex],
        pageSize: PAGE_SIZE,
      });
      setPage(result.data);
    } catch (caught) {
      setError(messageFor(caught));
      setPage({ hasMore: false, items: [], nextCursor: null });
    } finally {
      setLoading(false);
    }
  }, [canRead, cursorIndex, cursors, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const branches = useMemo(() => {
    const values = new Map<string, string>();
    for (const location of page.items) {
      values.set(location.branch.id, location.branch.name);
    }
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [page.items]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return page.items.filter((location) => {
      if (type && location.type !== type) return false;
      if (status && location.status !== status) return false;
      if (branchId && location.branch.id !== branchId) return false;
      if (!query) return true;
      return [
        location.name,
        location.branch.name,
        location.type,
        location.status,
        location.isSellable ? "sellable" : "not sellable",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [branchId, page.items, search, status, type]);

  const metrics = useMemo(() => {
    const active = page.items.filter((item) => item.status === "ACTIVE").length;
    const sellable = page.items.filter((item) => item.isSellable).length;
    const branchCount = new Set(page.items.map((item) => item.branch.id)).size;
    return {
      active,
      branches: branchCount,
      loaded: page.items.length,
      sellable,
    };
  }, [page.items]);

  const typeMix = useMemo(() => {
    const counts = new Map<LocationType, number>();
    for (const location of page.items) {
      counts.set(location.type, (counts.get(location.type) ?? 0) + 1);
    }
    return locationTypes
      .map((locationType) => ({
        count: counts.get(locationType) ?? 0,
        type: locationType,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [page.items]);

  if (!canRead) {
    return (
      <StatePanel
        icon={<ShieldCheck size={28} />}
        text="Your role does not have permission to read inventory stock locations."
        title="Stock locations are restricted"
      />
    );
  }

  function clearFilters() {
    setSearch("");
    setType("");
    setStatus("");
    setBranchId("");
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
    const rows = [
      [
        "location_name",
        "branch",
        "branch_status",
        "type",
        "sellable",
        "status",
      ],
      ...visibleItems.map((location) => [
        location.name,
        location.branch.name,
        location.branch.status,
        location.type,
        location.isSellable ? "yes" : "no",
        location.status,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `senvo-stock-locations-page-${cursorIndex + 1}.csv`;
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
            <span>Stock Locations</span>
          </div>
          <h1>Stock Locations</h1>
          <p>
            See where inventory can physically live, which locations are active,
            and which ones can sell stock.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/inventory/movements">
            <ArrowRightLeft size={16} /> Movement History
          </Link>
          <Link className={styles.primaryButton} href="/inventory">
            <Boxes size={16} /> View Inventory
          </Link>
        </div>
      </header>

      <section
        className={styles.metrics}
        aria-label="Loaded stock location summary"
      >
        <Metric
          icon={<Building2 size={20} />}
          label="Loaded locations"
          meta={`Page ${cursorIndex + 1}${page.hasMore ? " · more available" : ""}`}
          value={metrics.loaded}
        />
        <Metric
          icon={<CheckCircle2 size={20} />}
          label="Active"
          meta="Usable locations on this API page"
          tone="green"
          value={metrics.active}
        />
        <Metric
          icon={<Store size={20} />}
          label="Sellable"
          meta="Locations allowed to sell stock"
          tone="blue"
          value={metrics.sellable}
        />
        <Metric
          icon={<MapPin size={20} />}
          label="Branches represented"
          meta="Distinct branches on this page"
          tone="amber"
          value={metrics.branches}
        />
      </section>

      <section className={styles.filterBar} aria-label="Stock location filters">
        <label className={styles.searchField}>
          <Search size={16} />
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search this page by location or branch…"
            value={search}
          />
          {search ? (
            <button
              aria-label="Clear search"
              onClick={() => setSearch("")}
              type="button"
            >
              <X size={14} />
            </button>
          ) : null}
        </label>
        <label className={styles.selectField}>
          <span className={styles.srOnly}>Location type</span>
          <select
            onChange={(event) =>
              setType(event.target.value as "" | LocationType)
            }
            value={type}
          >
            <option value="">All types</option>
            {locationTypes.map((locationType) => (
              <option key={locationType} value={locationType}>
                {humanize(locationType)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.selectField}>
          <span className={styles.srOnly}>Status</span>
          <select
            onChange={(event) =>
              setStatus(event.target.value as "" | LocationStatus)
            }
            value={status}
          >
            <option value="">All statuses</option>
            {locationStatuses.map((locationStatus) => (
              <option key={locationStatus} value={locationStatus}>
                {humanize(locationStatus)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.selectField}>
          <span className={styles.srOnly}>Branch</span>
          <select
            onChange={(event) => setBranchId(event.target.value)}
            value={branchId}
          >
            <option value="">All branches</option>
            {branches.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          className={styles.resetButton}
          onClick={clearFilters}
          type="button"
        >
          Reset
        </button>
        <button
          className={styles.exportButton}
          disabled={visibleItems.length === 0}
          onClick={exportCsv}
          type="button"
        >
          <Download size={15} /> Export page
        </button>
      </section>

      <div className={styles.workspaceGrid}>
        <section className={styles.tableCard}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Operational structure</p>
              <h2>Locations</h2>
            </div>
            <span>
              {visibleItems.length} visible · {page.items.length} loaded
            </span>
          </div>

          {loading ? (
            <InlineState
              icon={<LoaderCircle className={styles.spin} size={22} />}
              text="Reading stock locations from the inventory service…"
              title="Loading stock locations"
            />
          ) : error ? (
            <InlineState
              action={
                <button
                  onClick={() => setReloadKey((current) => current + 1)}
                  type="button"
                >
                  Retry
                </button>
              }
              icon={<RefreshCw size={21} />}
              text={error}
              title="Stock locations are unavailable"
            />
          ) : visibleItems.length === 0 ? (
            <InlineState
              icon={<CircleSlash2 size={22} />}
              text="Try another filter or clear the page search."
              title="No locations match this view"
            />
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Branch</th>
                    <th>Type</th>
                    <th>Sellable</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((location) => (
                    <tr key={location.id}>
                      <td>
                        <div className={styles.locationCell}>
                          <span>{iconForType(location.type)}</span>
                          <div>
                            <strong>{location.name}</strong>
                            <code title={location.id}>
                              {shortId(location.id)}
                            </code>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className={styles.branchCell}>
                          <strong>{location.branch.name}</strong>
                          <small>{humanize(location.branch.status)}</small>
                        </div>
                      </td>
                      <td>
                        <TypeBadge type={location.type} />
                      </td>
                      <td>
                        <span
                          className={
                            location.isSellable
                              ? styles.sellable
                              : styles.notSellable
                          }
                        >
                          {location.isSellable ? "Yes" : "No"}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={location.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.pagination}>
            <span>Page {cursorIndex + 1} · cursor pagination</span>
            <div>
              <button
                aria-label="Previous page"
                disabled={cursorIndex === 0 || loading}
                onClick={previousPage}
                type="button"
              >
                <ArrowLeft size={16} />
              </button>
              <button
                aria-label="Next page"
                disabled={!page.hasMore || !page.nextCursor || loading}
                onClick={nextPage}
                type="button"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>

        <aside className={styles.sideColumn}>
          <section className={styles.sideCard}>
            <div className={styles.sideHeading}>
              <p className={styles.eyebrow}>Current API page</p>
              <h2>Location Types</h2>
            </div>
            {typeMix.length ? (
              <div className={styles.typeMix}>
                {typeMix.map((item) => (
                  <div key={item.type}>
                    <span>{iconForType(item.type)}</span>
                    <strong>{humanize(item.type)}</strong>
                    <b>{item.count}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.helperText}>
                No location types are loaded yet.
              </p>
            )}
          </section>

          <section className={styles.sideCard}>
            <div className={styles.sideHeading}>
              <p className={styles.eyebrow}>Stock operations</p>
              <h2>Quick Actions</h2>
            </div>
            <QuickAction
              href="/inventory/receive"
              icon={<PackagePlus size={18} />}
              text="Receive physical stock into a location"
              title="Receive Stock"
            />
            <QuickAction
              href="/inventory/transfer"
              icon={<ArrowRightLeft size={18} />}
              text="Move available stock between locations"
              title="Transfer Stock"
            />
            <QuickAction
              href="/inventory/adjustment"
              icon={<SlidersHorizontal size={18} />}
              text="Correct a verified stock difference"
              title="Stock Adjustment"
            />
            <QuickAction
              href="/inventory"
              icon={<Boxes size={18} />}
              text="Check On Hand, Reserved and Available"
              title="Inventory Overview"
            />
          </section>

          <section className={styles.guideCard}>
            <MapPin size={20} />
            <div>
              <strong>Location ≠ branch</strong>
              <p>
                A branch is the business site. A stock location is the physical
                inventory bucket inside that operating structure.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Metric({
  icon,
  label,
  meta,
  tone = "neutral",
  value,
}: {
  icon: ReactNode;
  label: string;
  meta: string;
  tone?: "neutral" | "green" | "blue" | "amber";
  value: number;
}) {
  return (
    <article className={styles.metricCard}>
      <span className={`${styles.metricIcon} ${styles[`metric_${tone}`]}`}>
        {icon}
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </article>
  );
}

function TypeBadge({ type }: { type: LocationType }) {
  return (
    <span className={`${styles.typeBadge} ${styles[`type_${type}`]}`}>
      {humanize(type)}
    </span>
  );
}

function StatusBadge({ status }: { status: LocationStatus }) {
  return (
    <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
      {status === "ACTIVE" ? <CheckCircle2 size={12} /> : null}
      {humanize(status)}
    </span>
  );
}

function QuickAction({
  href,
  icon,
  text,
  title,
}: {
  href: string;
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <Link className={styles.quickAction} href={href}>
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
      <ArrowRight size={15} />
    </Link>
  );
}

function InlineState({
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
    <div className={styles.inlineState}>
      {icon}
      <strong>{title}</strong>
      <p>{text}</p>
      {action ? <div>{action}</div> : null}
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
    <main className={styles.page}>
      <section className={styles.statePanel}>
        <span>{icon}</span>
        <div>
          <h1>{title}</h1>
          <p>{text}</p>
          <Link href="/">Back to dashboard</Link>
        </div>
      </section>
    </main>
  );
}

function iconForType(type: LocationType) {
  if (type === "WAREHOUSE") return <Warehouse size={17} />;
  if (type === "SHOWROOM") return <Store size={17} />;
  if (type === "QC_HOLD" || type === "DAMAGE_HOLD" || type === "RETURN_HOLD") {
    return <ShieldCheck size={17} />;
  }
  if (type === "TRANSIT") return <ArrowRightLeft size={17} />;
  return <MapPin size={17} />;
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replace(/_/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function shortId(value: string) {
  return value ? `LOC-${value.slice(0, 8).toUpperCase()}` : "Location";
}

function csvCell(value: string) {
  return `"${value.replace(/"/gu, '""')}"`;
}

function messageFor(caught: unknown) {
  if (caught instanceof AdminApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return "Stock locations could not be loaded.";
}
