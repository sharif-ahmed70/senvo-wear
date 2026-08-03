import { AuthorizationError, type PosCheckoutRepository } from "@senvo/domain";
import { describe, expect, it } from "vitest";
import type { ApplicationAuthenticationService } from "../context/authentication.js";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import { PosApplicationService } from "./pos-application-service.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const cartId = "10000000-0000-4000-8000-000000000003";

describe("PosApplicationService checkout", () => {
  it("requires POS update and sales create permission before checkout writes", async () => {
    const calls: Array<{ action: string; resource: string }> = [];
    const authorizationService: ApplicationAuthorizationService = {
      authorize: (_context, permission) => {
        calls.push(permission);
        if (permission.resource === "SALES") {
          throw new AuthorizationError("Sales creation denied.");
        }
        return Promise.resolve();
      },
    };
    const service = new PosApplicationService({
      authenticationService,
      authorizationService,
      barcodes: {} as never,
      branches: {} as never,
      checkouts,
      clock: { now: () => new Date("2026-08-03T10:00:00.000Z") },
      inventory: {} as never,
      memberships: {} as never,
      pos: {} as never,
      salesSources: {} as never,
      transactionManager,
      users: {} as never,
    });
    const result = await service.checkoutCart(
      { organizationId, requestId: "req_checkout_1", userId },
      { cartId, idempotencyKey: "checkout-service-001" },
    );
    expect(result).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
    expect(calls).toEqual([
      { action: "UPDATE", resource: "POS" },
      { action: "CREATE", resource: "SALES" },
    ]);
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

const checkouts: PosCheckoutRepository = {
  createCompleted: () =>
    Promise.reject(new Error("Unexpected checkout write.")),
  findById: () => Promise.resolve(null),
  list: () => Promise.resolve([]),
  prepare: () => Promise.reject(new Error("Unexpected checkout preparation.")),
};

const transactionManager: ApplicationTransactionManager = {
  execute: (context, operation) =>
    operation({
      applicationContext: context,
      auditWriter: {
        recordWithinTransaction: () => Promise.reject(new Error()),
      },
      inventoryMovementRepository: {} as never,
      posCheckoutRepository: checkouts,
      posCheckoutSalesOrderRepository: {} as never,
      salesOrderRepository: {} as never,
    }),
};
