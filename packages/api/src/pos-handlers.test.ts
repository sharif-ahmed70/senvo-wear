import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type {
  PosCartLineContract,
  PosCartDetailsContract,
  PosCheckoutContract,
  PosSaleLookupContract,
  SalesReceiptContract,
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
  it("validates and authorizes organization-scoped cart reads", async () => {
    const application = new FakePos();
    const authorization = new FakeAuthorization();
    const response = await handlers(application, authorization).getCart.handle({
      context,
      input: { cartId: "10000000-0000-4000-8000-000000000010" },
    });
    expect(response.success).toBe(true);
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "POS",
    });
    expect(application.context?.organizationId).toBe(organizationId);

    const invalid = await handlers(application).getCart.handle({
      context,
      input: { cartId: "not-an-id", organizationId },
    });
    expect(invalid).toMatchObject({ success: false });
  });
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

  it("reads only current cashier sessions through trusted context", async () => {
    const application = new FakePos();
    const authorization = new FakeAuthorization();
    const response = await handlers(
      application,
      authorization,
    ).listCurrentSessions.handle({ context, input: {} });
    expect(response.success).toBe(true);
    expect(authorization.permission).toEqual({
      action: "READ",
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

  it("accepts only operator-controlled payment instructions at checkout", async () => {
    const application = new FakePos();
    const response = await handlers(application).checkoutCart.handle({
      context,
      input: {
        cartId: "20000000-0000-4000-8000-000000000001",
        allowOutstanding: false,
        idempotencyKey: "checkout-attempt-001",
        payments: [{ amountMinor: 1, method: "CASH" }],
        organizationId,
        staffId: userId,
        totalMinor: 1,
      },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(application.context).toBeUndefined();
  });

  it("requires receipt read permission before receipt application access", async () => {
    const application = new FakePos();
    const authorization = new FakeAuthorization();
    const response = await handlers(
      application,
      authorization,
    ).getReceipt.handle({
      context,
      input: { checkoutId: "20000000-0000-4000-8000-000000000001" },
    });
    expect(response.success).toBe(true);
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "RECEIPT",
    });
    expect(application.context).toMatchObject({ organizationId, userId });
  });

  it("uses PAYMENT CREATE and rejects trusted field injection for collections", async () => {
    const application = new FakePos();
    const authorization = new FakeAuthorization();
    const valid = await handlers(
      application,
      authorization,
    ).collectPayment.handle({
      context,
      input: {
        checkoutId: "20000000-0000-4000-8000-000000000001",
        idempotencyKey: "payment-collection-001",
        payments: [{ amountMinor: 500, method: "CASH" }],
      },
    });
    expect(valid.success).toBe(true);
    expect(authorization.permission).toEqual({
      action: "CREATE",
      resource: "PAYMENT",
    });
    const injected = await handlers(application).collectPayment.handle({
      context,
      input: {
        checkoutId: "20000000-0000-4000-8000-000000000001",
        idempotencyKey: "payment-collection-002",
        organizationId,
        acceptedByUserId: userId,
        outstandingMinor: 500,
        payments: [{ amountMinor: 500, method: "CASH" }],
      },
    });
    expect(injected).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
  });

  it("validates return input and rejects organization or staff injection", async () => {
    const application = new FakePos();
    const authorization = new FakeAuthorization();
    const valid = await handlers(
      application,
      authorization,
    ).createReturn.handle({
      context,
      input: {
        checkoutId: "20000000-0000-4000-8000-000000000001",
        destinationLocationId: "20000000-0000-4000-8000-000000000002",
        idempotencyKey: "return-attempt-001",
        lines: [
          {
            quantity: 1,
            salesOrderLineId: "20000000-0000-4000-8000-000000000003",
          },
        ],
        reasonCode: "SIZE_OR_FIT",
      },
    });
    expect(valid.success).toBe(true);
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "POS",
    });
    expect(application.context).toMatchObject({ organizationId, userId });
    const injected = await handlers(application).createReturn.handle({
      context,
      input: {
        acceptedByUserId: userId,
        checkoutId: "20000000-0000-4000-8000-000000000001",
        destinationLocationId: "20000000-0000-4000-8000-000000000002",
        idempotencyKey: "return-attempt-002",
        lines: [
          {
            quantity: 1,
            salesOrderLineId: "20000000-0000-4000-8000-000000000003",
          },
        ],
        organizationId,
        reasonCode: "DEFECTIVE",
      },
    });
    expect(injected).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
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
  collectPayment(context: ApplicationExecutionContext) {
    return this.result(context, {} as never);
  }
  createReturn(context: ApplicationExecutionContext) {
    return this.result(context, {} as never);
  }
  closeSession(context: ApplicationExecutionContext) {
    return this.result(context, {} as SalesSessionContract);
  }
  checkoutCart(context: ApplicationExecutionContext) {
    return this.result(context, {} as PosCheckoutContract);
  }
  createCounter(context: ApplicationExecutionContext) {
    return this.result(context, {} as SalesCounterContract);
  }
  listCounters(context: ApplicationExecutionContext) {
    return this.result(context, [] as SalesCounterContract[]);
  }
  getCheckout(context: ApplicationExecutionContext) {
    return this.result(context, {} as PosCheckoutContract);
  }
  getCart(context: ApplicationExecutionContext) {
    return this.result(context, {} as PosCartDetailsContract);
  }
  getReceipt(context: ApplicationExecutionContext) {
    return this.result(context, {} as SalesReceiptContract);
  }
  getPaymentAccount(context: ApplicationExecutionContext) {
    return this.result(context, {} as never);
  }
  getPaymentCollectionReceipt(context: ApplicationExecutionContext) {
    return this.result(context, {} as never);
  }
  getReturns(context: ApplicationExecutionContext) {
    return this.result(context, {} as never);
  }
  getReturnReceipt(context: ApplicationExecutionContext) {
    return this.result(context, {} as never);
  }
  listCheckouts(context: ApplicationExecutionContext) {
    return this.result(context, [] as PosCheckoutContract[]);
  }
  listSessions(context: ApplicationExecutionContext) {
    return this.result(context, [] as SalesSessionContract[]);
  }
  listCurrentSessions(context: ApplicationExecutionContext) {
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
