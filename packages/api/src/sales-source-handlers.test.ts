import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type {
  SalesBoothContract,
  SalesSourceSummaryContract,
} from "@senvo/contracts";
import { describe, expect, it } from "vitest";
import {
  createSalesSourceApiHandlers,
  type ApiRequestContext,
  type SalesSourceApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const context: ApiRequestContext = {
  authenticatedUser: { userId },
  organizationId,
  permissions: [{ action: "READ", resource: "SALES" }],
  requestId: "req_sales_source_1",
};

describe("sales source API handlers", () => {
  it("uses SALES.READ with trusted organization context", async () => {
    const application = new FakeSalesSource();
    const authorization = new FakeAuthorization();
    const response = handlers(application, authorization).listBooths.handle({
      context,
      input: {},
    });
    await expect(response).resolves.toMatchObject({ success: true });
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "SALES",
    });
    expect(application.context).toMatchObject({ organizationId, userId });
  });

  it("rejects organization, staff, and permission injection", async () => {
    const application = new FakeSalesSource();
    const response = await handlers(application).createBooth.handle({
      context: {
        ...context,
        permissions: [{ action: "CREATE", resource: "SALES" }],
      },
      input: {
        endDate: "2026-08-10",
        location: "UIU",
        name: "Spring Fest",
        organizationId,
        permissions: [],
        responsibleStaffId: userId,
        startDate: "2026-08-08",
      },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(application.context).toBeUndefined();
  });

  it("validates booth dates and requires SALES.UPDATE for status", async () => {
    const application = new FakeSalesSource();
    const authorization = new FakeAuthorization();
    const invalid = await handlers(application).createBooth.handle({
      context,
      input: { endDate: "bad", location: "", name: "", startDate: "bad" },
    });
    expect(invalid).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
    });
    await handlers(application, authorization).updateBoothStatus.handle({
      context: {
        ...context,
        permissions: [{ action: "UPDATE", resource: "SALES" }],
      },
      input: {
        boothId: "20000000-0000-4000-8000-000000000001",
        expectedVersion: 1,
        status: "INACTIVE",
      },
    });
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "SALES",
    });
  });
});

const authenticationService: ApplicationAuthenticationService = {
  authenticate: (request) =>
    Promise.resolve({
      authenticatedUserId: request.userId ?? userId,
      provider: "PASSWORD",
      requestId: request.requestId,
    }),
};
function handlers(
  sales: FakeSalesSource,
  authorizationService = new FakeAuthorization(),
) {
  return createSalesSourceApiHandlers({
    authenticationService,
    authorizationService,
    sales,
  });
}
class FakeAuthorization implements ApplicationAuthorizationService {
  permission?: { action: string; resource: string };
  authorize(
    _context: ApplicationExecutionContext,
    permission: { action: string; resource: string },
  ) {
    this.permission = permission;
    return Promise.resolve();
  }
}
class FakeSalesSource implements SalesSourceApplication {
  context?: ApplicationExecutionContext;
  private result<T>(context: ApplicationExecutionContext, data: T) {
    this.context = context;
    return Promise.resolve<ApplicationServiceResult<T>>({ data, ok: true });
  }
  createSalesBooth(context: ApplicationExecutionContext) {
    return this.result(context, {} as SalesBoothContract);
  }
  getSalesSourceSummary(context: ApplicationExecutionContext) {
    return this.result(context, {} as SalesSourceSummaryContract);
  }
  listSalesBooths(context: ApplicationExecutionContext) {
    return this.result(context, [] as SalesBoothContract[]);
  }
  updateSalesBoothStatus(context: ApplicationExecutionContext) {
    return this.result(context, {} as SalesBoothContract);
  }
}
