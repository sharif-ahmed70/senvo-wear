"use client";

import type { SalesOrderListReadContract } from "@senvo/contracts";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
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
import styles from "./sales-orders-list-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const PAGE_SIZE = 25;
const statuses = [
  "DRAFT",
  "RESERVED",
  "CONFIRMED",
  "FULFILLED",
  "CANCELLED",
] as const;
const channels = [
  "ONLINE",
  "OFFLINE_STORE",
  "EVENT_BOOTH",
  "POS",
  "MANUAL",
] as const;

type OrderStatus = (typeof statuses)[number];
type SalesChannel = (typeof channels)[number];
type Filters = {
  channel: "" | SalesChannel;
  search: string;
  status: "" | OrderStatus;
};
type ApiPage = {
  hasMore: boolean;
  items: SalesOrderListReadContract[];
  nextCursor: string | null;
};

export function SalesOrdersListWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("SALES_ORDER:READ");
  const canStartPos = [
    "POS:READ",
    "POS:CREATE",
    "POS:UPDATE",
    "SALES:CREATE",
    "PAYMENT:CREATE",
  ].every((permission) =>
    permissions.includes(permission as AdminPermissionKey),
  );

  const [draftSearch, setDraftSearch] = useState("");
  const [draftChannel, setDraftChannel] = useState<"" | SalesChannel>("");
  const [filters, setFilters] = useState<Filters>({
    channel: "",
    search: "",
    status: "",
  });
  const [cursors, setCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [page, setPage] = useState<ApiPage>({
    hasMore: false,
    items: [],
    nextCursor: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    void reloadKey;
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      const result = await client.listSalesOrders({
        channel: filters.channel || undefined,
        cursor: cursors[cursorIndex],
        order: "NEWEST",
        pageSize: PAGE_SIZE,
        search: filters.search || undefined,
        status: filters.status || undefined,
      });
      setPage(result.data);
    } catch (caught) {
      setPage({ hasMore: false, items: [], nextCursor: null });
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [canRead, cursorIndex, cursors, filters, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeFilterCount = useMemo(
    () =>
      Number(Boolean(filters.search)) +
      Number(Boolean(filters.channel)) +
      Number(Boolean(filters.status)),
    [filters],
  );

  if (!canRead) {
    return (
      <StatePanel
        icon={<ShieldCheck size={28} />}
        title="Sales orders are restricted"
        text="Your role does not have permission to read sales orders."
      />
    );
  }

  function resetPaging() {
    setCursors([undefined]);
    setCursorIndex(0);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetPaging();
    setFilters((current) => ({
      ...current,
      channel: draftChannel,
      search: draftSearch.trim(),
    }));
  }

  function selectStatus(status: "" | OrderStatus) {
    resetPaging();
    setFilters((current) => ({ ...current, status }));
  }

  function clearFilters() {
    setDraftSearch("");
    setDraftChannel("");
    resetPaging();
    setFilters({ channel: "", search: "", status: "" });
  }

  function previousPage() {
    if (cursorIndex === 0 || loading) return;
    setCursorIndex((current) => Math.max(0, current - 1));
  }

  function nextPage() {
    if (!page.nextCursor || loading) return;
    setCursors((current) => [
      ...current.slice(0, cursorIndex + 1),
      page.nextCursor ?? undefined,
    ]);
    setCursorIndex((current) => current + 1);
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Order operations</p>
          <h1>Sales Orders</h1>
          <p>
            Find an order, understand its current state, and open the full
            record when action is required.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            aria-label="Refresh sales orders"
            className={styles.secondaryButton}
            disabled={loading}
            onClick={() => setReloadKey((current) => current + 1)}
            type="button"
          >
            <RefreshCw className={loading ? styles.spin : ""} size={16} />{" "}
            Refresh
          </button>
          {canStartPos ? (
            <Link className={styles.primaryButton} href="/pos/sell">
              <ShoppingBag size={16} /> New Sale (POS)
            </Link>
          ) : null}
        </div>
      </header>

      <nav aria-label="Order status" className={styles.statusTabs}>
        <StatusTab
          active={filters.status === ""}
          label="All"
          onClick={() => selectStatus("")}
        />
        {statuses.map((status) => (
          <StatusTab
            active={filters.status === status}
            key={status}
            label={humanize(status)}
            onClick={() => selectStatus(status)}
            tone={statusTone(status)}
          />
        ))}
      </nav>

      <section className={styles.ordersCard}>
        <form className={styles.filterBar} onSubmit={applyFilters}>
          <label className={styles.searchField}>
            <Search aria-hidden="true" size={16} />
            <span className={styles.srOnly}>Search sales orders</span>
            <input
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Search order number…"
              value={draftSearch}
            />
            {draftSearch ? (
              <button
                aria-label="Clear search"
                onClick={() => setDraftSearch("")}
                type="button"
              >
                <X size={14} />
              </button>
            ) : null}
          </label>

          <label className={styles.selectField}>
            <span className={styles.srOnly}>Sales source</span>
            <select
              onChange={(event) =>
                setDraftChannel(event.target.value as "" | SalesChannel)
              }
              value={draftChannel}
            >
              <option value="">All sales sources</option>
              {channels.map((channel) => (
                <option key={channel} value={channel}>
                  {channelLabel(channel)}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" size={14} />
          </label>

          <button className={styles.filterButton} type="submit">
            <SlidersHorizontal size={15} /> Apply
          </button>
          {activeFilterCount ? (
            <button
              className={styles.clearButton}
              onClick={clearFilters}
              type="button"
            >
              Clear {activeFilterCount}
            </button>
          ) : null}
        </form>

        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Newest first</p>
            <h2>
              {filters.status
                ? `${humanize(filters.status)} orders`
                : "All orders"}
            </h2>
          </div>
          <span>
            {page.items.length} loaded · page {cursorIndex + 1}
          </span>
        </div>

        {loading ? (
          <InlineState
            icon={<LoaderCircle className={styles.spin} size={23} />}
            title="Loading sales orders"
            text="Reading the latest order records…"
          />
        ) : error ? (
          <InlineState
            action={
              <button
                onClick={() => setReloadKey((current) => current + 1)}
                type="button"
              >
                Try again
              </button>
            }
            icon={<RefreshCw size={22} />}
            title="Sales orders are unavailable"
            text={error}
          />
        ) : page.items.length === 0 ? (
          <InlineState
            icon={<ShoppingBag size={22} />}
            title="No orders match this view"
            text="Try a different status, sales source, or order number."
          />
        ) : (
          <OrdersTable items={page.items} />
        )}

        <footer className={styles.pagination}>
          <span>Cursor pagination · {PAGE_SIZE} orders per API page</span>
          <div>
            <button
              aria-label="Previous page"
              disabled={cursorIndex === 0 || loading}
              onClick={previousPage}
              type="button"
            >
              <ArrowLeft size={16} />
            </button>
            <span>{cursorIndex + 1}</span>
            <button
              aria-label="Next page"
              disabled={!page.hasMore || !page.nextCursor || loading}
              onClick={nextPage}
              type="button"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

function OrdersTable({ items }: { items: SalesOrderListReadContract[] }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Source</th>
            <th>Payment</th>
            <th>Status</th>
            <th className={styles.numberCell}>Total</th>
            <th>Created</th>
            <th>Delivery area</th>
            <th>
              <span className={styles.srOnly}>Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((order) => (
            <tr key={order.id}>
              <td>
                <Link
                  className={styles.orderNumber}
                  href={`/sales/orders/${order.id}`}
                >
                  {order.orderNumber}
                </Link>
              </td>
              <td>
                <div className={styles.customerCell}>
                  <strong>{order.customer.name ?? "Guest customer"}</strong>
                  <small>{order.customer.phone ?? "No phone provided"}</small>
                </div>
              </td>
              <td>
                <SourceBadge channel={order.channel} />
              </td>
              <td>
                <PaymentLabel order={order} />
              </td>
              <td>
                <StatusBadge value={order.status} />
              </td>
              <td className={`${styles.numberCell} ${styles.totalCell}`}>
                {formatMoney(order.totalMinor, order.currencyCode)}
              </td>
              <td>
                <time dateTime={order.createdAt}>
                  {formatDateTime(order.createdAt)}
                </time>
              </td>
              <td>{deliveryArea(order)}</td>
              <td>
                <Link
                  aria-label={`Open order ${order.orderNumber}`}
                  className={styles.openButton}
                  href={`/sales/orders/${order.id}`}
                >
                  <ExternalLink size={15} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusTab({
  active,
  label,
  onClick,
  tone = "neutral",
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "blue" | "green" | "amber" | "red" | "violet";
}) {
  return (
    <button
      aria-pressed={active}
      className={`${styles.statusTab} ${active ? styles.statusTabActive : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className={`${styles.tabDot} ${styles[`tabDot_${tone}`]}`} />
      {label}
    </button>
  );
}

function StatusBadge({ value }: { value: OrderStatus }) {
  const tone = statusTone(value);
  return (
    <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>
      {humanize(value)}
    </span>
  );
}

function SourceBadge({ channel }: { channel: SalesChannel }) {
  return <span className={styles.sourceBadge}>{channelLabel(channel)}</span>;
}

function PaymentLabel({ order }: { order: SalesOrderListReadContract }) {
  const preference = order.commerce?.paymentPreference;
  if (preference === "CASH_ON_DELIVERY") {
    return (
      <span className={styles.paymentCell}>
        <strong>Cash on delivery</strong>
        <small>Collection pending</small>
      </span>
    );
  }
  if (preference === "ONLINE_PAYMENT") {
    return (
      <span className={styles.paymentCell}>
        <strong>Online payment</strong>
        <small>Open order for provider status</small>
      </span>
    );
  }
  return <span className={styles.muted}>Not available</span>;
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

function statusTone(status: OrderStatus) {
  if (status === "DRAFT") return "neutral" as const;
  if (status === "RESERVED") return "violet" as const;
  if (status === "CONFIRMED") return "blue" as const;
  if (status === "FULFILLED") return "green" as const;
  if (status === "CANCELLED") return "red" as const;
  return "amber" as const;
}

function channelLabel(channel: SalesChannel) {
  if (channel === "ONLINE") return "Online";
  if (channel === "OFFLINE_STORE") return "Store";
  if (channel === "EVENT_BOOTH") return "Event booth";
  if (channel === "POS") return "POS";
  return "Manual";
}

function deliveryArea(order: SalesOrderListReadContract) {
  return (
    [order.delivery.district, order.delivery.city].filter(Boolean).join(", ") ||
    "Not provided"
  );
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/gu, (letter) => letter.toUpperCase());
}

function formatMoney(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat("en-BD", {
    currency: currencyCode,
    style: "currency",
  }).format(amountMinor / 100);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-BD", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function messageFor(error: unknown) {
  if (error instanceof AdminApiError) {
    if (error.category === "AUTHENTICATION") return "Sign in is required.";
    if (error.category === "AUTHORIZATION")
      return "Your role cannot read sales orders.";
    return `${error.message} Request ID: ${error.requestId}`;
  }
  if (error instanceof Error) return error.message;
  return "The sales service could not load orders.";
}
