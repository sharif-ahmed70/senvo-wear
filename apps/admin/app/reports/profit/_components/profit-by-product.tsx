"use client";

import type { DashboardSummaryContract } from "@senvo/contracts";
import {
  AlertCircle,
  AlertTriangle,
  LoaderCircle,
  Search,
} from "lucide-react";
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
import styles from "./profit-by-product.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

type SalesPeriod = NonNullable<DashboardSummaryContract["financials"]>["period"];
// Cost and profit come only to roles that may see costs.
type Period = SalesPeriod &
  Required<
    Pick<
      SalesPeriod,
      "costMinor" | "productProfits" | "profitMinor" | "uncostedSalesMinor"
    >
  >;

function withProfit(period: SalesPeriod | undefined): Period | null {
  return period?.productProfits &&
    period.costMinor !== undefined &&
    period.profitMinor !== undefined &&
    period.uncostedSalesMinor !== undefined
    ? (period as Period)
    : null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; period: Period };

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

function marginText(profitMinor: number, costedRevenueMinor: number): string {
  if (costedRevenueMinor <= 0) return "—";
  return `${((profitMinor / costedRevenueMinor) * 100).toFixed(1)}%`;
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
 * Owner view behind the dashboard's Profit card: every product sold in the
 * period with pieces, sales, cost and estimated profit. Uses the dashboard
 * summary, so the rows add up to the card and only POS APPROVE roles see it.
 */
export function ProfitByProduct() {
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
      const withCosts = withProfit(result.data.financials?.period);
      setState(
        withCosts
          ? { kind: "ready", period: withCosts }
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
            : "লাভের হিসাব আনা যায়নি।",
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
      `/reports/profit?from=${next.from}&to=${next.to}`,
    );
  }

  const rows = useMemo(() => {
    if (state.kind !== "ready") return [];
    const term = search.trim().toLowerCase();
    return term
      ? state.period.productProfits.filter(
          (row) =>
            row.name.toLowerCase().includes(term) ||
            row.productCode.toLowerCase().includes(term),
        )
      : state.period.productProfits;
  }, [search, state]);

  if (state.kind === "forbidden") {
    return (
      <NoAccessState detail="কোন প্রোডাক্টে কত লাভ, সেটা শুধু Owner/Admin দেখতে পারেন।" />
    );
  }

  const period = state.kind === "ready" ? state.period : null;
  const totals = rows.reduce(
    (sum, row) => ({
      cost: sum.cost + row.costMinor,
      costedRevenue: sum.costedRevenue + row.revenueMinor - row.uncostedRevenueMinor,
      extra: sum.extra + row.extraCostMinor,
      profit: sum.profit + row.profitMinor,
      quantity: sum.quantity + row.quantity,
      returned: sum.returned + row.returnedQuantity,
      revenue: sum.revenue + row.revenueMinor,
      uncosted: sum.uncosted + row.uncostedRevenueMinor,
    }),
    {
      cost: 0,
      costedRevenue: 0,
      extra: 0,
      profit: 0,
      quantity: 0,
      returned: 0,
      revenue: 0,
      uncosted: 0,
    },
  );
  const periodExtraMinor =
    period?.productProfits.reduce((sum, row) => sum + row.extraCostMinor, 0) ??
    0;
  const periodReturned =
    period?.productProfits.reduce((sum, row) => sum + row.returnedQuantity, 0) ??
    0;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Reports · লাভের হিসাব</p>
          <h1 className={styles.title}>Profit by product</h1>
          <p className={styles.subtitle}>
            কোন প্রোডাক্ট কত পিস বিক্রি হলো আর তাতে আনুমানিক কত লাভ এলো
            {period ? ` · ${periodText(period.from, period.to)}` : ""}
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
          লাভের হিসাব আনা হচ্ছে…
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
      ) : period ? (
        <>
          <section aria-label="Period totals" className={styles.summaryGrid}>
            <article className={`${styles.summaryCard} ${styles.summaryProfit}`}>
              <span>মোট লাভ (আনুমানিক)</span>
              <strong>{formatMinor(period.profitMinor)}</strong>
              <small>
                {marginText(
                  period.profitMinor,
                  period.profitMinor + period.costMinor,
                )}{" "}
                margin
              </small>
            </article>
            <article className={styles.summaryCard}>
              <span>নিট বিক্রি (ফেরত বাদে)</span>
              <strong>
                {formatMinor(
                  period.productProfits.reduce(
                    (sum, row) => sum + row.revenueMinor,
                    0,
                  ),
                )}
              </strong>
              <small>
                {period.productProfits.reduce(
                  (sum, row) => sum + row.quantity,
                  0,
                )}{" "}
                পিস · {period.productProfits.length} টা প্রোডাক্ট
                {periodReturned > 0 ? ` · ${periodReturned} পিস ফেরত` : ""}
              </small>
            </article>
            <article className={styles.summaryCard}>
              <span>কেনা দাম (Supplier)</span>
              <strong>{formatMinor(period.costMinor - periodExtraMinor)}</strong>
              <small>বিক্রি হওয়া মালের</small>
            </article>
            <article className={styles.summaryCard}>
              <span>অতিরিক্ত খরচ (ভাড়া/কুলি)</span>
              <strong>{formatMinor(periodExtraMinor)}</strong>
              <small>বিক্রি হওয়া মালের ভাগ</small>
            </article>
          </section>

          {period.uncostedSalesMinor > 0 ? (
            <p className={styles.warning} role="status">
              <AlertTriangle aria-hidden="true" size={16} />
              {formatMinor(period.uncostedSalesMinor)} বিক্রির মালের কেনা দাম
              সিস্টেমে নেই, তাই সেটুকু লাভের হিসাবে ধরা হয়নি।
            </p>
          ) : null}

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
              <small>সবচেয়ে বেশি লাভ উপরে</small>
            </div>

            {period.productProfits.length === 0 ? (
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
                      <th className={styles.num}>কেনা দাম (Supplier)</th>
                      <th className={styles.num}>অতিরিক্ত খরচ</th>
                      <th className={styles.num}>লাভ</th>
                      <th className={styles.num}>Margin</th>
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
                              {row.uncostedRevenueMinor > 0 ? (
                                <small className={styles.uncosted}>
                                  {formatMinor(row.uncostedRevenueMinor)}-এর
                                  কেনা দাম নেই
                                </small>
                              ) : null}
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
                        <td className={styles.num}>
                          {formatMinor(row.costMinor - row.extraCostMinor)}
                        </td>
                        <td className={styles.num}>
                          {formatMinor(row.extraCostMinor)}
                        </td>
                        <td
                          className={`${styles.num} ${styles.profit} ${
                            row.profitMinor < 0 ? styles.loss : ""
                          }`}
                        >
                          {formatMinor(row.profitMinor)}
                        </td>
                        <td className={styles.num}>
                          {marginText(
                            row.profitMinor,
                            row.revenueMinor - row.uncostedRevenueMinor,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>
                        মোট{search.trim() ? " (খোঁজার ফল)" : ""}
                      </th>
                      <td className={styles.num}>
                        {totals.quantity + totals.returned}
                      </td>
                      <td className={styles.num}>{totals.returned || "—"}</td>
                      <td className={styles.num}>
                        {formatMinor(totals.revenue)}
                      </td>
                      <td className={styles.num}>
                        {formatMinor(totals.cost - totals.extra)}
                      </td>
                      <td className={styles.num}>
                        {formatMinor(totals.extra)}
                      </td>
                      <td
                        className={`${styles.num} ${styles.profit} ${
                          totals.profit < 0 ? styles.loss : ""
                        }`}
                      >
                        {formatMinor(totals.profit)}
                      </td>
                      <td className={styles.num}>
                        {marginText(totals.profit, totals.costedRevenue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <p className={styles.footnote}>
            লাভ = বিক্রির টাকা − কেনা দাম (Supplier) − অতিরিক্ত খরচ
            (Dashboard-এর Profit card-এর একই নিয়মে)। অতিরিক্ত খরচ হলো মাল তোলার
            সময় লেখা গাড়ি ভাড়া, কুরিয়ার, কুলি — প্রতি পিসে ভাগ করা।
            বিক্রির টাকা ডিসকাউন্ট বাদ দিয়ে (POS-এ আইটেম আর পুরো বিলের ডিসকাউন্ট
            দুটোই)। ফেরত আসা মাল যেদিন ফেরত এলো সেদিনের বিক্রি, কেনা দাম আর লাভ
            থেকে বাদ যায়; বদলে (exchange) শুধু নতুন মালের লাভ থাকে। Delivery
            charge ধরা হয়নি। কেনা দাম হলো মাল তোলার সময়ের গড় দাম।
          </p>
        </>
      ) : null}
    </main>
  );
}
