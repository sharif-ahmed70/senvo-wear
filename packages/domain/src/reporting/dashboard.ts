import { ValidationApplicationError } from "../errors.js";

/**
 * Admin dashboard read model.
 *
 * Definitions (keep in step with PrismaDashboardReadRepository):
 *
 * - Business day: the Asia/Dhaka calendar day. Bangladesh has no daylight
 *   saving, so a day runs from 00:00 to 24:00 at UTC+06:00.
 * - Sale: a sales order whose status is CONFIRMED or FULFILLED, dated by its
 *   `confirmed_at`, valued at its `total_minor`. DRAFT and RESERVED are not
 *   sales yet; CANCELLED orders are excluded even if they were confirmed
 *   earlier. Every POS checkout creates exactly one sales order (channel POS)
 *   and runs it through confirm and fulfil, so counting sales orders counts a
 *   POS sale once; pos_checkout_records are never added on top.
 * - Refunds: payment_refunds by `issued_at`, reported on their own and never
 *   netted from sales.
 * - Pending orders: sales orders awaiting fulfilment, i.e. status RESERVED
 *   or CONFIRMED.
 * - Stock: per variant, available-to-sell summed over every stock location
 *   (posted movements minus active reservations, as on the Inventory page).
 *   No reorder threshold is stored, so available <= 0 is out of stock and
 *   1..LOW_STOCK_MAX_AVAILABLE is low. ARCHIVED variants are not counted;
 *   INACTIVE variants are counted as inactive only.
 * - Recent orders: the latest non-DRAFT sales orders by creation time.
 * - Top products: sale order lines of the last 7 business days grouped by
 *   product, ranked by line revenue (`line_total_minor`).
 * - Period: the business dates `from`..`to` the caller picked (default today,
 *   at most DASHBOARD_MAX_RANGE_DAYS). Its comparison period is the same
 *   number of days just before it.
 * - Cost and profit (estimated): a sale line's cost is its cost snapshot when
 *   one was recorded, otherwise quantity x the variant's current moving
 *   average cost. Lines without any known cost are left out of profit and
 *   reported as `uncostedSalesMinor`. Profit = costed line revenue - cost; it
 *   ignores order-level delivery fees and refunds.
 * - Profit by product: the same sale lines and cost rule as the period
 *   profit, grouped by product, so the rows add up to the period totals.
 *   Ranked by profit, at most DASHBOARD_PRODUCT_PROFIT_LIMIT products. The
 *   cost is split into supplier price and extra cost (transport/labour) by
 *   the share of extra cost in the variant's posted purchases, so the owner
 *   sees the supplier price unchanged next to the extra cost.
 * - Stock value (at cost): per ACTIVE or INACTIVE variant, on-hand summed
 *   over every stock location x the variant's current moving average cost.
 *   Units of variants without a known cost are left out of the value and
 *   reported as `uncostedUnits`; negative on-hand counts as zero.
 */
export const DASHBOARD_MAX_RANGE_DAYS = 366;
export const DASHBOARD_TIME_ZONE = "Asia/Dhaka";
export const LOW_STOCK_MAX_AVAILABLE = 3;
export const SALE_ORDER_STATUSES = ["CONFIRMED", "FULFILLED"] as const;
export const PENDING_ORDER_STATUSES = ["RESERVED", "CONFIRMED"] as const;
export const DASHBOARD_RECENT_ORDER_LIMIT = 6;
export const DASHBOARD_TOP_PRODUCT_LIMIT = 5;
export const DASHBOARD_TREND_DAYS = 7;
export const DASHBOARD_PRODUCT_PROFIT_LIMIT = 500;
export const DASHBOARD_SALES_CHANNELS = [
  "POS",
  "OFFLINE_STORE",
  "ONLINE",
  "EVENT_BOOTH",
  "MANUAL",
] as const;

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DashboardSalesChannel = (typeof DASHBOARD_SALES_CHANNELS)[number];
export type StockClass = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

/** YYYY-MM-DD of an instant in Asia/Dhaka. */
export function businessDateOf(instant: Date): string {
  if (Number.isNaN(instant.getTime())) {
    throw new ValidationApplicationError("Dashboard time is invalid.");
  }
  return new Date(instant.getTime() + DHAKA_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** The UTC instant at which a Dhaka business date starts. */
export function startOfBusinessDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new ValidationApplicationError("Business date is invalid.");
  }
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - DHAKA_OFFSET_MS);
}

export function addBusinessDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** The business dates the dashboard period covers. */
export type DashboardRange = {
  /** Every business date in the period, oldest first. */
  dates: string[];
  /** Start of the day after `to`. */
  end: Date;
  from: string;
  /** Start of the comparison period (same length, just before). */
  previousStart: Date;
  start: Date;
  to: string;
};

export function dashboardRange(
  today: string,
  input: { from?: string; to?: string } = {},
): DashboardRange {
  const from = input.from ?? input.to ?? today;
  const to = input.to ?? input.from ?? today;
  const start = startOfBusinessDate(from);
  const end = startOfBusinessDate(addBusinessDays(to, 1));
  if (from > to)
    throw new ValidationApplicationError(
      "The start date must be on or before the end date.",
    );
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (days > DASHBOARD_MAX_RANGE_DAYS)
    throw new ValidationApplicationError(
      `Choose at most ${DASHBOARD_MAX_RANGE_DAYS} days.`,
    );
  return {
    dates: Array.from({ length: days }, (_, index) =>
      addBusinessDays(from, index),
    ),
    end,
    from,
    previousStart: startOfBusinessDate(addBusinessDays(from, -days)),
    start,
    to,
  };
}

export type DashboardWindows = {
  businessDate: string;
  range: DashboardRange;
  /** The 7 business dates ending today, oldest first. */
  last7Dates: string[];
  /** Start of today - 6 (first of the last 7 days). */
  last7Start: Date;
  /** Start of today - 13 (first of the 7 days before that). */
  previous7Start: Date;
  todayStart: Date;
  tomorrowStart: Date;
  yesterdayDate: string;
};

export function dashboardWindows(
  now: Date,
  range: { from?: string; to?: string } = {},
): DashboardWindows {
  const businessDate = businessDateOf(now);
  const last7Dates = Array.from({ length: DASHBOARD_TREND_DAYS }, (_, index) =>
    addBusinessDays(businessDate, index - (DASHBOARD_TREND_DAYS - 1)),
  );
  return {
    businessDate,
    range: dashboardRange(businessDate, range),
    last7Dates,
    last7Start: startOfBusinessDate(last7Dates[0] ?? businessDate),
    previous7Start: startOfBusinessDate(
      addBusinessDays(businessDate, -(2 * DASHBOARD_TREND_DAYS - 1)),
    ),
    todayStart: startOfBusinessDate(businessDate),
    tomorrowStart: startOfBusinessDate(addBusinessDays(businessDate, 1)),
    yesterdayDate: addBusinessDays(businessDate, -1),
  };
}

export function classifyStock(availableToSell: number): StockClass {
  if (availableToSell <= 0) return "OUT_OF_STOCK";
  if (availableToSell <= LOW_STOCK_MAX_AVAILABLE) return "LOW_STOCK";
  return "IN_STOCK";
}

export type DailySales = {
  date: string;
  saleCount: number;
  salesMinor: number;
};

/** One entry per date, oldest first; dates without sales are zero. */
export function zeroFillDailySales(
  dates: readonly string[],
  rows: readonly DailySales[],
): Array<{ date: string; salesMinor: number }> {
  const byDate = new Map(rows.map((row) => [row.date, row.salesMinor]));
  return dates.map((date) => ({ date, salesMinor: byDate.get(date) ?? 0 }));
}

export type DashboardSummary = {
  attention: {
    lowStockVariants: number;
    openSessions: Array<{
      counterName: string;
      openedAt: Date;
      openedByName: string;
      openingFloatMinor: number;
    }>;
    outOfStockVariants: number;
    pendingOrders: number;
  };
  businessDate: string;
  financials?: {
    channels: Array<{
      channel: DashboardSalesChannel;
      previousPeriodMinor: number;
      salesMinor: number;
    }>;
    last7Days: Array<{ date: string; salesMinor: number }>;
    period: DashboardPeriodSummary;
    refundsTodayMinor: number;
    stock: DashboardStockValue;
    todaySaleCount: number;
    todaySalesMinor: number;
    topProducts: Array<{
      name: string;
      productId: string;
      quantity: number;
      revenueMinor: number;
    }>;
    yesterdaySalesMinor: number;
  };
  generatedAt: Date;
  inventory: {
    inStock: number;
    inactive: number;
    lowStock: number;
    outOfStock: number;
    total: number;
  };
  recentOrders: Array<{
    channel: string;
    createdAt: Date;
    customerName: string | null;
    id: string;
    orderNumber: string;
    status: string;
    totalMinor: number;
  }>;
};

/** Stock on hand valued at cost (see the definitions at the top). */
export type DashboardStockValue = {
  costMinor: number;
  uncostedUnits: number;
};

/** One product's sales and estimated profit in the picked period. */
export type DashboardProductProfit = {
  /** Cost of the lines whose cost is known (supplier price + extra cost). */
  costMinor: number;
  /**
   * The part of costMinor that is transport/labour ("extra cost" at intake),
   * by each variant's posted purchases: extra / landed unit cost.
   */
  extraCostMinor: number;
  name: string;
  productCode: string;
  productId: string;
  /** Revenue of the lines with a known cost minus their cost. */
  profitMinor: number;
  quantity: number;
  /** Revenue of all its sale lines. */
  revenueMinor: number;
  /** Revenue of lines without any known cost (left out of profit). */
  uncostedRevenueMinor: number;
};

/** Raw per-product aggregates the repository returns. */
export type DashboardProductProfitRow = Omit<
  DashboardProductProfit,
  "profitMinor"
> & { costedRevenueMinor: number };

export type DashboardTopProduct = {
  name: string;
  productId: string;
  quantity: number;
  revenueMinor: number;
};

export type DashboardPeriodSummary = {
  averageSaleMinor: number;
  channels: Array<{
    channel: DashboardSalesChannel;
    previousPeriodMinor: number;
    salesMinor: number;
  }>;
  costMinor: number;
  daily: Array<{ date: string; profitMinor: number; salesMinor: number }>;
  from: string;
  previousSalesMinor: number;
  /** Ranked by profit; adds up to the period's profit and cost. */
  productProfits: DashboardProductProfit[];
  /** Estimated: see the definitions at the top of this file. */
  profitMinor: number;
  refundsMinor: number;
  saleCount: number;
  salesMinor: number;
  to: string;
  topProducts: DashboardTopProduct[];
  uncostedSalesMinor: number;
};

/** Raw aggregates for the picked period. */
export type DashboardPeriodReadModel = {
  channels: Array<{
    channel: string;
    previousPeriodMinor: number;
    salesMinor: number;
  }>;
  daily: Array<{
    costMinor: number;
    costedSalesMinor: number;
    date: string;
    saleCount: number;
    salesMinor: number;
  }>;
  productProfits: DashboardProductProfitRow[];
  refundsMinor: number;
  topProducts: DashboardTopProduct[];
  uncostedSalesMinor: number;
};

/** Raw, tenant-scoped aggregates the repository returns. */
export type DashboardReadModel = {
  financials: {
    channels: Array<{
      channel: string;
      previousPeriodMinor: number;
      salesMinor: number;
    }>;
    dailySales: DailySales[];
    period: DashboardPeriodReadModel;
    refundsTodayMinor: number;
    stock: DashboardStockValue;
    topProducts: NonNullable<DashboardSummary["financials"]>["topProducts"];
  } | null;
  inventory: DashboardSummary["inventory"];
  openSessions: DashboardSummary["attention"]["openSessions"];
  pendingOrders: number;
  recentOrders: DashboardSummary["recentOrders"];
};

export type DashboardReadRepository = {
  readDashboard(input: {
    includeFinancials: boolean;
    organizationId: string;
    windows: DashboardWindows;
  }): Promise<DashboardReadModel>;
};

/**
 * Builds the dashboard. Financial figures are read only when the caller may
 * see them; otherwise the block is absent (not zeroed).
 */
export async function getDashboardSummary(
  repository: DashboardReadRepository,
  input: {
    from?: string;
    includeFinancials: boolean;
    now: Date;
    organizationId: string;
    to?: string;
  },
): Promise<DashboardSummary> {
  const windows = dashboardWindows(input.now, {
    from: input.from,
    to: input.to,
  });
  const model = await repository.readDashboard({
    includeFinancials: input.includeFinancials,
    organizationId: input.organizationId,
    windows,
  });
  const summary: DashboardSummary = {
    attention: {
      lowStockVariants: model.inventory.lowStock,
      openSessions: model.openSessions,
      outOfStockVariants: model.inventory.outOfStock,
      pendingOrders: model.pendingOrders,
    },
    businessDate: windows.businessDate,
    generatedAt: input.now,
    inventory: model.inventory,
    recentOrders: model.recentOrders.slice(0, DASHBOARD_RECENT_ORDER_LIMIT),
  };
  if (input.includeFinancials && model.financials) {
    const daily = new Map(
      model.financials.dailySales.map((row) => [row.date, row]),
    );
    const channelRows = new Map(
      model.financials.channels.map((row) => [row.channel, row]),
    );
    summary.financials = {
      channels: DASHBOARD_SALES_CHANNELS.map((channel) => ({
        channel,
        previousPeriodMinor: channelRows.get(channel)?.previousPeriodMinor ?? 0,
        salesMinor: channelRows.get(channel)?.salesMinor ?? 0,
      })),
      last7Days: zeroFillDailySales(
        windows.last7Dates,
        model.financials.dailySales,
      ),
      period: summarizePeriod(windows.range, model.financials.period),
      refundsTodayMinor: model.financials.refundsTodayMinor,
      stock: model.financials.stock,
      todaySaleCount: daily.get(windows.businessDate)?.saleCount ?? 0,
      todaySalesMinor: daily.get(windows.businessDate)?.salesMinor ?? 0,
      topProducts: model.financials.topProducts.slice(
        0,
        DASHBOARD_TOP_PRODUCT_LIMIT,
      ),
      yesterdaySalesMinor: daily.get(windows.yesterdayDate)?.salesMinor ?? 0,
    };
  }
  return summary;
}

/** Totals, zero-filled daily series and channel rows for the picked period. */
export function summarizePeriod(
  range: DashboardRange,
  period: DashboardPeriodReadModel,
): DashboardPeriodSummary {
  const byDate = new Map(period.daily.map((row) => [row.date, row]));
  const daily = range.dates.map((date) => {
    const row = byDate.get(date);
    return {
      date,
      profitMinor: (row?.costedSalesMinor ?? 0) - (row?.costMinor ?? 0),
      salesMinor: row?.salesMinor ?? 0,
    };
  });
  const sum = (
    pick: (row: DashboardPeriodReadModel["daily"][number]) => number,
  ) => period.daily.reduce((total, row) => total + pick(row), 0);
  const saleCount = sum((row) => row.saleCount);
  const salesMinor = sum((row) => row.salesMinor);
  const costMinor = sum((row) => row.costMinor);
  const channelRows = new Map(period.channels.map((row) => [row.channel, row]));
  const channels = DASHBOARD_SALES_CHANNELS.map((channel) => ({
    channel,
    previousPeriodMinor: channelRows.get(channel)?.previousPeriodMinor ?? 0,
    salesMinor: channelRows.get(channel)?.salesMinor ?? 0,
  }));
  return {
    averageSaleMinor: saleCount > 0 ? Math.round(salesMinor / saleCount) : 0,
    channels,
    costMinor,
    daily,
    from: range.from,
    previousSalesMinor: channels.reduce(
      (total, row) => total + row.previousPeriodMinor,
      0,
    ),
    productProfits: period.productProfits
      .map(({ costedRevenueMinor, ...row }) => ({
        ...row,
        profitMinor: costedRevenueMinor - row.costMinor,
      }))
      .sort(
        (a, b) =>
          b.profitMinor - a.profitMinor ||
          b.revenueMinor - a.revenueMinor ||
          a.productId.localeCompare(b.productId),
      )
      .slice(0, DASHBOARD_PRODUCT_PROFIT_LIMIT),
    profitMinor: sum((row) => row.costedSalesMinor) - costMinor,
    refundsMinor: period.refundsMinor,
    saleCount,
    salesMinor,
    to: range.to,
    topProducts: period.topProducts.slice(0, DASHBOARD_TOP_PRODUCT_LIMIT),
    uncostedSalesMinor: period.uncostedSalesMinor,
  };
}
