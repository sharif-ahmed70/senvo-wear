"use client";

import type {
  InventoryAvailabilityReadContract,
  InventoryMovementHistoryContract,
  StockLocationReadContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  LoaderCircle,
  MapPinned,
  PackagePlus,
  Search,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import {
  AdminApiClient,
  AdminApiError,
  type AdminApiResult,
} from "../../_lib/api-client";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type InventoryView = "availability" | "locations" | "movements";
type PageState<T> = {
  hasMore: boolean;
  items: T[];
  nextCursor: string | null;
};

export function InventoryWorkspace({
  permissions,
  view,
}: {
  permissions: readonly AdminPermissionKey[];
  view: InventoryView;
}) {
  if (!permissions.includes("INVENTORY:READ")) {
    return <InventoryRestricted />;
  }
  const canCreate = permissions.includes("INVENTORY:CREATE");
  return (
    <main className="inventory-page">
      <InventoryHeader canCreate={canCreate} view={view} />
      {view === "availability" ? <AvailabilityView /> : null}
      {view === "locations" ? <LocationsView /> : null}
      {view === "movements" ? <MovementsView /> : null}
    </main>
  );
}

function InventoryHeader({
  canCreate,
  view,
}: {
  canCreate?: boolean;
  view: InventoryView;
}) {
  return (
    <>
      <header className="inventory-header">
        <div>
          <p className="page-eyebrow">Inventory</p>
          <h1>{titleFor(view)}</h1>
        </div>
        {canCreate ? (
          <Link className="inventory-primary-button" href="/inventory/receive">
            <PackagePlus aria-hidden="true" size={16} />
            Receive Stock
          </Link>
        ) : null}
      </header>
      <nav aria-label="Inventory views" className="inventory-tabs">
        <InventoryTab
          active={view === "availability"}
          href="/inventory"
          label="Overview"
        />
        <InventoryTab
          active={view === "locations"}
          href="/inventory/locations"
          label="Locations"
        />
        <InventoryTab
          active={view === "movements"}
          href="/inventory/movements"
          label="Movements"
        />
        {canCreate ? (
          <InventoryTab
            active={false}
            href="/inventory/receive"
            label="Receive Stock"
          />
        ) : null}
      </nav>
    </>
  );
}

function InventoryTab({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link aria-current={active ? "page" : undefined} href={href}>
      {label}
    </Link>
  );
}

function AvailabilityView() {
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState("");
  const [filters, setFilters] = useState({ locationId: "", search: "" });
  const [locations, setLocations] = useState<StockLocationReadContract[]>([]);
  const pager = useInventoryPager<InventoryAvailabilityReadContract>(
    useCallback(
      (cursor) =>
        client.listInventoryAvailability({
          cursor,
          locationId: filters.locationId || undefined,
          pageSize: 25,
          search: filters.search || undefined,
        }),
      [filters],
    ),
  );

  useEffect(() => {
    void client
      .listStockLocations({ pageSize: 100 })
      .then((result) => setLocations(result.data.items))
      .catch(() => setLocations([]));
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    pager.reset();
    setFilters({ locationId, search: search.trim() });
  }

  return (
    <section className="inventory-section">
      <form className="inventory-filters" onSubmit={submit}>
        <label className="inventory-search">
          <Search aria-hidden="true" size={16} />
          <span className="sr-only">Search SKU or product</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search SKU or product"
            value={search}
          />
        </label>
        <label>
          <span className="sr-only">Location</span>
          <select
            onChange={(event) => setLocationId(event.target.value)}
            value={locationId}
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <button className="inventory-primary-button" type="submit">
          Apply
        </button>
      </form>
      <InventoryResult
        emptyIcon={Boxes}
        emptyTitle="No inventory positions"
        pager={pager}
        render={(items) => <AvailabilityTable items={items} />}
      />
    </section>
  );
}

function AvailabilityTable({
  items,
}: {
  items: InventoryAvailabilityReadContract[];
}) {
  return (
    <InventoryTable>
      <thead>
        <tr>
          <th>Product</th>
          <th>Variant</th>
          <th>SKU</th>
          <th>Location</th>
          <th className="inventory-number">On hand</th>
          <th className="inventory-number">Reserved</th>
          <th className="inventory-number">Available</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={`${item.variant.id}:${item.location.id}`}>
            <td>
              <Link href={`/catalog/products/${item.variant.productId}`}>
                {item.variant.productName}
              </Link>
            </td>
            <td>
              {item.variant.color} / {item.variant.size}
            </td>
            <td className="inventory-mono">{item.variant.sku}</td>
            <td>{item.location.name}</td>
            <td className="inventory-number">{item.onHand}</td>
            <td className="inventory-number">{item.reserved}</td>
            <td className="inventory-number inventory-available">
              {item.availableToSell}
            </td>
          </tr>
        ))}
      </tbody>
    </InventoryTable>
  );
}

function LocationsView() {
  const pager = useInventoryPager<StockLocationReadContract>(
    useCallback(
      (cursor) => client.listStockLocations({ cursor, pageSize: 25 }),
      [],
    ),
  );
  return (
    <section className="inventory-section">
      <InventoryResult
        emptyIcon={MapPinned}
        emptyTitle="No stock locations"
        pager={pager}
        render={(items) => (
          <InventoryTable>
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
              {items.map((location) => (
                <tr key={location.id}>
                  <td>
                    <strong>{location.name}</strong>
                  </td>
                  <td>
                    {location.branch.name}
                    <span className="inventory-subtle">
                      {location.branch.status}
                    </span>
                  </td>
                  <td>{humanize(location.type)}</td>
                  <td>{location.isSellable ? "Yes" : "No"}</td>
                  <td>
                    <StatusBadge value={location.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </InventoryTable>
        )}
      />
    </section>
  );
}

function MovementsView() {
  const [locationId, setLocationId] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [filters, setFilters] = useState({ locationId, status, type });
  const [locations, setLocations] = useState<StockLocationReadContract[]>([]);
  const pager = useInventoryPager<InventoryMovementHistoryContract>(
    useCallback(
      (cursor) =>
        client.listInventoryMovements({
          cursor,
          locationId: filters.locationId || undefined,
          pageSize: 25,
          status:
            filters.status === "DRAFT" || filters.status === "POSTED"
              ? filters.status
              : undefined,
          type: movementType(filters.type),
        }),
      [filters],
    ),
  );

  useEffect(() => {
    void client
      .listStockLocations({ pageSize: 100 })
      .then((result) => setLocations(result.data.items))
      .catch(() => setLocations([]));
  }, []);

  return (
    <section className="inventory-section">
      <form
        className="inventory-filters"
        onSubmit={(event) => {
          event.preventDefault();
          pager.reset();
          setFilters({ locationId, status, type });
        }}
      >
        <select
          aria-label="Location"
          onChange={(event) => setLocationId(event.target.value)}
          value={locationId}
        >
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Movement type"
          onChange={(event) => setType(event.target.value)}
          value={type}
        >
          <option value="">All types</option>
          {movementTypes.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          onChange={(event) => setStatus(event.target.value)}
          value={status}
        >
          <option value="">All statuses</option>
          <option value="POSTED">Posted</option>
          <option value="DRAFT">Draft</option>
        </select>
        <button className="inventory-primary-button" type="submit">
          Apply
        </button>
      </form>
      <InventoryResult
        emptyIcon={Boxes}
        emptyTitle="No inventory movements"
        pager={pager}
        render={(items) => (
          <InventoryTable>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Variant</th>
                <th>From</th>
                <th>To</th>
                <th className="inventory-number">Quantity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((movement, index) => (
                <tr key={`${movement.id}:${movement.variant.id}:${index}`}>
                  <td>{formatDate(movement.occurredAt)}</td>
                  <td>{humanize(movement.type)}</td>
                  <td>
                    <strong>{movement.variant.sku}</strong>
                    <span className="inventory-subtle">
                      {movement.variant.color} / {movement.variant.size}
                    </span>
                  </td>
                  <td>{movement.sourceLocation?.name ?? "External"}</td>
                  <td>{movement.destinationLocation?.name ?? "External"}</td>
                  <td className="inventory-number">{movement.quantity}</td>
                  <td>
                    <StatusBadge value={movement.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </InventoryTable>
        )}
      />
    </section>
  );
}

function useInventoryPager<T>(
  load: (cursor?: string) => Promise<AdminApiResult<PageState<T>>>,
): {
  cursorIndex: number;
  error: string;
  loading: boolean;
  next(): void;
  page: PageState<T>;
  previous(): void;
  reset(): void;
  retry(): void;
} {
  const [cursors, setCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [page, setPage] = useState<PageState<T>>({
    hasMore: false,
    items: [],
    nextCursor: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void load(cursors[cursorIndex])
      .then((result) => {
        if (active) setPage(result.data);
      })
      .catch((caught) => {
        if (active) setError(messageForError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cursorIndex, cursors, load, reload]);

  return {
    cursorIndex,
    error,
    loading,
    next() {
      if (!page.nextCursor) return;
      setLoading(true);
      setError("");
      setCursors((current) => [
        ...current.slice(0, cursorIndex + 1),
        page.nextCursor ?? undefined,
      ]);
      setCursorIndex((current) => current + 1);
    },
    page,
    previous() {
      setLoading(true);
      setError("");
      setCursorIndex((current) => Math.max(0, current - 1));
    },
    reset() {
      setLoading(true);
      setError("");
      setPage({ hasMore: false, items: [], nextCursor: null });
      setCursors([undefined]);
      setCursorIndex(0);
    },
    retry() {
      setLoading(true);
      setError("");
      setReload((current) => current + 1);
    },
  };
}

function InventoryResult<T>({
  emptyIcon: EmptyIcon,
  emptyTitle,
  pager,
  render,
}: {
  emptyIcon: typeof Boxes;
  emptyTitle: string;
  pager: ReturnType<typeof useInventoryPager<T>>;
  render: (items: T[]) => ReactNode;
}) {
  if (pager.loading) {
    return (
      <div aria-label="Loading inventory" className="inventory-state">
        <LoaderCircle aria-hidden="true" className="inventory-spin" size={22} />
      </div>
    );
  }
  if (pager.error) {
    return (
      <div className="inventory-state" role="alert">
        <AlertCircle aria-hidden="true" size={22} />
        <strong>Inventory data is unavailable</strong>
        <p>{pager.error}</p>
        <button
          className="inventory-secondary-button"
          onClick={() => pager.retry()}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }
  if (pager.page.items.length === 0) {
    return (
      <div className="inventory-state">
        <EmptyIcon aria-hidden="true" size={22} />
        <strong>{emptyTitle}</strong>
      </div>
    );
  }
  return (
    <>
      {render(pager.page.items)}
      <div className="inventory-pagination">
        <button
          aria-label="Previous page"
          className="inventory-icon-button"
          disabled={pager.cursorIndex === 0}
          onClick={() => pager.previous()}
          title="Previous page"
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={17} />
        </button>
        <span>Page {pager.cursorIndex + 1}</span>
        <button
          aria-label="Next page"
          className="inventory-icon-button"
          disabled={!pager.page.hasMore}
          onClick={() => pager.next()}
          title="Next page"
          type="button"
        >
          <ArrowRight aria-hidden="true" size={17} />
        </button>
      </div>
    </>
  );
}

function InventoryTable({ children }: { children: ReactNode }) {
  return (
    <div className="inventory-table-wrap">
      <table className="inventory-table">{children}</table>
    </div>
  );
}

function InventoryRestricted() {
  return (
    <main className="inventory-page">
      <div className="inventory-state" role="alert">
        <AlertCircle aria-hidden="true" size={22} />
        <strong>Inventory access is restricted</strong>
      </div>
    </main>
  );
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inventory-badge inventory-badge--${value.toLowerCase()}`}>
      {humanize(value)}
    </span>
  );
}

const movementTypes = [
  "OPENING",
  "RECEIPT",
  "ISSUE",
  "TRANSFER",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
] as const;

function movementType(value: string) {
  return movementTypes.find((type) => type === value);
}

function titleFor(view: InventoryView) {
  if (view === "locations") return "Stock locations";
  if (view === "movements") return "Movement history";
  return "Inventory overview";
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function messageForError(error: unknown): string {
  if (error instanceof AdminApiError) {
    return `${error.message} Request ${error.requestId}.`;
  }
  return "The inventory service could not complete this request.";
}
