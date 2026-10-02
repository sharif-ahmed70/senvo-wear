import { describe, expect, it } from "vitest";
import {
  classifyStock,
  dashboardWindows,
  getDashboardSummary,
  type DashboardReadModel,
  type DashboardReadRepository,
} from "./dashboard.js";

const emptyModel = (): DashboardReadModel => ({
  financials: {
    channels: [],
    dailySales: [],
    refundsTodayMinor: 0,
    topProducts: [],
  },
  inventory: { inStock: 0, inactive: 0, lowStock: 0, outOfStock: 0, total: 0 },
  openSessions: [],
  pendingOrders: 0,
  recentOrders: [],
});

function repository(model = emptyModel()) {
  const calls: Array<{ includeFinancials: boolean }> = [];
  const repo: DashboardReadRepository = {
    readDashboard: (input) => {
      calls.push(input);
      return Promise.resolve(model);
    },
  };
  return { calls, repo };
}

describe("dashboard windows", () => {
  it("uses the Asia/Dhaka calendar day", () => {
    // 2026-10-02 19:30 UTC is already 2026-10-03 01:30 in Dhaka.
    const windows = dashboardWindows(new Date("2026-10-02T19:30:00.000Z"));
    expect(windows.businessDate).toBe("2026-10-03");
    expect(windows.todayStart.toISOString()).toBe("2026-10-02T18:00:00.000Z");
    expect(windows.tomorrowStart.toISOString()).toBe(
      "2026-10-03T18:00:00.000Z",
    );
    expect(windows.yesterdayDate).toBe("2026-10-02");
    expect(windows.last7Dates).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(windows.last7Start.toISOString()).toBe("2026-09-26T18:00:00.000Z");
    expect(windows.previous7Start.toISOString()).toBe(
      "2026-09-19T18:00:00.000Z",
    );
  });

  it("classifies stock: 0 out, 1..3 low, more in stock", () => {
    expect(classifyStock(-2)).toBe("OUT_OF_STOCK");
    expect(classifyStock(0)).toBe("OUT_OF_STOCK");
    expect(classifyStock(1)).toBe("LOW_STOCK");
    expect(classifyStock(3)).toBe("LOW_STOCK");
    expect(classifyStock(4)).toBe("IN_STOCK");
  });
});

describe("getDashboardSummary", () => {
  const now = new Date("2026-10-02T06:00:00.000Z");

  it("zero-fills seven days and every channel on an empty store", async () => {
    const { repo } = repository();
    const summary = await getDashboardSummary(repo, {
      includeFinancials: true,
      now,
      organizationId: "org",
    });
    expect(summary.businessDate).toBe("2026-10-02");
    expect(summary.financials?.last7Days).toHaveLength(7);
    expect(
      summary.financials?.last7Days.every((day) => day.salesMinor === 0),
    ).toBe(true);
    expect(summary.financials?.channels.map((c) => c.channel)).toEqual([
      "POS",
      "OFFLINE_STORE",
      "ONLINE",
      "EVENT_BOOTH",
      "MANUAL",
    ]);
    expect(summary.financials?.todaySalesMinor).toBe(0);
  });

  it("omits financials entirely when the caller may not see them", async () => {
    const { calls, repo } = repository();
    const summary = await getDashboardSummary(repo, {
      includeFinancials: false,
      now,
      organizationId: "org",
    });
    expect("financials" in summary).toBe(false);
    expect(calls[0]?.includeFinancials).toBe(false);
  });

  it("reads today and yesterday from the daily rows", async () => {
    const model = emptyModel();
    model.financials?.dailySales.push(
      { date: "2026-10-02", saleCount: 3, salesMinor: 90000 },
      { date: "2026-10-01", saleCount: 1, salesMinor: 15000 },
      { date: "2026-09-20", saleCount: 9, salesMinor: 999 },
    );
    const { repo } = repository(model);
    const summary = await getDashboardSummary(repo, {
      includeFinancials: true,
      now,
      organizationId: "org",
    });
    expect(summary.financials).toMatchObject({
      todaySaleCount: 3,
      todaySalesMinor: 90000,
      yesterdaySalesMinor: 15000,
    });
    expect(summary.financials?.last7Days.at(-1)).toEqual({
      date: "2026-10-02",
      salesMinor: 90000,
    });
  });
});
