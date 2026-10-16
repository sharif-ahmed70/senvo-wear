import type { DashboardSummaryContract } from "@senvo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminDashboard } from "./_components/dashboard";
import {
  changeLabel,
  dashboardModelFromSummary,
  formatMinor,
} from "./_lib/dashboard-model";

const base: DashboardSummaryContract = {
  attention: {
    lowStockVariants: 2,
    openSessions: [
      {
        counterName: "Main counter",
        openedAt: "2026-10-02T03:00:00.000Z",
        openedByName: "Rina",
        openingFloatMinor: 50000,
      },
    ],
    outOfStockVariants: 1,
    pendingOrders: 3,
  },
  businessDate: "2026-10-02",
  generatedAt: "2026-10-02T06:00:00.000Z",
  inventory: { inStock: 7, inactive: 1, lowStock: 2, outOfStock: 1, total: 11 },
  recentOrders: [
    {
      channel: "POS",
      createdAt: "2026-10-02T05:50:00.000Z",
      customerName: null,
      id: "44444444-4444-4444-8444-444444444444",
      orderNumber: "SO-0042",
      status: "FULFILLED",
      totalMinor: 125050,
    },
  ],
};

const financials: NonNullable<DashboardSummaryContract["financials"]> = {
  channels: [
    { channel: "POS", previousPeriodMinor: 100000, salesMinor: 150000 },
  ],
  last7Days: [
    "2026-09-26",
    "2026-09-27",
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
  ].map((date) => ({ date, salesMinor: 0 })),
  refundsTodayMinor: 0,
  todaySaleCount: 1,
  todaySalesMinor: 125050,
  topProducts: [],
  yesterdaySalesMinor: 0,
};

const render = (summary: DashboardSummaryContract) =>
  renderToStaticMarkup(
    <AdminDashboard
      model={dashboardModelFromSummary(summary, {
        greetingName: "Rina",
        now: new Date("2026-10-02T06:00:00.000Z"),
      })}
    />,
  );

describe("dashboard model", () => {
  it("hides every money panel when financials are absent", () => {
    const html = render(base);
    expect(html).not.toContain("Sales overview");
    expect(html).not.toContain("Channel performance");
    expect(html).not.toContain("Top selling products");
    expect(html).not.toContain("Today’s sales");
    expect(html).toContain("Orders waiting for fulfilment");
    expect(html).toContain("SO-0042");
    expect(html).toContain("Walk-in customer");
    expect(html).toContain("10 min ago");
  });

  it("shows sales, channels and top products with financials", () => {
    const html = render({ ...base, financials });
    expect(html).toContain("Sales overview");
    expect(html).toContain("Counter (POS)");
    expect(html).toContain("+50.0%");
    expect(html).toContain("৳ 1,250.5");
    expect(html).toContain("No sales in the last 7 days.");
  });

  it("formats money and changes without floats leaking into minor units", () => {
    expect(formatMinor(125000)).toBe("৳ 1,250");
    expect(changeLabel(0, 0)).toBe("—");
    expect(changeLabel(500, 0)).toBe("New");
    expect(changeLabel(900, 1000)).toBe("−10.0%");
  });
});
