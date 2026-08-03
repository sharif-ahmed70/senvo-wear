import { describe, expect, it } from "vitest";
import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceErrorCode,
  ApplicationServiceResult,
} from "@senvo/application";
import type {
  InventoryMovementContract,
  SalesOrderServiceContract,
} from "@senvo/contracts";
import { AuthenticationError, AuthorizationError } from "@senvo/domain";
import {
  createPostInventoryMovementApiHandler,
  createSalesOrderApiHandler,
  type ApiRequestContext,
  type InventoryMovementPostingApplication,
  type SalesOrderCreationApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const productVariantId = "10000000-0000-4000-8000-000000000003";
const salesOrderId = "10000000-0000-4000-8000-000000000004";
const movementId = "10000000-0000-4000-8000-000000000005";
const requestId = "req_api_gateway_1";

const requestContext: ApiRequestContext = {
  authenticatedUser: { userId },
  organizationId,
  permissions: [
    { action: "CREATE", resource: "SALES_ORDER" },
    { action: "UPDATE", resource: "INVENTORY" },
  ],
  requestId,
};

describe("API application gateway", () => {
  it("validates, authenticates, authorizes, and creates a sales order in order", async () => {
    const events: string[] = [];
    const authentication = new FakeAuthenticationService(events);
    const authorization = new FakeAuthorizationService(events);
    const sales = new FakeSalesApplication(events);
    const handler = createSalesOrderApiHandler({
      authenticationService: authentication,
      authorizationService: authorization,
      sales,
    });

    const response = await handler.handle({
      context: requestContext,
      input: createSalesOrderInput(),
    });

    expect(response).toEqual({
      data: { id: salesOrderId },
      requestId,
      success: true,
    });
    expect(events).toEqual(["authenticate", "authorize", "application"]);
    expect(authentication.calls).toEqual([{ requestId, userId }]);
    expect(authorization.calls).toEqual([
      {
        organizationId,
        permission: { action: "CREATE", resource: "SALES" },
        userId,
      },
    ]);
    expect(sales.calls[0]?.context).toMatchObject({
      actorId: userId,
      authenticationState: "AUTHENTICATED",
      organizationId,
      permissions: requestContext.permissions,
      requestId,
      userId,
    });
    expect(sales.calls[0]?.input).toEqual(createSalesOrderInput());
  });

  it("rejects unknown fields before authentication", async () => {
    const events: string[] = [];
    const handler = createSalesOrderApiHandler({
      authenticationService: new FakeAuthenticationService(events),
      authorizationService: new FakeAuthorizationService(events),
      sales: new FakeSalesApplication(events),
    });

    const response = await handler.handle({
      context: requestContext,
      input: { ...createSalesOrderInput(), organizationId },
    });

    expect(response).toMatchObject({
      error: {
        code: "VALIDATION.INVALID_INPUT",
        message: "Input is invalid.",
      },
      requestId,
      success: false,
    });
    expect(events).toEqual([]);
  });

  it("returns a safe authentication error and does not authorize", async () => {
    const events: string[] = [];
    const authentication = new FakeAuthenticationService(events);
    authentication.error = new AuthenticationError("Missing identity.");
    const handler = createSalesOrderApiHandler({
      authenticationService: authentication,
      authorizationService: new FakeAuthorizationService(events),
      sales: new FakeSalesApplication(events),
    });

    const response = await handler.handle({
      context: { ...requestContext, authenticatedUser: null },
      input: createSalesOrderInput(),
    });

    expect(response).toEqual({
      error: {
        code: "AUTHENTICATION.REQUIRED",
        message: "Authentication is required.",
      },
      requestId,
      success: false,
    });
    expect(events).toEqual(["authenticate"]);
  });

  it("returns a safe forbidden error and does not call the application", async () => {
    const events: string[] = [];
    const authorization = new FakeAuthorizationService(events);
    authorization.error = new AuthorizationError("Permission denied.");
    const handler = createSalesOrderApiHandler({
      authenticationService: new FakeAuthenticationService(events),
      authorizationService: authorization,
      sales: new FakeSalesApplication(events),
    });

    const response = await handler.handle({
      context: requestContext,
      input: createSalesOrderInput(),
    });

    expect(response).toEqual({
      error: {
        code: "AUTHORIZATION.FORBIDDEN",
        message: "You are not allowed to perform this action.",
      },
      requestId,
      success: false,
    });
    expect(events).toEqual(["authenticate", "authorize"]);
  });

  it.each([
    ["VALIDATION_ERROR", "VALIDATION.INVALID_INPUT"],
    ["UNAUTHORIZED", "AUTHENTICATION.REQUIRED"],
    ["FORBIDDEN", "AUTHORIZATION.FORBIDDEN"],
    ["NOT_FOUND", "NOT_FOUND.RESOURCE"],
    ["CONFLICT", "CONFLICT.STATE"],
    ["CONCURRENCY_CONFLICT", "CONCURRENCY.VERSION_MISMATCH"],
    ["INTERNAL_ERROR", "INTERNAL.UNEXPECTED"],
  ] as const)("maps %s application failures to %s", async (code, apiCode) => {
    const events: string[] = [];
    const sales = new FakeSalesApplication(events);
    sales.result = applicationFailure(code);
    const handler = createSalesOrderApiHandler({
      authenticationService: new FakeAuthenticationService(events),
      authorizationService: new FakeAuthorizationService(events),
      sales,
    });

    const response = await handler.handle({
      context: requestContext,
      input: createSalesOrderInput(),
    });

    expect(response).toMatchObject({
      error: { code: apiCode },
      requestId,
      success: false,
    });
    expect(JSON.stringify(response)).not.toContain("stack");
  });

  it("hides unexpected application exceptions", async () => {
    const events: string[] = [];
    const sales = new FakeSalesApplication(events);
    sales.error = new Error("database password leaked in internal exception");
    const handler = createSalesOrderApiHandler({
      authenticationService: new FakeAuthenticationService(events),
      authorizationService: new FakeAuthorizationService(events),
      sales,
    });

    const response = await handler.handle({
      context: requestContext,
      input: createSalesOrderInput(),
    });

    expect(response).toEqual({
      error: {
        code: "INTERNAL.UNEXPECTED",
        message: "An unexpected error occurred.",
      },
      requestId,
      success: false,
    });
    expect(JSON.stringify(response)).not.toContain("password");
    expect(JSON.stringify(response)).not.toContain("stack");
  });

  it("posts an inventory movement and propagates request context", async () => {
    const events: string[] = [];
    const inventory = new FakeInventoryApplication(events);
    const authorization = new FakeAuthorizationService(events);
    const handler = createPostInventoryMovementApiHandler({
      authenticationService: new FakeAuthenticationService(events),
      authorizationService: authorization,
      inventory,
    });

    const response = await handler.handle({
      context: requestContext,
      input: { movementId },
    });

    expect(response).toEqual({
      data: { id: movementId },
      requestId,
      success: true,
    });
    expect(authorization.calls[0]?.permission).toEqual({
      action: "UPDATE",
      resource: "INVENTORY",
    });
    expect(inventory.calls[0]).toMatchObject({
      context: { organizationId, requestId, userId },
      input: { movementId },
    });
  });
});

class FakeAuthenticationService implements ApplicationAuthenticationService {
  readonly calls: Array<{ requestId: string; userId: string | null }> = [];
  error: Error | null = null;

  constructor(private readonly events: string[]) {}

  authenticate(request: { requestId: string; userId: string | null }) {
    this.events.push("authenticate");
    this.calls.push(request);
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve({
      authenticatedUserId: request.userId ?? userId,
      provider: "PASSWORD" as const,
      requestId: request.requestId,
    });
  }
}

class FakeAuthorizationService implements ApplicationAuthorizationService {
  readonly calls: Array<{
    organizationId: string;
    permission: Parameters<ApplicationAuthorizationService["authorize"]>[1];
    userId: string | null;
  }> = [];
  error: Error | null = null;

  constructor(private readonly events: string[]) {}

  authorize(
    context: Parameters<ApplicationAuthorizationService["authorize"]>[0],
    permission: Parameters<ApplicationAuthorizationService["authorize"]>[1],
  ) {
    this.events.push("authorize");
    this.calls.push({
      organizationId: context.organizationId,
      permission,
      userId: context.userId,
    });
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve();
  }
}

class FakeSalesApplication implements SalesOrderCreationApplication {
  readonly calls: Array<{
    context: ApplicationExecutionContext;
    input: unknown;
  }> = [];
  error: Error | null = null;
  result: ApplicationServiceResult<SalesOrderServiceContract> = {
    data: { id: salesOrderId } as SalesOrderServiceContract,
    ok: true,
  };

  constructor(private readonly events: string[]) {}

  createOrder(context: ApplicationExecutionContext, input: unknown) {
    this.events.push("application");
    this.calls.push({ context, input });
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve(this.result);
  }
}

class FakeInventoryApplication implements InventoryMovementPostingApplication {
  readonly calls: Array<{
    context: ApplicationExecutionContext;
    input: unknown;
  }> = [];

  constructor(private readonly events: string[]) {}

  postMovement(context: ApplicationExecutionContext, input: unknown) {
    this.events.push("application");
    this.calls.push({ context, input });
    return Promise.resolve({
      data: { id: movementId } as InventoryMovementContract,
      ok: true as const,
    });
  }
}

function createSalesOrderInput() {
  return {
    channel: "ONLINE" as const,
    currencyCode: "BDT",
    idempotencyKey: "sales-order-api-1",
    lines: [{ productVariantId, quantity: 1, unitPriceMinor: 1_000 }],
    orderNumber: "SO-API-1",
  };
}

function applicationFailure(
  code: ApplicationServiceErrorCode,
): ApplicationServiceResult<SalesOrderServiceContract> {
  return {
    error: {
      code,
      message:
        code === "INTERNAL_ERROR"
          ? "An unexpected error occurred."
          : "The request could not be completed.",
      requestId,
      retryable: code === "CONCURRENCY_CONFLICT",
    },
    ok: false,
  };
}
