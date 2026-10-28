import { describe, expect, it } from "vitest";
import {
  classifyStock,
  dashboardRange,
  dashboardWindows,
  summarizePeriod,
  getDashboardSummary,
  type DashboardReadModel,
  type DashboardReadRepository,
} from "./dashboard.js";

const emptyModel = (): DashboardReadModel => ({
  financials: {
    channels: [],
    dailySales: [],
    period: {
      channels: [],
      daily: [],
      productProfits: [],
      refundsMinor: 0,
      topProducts: [],
      uncostedSalesMinor: 0,
    },
    refundsTodayMinor: 0,
    stock: { costMinor: 0, uncostedUnits: 0 },
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

describe("dashboard period", () => {
  it("defaults to today and accepts a single date", () => {
    expect(dashboardRange("2026-10-21")).toMatchObject({
      dates: ["2026-10-21"],
      from: "2026-10-21",
      to: "2026-10-21",
    });
    expect(dashboardRange("2026-10-21", { from: "2026-10-01" }).to).toBe(
      "2026-10-01",
    );
  });

  it("covers whole Dhaka days and compares with the same length before", () => {
    const range = dashboardRange("2026-10-21", {
      from: "2026-10-01",
      to: "2026-10-07",
    });
    expect(range.dates).toHaveLength(7);
    expect(range.start.toISOString()).toBe("2026-09-30T18:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-07T18:00:00.000Z");
    expect(range.previousStart.toISOString()).toBe("2026-09-23T18:00:00.000Z");
  });

  it("rejects reversed, malformed and too long ranges", () => {
    expect(() =>
      dashboardRange("2026-10-21", { from: "2026-10-09", to: "2026-10-01" }),
    ).toThrow();
    expect(() =>
      dashboardRange("2026-10-21", { from: "10/01/2026" }),
    ).toThrow();
    expect(() =>
      dashboardRange("2026-10-21", { from: "2024-01-01", to: "2026-01-01" }),
    ).toThrow();
  });

  it("computes estimated profit only from costed sales", () => {
    const summary = summarizePeriod(
      dashboardRange("2026-10-21", { from: "2026-10-20", to: "2026-10-21" }),
      {
        channels: [
          { channel: "POS", previousPeriodMinor: 1_000, salesMinor: 30_000 },
        ],
        daily: [
          {
            costMinor: 6_000,
            costedSalesMinor: 10_000,
            date: "2026-10-21",
            saleCount: 2,
            salesMinor: 30_000,
          },
        ],
        productProfits: [
          {
            costMinor: 3_500,
            costedRevenueMinor: 4_000,
            extraCostMinor: 500,
            name: "Panjabi",
            productCode: "PAN-0001",
            productId: "11111111-1111-4111-8111-111111111111",
            quantity: 3,
            returnedQuantity: 0,
            revenueMinor: 24_000,
            uncostedRevenueMinor: 20_000,
          },
          {
            costMinor: 2_500,
            costedRevenueMinor: 6_000,
            extraCostMinor: 0,
            name: "Shirt",
            productCode: "SHI-0001",
            productId: "22222222-2222-4222-8222-222222222222",
            quantity: 2,
            returnedQuantity: 0,
            revenueMinor: 6_000,
            uncostedRevenueMinor: 0,
          },
        ],
        refundsMinor: 500,
        topProducts: [],
        uncostedSalesMinor: 20_000,
      },
    );
    // Ranked by profit; the rows add up to the period's cost and profit.
    expect(
      summary.productProfits.map(({ name, profitMinor }) => [
        name,
        profitMinor,
      ]),
    ).toEqual([
      ["Shirt", 3_500],
      ["Panjabi", 500],
    ]);
    expect(
      summary.productProfits.reduce((sum, row) => sum + row.profitMinor, 0),
    ).toBe(summary.profitMinor);
    expect(
      summary.productProfits.reduce((sum, row) => sum + row.costMinor, 0),
    ).toBe(summary.costMinor);
    // Transport/labour is shown apart but stays inside the cost.
    expect(summary.productProfits[1]).toMatchObject({
      costMinor: 3_500,
      extraCostMinor: 500,
      profitMinor: 500,
    });
    expect(summary).toMatchObject({
      averageSaleMinor: 15_000,
      costMinor: 6_000,
      previousSalesMinor: 1_000,
      profitMinor: 4_000,
      saleCount: 2,
      salesMinor: 30_000,
      uncostedSalesMinor: 20_000,
    });
    expect(summary.daily).toEqual([
      { date: "2026-10-20", profitMinor: 0, salesMinor: 0 },
      { date: "2026-10-21", profitMinor: 4_000, salesMinor: 30_000 },
    ]);
  });

  it("takes a return off the profit of the day it came back", () => {
    // Shoe sold on 20th (1 480, cost 975), returned on 21st; a shirt sold
    // on 21st (400, cost 241) as the exchange.
    const summary = summarizePeriod(
      dashboardRange("2026-10-21", { from: "2026-10-20", to: "2026-10-21" }),
      {
        channels: [],
        daily: [
          {
            costMinor: 97_500,
            costedSalesMinor: 148_000,
            date: "2026-10-20",
            saleCount: 1,
            salesMinor: 148_000,
          },
          {
            costMinor: 24_100 - 97_500,
            costedSalesMinor: 40_000 - 148_000,
            date: "2026-10-21",
            saleCount: 1,
            salesMinor: 40_000,
          },
        ],
        productProfits: [
          {
            costMinor: 0,
            costedRevenueMinor: 0,
            extraCostMinor: 0,
            name: "Shoe",
            productCode: "SPO-0002",
            productId: "11111111-1111-4111-8111-111111111111",
            quantity: 0,
            returnedQuantity: 1,
            revenueMinor: 0,
            uncostedRevenueMinor: 0,
          },
          {
            costMinor: 24_100,
            costedRevenueMinor: 40_000,
            extraCostMinor: 1_100,
            name: "Shirt",
            productCode: "SHI-0001",
            productId: "22222222-2222-4222-8222-222222222222",
            quantity: 1,
            returnedQuantity: 0,
            revenueMinor: 40_000,
            uncostedRevenueMinor: 0,
          },
        ],
        refundsMinor: 0,
        topProducts: [],
        uncostedSalesMinor: 0,
      },
    );
    // Only the exchanged shirt's profit is left.
    expect(summary.profitMinor).toBe(15_900);
    expect(summary.daily).toEqual([
      { date: "2026-10-20", profitMinor: 50_500, salesMinor: 148_000 },
      { date: "2026-10-21", profitMinor: -34_600, salesMinor: 40_000 },
    ]);
    expect(summary.productProfits).toEqual([
      expect.objectContaining({ name: "Shirt", profitMinor: 15_900 }),
      expect.objectContaining({
        name: "Shoe",
        profitMinor: 0,
        returnedQuantity: 1,
      }),
    ]);
  });
});

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
