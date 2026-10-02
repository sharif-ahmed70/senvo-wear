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
 */
export const DASHBOARD_TIME_ZONE = "Asia/Dhaka";
export const LOW_STOCK_MAX_AVAILABLE = 3;
export const SALE_ORDER_STATUSES = ["CONFIRMED", "FULFILLED"] as const;
export const PENDING_ORDER_STATUSES = ["RESERVED", "CONFIRMED"] as const;
export const DASHBOARD_RECENT_ORDER_LIMIT = 6;
export const DASHBOARD_TOP_PRODUCT_LIMIT = 5;
export const DASHBOARD_TREND_DAYS = 7;
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

export type DashboardWindows = {
  businessDate: string;
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

export function dashboardWindows(now: Date): DashboardWindows {
  const businessDate = businessDateOf(now);
  const last7Dates = Array.from({ length: DASHBOARD_TREND_DAYS }, (_, index) =>
    addBusinessDays(businessDate, index - (DASHBOARD_TREND_DAYS - 1)),
  );
  return {
    businessDate,
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
    refundsTodayMinor: number;
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

/** Raw, tenant-scoped aggregates the repository returns. */
export type DashboardReadModel = {
  financials: {
    channels: Array<{
      channel: string;
      previousPeriodMinor: number;
      salesMinor: number;
    }>;
    dailySales: DailySales[];
    refundsTodayMinor: number;
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
  input: { includeFinancials: boolean; now: Date; organizationId: string },
): Promise<DashboardSummary> {
  const windows = dashboardWindows(input.now);
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
      refundsTodayMinor: model.financials.refundsTodayMinor,
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
