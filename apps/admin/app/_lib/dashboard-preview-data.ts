import type { DashboardModel } from "../_components/dashboard";

// DESIGN HANDOFF ONLY.
// Cline/integration work must replace this preview model with real organization-scoped
// read models before the design branch is merged into the implementation branch.
export const dashboardPreviewData = {
  attention: [
    {
      count: "3",
      detail: "2 online · 1 store order",
      href: "/sales/orders",
      kind: "orders",
      label: "Orders waiting for fulfilment",
    },
    {
      count: "8",
      detail: "Reorder recommended",
      href: "/inventory",
      kind: "inventory",
      label: "Variants low on available stock",
    },
    {
      count: "1",
      detail: "Counter 02 is still open",
      href: "/pos/sessions",
      kind: "session",
      label: "Open POS session",
    },
    {
      count: "2",
      detail: "Review settlement state",
      href: "/pos/checkouts",
      kind: "payment",
      label: "Payments need reconciliation",
    },
  ],
  chart: {
    labels: ["19 Aug", "20 Aug", "21 Aug", "22 Aug", "23 Aug", "24 Aug", "25 Aug"],
    values: [92000, 144000, 191000, 189000, 238000, 190000, 265800],
  },
  channels: [
    { amount: "৳ 178,500", change: "19.3%", kind: "store", label: "Store sales" },
    { amount: "৳ 72,300", change: "16.8%", kind: "online", label: "Online store" },
    { amount: "৳ 15,000", change: "8.2%", kind: "booth", label: "Event booths" },
  ],
  dateLabel: "25 August 2026",
  greetingName: "Asif",
  inventory: {
    note: "8 variants are low on available stock.",
    slices: [
      { count: "156", label: "In stock", tone: "healthy" },
      { count: "8", label: "Low stock", tone: "warning" },
      { count: "18", label: "Out of stock", tone: "danger" },
      { count: "66", label: "Inactive", tone: "muted" },
    ],
    total: "248",
  },
  metrics: [
    { label: "Today’s sales", value: "৳ 265,800", meta: "↗ 18.6% vs yesterday" },
    { label: "Today’s orders", value: "24", meta: "↗ 9.1% vs yesterday" },
    { label: "Items sold", value: "132", meta: "↗ 12.4% vs yesterday" },
    { label: "Average order value", value: "৳ 2,215", meta: "↗ 7.3% vs yesterday" },
    { label: "Open sessions", value: "3", meta: "2 active counters" },
    { label: "Low stock variants", value: "8", meta: "Needs attention", tone: "attention" },
  ],
  orders: [
    {
      channel: "Online",
      customer: "Customer 1058",
      href: "/sales/orders",
      id: "#SO-1058",
      status: "Reserved",
      time: "10 min ago",
      total: "৳ 4,650",
    },
    {
      channel: "Store",
      customer: "Customer 1057",
      href: "/sales/orders",
      id: "#SO-1057",
      status: "Paid",
      time: "28 min ago",
      total: "৳ 2,150",
    },
    {
      channel: "Online",
      customer: "Customer 1056",
      href: "/sales/orders",
      id: "#SO-1056",
      status: "Reserved",
      time: "45 min ago",
      total: "৳ 3,850",
    },
    {
      channel: "Store",
      customer: "Customer 1055",
      href: "/sales/orders",
      id: "#SO-1055",
      status: "Paid",
      time: "1 hr ago",
      total: "৳ 1,650",
    },
    {
      channel: "Booth",
      customer: "Customer 1054",
      href: "/sales/orders",
      id: "#SO-1054",
      status: "Confirmed",
      time: "2 hr ago",
      total: "৳ 2,300",
    },
  ],
  products: [
    { label: "Premium Oxford Shirt", meta: "Men", revenue: "৳ 56,000", sold: "28 sold" },
    { label: "Denim Jacket", meta: "Unisex", revenue: "৳ 42,000", sold: "21 sold" },
    { label: "Essential Hoodie", meta: "Unisex", revenue: "৳ 27,000", sold: "18 sold" },
    { label: "Cargo Pants", meta: "Men", revenue: "৳ 22,500", sold: "15 sold" },
    { label: "Polo T-Shirt", meta: "Men", revenue: "৳ 18,000", sold: "12 sold" },
  ],
  revenueTotal: "৳ 265,800",
} satisfies DashboardModel;
