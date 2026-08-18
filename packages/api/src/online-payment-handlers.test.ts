import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
} from "@senvo/application";
import { AuthorizationError } from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import {
  createOnlinePaymentApiHandlers,
  type ApiRequestContext,
  type OnlinePaymentApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const salesOrderId = "10000000-0000-4000-8000-000000000003";
const attemptId = "10000000-0000-4000-8000-000000000004";
const context: ApiRequestContext = {
  authenticatedUser: { userId },
  organizationId,
  permissions: [{ action: "APPROVE", resource: "PAYMENT" }],
  requestId: "request-payment-api",
};

describe("online payment API handlers", () => {
  it("uses trusted organization context and PAYMENT:READ for payment history", async () => {
    const application = fakeApplication();
    const authorization = new RecordingAuthorization();
    const response = await handlers(
      application,
      authorization,
    ).getOrderPayment.handle({
      context,
      input: { salesOrderId },
    });
    expect(response.success, JSON.stringify(response)).toBe(true);
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "PAYMENT",
    });
    expect(application.getAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, userId }),
      { salesOrderId },
    );
  });

  it("rejects tenant, identity, role, and permission injection on provider refunds", async () => {
    const application = fakeApplication();
    const response = await handlers(application).refund.handle({
      context,
      input: {
        amountMinor: 1000,
        idempotencyKey: "admin-refund:test-1",
        organizationId,
        paymentAttemptId: attemptId,
        permissions: [],
        reason: "Cancelled order",
        role: "OWNER",
        userId,
      },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(application.refund).not.toHaveBeenCalled();
  });

  it("maps forbidden reconciliation without calling the application service", async () => {
    const application = fakeApplication();
    const authorization: ApplicationAuthorizationService = {
      authorize: () => Promise.reject(new AuthorizationError()),
    };
    const response = await handlers(
      application,
      authorization,
    ).reconcile.handle({
      context,
      input: { paymentAttemptId: attemptId },
    });
    expect(response, JSON.stringify(response)).toMatchObject({
      error: { code: "AUTHORIZATION.FORBIDDEN" },
      success: false,
    });
    expect(application.reconcile).not.toHaveBeenCalled();
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
  application: ReturnType<typeof fakeApplication>,
  authorizationService: ApplicationAuthorizationService = new RecordingAuthorization(),
) {
  return createOnlinePaymentApiHandlers({
    application,
    authenticationService,
    authorizationService,
  });
}

function fakeApplication() {
  const success = () => Promise.resolve({ data: {}, ok: true as const });
  return {
    getAdmin: vi.fn(success),
    reconcile: vi.fn(success),
    refreshRefund: vi.fn(success),
    refund: vi.fn(success),
  } as unknown as OnlinePaymentApplication & {
    getAdmin: ReturnType<typeof vi.fn>;
    reconcile: ReturnType<typeof vi.fn>;
    refreshRefund: ReturnType<typeof vi.fn>;
    refund: ReturnType<typeof vi.fn>;
  };
}

class RecordingAuthorization implements ApplicationAuthorizationService {
  permission?: { action: string; resource: string };
  authorize(
    _context: ApplicationExecutionContext,
    permission: { action: string; resource: string },
  ) {
    this.permission = permission;
    return Promise.resolve();
  }
}
