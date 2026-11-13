"use client";

import type { DashboardSummaryContract } from "@senvo/contracts";
import { AlertCircle, LoaderCircle, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import { formatMinor } from "../../../_lib/dashboard-model";
import {
  DashboardRange,
  dhakaToday,
  type DashboardRangeValue,
} from "../../../_components/dashboard-range";
import { NoAccessState } from "../../../_components/no-access-state";
import { ProductThumb } from "../../../_components/product-thumb";
import styles from "../../profit/_components/profit-by-product.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

type Period = NonNullable<DashboardSummaryContract["financials"]>["period"];
type ProductSale = NonNullable<Period["productSales"]>[number];

type LoadState =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; period: Period; rows: ProductSale[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** The period from the link (dashboard card), or today. */
function rangeFromUrl(search: string): DashboardRangeValue {
  const query = new URLSearchParams(search);
  const today = dhakaToday();
  const from = query.get("from") ?? "";
  const to = query.get("to") ?? "";
  if (DATE.test(from) && DATE.test(to)) {
    return {
      from,
      preset: from === today && to === today ? "today" : "custom",
      to,
    };
  }
  return { from: today, preset: "today", to: today };
}

function periodText(from: string, to: string): string {
  const format = (date: string) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      year: "numeric",
    }).format(new Date(`${date}T00:00:00.000Z`));
  return from === to ? format(from) : `${format(from)} – ${format(to)}`;
}

/**
 * Behind the dashboard's Sales card: every product sold in the period with
 * pieces, returns and sales. No cost or profit, so every dashboard role
 * (staff to owner) sees it.
 */
export function SalesByProduct() {
  const [range, setRange] = useState<DashboardRangeValue | null>(null);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  // The URL is only known in the browser.
  useEffect(() => {
    setRange(rangeFromUrl(window.location.search));
  }, []);

  const load = useCallback(async (period: DashboardRangeValue) => {
    setRefreshing(true);
    try {
      const result = await client.getDashboardSummary({
        from: period.from,
        to: period.to,
      });
      const found = result.data.financials?.period;
      if (found && !found.productSales) {
        // An API started before this list existed does not send it.
        setState({
          kind: "error",
          message: "Server পুরনো। SENVO Stop করে আবার Start করুন।",
        });
        return;
      }
      setState(
        found
          ? { kind: "ready", period: found, rows: found.productSales ?? [] }
          : { kind: "forbidden" },
      );
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 403) {
        setState({ kind: "forbidden" });
        return;
      }
      setState({
        kind: "error",
        message:
          caught instanceof AdminApiError
            ? `${caught.message} Request ${caught.requestId}.`
            : "বিক্রির হিসাব আনা যায়নি।",
      });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (range) void load(range);
  }, [load, range]);

  function changeRange(next: DashboardRangeValue) {
    setRange(next);
    // Keep the link shareable and the back button on the same period.
    window.history.replaceState(
      null,
      "",
      `/reports/sales?from=${next.from}&to=${next.to}`,
    );
  }

  const rows = useMemo(() => {
    if (state.kind !== "ready") return [];
    const term = search.trim().toLowerCase();
    return term
      ? state.rows.filter(
          (row) =>
            row.name.toLowerCase().includes(term) ||
            row.productCode.toLowerCase().includes(term),
        )
      : state.rows;
  }, [search, state]);

  if (state.kind === "forbidden") {
    return <NoAccessState detail="বিক্রির হিসাব দেখার অনুমতি আপনার নেই।" />;
  }

  const ready = state.kind === "ready" ? state : null;
  const totals = rows.reduce(
    (sum, row) => ({
      quantity: sum.quantity + row.quantity,
      returned: sum.returned + row.returnedQuantity,
      revenue: sum.revenue + row.revenueMinor,
    }),
    { quantity: 0, returned: 0, revenue: 0 },
  );
  const all = (ready?.rows ?? []).reduce(
    (sum, row) => ({
      quantity: sum.quantity + row.quantity,
      returned: sum.returned + row.returnedQuantity,
    }),
    { quantity: 0, returned: 0 },
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Reports · বিক্রির হিসাব</p>
          <h1 className={styles.title}>Sales by product</h1>
          <p className={styles.subtitle}>
            কোন প্রোডাক্ট কত পিস বিক্রি হলো
            {ready
              ? ` · ${periodText(ready.period.from, ready.period.to)}`
              : ""}
          </p>
        </div>
        {range ? (
          <DashboardRange
            busy={refreshing}
            onChange={changeRange}
            value={range}
          />
        ) : null}
      </header>

      {state.kind === "loading" ? (
        <p className={styles.stateLine} role="status">
          <LoaderCircle aria-hidden="true" className={styles.spin} size={18} />
          বিক্রির হিসাব আনা হচ্ছে…
        </p>
      ) : state.kind === "error" ? (
        <div className={styles.stateLine} role="alert">
          <AlertCircle aria-hidden="true" size={18} /> {state.message}
          {range ? (
            <button
              className={styles.retry}
              onClick={() => void load(range)}
              type="button"
            >
              আবার চেষ্টা করুন
            </button>
          ) : null}
        </div>
      ) : ready ? (
        <>
          <section aria-label="Period totals" className={styles.summaryGrid}>
            <article className={`${styles.summaryCard} ${styles.summaryProfit}`}>
              <span>মোট বিক্রি</span>
              <strong>{formatMinor(ready.period.salesMinor)}</strong>
              <small>{ready.period.saleCount} টা বিল</small>
            </article>
            <article className={styles.summaryCard}>
              <span>বিক্রি হওয়া পিস</span>
              <strong>{all.quantity + all.returned}</strong>
              <small>{ready.rows.length} টা প্রোডাক্ট</small>
            </article>
            <article className={styles.summaryCard}>
              <span>ফেরত (পিস)</span>
              <strong>{all.returned}</strong>
              <small>নিট {all.quantity} পিস</small>
            </article>
          </section>

          <section className={styles.tableCard}>
            <div className={styles.tableTools}>
              <label className={styles.search}>
                <Search aria-hidden="true" size={15} />
                <input
                  aria-label="প্রোডাক্ট খুঁজুন"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="প্রোডাক্টের নাম বা code…"
                  type="search"
                  value={search}
                />
              </label>
              <small>সবচেয়ে বেশি বিক্রি উপরে</small>
            </div>

            {ready.rows.length === 0 ? (
              <p className={styles.empty}>এই সময়ে কোনো বিক্রি হয়নি।</p>
            ) : rows.length === 0 ? (
              <p className={styles.empty}>এই নামে কোনো প্রোডাক্ট পাওয়া যায়নি।</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className={styles.num}>বিক্রি (পিস)</th>
                      <th className={styles.num}>ফেরত (পিস)</th>
                      <th className={styles.num}>নিট বিক্রির টাকা</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.productId}>
                        <td>
                          <Link
                            className={styles.product}
                            href={`/catalog/products/${row.productId}`}
                          >
                            <ProductThumb
                              name={row.name}
                              productId={row.productId}
                              size={36}
                            />
                            <span>
                              <strong>{row.name}</strong>
                              <small>{row.productCode}</small>
                            </span>
                          </Link>
                        </td>
                        <td className={styles.num}>
                          {row.quantity + row.returnedQuantity}
                        </td>
                        <td
                          className={`${styles.num} ${
                            row.returnedQuantity > 0 ? styles.loss : ""
                          }`}
                        >
                          {row.returnedQuantity || "—"}
                        </td>
                        <td className={styles.num}>
                          {formatMinor(row.revenueMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>মোট{search.trim() ? " (খোঁজার ফল)" : ""}</th>
                      <td className={styles.num}>
                        {totals.quantity + totals.returned}
                      </td>
                      <td className={styles.num}>{totals.returned || "—"}</td>
                      <td className={styles.num}>
                        {formatMinor(totals.revenue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <p className={styles.footnote}>
            বিক্রির টাকা ডিসকাউন্ট বাদ দিয়ে (POS-এ আইটেম আর পুরো বিলের ডিসকাউন্ট
            দুটোই)। ফেরত আসা মাল যেদিন ফেরত এলো সেদিনের বিক্রি থেকে বাদ যায়।
            Delivery charge ধরা হয়নি। কোনো প্রোডাক্টে চাপ দিলে তার পুরো তথ্য
            খুলবে।
          </p>
        </>
      ) : null}
    </main>
  );
}
