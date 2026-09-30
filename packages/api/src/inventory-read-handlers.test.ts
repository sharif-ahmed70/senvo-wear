import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type {
  InventoryAvailabilityReadContract,
  InventoryMovementHistoryContract,
  InventoryReadPageContract,
  StockLocationReadContract,
  VariantInventoryAvailabilityContract,
} from "@senvo/contracts";
import { AuthorizationError } from "@senvo/domain";
import { describe, expect, it } from "vitest";
import {
  createInventoryReadApiHandlers,
  type ApiRequestContext,
  type InventoryReadApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const variantId = "10000000-0000-4000-8000-000000000003";
const requestId = "req_inventory_read_1";
const context: ApiRequestContext = {
  authenticatedUser: { userId },
  organizationId,
  permissions: [{ action: "READ", resource: "INVENTORY" }],
  requestId,
};

describe("inventory read API handlers", () => {
  it("protects product summaries and validates query thresholds and tenant scope", async () => {
    const inventory = new FakeInventoryReadApplication();
    const authorizationService = new FakeAuthorization();
    const handlers = createInventoryReadApiHandlers({
      authenticationService,
      authorizationService,
      inventory,
    });
    const response = await handlers.listProductSummaries.handle({
      context,
      input: { pageSize: "2", lowStockThreshold: "0" },
    });
    expect(response.success).toBe(true);
    expect(inventory.payload).toEqual({ pageSize: 2, lowStockThreshold: 0 });
    expect(inventory.context).toMatchObject({ organizationId });
    expect(authorizationService.permission).toEqual({
      action: "READ",
      resource: "INVENTORY",
    });
    for (const input of [
      { organizationId },
      { lowStockThreshold: -1 },
      { lowStockThreshold: "abc" },
      { lowStockThreshold: 1.5 },
    ]) {
      expect(
        await handlers.listProductSummaries.handle({ context, input }),
      ).toMatchObject({
        success: false,
        error: { code: "VALIDATION.INVALID_INPUT" },
      });
    }
    authorizationService.reject = true;
    expect(
      await handlers.listProductSummaries.handle({ context, input: {} }),
    ).toMatchObject({
      success: false,
      error: { code: "AUTHORIZATION.FORBIDDEN" },
    });
  });
  it("enforces INVENTORY.READ and passes trusted organization context", async () => {
    const authorization = new FakeAuthorization();
    const inventory = new FakeInventoryReadApplication();
    const handlers = createInventoryReadApiHandlers({
      authenticationService,
      authorizationService: authorization,
      inventory,
    });

    const response = await handlers.listAvailability.handle({
      context,
      input: { pageSize: 10, search: "SKU" },
    });

    expect(response).toMatchObject({
      data: { hasMore: false, items: [], nextCursor: null },
      requestId,
      success: true,
    });
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "INVENTORY",
    });
    expect(inventory.context).toMatchObject({ organizationId, userId });
    expect(inventory.payload).toEqual({ pageSize: 10, search: "SKU" });
  });

  it("rejects organizationId injection before the application query", async () => {
    const inventory = new FakeInventoryReadApplication();
    const handlers = createInventoryReadApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      inventory,
    });

    const response = await handlers.listLocations.handle({
      context,
      input: { organizationId },
    });

    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(inventory.context).toBeUndefined();
  });

  it("returns safe authorization failures", async () => {
    const authorization = new FakeAuthorization();
    authorization.reject = true;
    const handlers = createInventoryReadApiHandlers({
      authenticationService,
      authorizationService: authorization,
      inventory: new FakeInventoryReadApplication(),
    });

    const response = await handlers.listMovements.handle({
      context,
      input: {},
    });

    expect(response).toEqual({
      error: {
        code: "AUTHORIZATION.FORBIDDEN",
        message: "You are not allowed to perform this action.",
      },
      requestId,
      success: false,
    });
  });

  it("passes cursor pagination and variant identifiers unchanged", async () => {
    const inventory = new FakeInventoryReadApplication();
    const handlers = createInventoryReadApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      inventory,
    });

    await handlers.listMovements.handle({
      context,
      input: { cursor: "inventory-cursor", pageSize: 5, status: "POSTED" },
    });
    expect(inventory.payload).toEqual({
      cursor: "inventory-cursor",
      pageSize: 5,
      status: "POSTED",
    });

    await handlers.getVariantAvailability.handle({
      context,
      input: { variantId },
    });
    expect(inventory.payload).toEqual({ variantId });
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

class FakeInventoryReadApplication implements InventoryReadApplication {
  listProductInventorySummaries(
    context: ApplicationExecutionContext,
    payload: unknown,
  ) {
    this.payload = payload;
    return this.success(context, {
      hasMore: false,
      items: [],
      nextCursor: null,
    });
  }

  context?: ApplicationExecutionContext;
  payload?: unknown;

  private success<T>(context: ApplicationExecutionContext, data: T) {
    this.context = context;
    return Promise.resolve<ApplicationServiceResult<T>>({ data, ok: true });
  }

  getVariantAvailability(
    context: ApplicationExecutionContext,
    payload: unknown,
  ) {
    this.payload = payload;
    return this.success(context, {} as VariantInventoryAvailabilityContract);
  }

  listInventoryAvailability(
    context: ApplicationExecutionContext,
    payload: unknown,
  ) {
    this.payload = payload;
    return this.success(
      context,
      emptyPage<InventoryAvailabilityReadContract>(),
    );
  }

  listInventoryMovements(
    context: ApplicationExecutionContext,
    payload: unknown,
  ) {
    this.payload = payload;
    return this.success(context, emptyPage<InventoryMovementHistoryContract>());
  }

  listStockLocations(context: ApplicationExecutionContext, payload: unknown) {
    this.payload = payload;
    return this.success(context, emptyPage<StockLocationReadContract>());
  }
}

function emptyPage<T>(): InventoryReadPageContract<T> {
  return { hasMore: false, items: [], nextCursor: null };
}
