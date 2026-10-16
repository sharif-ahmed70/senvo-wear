import {
  AuthorizationError,
  type DashboardReadModel,
  type DashboardReadRepository,
  type PermissionKey,
} from "@senvo/domain";
import { describe, expect, it } from "vitest";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import { ReportingApplicationService } from "./reporting-application-service.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

const model: DashboardReadModel = {
  financials: {
    channels: [{ channel: "POS", previousPeriodMinor: 1000, salesMinor: 5000 }],
    dailySales: [{ date: "2026-10-02", saleCount: 2, salesMinor: 5000 }],
    refundsTodayMinor: 300,
    topProducts: [
      {
        name: "Polo",
        productId: "33333333-3333-4333-8333-333333333333",
        quantity: 2,
        revenueMinor: 5000,
      },
    ],
  },
  inventory: { inStock: 4, inactive: 1, lowStock: 2, outOfStock: 3, total: 10 },
  openSessions: [
    {
      counterName: "Main counter",
      openedAt: new Date("2026-10-02T03:00:00.000Z"),
      openedByName: "Rina",
      openingFloatMinor: 50000,
    },
  ],
  pendingOrders: 5,
  recentOrders: [
    {
      channel: "POS",
      createdAt: new Date("2026-10-02T05:00:00.000Z"),
      customerName: null,
      id: "44444444-4444-4444-8444-444444444444",
      orderNumber: "SO-0001",
      status: "FULFILLED",
      totalMinor: 2500,
    },
  ],
};

/** Grants exactly the permissions in the context, like the HTTP layer. */
const contextPermissions: ApplicationAuthorizationService = {
  authorize: (context, permission) =>
    (context.permissions ?? []).some(
      (item) =>
        item.action === permission.action &&
        item.resource === permission.resource,
    )
      ? Promise.resolve()
      : Promise.reject(new AuthorizationError()),
};

function service() {
  const calls: boolean[] = [];
  const dashboards: DashboardReadRepository = {
    readDashboard: (input) => {
      calls.push(input.includeFinancials);
      return Promise.resolve({
        ...model,
        financials: input.includeFinancials ? model.financials : null,
      });
    },
  };
  return {
    calls,
    service: new ReportingApplicationService({
      authorizationService: contextPermissions,
      clock: { now: () => new Date("2026-10-02T06:00:00.000Z") },
      dashboards,
    }),
  };
}

const context = (permissions: PermissionKey[]) => ({
  organizationId,
  permissions,
  requestId: "req-dashboard",
  userId,
});

const STAFF: PermissionKey[] = [
  { action: "READ", resource: "REPORT" },
  { action: "CREATE", resource: "POS" },
];
const OWNER: PermissionKey[] = [
  { action: "READ", resource: "REPORT" },
  { action: "APPROVE", resource: "POS" },
];

describe("ReportingApplicationService.getDashboardSummary", () => {
  it("omits financials entirely without POS APPROVE", async () => {
    const harness = service();
    const result = await harness.service.getDashboardSummary(
      context(STAFF),
      {},
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("financials" in result.data).toBe(false);
    expect(JSON.stringify(result.data)).not.toMatch(/salesMinor|refunds/u);
    expect(harness.calls).toEqual([false]);
    expect(result.data.attention).toMatchObject({
      lowStockVariants: 2,
      outOfStockVariants: 3,
      pendingOrders: 5,
    });
  });

  it("includes financials for owners", async () => {
    const harness = service();
    const result = await harness.service.getDashboardSummary(
      context(OWNER),
      {},
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(harness.calls).toEqual([true]);
    expect(result.data.businessDate).toBe("2026-10-02");
    expect(result.data.financials).toMatchObject({
      refundsTodayMinor: 300,
      todaySaleCount: 2,
      todaySalesMinor: 5000,
      yesterdaySalesMinor: 0,
    });
    expect(result.data.financials?.last7Days).toHaveLength(7);
    expect(result.data.recentOrders[0]?.createdAt).toBe(
      "2026-10-02T05:00:00.000Z",
    );
  });

  it("requires REPORT READ", async () => {
    const harness = service();
    const result = await harness.service.getDashboardSummary(
      context([{ action: "APPROVE", resource: "POS" }]),
      {},
    );
    expect(result).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
    expect(harness.calls).toEqual([]);
  });

  it("rejects unexpected input", async () => {
    const result = await service().service.getDashboardSummary(context(OWNER), {
      organizationId,
    });
    expect(result).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
      ok: false,
    });
  });
});
