import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type {
  PosCartLineContract,
  PosSaleLookupContract,
  SalesCounterContract,
  SalesSessionContract,
} from "@senvo/contracts";
import { describe, expect, it } from "vitest";
import {
  createPosApiHandlers,
  type ApiRequestContext,
  type PosApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const context: ApiRequestContext = {
  authenticatedUser: { userId },
  organizationId,
  permissions: [{ action: "CREATE", resource: "POS" }],
  requestId: "req_pos_api_1",
};

describe("POS API handlers", () => {
  it("uses trusted context and POS permission", async () => {
    const application = new FakePos();
    const authorization = new FakeAuthorization();
    const response = await handlers(
      application,
      authorization,
    ).createCounter.handle({
      context,
      input: {
        branchId: "20000000-0000-4000-8000-000000000001",
        code: "MAIN-01",
        name: "Main counter",
        type: "STORE",
      },
    });
    expect(response.success).toBe(true);
    expect(authorization.permission).toEqual({
      action: "CREATE",
      resource: "POS",
    });
    expect(application.context).toMatchObject({ organizationId, userId });
  });

  it("rejects organization, staff identity, role, and permissions injection", async () => {
    const application = new FakePos();
    const response = await handlers(application).openSession.handle({
      context,
      input: {
        counterId: "20000000-0000-4000-8000-000000000001",
        organizationId,
        permissions: [],
        role: "OWNER",
        userId,
      },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(application.context).toBeUndefined();
  });

  it("validates counter source and cart quantity contracts", async () => {
    const application = new FakePos();
    const counterResponse = await handlers(application).createCounter.handle({
      context,
      input: { code: "x", name: "", type: "STORE" },
    });
    const cartResponse = await handlers(application).addCartItem.handle({
      context,
      input: { cartId: "bad", productVariantId: "bad", quantity: 0 },
    });
    expect(counterResponse.success).toBe(false);
    expect(cartResponse.success).toBe(false);
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
  pos: FakePos,
  authorizationService = new FakeAuthorization(),
) {
  return createPosApiHandlers({
    authenticationService,
    authorizationService,
    pos,
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
class FakePos implements PosApplication {
  context?: ApplicationExecutionContext;
  private result<T>(context: ApplicationExecutionContext, data: T) {
    this.context = context;
    return Promise.resolve<ApplicationServiceResult<T>>({ data, ok: true });
  }
  addCartItem(context: ApplicationExecutionContext) {
    return this.result(context, {} as PosCartLineContract);
  }
  closeSession(context: ApplicationExecutionContext) {
    return this.result(context, {} as SalesSessionContract);
  }
  createCounter(context: ApplicationExecutionContext) {
    return this.result(context, {} as SalesCounterContract);
  }
  listCounters(context: ApplicationExecutionContext) {
    return this.result(context, [] as SalesCounterContract[]);
  }
  listSessions(context: ApplicationExecutionContext) {
    return this.result(context, [] as SalesSessionContract[]);
  }
  lookupSale(context: ApplicationExecutionContext) {
    return this.result(context, {} as PosSaleLookupContract);
  }
  openSession(context: ApplicationExecutionContext) {
    return this.result(context, {} as SalesSessionContract);
  }
  removeCartItem(context: ApplicationExecutionContext) {
    return this.result(context, null);
  }
  updateCartItem(context: ApplicationExecutionContext) {
    return this.result(context, {} as PosCartLineContract);
  }
  updateCounterStatus(context: ApplicationExecutionContext) {
    return this.result(context, {} as SalesCounterContract);
  }
}
