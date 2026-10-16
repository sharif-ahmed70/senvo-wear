import type { DashboardSummaryContract } from "@senvo/contracts";
import type {
  DashboardAttentionItem,
  DashboardChannel,
  DashboardMetric,
  DashboardModel,
  DashboardOrder,
} from "../_components/dashboard";

type Channel = DashboardSummaryContract["recentOrders"][number]["channel"];

const channelLabels: Record<Channel, string> = {
  EVENT_BOOTH: "Booth",
  MANUAL: "Manual",
  OFFLINE_STORE: "Store",
  ONLINE: "Online",
  POS: "POS",
};

const channelCards: Record<
  Channel,
  { kind: DashboardChannel["kind"]; label: string }
> = {
  EVENT_BOOTH: { kind: "booth", label: "Event booths" },
  MANUAL: { kind: "store", label: "Manual orders" },
  OFFLINE_STORE: { kind: "store", label: "Store orders" },
  ONLINE: { kind: "online", label: "Online store" },
  POS: { kind: "store", label: "Counter (POS)" },
};

const amountFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** Integer poisha → "৳ 1,250" (display only). */
export function formatMinor(minor: number): string {
  return `৳ ${amountFormatter.format(minor / 100)}`;
}

/** "+18.6%", "−4.0%", "New" when the earlier period was zero, "—" when both are zero. */
export function changeLabel(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "—" : "New";
  const percent = ((current - previous) / previous) * 100;
  return `${percent >= 0 ? "+" : "−"}${Math.abs(percent).toFixed(1)}%`;
}

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function relativeTime(iso: string, now: Date): string {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - Date.parse(iso)) / 60_000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/** Maps the real dashboard summary onto the dashboard view model. */
export function dashboardModelFromSummary(
  summary: DashboardSummaryContract,
  options: { greetingName: string; now?: Date },
): DashboardModel {
  const now = options.now ?? new Date();
  const { attention, financials, inventory } = summary;
  const firstSession = attention.openSessions[0];

  const metrics: DashboardMetric[] = [];
  if (financials) {
    const average =
      financials.todaySaleCount > 0
        ? Math.round(financials.todaySalesMinor / financials.todaySaleCount)
        : 0;
    metrics.push(
      {
        label: "Today’s sales",
        meta: `${changeLabel(financials.todaySalesMinor, financials.yesterdaySalesMinor)} vs yesterday`,
        value: formatMinor(financials.todaySalesMinor),
      },
      {
        label: "Today’s sales count",
        meta: "Confirmed and fulfilled",
        value: String(financials.todaySaleCount),
      },
      {
        label: "Average sale value",
        meta: "Today",
        value: formatMinor(average),
      },
      {
        label: "Refunds today",
        meta: "Shown separately, not deducted",
        value: formatMinor(financials.refundsTodayMinor),
      },
    );
  }
  metrics.push(
    {
      label: "Open sessions",
      meta: firstSession
        ? `${firstSession.counterName} is open`
        : "No counter open",
      value: String(attention.openSessions.length),
    },
    {
      label: "Low stock variants",
      meta: `${attention.outOfStockVariants} out of stock`,
      tone: attention.lowStockVariants > 0 ? "attention" : "default",
      value: String(attention.lowStockVariants),
    },
  );

  const attentionItems: DashboardAttentionItem[] = [
    {
      count: String(attention.pendingOrders),
      detail: "Reserved or confirmed, not yet fulfilled",
      href: "/sales/orders",
      kind: "orders",
      label: "Orders waiting for fulfilment",
    },
    {
      count: String(attention.lowStockVariants + attention.outOfStockVariants),
      detail: `${attention.lowStockVariants} low · ${attention.outOfStockVariants} out of stock`,
      href: "/inventory",
      kind: "inventory",
      label: "Variants low or out of stock",
    },
    {
      count: String(attention.openSessions.length),
      detail: firstSession
        ? `${firstSession.counterName} · opened by ${firstSession.openedByName}`
        : "No open POS session",
      href: "/pos/sessions",
      kind: "session",
      label: "Open POS sessions",
    },
  ];

  const orders: DashboardOrder[] = summary.recentOrders.map((order) => ({
    channel: channelLabels[order.channel],
    customer: order.customerName ?? "Walk-in customer",
    href: `/sales/orders/${order.id}`,
    id: order.orderNumber,
    status: titleCase(order.status),
    time: relativeTime(order.createdAt, now),
    total: formatMinor(order.totalMinor),
  }));

  const model: DashboardModel = {
    attention: attentionItems,
    dateLabel: longDate(summary.businessDate),
    greetingName: options.greetingName,
    inventory: {
      note:
        attention.lowStockVariants > 0
          ? `${attention.lowStockVariants} variants are low on available stock.`
          : "No variant is low on stock.",
      slices: [
        {
          count: String(inventory.inStock),
          label: "In stock",
          tone: "healthy",
        },
        {
          count: String(inventory.lowStock),
          label: "Low stock",
          tone: "warning",
        },
        {
          count: String(inventory.outOfStock),
          label: "Out of stock",
          tone: "danger",
        },
        { count: String(inventory.inactive), label: "Inactive", tone: "muted" },
      ],
      total: String(inventory.total),
    },
    metrics,
    orders,
  };

  if (financials) {
    model.chart = {
      labels: financials.last7Days.map((day) => dayLabel(day.date)),
      values: financials.last7Days.map((day) => day.salesMinor),
    };
    model.channels = financials.channels.map((channel) => ({
      ...channelCards[channel.channel],
      amount: formatMinor(channel.salesMinor),
      change: changeLabel(channel.salesMinor, channel.previousPeriodMinor),
    }));
    model.products = financials.topProducts.map((product) => ({
      label: product.name,
      meta: "Last 7 days",
      revenue: formatMinor(product.revenueMinor),
      sold: `${product.quantity} sold`,
    }));
    model.revenueTotal = formatMinor(
      financials.channels.reduce((sum, channel) => sum + channel.salesMinor, 0),
    );
  }
  return model;
}
