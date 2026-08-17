"use client";

import type {
  SalesOrderDetailsReadContract,
  SalesOrderListReadContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleX,
  LoaderCircle,
  PackageCheck,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

export function SalesOrdersWorkspace({
  orderId,
  permissions,
  view,
}: {
  orderId?: string;
  permissions: readonly AdminPermissionKey[];
  view: "details" | "list";
}) {
  if (!permissions.includes("SALES_ORDER:READ")) {
    return <SalesRestricted />;
  }
  return (
    <main className="sales-page">
      {view === "list" ? (
        <SalesOrderList />
      ) : (
        <SalesOrderDetails
          canUpdate={permissions.includes("SALES_ORDER:UPDATE")}
          orderId={orderId ?? ""}
        />
      )}
    </main>
  );
}

function SalesOrderList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [filters, setFilters] = useState({
    channel: "",
    search: "",
    status: "",
  });
  const pager = useSalesPager(
    useCallback(
      (cursor) =>
        client.listSalesOrders({
          cursor,
          channel: (filters.channel || undefined) as
            | "ONLINE"
            | "OFFLINE_STORE"
            | "EVENT_BOOTH"
            | "POS"
            | "MANUAL"
            | undefined,
          order: "NEWEST",
          pageSize: 25,
          search: filters.search || undefined,
          status: (filters.status || undefined) as
            | "CANCELLED"
            | "CONFIRMED"
            | "DRAFT"
            | "FULFILLED"
            | "RESERVED"
            | undefined,
        }),
      [filters],
    ),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    pager.reset();
    setFilters({ channel, search: search.trim(), status });
  }

  return (
    <>
      <header className="sales-header">
        <div>
          <p className="page-eyebrow">Sales</p>
          <h1>Sales Orders</h1>
        </div>
      </header>
      <section className="sales-section">
        <form className="sales-filters" onSubmit={submit}>
          <label className="sales-search">
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">Search order number</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order number"
              value={search}
            />
          </label>
          <label>
            <span className="sr-only">Sales source</span>
            <select
              onChange={(event) => setChannel(event.target.value)}
              value={channel}
            >
              <option value="">All sales sources</option>
              <option value="ONLINE">Online orders</option>
              <option value="OFFLINE_STORE">Store orders</option>
              <option value="EVENT_BOOTH">Booth orders</option>
              <option value="POS">POS sales</option>
              <option value="MANUAL">Manual orders</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Order status</span>
            <select
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="RESERVED">Reserved</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="FULFILLED">Fulfilled</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <button className="sales-primary-button" type="submit">
            Apply
          </button>
        </form>
        <SalesResult pager={pager} />
      </section>
    </>
  );
}

function SalesResult({ pager }: { pager: ReturnType<typeof useSalesPager> }) {
  if (pager.loading) return <SalesState loading label="Loading orders" />;
  if (pager.error) {
    return (
      <SalesState
        label={pager.error}
        retry={() => void pager.load()}
        role="alert"
      />
    );
  }
  if (pager.items.length === 0) {
    return <SalesState label="No sales orders match these filters." />;
  }
  return (
    <>
      <div className="sales-table-wrap">
        <table className="sales-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Sales source</th>
              <th>Payment</th>
              <th>Status</th>
              <th className="sales-number">Amount</th>
              <th>Date</th>
              <th>Delivery area</th>
            </tr>
          </thead>
          <tbody>
            {pager.items.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/sales/orders/${order.id}`}>
                    {order.orderNumber}
                  </Link>
                </td>
                <td>
                  <strong>{order.customer.name ?? "Guest"}</strong>
                  <br />
                  <span className="sales-subtle">
                    {order.customer.phone ?? "No phone"}
                  </span>
                </td>
                <td>
                  {order.channel === "ONLINE"
                    ? "Online"
                    : order.channel.replaceAll("_", " ")}
                </td>
                <td>
                  {order.commerce?.paymentPreference === "CASH_ON_DELIVERY"
                    ? "Cash on delivery - Unpaid"
                    : "Not available"}
                </td>
                <td>
                  <StatusBadge value={order.status} />
                </td>
                <td className="sales-number">
                  {formatMoney(order.totalMinor, order.currencyCode)}
                </td>
                <td>{formatDate(order.createdAt)}</td>
                <td>
                  {[order.delivery.district, order.delivery.city]
                    .filter(Boolean)
                    .join(", ") || "Not provided"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sales-pagination">
        <button
          aria-label="Previous page"
          className="sales-icon-button"
          disabled={!pager.canPrevious}
          onClick={pager.previous}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <span>Page {pager.page + 1}</span>
        <button
          aria-label="Next page"
          className="sales-icon-button"
          disabled={!pager.hasMore}
          onClick={pager.next}
          type="button"
        >
          <ArrowRight aria-hidden="true" size={18} />
        </button>
      </div>
    </>
  );
}

function SalesOrderDetails({
  canUpdate,
  orderId,
}: {
  canUpdate: boolean;
  orderId: string;
}) {
  const [order, setOrder] = useState<SalesOrderDetailsReadContract | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrder((await client.getSalesOrder(orderId)).data);
    } catch (caught) {
      setError(safeMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function runAction(action: SalesAction) {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const input = { expectedVersion: order.version, salesOrderId: order.id };
      if (action === "reserve") await client.reserveSalesOrder(input);
      if (action === "confirm") await client.confirmSalesOrder(input);
      if (action === "fulfill") await client.fulfillSalesOrder(input);
      if (action === "cancel") await client.cancelSalesOrder(input);
      await load();
    } catch (caught) {
      setError(safeMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <SalesState loading label="Loading order details" />;
  if (!order) {
    return (
      <SalesState
        label={error ?? "Order was not found."}
        retry={() => void load()}
      />
    );
  }
  return (
    <SalesOrderDetailsPanel
      busy={busy}
      canUpdate={canUpdate}
      error={error}
      onAction={(action) => void runAction(action)}
      order={order}
    />
  );
}

type SalesAction = "cancel" | "confirm" | "fulfill" | "reserve";

export function SalesOrderDetailsPanel({
  busy,
  canUpdate,
  error,
  onAction,
  order,
}: {
  busy: boolean;
  canUpdate: boolean;
  error?: string | null;
  onAction: (action: SalesAction) => void;
  order: SalesOrderDetailsReadContract;
}) {
  const actions = allowedActions(order.status);
  return (
    <>
      <header className="sales-detail-header">
        <div>
          <Link className="sales-back-link" href="/sales/orders">
            <ArrowLeft aria-hidden="true" size={16} /> Orders
          </Link>
          <p className="page-eyebrow">Sales order</p>
          <div className="sales-title-row">
            <h1>{order.orderNumber}</h1>
            <StatusBadge value={order.status} />
          </div>
          <p className="sales-subtle">
            {order.channel} · Created {formatDate(order.timestamps.createdAt)}
          </p>
          {order.commerce ? (
            <p className="sales-subtle">Cash on delivery - Unpaid</p>
          ) : null}
        </div>
        {canUpdate && actions.length > 0 ? (
          <div className="sales-actions">
            {actions.map((action) => (
              <button
                className={
                  action === "cancel"
                    ? "sales-secondary-button"
                    : "sales-primary-button"
                }
                disabled={busy}
                key={action}
                onClick={() => onAction(action)}
                type="button"
              >
                {actionIcon(action)}
                {actionLabel(action)}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      {error ? (
        <div className="sales-inline-error" role="alert">
          <AlertCircle aria-hidden="true" size={18} /> {error}
        </div>
      ) : null}
      <div className="sales-detail-grid">
        <section className="sales-detail-section">
          <h2>Order summary</h2>
          <DefinitionRows
            rows={[
              [
                "Subtotal",
                formatMoney(order.totals.subtotalMinor, order.currencyCode),
              ],
              [
                "Discount",
                formatMoney(order.totals.discountMinor, order.currencyCode),
              ],
              [
                "Delivery",
                formatMoney(order.totals.deliveryMinor, order.currencyCode),
              ],
              [
                "Total",
                formatMoney(order.totals.totalMinor, order.currencyCode),
              ],
            ]}
          />
        </section>
        <section className="sales-detail-section">
          <h2>Customer</h2>
          <DefinitionRows
            rows={[
              ["Name", order.customer.name ?? "Not provided"],
              ["Phone", order.customer.phone ?? "Not provided"],
              ["Email", order.customer.email ?? "Not provided"],
            ]}
          />
        </section>
        <section className="sales-detail-section">
          <h2>Delivery</h2>
          <address>{formatAddress(order.delivery)}</address>
        </section>
        <section className="sales-detail-section">
          <h2>Inventory</h2>
          <DefinitionRows
            rows={[
              [
                "Reservation",
                order.inventory.reservation?.status ?? "Not reserved",
              ],
              [
                "Location",
                order.inventory.reservation?.stockLocation.name ??
                  "Not assigned",
              ],
              ["Fulfillment", order.inventory.fulfillment.status],
              [
                "Movement",
                order.inventory.fulfillment.movement?.movementNumber ??
                  "Not posted",
              ],
            ]}
          />
        </section>
      </div>
      <section className="sales-detail-section sales-detail-section--wide">
        <h2>Order items</h2>
        <div className="sales-table-wrap">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Variant</th>
                <th>SKU</th>
                <th className="sales-number">Qty</th>
                <th className="sales-number">Unit price</th>
                <th className="sales-number">Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.productName}</td>
                  <td>
                    {[line.color, line.size].filter(Boolean).join(" / ") ||
                      "Standard"}
                  </td>
                  <td className="sales-mono">{line.sku}</td>
                  <td className="sales-number">{line.quantity}</td>
                  <td className="sales-number">
                    {formatMoney(line.unitPriceMinor, order.currencyCode)}
                  </td>
                  <td className="sales-number">
                    {formatMoney(line.lineTotalMinor, order.currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="sales-detail-section sales-detail-section--wide">
        <h2>Timeline</h2>
        <ol className="sales-timeline">
          {timeline(order).map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <time dateTime={item.value}>{formatDateTime(item.value)}</time>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function DefinitionRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="sales-definition-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function useSalesPager(
  fetchPage: (cursor?: string) => ReturnType<AdminApiClient["listSalesOrders"]>,
) {
  const [items, setItems] = useState<SalesOrderListReadContract[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursors, setCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPage(cursors[page]);
      setItems(result.data.items);
      setHasMore(result.data.hasMore);
      setNextCursor(result.data.nextCursor);
    } catch (caught) {
      setError(safeMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [cursors, fetchPage, page]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  return {
    canPrevious: page > 0,
    error,
    hasMore,
    items,
    load,
    loading,
    next: () => {
      if (!nextCursor) return;
      setCursors((current) => [...current.slice(0, page + 1), nextCursor]);
      setPage((current) => current + 1);
    },
    page,
    previous: () => setPage((current) => Math.max(0, current - 1)),
    reset: () => {
      setCursors([undefined]);
      setPage(0);
    },
  };
}

function SalesState({
  label,
  loading,
  retry,
  role,
}: {
  label: string;
  loading?: boolean;
  retry?: () => void;
  role?: "alert";
}) {
  return (
    <div className="sales-state" role={role}>
      {loading ? (
        <LoaderCircle aria-hidden="true" className="sales-spin" size={22} />
      ) : (
        <AlertCircle aria-hidden="true" size={22} />
      )}
      <p>{label}</p>
      {retry ? (
        <button
          className="sales-secondary-button"
          onClick={retry}
          type="button"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

function SalesRestricted() {
  return (
    <main className="sales-page">
      <div className="sales-state" role="alert">
        <ShieldCheck aria-hidden="true" size={24} />
        <h1>Sales access is restricted</h1>
        <p>Your role does not include sales order read permission.</p>
      </div>
    </main>
  );
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`sales-badge sales-badge--${value.toLowerCase()}`}>
      {value.toLowerCase().replace(/^./u, (letter) => letter.toUpperCase())}
    </span>
  );
}

function allowedActions(
  status: SalesOrderDetailsReadContract["status"],
): SalesAction[] {
  if (status === "DRAFT") return ["reserve", "cancel"];
  if (status === "RESERVED") return ["confirm", "cancel"];
  if (status === "CONFIRMED") return ["fulfill"];
  return [];
}

function actionLabel(action: SalesAction): string {
  return action.replace(/^./u, (letter) => letter.toUpperCase());
}

function actionIcon(action: SalesAction): ReactNode {
  if (action === "reserve") return <ShieldCheck aria-hidden="true" size={16} />;
  if (action === "confirm") return <Check aria-hidden="true" size={16} />;
  if (action === "fulfill")
    return <PackageCheck aria-hidden="true" size={16} />;
  return <CircleX aria-hidden="true" size={16} />;
}

function timeline(order: SalesOrderDetailsReadContract) {
  return [
    { label: "Created", value: order.timestamps.createdAt },
    order.timestamps.reservedAt
      ? { label: "Reserved", value: order.timestamps.reservedAt }
      : null,
    order.timestamps.confirmedAt
      ? { label: "Confirmed", value: order.timestamps.confirmedAt }
      : null,
    order.timestamps.fulfilledAt
      ? { label: "Fulfilled", value: order.timestamps.fulfilledAt }
      : null,
    order.timestamps.cancelledAt
      ? { label: "Cancelled", value: order.timestamps.cancelledAt }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
}

function formatAddress(
  delivery: SalesOrderDetailsReadContract["delivery"],
): string {
  return (
    [
      delivery.addressLine1,
      delivery.addressLine2,
      delivery.city,
      delivery.district,
      delivery.postalCode,
    ]
      .filter(Boolean)
      .join(", ") || "No delivery address provided"
  );
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-BD", {
    currency,
    style: "currency",
  }).format(amountMinor / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function safeMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.category === "AUTHENTICATION") return "Sign in is required.";
    if (error.category === "AUTHORIZATION")
      return "Sales access is restricted.";
    if (error.category === "CONCURRENCY")
      return "This order changed. Refresh and try again.";
    if (error.category === "NOT_FOUND") return "The sales order was not found.";
  }
  return "The sales service could not complete this request.";
}
