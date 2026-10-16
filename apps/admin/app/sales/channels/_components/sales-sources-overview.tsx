"use client";

import type { SalesSourceSummaryContract } from "@senvo/contracts";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  History,
  LoaderCircle,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
  TentTree,
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
import { useAdminPermissions } from "../../../admin-shell";
import styles from "./sales-sources-overview.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type ChannelKey = "ONLINE" | "OFFLINE_STORE" | "EVENT_BOOTH";

type ChannelPresentation = {
  description: string;
  icon: ReactNode;
  label: string;
  operationalNote: string;
};

const presentation: Record<ChannelKey, ChannelPresentation> = {
  ONLINE: {
    description: "Orders placed through the SENVO storefront.",
    icon: <RadioTower size={20} />,
    label: "Online",
    operationalNote: "Customer orders from the online shop",
  },
  OFFLINE_STORE: {
    description: "Orders attributed to permanent store operations.",
    icon: <Store size={20} />,
    label: "Store",
    operationalNote: "Permanent store-assisted sales",
  },
  EVENT_BOOTH: {
    description: "Orders attributed to temporary fairs and event booths.",
    icon: <TentTree size={20} />,
    label: "Event Booth",
    operationalNote: "Temporary event and booth sales",
  },
};

export function SalesSourcesOverview({
  permissions: propsPermissions,
}: {
  permissions?: readonly AdminPermissionKey[];
} = {}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const canRead = permissions.includes("SALES:READ");

  const [summary, setSummary] = useState<SalesSourceSummaryContract | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      setSummary((await client.getSalesSourceSummary()).data);
    } catch (caught) {
      setSummary(null);
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    if (!summary) return { orders: 0, salesMinor: 0 };
    return summary.channels.reduce(
      (current, channel) => ({
        orders: current.orders + channel.orderCount,
        salesMinor: current.salesMinor + channel.totalMinor,
      }),
      { orders: 0, salesMinor: 0 },
    );
  }, [summary]);

  if (!canRead) {
    return (
      <StatePanel
        icon={<ShieldCheck size={28} />}
        text="Your role does not include permission to read sales-source information."
        title="Sales sources are restricted"
      />
    );
  }

  if (loading) {
    return (
      <StatePanel
        icon={<LoaderCircle className={styles.spin} size={28} />}
        text="Reading the sales-source summary from the existing sales read model…"
        title="Loading sales sources"
      />
    );
  }

  if (!summary) {
    return (
      <StatePanel
        action={
          <button onClick={() => void load()} type="button">
            <RefreshCw size={15} /> Retry
          </button>
        }
        icon={<AlertCircle size={28} />}
        text={error || "The sales-source summary is unavailable."}
        title="Sales sources could not be loaded"
      />
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Sales attribution</p>
          <h1>Sales Sources</h1>
          <p>
            Compare where SENVO orders and tracked sales come from without
            inventing custom channels that the current backend does not manage.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryButton}
            onClick={() => void load()}
            type="button"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <Link className={styles.primaryButton} href="/sales/orders">
            <ShoppingBag size={16} /> Sales Orders
          </Link>
        </div>
      </header>

      <section className={styles.summaryStrip} aria-label="Sales source totals">
        <SummaryItem
          icon={<ShoppingBag size={20} />}
          label="Tracked orders"
          note="Across current supported sources"
          value={number(totals.orders)}
        />
        <SummaryItem
          icon={<BarChart3 size={20} />}
          label="Tracked sales"
          note="Sum of source-attributed sales"
          value={money(totals.salesMinor)}
        />
        {summary.legacyOrderCount > 0 ? (
          <SummaryItem
            icon={<History size={20} />}
            label="Legacy-labeled orders"
            note="Preserved for historical accuracy"
            value={number(summary.legacyOrderCount)}
          />
        ) : null}
      </section>

      <section className={styles.workspace}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Source comparison</p>
            <h2>Where orders originate</h2>
            <p>
              Order share is derived from the same summary rows shown below.
            </p>
          </div>
          <span>{summary.channels.length} supported source types</span>
        </div>

        {summary.channels.length === 0 ? (
          <div className={styles.emptyState}>
            <BarChart3 size={24} />
            <strong>No source-attributed sales yet</strong>
            <p>
              Sales will appear here when orders are attributed to a supported
              source.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Sales source</th>
                  <th>Operational meaning</th>
                  <th className={styles.numeric}>Orders</th>
                  <th>Order share</th>
                  <th className={styles.numeric}>Tracked sales</th>
                </tr>
              </thead>
              <tbody>
                {summary.channels.map((channel) => {
                  const key = channel.salesChannel;
                  const detail =
                    presentation[key] ??
                    fallbackPresentation(channel.salesChannel);
                  const share =
                    totals.orders > 0
                      ? (channel.orderCount / totals.orders) * 100
                      : 0;
                  return (
                    <tr key={channel.salesChannel}>
                      <td>
                        <div className={styles.sourceIdentity}>
                          <span className={styles.sourceIcon}>
                            {detail.icon}
                          </span>
                          <span>
                            <strong>{detail.label}</strong>
                            <small>{detail.description}</small>
                          </span>
                        </div>
                      </td>
                      <td>{detail.operationalNote}</td>
                      <td className={styles.numeric}>
                        {number(channel.orderCount)}
                      </td>
                      <td>
                        <div className={styles.shareCell}>
                          <span
                            className={styles.shareTrack}
                            aria-hidden="true"
                          >
                            <span
                              style={{
                                width: `${Math.max(0, Math.min(100, share))}%`,
                              }}
                            />
                          </span>
                          <strong>{percent(share)}</strong>
                        </div>
                      </td>
                      <td className={`${styles.numeric} ${styles.salesValue}`}>
                        {money(channel.totalMinor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {summary.legacyOrderCount > 0 ? (
          <div className={styles.legacyNote}>
            <History size={18} />
            <div>
              <strong>Historical source labels are preserved</strong>
              <p>
                {number(summary.legacyOrderCount)} earlier order(s) keep their
                original source labels instead of being rewritten into the
                current channel model.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section
        className={styles.nextActions}
        aria-label="Related sales workflows"
      >
        <Link href="/sales/orders">
          <span>
            <ShoppingBag size={18} />
          </span>
          <div>
            <strong>Sales Orders</strong>
            <small>
              Inspect and process the orders behind these source totals.
            </small>
          </div>
          <ArrowRight size={16} />
        </Link>
        <Link href="/sales/booths">
          <span>
            <TentTree size={18} />
          </span>
          <div>
            <strong>Booth History</strong>
            <small>
              Manage the temporary event locations used by Event Booth sales.
            </small>
          </div>
          <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  );
}

function SummaryItem({
  icon,
  label,
  note,
  value,
}: {
  icon: ReactNode;
  label: string;
  note: string;
  value: string;
}) {
  return (
    <article className={styles.summaryItem}>
      <span className={styles.summaryIcon}>{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
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
  action?: ReactNode;
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel}>
        <span>{icon}</span>
        <h1>{title}</h1>
        <p>{text}</p>
        {action ? <div>{action}</div> : null}
      </section>
    </main>
  );
}

function fallbackPresentation(value: string): ChannelPresentation {
  return {
    description: "Sales attributed to a backend-supported channel.",
    icon: <BarChart3 size={20} />,
    label: humanize(value),
    operationalNote: "Sales-channel attribution",
  };
}

function money(amountMinor: number) {
  return new Intl.NumberFormat("en-BD", {
    currency: "BDT",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amountMinor / 100);
}

function number(value: number) {
  return new Intl.NumberFormat("en-BD").format(value);
}

function percent(value: number) {
  return `${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 1 }).format(value)}%`;
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/gu, (letter) => letter.toUpperCase());
}

function messageFor(error: unknown) {
  if (error instanceof AdminApiError) {
    if (error.category === "AUTHENTICATION") return "Sign in is required.";
    if (error.category === "AUTHORIZATION")
      return "Sales access is restricted.";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Sales-source information could not be loaded.";
}
