import {
  AuthenticationError,
  AuthorizationError,
  type PosCheckoutPreparation,
  type PosCheckoutRepository,
  type SalesOrder,
} from "@senvo/domain";
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
      receipts: {} as never,
      salesSources: {} as never,
      transactionManager,
      users: {} as never,
    });
    const result = await service.checkoutCart(
      { organizationId, requestId: "req_checkout_1", userId },
      {
        allowOutstanding: false,
        cartId,
        idempotencyKey: "checkout-service-001",
        payments: [{ amountMinor: 2500, method: "CASH" }],
      },
    );
    expect(result).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
    expect(calls).toEqual([
      { action: "UPDATE", resource: "POS" },
      { action: "CREATE", resource: "SALES" },
    ]);
  });

  it("requires payment create permission before checkout preparation", async () => {
    const calls: Array<{ action: string; resource: string }> = [];
    const service = serviceWith({
      authorizationService: {
        authorize: (_context, permission) => {
          calls.push(permission);
          if (permission.resource === "PAYMENT") {
            throw new AuthorizationError("Payment creation denied.");
          }
          return Promise.resolve();
        },
      },
    });
    const result = await service.checkoutCart(context(), checkoutPayload());
    expect(result).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
    expect(calls).toEqual([
      { action: "UPDATE", resource: "POS" },
      { action: "CREATE", resource: "SALES" },
      { action: "CREATE", resource: "PAYMENT" },
    ]);
  });

  it("requires an authenticated staff identity before opening a transaction", async () => {
    const service = serviceWith({
      authenticationService: {
        authenticate: () =>
          Promise.reject(new AuthenticationError("Authentication required.")),
      },
    });
    const result = await service.checkoutCart(context(), checkoutPayload());
    expect(result).toMatchObject({
      error: { code: "UNAUTHORIZED" },
      ok: false,
    });
  });

  it("fails safely when payment or receipt transaction capability is absent", async () => {
    const result = await serviceWith({}).checkoutCart(
      context(),
      checkoutPayload(),
    );
    expect(result).toMatchObject({
      error: { code: "INTERNAL_ERROR" },
      ok: false,
    });
  });

  it("requires payment approval for an outstanding checkout", async () => {
    const calls: Array<{ action: string; resource: string }> = [];
    const service = serviceWith({
      authorizationService: {
        authorize: (_context, permission) => {
          calls.push(permission);
          if (permission.action === "APPROVE") {
            throw new AuthorizationError("Outstanding payment denied.");
          }
          return Promise.resolve();
        },
      },
      transactionManager: transactionWith(preparation()),
    });
    const result = await service.checkoutCart(context(), {
      ...checkoutPayload(),
      allowOutstanding: true,
      payments: [],
    });
    expect(result).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
    expect(calls.at(-1)).toEqual({ action: "APPROVE", resource: "PAYMENT" });
  });

  it("does not duplicate audit entries for a same-payload replay", async () => {
    const audits: unknown[] = [];
    const existing = completedCheckout();
    const manager = transactionWith(
      { ...preparation(), checkout: existing },
      audits,
    );
    const service = serviceWith({ transactionManager: manager });
    const result = await service.checkoutCart(context(), checkoutPayload());
    expect(result).toMatchObject({
      data: { id: existing.id, paymentStatus: "PAID" },
      ok: true,
    });
    expect(audits).toEqual([]);
  });

  it("writes checkout, payment, and receipt audits without tender references", async () => {
    const audits: Array<Record<string, unknown>> = [];
    const service = serviceWith({
      transactionManager: successfulTransaction(audits),
    });
    const result = await service.checkoutCart(context(), {
      ...checkoutPayload(),
      payments: [
        { amountMinor: 5000, method: "CARD", reference: "CARD-SECRET-REF" },
      ],
    });
    expect(result).toMatchObject({
      data: { paidMinor: 5000, paymentStatus: "PAID" },
      ok: true,
    });
    expect(audits.map((entry) => entry.action)).toEqual([
      "POS_CHECKOUT_COMPLETED",
      "POS_PAYMENT_RECORDED",
      "SALES_RECEIPT_ISSUED",
    ]);
    expect(JSON.stringify(audits)).not.toContain("CARD-SECRET-REF");
  });
});

function serviceWith(overrides: {
  authenticationService?: ApplicationAuthenticationService;
  authorizationService?: ApplicationAuthorizationService;
  transactionManager?: ApplicationTransactionManager;
}) {
  return new PosApplicationService({
    authenticationService:
      overrides.authenticationService ?? authenticationService,
    authorizationService: overrides.authorizationService ?? {
      authorize: () => Promise.resolve(),
    },
    barcodes: {} as never,
    branches: {} as never,
    checkouts,
    clock: { now: () => new Date("2026-08-03T10:00:00.000Z") },
    inventory: {} as never,
    memberships: {} as never,
    pos: {} as never,
    receipts: {} as never,
    salesSources: {} as never,
    transactionManager: overrides.transactionManager ?? transactionManager,
    users: {} as never,
  });
}

function context() {
  return { organizationId, requestId: "req_checkout_test", userId };
}

function checkoutPayload() {
  return {
    allowOutstanding: false,
    cartId,
    idempotencyKey: "checkout-service-001",
    payments: [{ amountMinor: 5000, method: "CASH" as const }],
  };
}

function preparation(): PosCheckoutPreparation {
  return {
    allocationPolicyId: "10000000-0000-4000-8000-000000000004",
    boothId: null,
    branchId: "10000000-0000-4000-8000-000000000005",
    cartId,
    checkout: null,
    counterCode: "MAIN",
    counterId: "10000000-0000-4000-8000-000000000006",
    counterName: "Main counter",
    counterStatus: "ACTIVE",
    counterType: "STORE",
    lines: [
      {
        hasActiveBarcode: true,
        productVariantId: "10000000-0000-4000-8000-000000000007",
        quantity: 2,
        sellingPriceMinor: 2500,
        variantStatus: "ACTIVE",
      },
    ],
    membershipStatus: "ACTIVE",
    organizationAddressLine1: null,
    organizationAddressLine2: null,
    organizationCity: null,
    organizationDistrict: null,
    organizationEmail: null,
    organizationId,
    organizationName: "SENVO Wear",
    organizationPhone: null,
    organizationPostalCode: null,
    salesSessionId: "10000000-0000-4000-8000-000000000008",
    sessionStatus: "OPEN",
    sourceName: "Main store",
    staffId: userId,
    staffName: "Staff member",
    staffStatus: "ACTIVE",
  };
}

function completedCheckout() {
  const timestamp = new Date("2026-08-03T10:00:00.000Z");
  return {
    cartId,
    completedAt: timestamp,
    counterId: "10000000-0000-4000-8000-000000000006",
    counterName: "Main counter",
    createdAt: timestamp,
    id: "10000000-0000-4000-8000-000000000009",
    idempotencyKey: "checkout-service-001",
    orderNumber: "POS-10000000000040008000",
    organizationId,
    outstandingMinor: 0,
    paidMinor: 5000,
    paymentBatchId: "10000000-0000-4000-8000-000000000010",
    paymentRequestSignature:
      '{"allowOutstanding":false,"payments":[{"amountMinor":5000,"method":"CASH","reference":null}]}',
    paymentStatus: "PAID",
    receiptId: "10000000-0000-4000-8000-000000000011",
    receiptNumber: "RCP-10000000000040008000",
    salesOrderId: "10000000-0000-4000-8000-000000000012",
    salesSessionId: "10000000-0000-4000-8000-000000000008",
    staffName: "Staff member",
    status: "COMPLETED",
    subtotalMinor: 5000,
    totalMinor: 5000,
    updatedAt: timestamp,
  } as const;
}

function transactionWith(
  value: PosCheckoutPreparation,
  audits: unknown[] = [],
): ApplicationTransactionManager {
  const repository = {
    ...checkouts,
    prepare: (_cartId: string, scopedOrganizationId: string) => {
      expect(scopedOrganizationId).toBe(organizationId);
      return Promise.resolve(value);
    },
  };
  return {
    execute: (trusted, operation) =>
      operation({
        applicationContext: trusted,
        auditWriter: {
          recordWithinTransaction: (record) => {
            audits.push(record);
            return Promise.resolve({} as never);
          },
        },
        inventoryMovementRepository: {} as never,
        paymentRepository: {} as never,
        posCheckoutRepository: repository,
        posCheckoutSalesOrderRepository: {} as never,
        receiptRepository: {} as never,
        salesOrderRepository: {} as never,
      }),
  };
}

function successfulTransaction(
  audits: Array<Record<string, unknown>>,
): ApplicationTransactionManager {
  const timestamp = new Date("2026-08-03T10:00:00.000Z");
  const orderId = "10000000-0000-4000-8000-000000000012";
  const order = (
    status: SalesOrder["status"],
    version: number,
  ): SalesOrder => ({
    allocationPolicyId: "10000000-0000-4000-8000-000000000004",
    boothId: null,
    cancelledAt: null,
    channel: "OFFLINE_STORE",
    confirmedAt: status === "DRAFT" || status === "RESERVED" ? null : timestamp,
    createdAt: timestamp,
    currencyCode: "BDT",
    customerEmail: null,
    customerName: null,
    customerPhone: null,
    deliveryAddressLine1: null,
    deliveryAddressLine2: null,
    deliveryCity: null,
    deliveryDistrict: null,
    deliveryMinor: 0,
    deliveryPostalCode: null,
    discountMinor: 0,
    fulfilledAt: status === "FULFILLED" ? timestamp : null,
    fulfillmentMovementId:
      status === "FULFILLED" ? "10000000-0000-4000-8000-000000000013" : null,
    id: orderId,
    idempotencyKey: "pos:session:checkout-service-001",
    inventoryReservationId:
      status === "DRAFT" ? null : "10000000-0000-4000-8000-000000000014",
    lines: [
      {
        colorSnapshot: "Black",
        createdAt: timestamp,
        discountMinor: 0,
        id: "10000000-0000-4000-8000-000000000015",
        lineNumber: 1,
        lineTotalMinor: 5000,
        organizationId,
        productNameSnapshot: "Oxford Shirt",
        productVariantId: "10000000-0000-4000-8000-000000000007",
        quantity: 2,
        salesOrderId: orderId,
        sizeSnapshot: "L",
        skuSnapshot: "OX-BLK-L",
        unitPriceMinor: 2500,
      },
    ],
    note: null,
    orderNumber: "POS-10000000000040008000",
    organizationId,
    payloadSignature: "signature",
    reservedAt: status === "DRAFT" ? null : timestamp,
    status,
    subtotalMinor: 5000,
    totalMinor: 5000,
    updatedAt: timestamp,
    version,
  });
  return {
    execute: (trusted, operation) =>
      operation({
        applicationContext: trusted,
        auditWriter: {
          recordWithinTransaction: (record) => {
            audits.push(record);
            return Promise.resolve({} as never);
          },
        },
        inventoryMovementRepository: {} as never,
        paymentRepository: {
          create: (record) =>
            Promise.resolve({
              ...record,
              lines: record.lines.map((line, index) => ({
                ...line,
                createdAt: timestamp,
                id: "10000000-0000-4000-8000-000000000016",
                lineNumber: index + 1,
                organizationId,
                paymentBatchId: record.id,
              })),
            }),
        },
        posCheckoutRepository: {
          ...checkouts,
          createCompleted: (record) =>
            Promise.resolve({
              ...record,
              counterName: "Main counter",
              createdAt: timestamp,
              orderNumber: "POS-10000000000040008000",
              outstandingMinor: null,
              paidMinor: null,
              paymentBatchId: null,
              paymentRequestSignature: null,
              paymentStatus: "UNRECORDED",
              receiptId: null,
              receiptNumber: null,
              staffName: "Staff member",
              status: "COMPLETED",
              updatedAt: timestamp,
            }),
          prepare: () => Promise.resolve(preparation()),
        },
        posCheckoutSalesOrderRepository: {
          confirm: () => Promise.resolve(order("CONFIRMED", 3)),
          createDraft: () => Promise.resolve(order("DRAFT", 1)),
          findByIdempotencyKey: () => Promise.resolve(null),
          fulfill: () => Promise.resolve(order("FULFILLED", 4)),
          reserve: () => Promise.resolve(order("RESERVED", 2)),
        },
        receiptRepository: {
          create: (record: never) => Promise.resolve(record),
          findByCheckoutId: () => Promise.resolve(null),
        },
        salesOrderRepository: {} as never,
      }),
  };
}

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
