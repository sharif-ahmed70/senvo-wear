import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type {
  SalesOrderDetailsReadContract,
  SalesOrderServiceContract,
} from "@senvo/contracts";
import { AuthorizationError } from "@senvo/domain";
import { describe, expect, it } from "vitest";
import {
  createSalesOrderManagementApiHandlers,
  type ApiRequestContext,
  type SalesOrderManagementApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const salesOrderId = "10000000-0000-4000-8000-000000000003";
const requestId = "req_sales_management_1";
const context: ApiRequestContext = {
  authenticatedUser: { userId },
  organizationId,
  permissions: [
    { action: "READ", resource: "SALES_ORDER" },
    { action: "UPDATE", resource: "SALES_ORDER" },
  ],
  requestId,
};

describe("sales order management API handlers", () => {
  it("lists and reads orders with SALES_ORDER.READ and trusted scope", async () => {
    const sales = new FakeSalesManagementApplication();
    const authorization = new FakeAuthorization();
    const handlers = createSalesOrderManagementApiHandlers({
      authenticationService,
      authorizationService: authorization,
      sales,
    });

    await handlers.list.handle({
      context,
      input: { order: "NEWEST", search: "SO-1", status: "DRAFT" },
    });
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "SALES_ORDER",
    });
    expect(sales.context).toMatchObject({ organizationId, userId });
    expect(sales.payload).toEqual({
      order: "NEWEST",
      search: "SO-1",
      status: "DRAFT",
    });

    await handlers.getDetails.handle({ context, input: { salesOrderId } });
    expect(sales.operation).toBe("details");
  });

  it("rejects organization and server-derived field injection", async () => {
    const sales = new FakeSalesManagementApplication();
    const handlers = createSalesOrderManagementApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      sales,
    });

    const response = await handlers.fulfill.handle({
      context,
      input: {
        expectedVersion: 1,
        movementNumber: "INJECTED",
        organizationId,
        salesOrderId,
        totals: { totalMinor: 1 },
      },
    });

    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(sales.operation).toBeUndefined();
  });

  it("maps every lifecycle action to SALES_ORDER.UPDATE", async () => {
    const sales = new FakeSalesManagementApplication();
    const authorization = new FakeAuthorization();
    const handlers = createSalesOrderManagementApiHandlers({
      authenticationService,
      authorizationService: authorization,
      sales,
    });
    const input = { expectedVersion: 3, salesOrderId };

    for (const action of ["reserve", "confirm", "fulfill", "cancel"] as const) {
      await handlers[action].handle({ context, input });
      expect(sales.operation).toBe(action);
      expect(sales.payload).toEqual(input);
      expect(authorization.permission).toEqual({
        action: "UPDATE",
        resource: "SALES_ORDER",
      });
    }
  });

  it("returns safe authorization failures without calling sales", async () => {
    const sales = new FakeSalesManagementApplication();
    const authorization = new FakeAuthorization();
    authorization.reject = true;
    const handlers = createSalesOrderManagementApiHandlers({
      authenticationService,
      authorizationService: authorization,
      sales,
    });

    const response = await handlers.list.handle({ context, input: {} });
    expect(response).toEqual({
      error: {
        code: "AUTHORIZATION.FORBIDDEN",
        message: "You are not allowed to perform this action.",
      },
      requestId,
      success: false,
    });
    expect(sales.operation).toBeUndefined();
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

class FakeAuthorization implements ApplicationAuthorizationService {
  permission?: { action: string; resource: string };
  reject = false;
  authorize(
    _context: ApplicationExecutionContext,
    permission: { action: string; resource: string },
  ) {
    this.permission = permission;
    return this.reject
      ? Promise.reject(new AuthorizationError("Denied."))
      : Promise.resolve();
  }
}

class FakeSalesManagementApplication implements SalesOrderManagementApplication {
  context?: ApplicationExecutionContext;
  operation?: string;
  payload?: unknown;

  private result<T>(
    operation: string,
    context: ApplicationExecutionContext,
    payload: unknown,
    data: T,
  ): Promise<ApplicationServiceResult<T>> {
    this.context = context;
    this.operation = operation;
    this.payload = payload;
    return Promise.resolve({ data, ok: true });
  }

  listManagedOrders(context: ApplicationExecutionContext, payload: unknown) {
    return this.result("list", context, payload, {
      hasMore: false,
      items: [],
      nextCursor: null,
    });
  }
  getManagedOrderDetails(
    context: ApplicationExecutionContext,
    payload: unknown,
  ) {
    return this.result(
      "details",
      context,
      payload,
      {} as SalesOrderDetailsReadContract,
    );
  }
  reserveManagedOrder(context: ApplicationExecutionContext, payload: unknown) {
    return this.result(
      "reserve",
      context,
      payload,
      {} as SalesOrderServiceContract,
    );
  }
  confirmManagedOrder(context: ApplicationExecutionContext, payload: unknown) {
    return this.result(
      "confirm",
      context,
      payload,
      {} as SalesOrderServiceContract,
    );
  }
  fulfillManagedOrder(context: ApplicationExecutionContext, payload: unknown) {
    return this.result(
      "fulfill",
      context,
      payload,
      {} as SalesOrderServiceContract,
    );
  }
  cancelManagedOrder(context: ApplicationExecutionContext, payload: unknown) {
    return this.result(
      "cancel",
      context,
      payload,
      {} as SalesOrderServiceContract,
    );
  }
}
