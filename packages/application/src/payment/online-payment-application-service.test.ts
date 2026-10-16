/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  BusinessRuleError,
  ConcurrencyError,
  NotFoundError,
  SalesOrderReservationExpiredError,
  type OnlinePaymentAttempt,
  type OnlinePaymentOrderFacts,
  type OnlinePaymentProviderAdapter,
  type OnlinePaymentRepository,
  type ProviderRefund,
} from "@senvo/domain";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import { OnlinePaymentApplicationService } from "./online-payment-application-service.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const salesOrderId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-08-18T10:00:00.000Z");

describe("OnlinePaymentApplicationService", () => {
  it("replays same-key initiation and conflicts when server-owned order facts change", async () => {
    const fixture = createFixture();
    const first = await fixture.service.initiateForCheckout({
      idempotencyKey: "checkout:payment-1",
      organizationId,
      requestId: "request-1",
      salesOrderId,
    });
    const replay = await fixture.service.initiateForCheckout({
      idempotencyKey: "checkout:payment-1",
      organizationId,
      requestId: "request-2",
      salesOrderId,
    });
    expect(replay.id).toBe(first.id);
    expect(fixture.provider.createSession).toHaveBeenCalledTimes(1);

    fixture.facts.totalMinor += 100;
    await expect(
      fixture.service.initiateForCheckout({
        idempotencyKey: "checkout:payment-1",
        organizationId,
        requestId: "request-3",
        salesOrderId,
      }),
    ).rejects.toThrow("idempotency key was reused with different details");
  });

  it("rejects a forged callback without validating or settling payment", async () => {
    const fixture = createFixture();
    await fixture.service.initiateForCheckout({
      idempotencyKey: "checkout:payment-2",
      organizationId,
      requestId: "request-1",
      salesOrderId,
    });
    vi.mocked(fixture.provider.validateNotificationSignature).mockReturnValue(
      false,
    );
    const result = await fixture.service.notification("request-ipn", {
      status: "VALID",
      tran_id: fixture.attempts[0]?.providerTransactionId,
      val_id: "validation-1",
      verify_key: "status,tran_id,val_id",
      verify_sign: "00000000000000000000000000000000",
    });
    expect(result).toEqual({
      data: { accepted: false, replayed: false },
      ok: true,
    });
    expect(fixture.provider.validateTransaction).not.toHaveBeenCalled();
    expect(fixture.repository.settleConfirmedPayment).not.toHaveBeenCalled();
  });

  it("confirms once, records the existing settlement fact, and safely replays duplicate IPN", async () => {
    const fixture = createFixture();
    const attempt = await fixture.service.initiateForCheckout({
      idempotencyKey: "checkout:payment-3",
      organizationId,
      requestId: "request-1",
      salesOrderId,
    });
    const payload = validNotification(attempt);
    const first = await fixture.service.notification("request-ipn-1", payload);
    const duplicate = await fixture.service.notification(
      "request-ipn-2",
      payload,
    );
    expect(first).toEqual({
      data: { accepted: true, replayed: false },
      ok: true,
    });
    expect(duplicate).toEqual({
      data: { accepted: true, replayed: true },
      ok: true,
    });
    expect(fixture.repository.settleConfirmedPayment).toHaveBeenCalledTimes(1);
    expect(fixture.confirmOrder).toHaveBeenCalledTimes(1);
    expect(fixture.recordAudit).toHaveBeenCalledTimes(1);
  });

  it("preserves late provider success as paid but refund-required without confirming inventory", async () => {
    const fixture = createFixture({ reservationStatus: "EXPIRED" });
    const attempt = await fixture.service.initiateForCheckout({
      idempotencyKey: "checkout:payment-4",
      organizationId,
      requestId: "request-1",
      salesOrderId,
    });
    const result = await fixture.service.notification(
      "request-ipn",
      validNotification(attempt),
    );
    expect(result).toEqual({
      data: { accepted: true, replayed: false },
      ok: true,
    });
    expect(fixture.confirmOrder).not.toHaveBeenCalled();
    expect(fixture.repository.settleConfirmedPayment).toHaveBeenCalledWith(
      expect.objectContaining({ resolutionStatus: "REFUND_REQUIRED" }),
    );
    expect(fixture.attempts[0]).toMatchObject({
      resolutionStatus: "REFUND_REQUIRED",
      status: "SUCCEEDED",
    });
  });

  it("locks order lifecycle before reading facts on successful provider observation", async () => {
    const fixture = createFixture();
    const attempt = await fixture.service.initiateForCheckout({
      idempotencyKey: "checkout:payment-lifecycle-lock",
      organizationId,
      requestId: "request-1",
      salesOrderId,
    });
    const callOrder: string[] = [];
    vi.mocked(fixture.repository.lockAttempt).mockImplementation(async () => {
      callOrder.push("lockAttempt");
    });
    vi.mocked(fixture.repository.lockOrderLifecycle).mockImplementation(
      async () => {
        callOrder.push("lockOrderLifecycle");
      },
    );
    vi.mocked(fixture.repository.getOrderFacts).mockImplementation(async () => {
      callOrder.push("getOrderFacts");
      return fixture.facts;
    });
    fixture.confirmOrder.mockImplementation(async () => {
      callOrder.push("confirm");
      return { id: salesOrderId };
    });

    const result = await fixture.service.notification(
      "request-ipn",
      validNotification(attempt),
    );
    expect(result.ok).toBe(true);
    expect(callOrder).toEqual([
      "lockAttempt",
      "lockOrderLifecycle",
      "getOrderFacts",
      "confirm",
    ]);
  });

  it("handles deadline crossing safely when reservation expires during order confirmation", async () => {
    const fixture = createFixture();
    const attempt = await fixture.service.initiateForCheckout({
      idempotencyKey: "checkout:payment-deadline-crossing",
      organizationId,
      requestId: "request-1",
      salesOrderId,
    });

    expect(fixture.facts.salesOrderStatus).toBe("RESERVED");
    expect(fixture.facts.reservationStatus).toBe("ACTIVE");
    fixture.confirmOrder.mockRejectedValueOnce(
      new SalesOrderReservationExpiredError(),
    );

    const result = await fixture.service.notification(
      "request-ipn",
      validNotification(attempt),
    );
    expect(result).toEqual({
      data: { accepted: true, replayed: false },
      ok: true,
    });
    expect(fixture.repository.settleConfirmedPayment).toHaveBeenCalledTimes(1);
    expect(fixture.repository.settleConfirmedPayment).toHaveBeenCalledWith(
      expect.objectContaining({ resolutionStatus: "REFUND_REQUIRED" }),
    );
    expect(fixture.repository.createReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: "LATE_SUCCESS_RESERVATION_UNAVAILABLE",
      }),
    );
    expect(fixture.attempts[0]).toMatchObject({
      resolutionStatus: "REFUND_REQUIRED",
      status: "SUCCEEDED",
    });
  });

  it.each([
    {
      name: "ConcurrencyError",
      error: new ConcurrencyError(),
      expectedCode: "INTERNAL_ERROR",
    },
    {
      name: "NotFoundError",
      error: new NotFoundError("Sales order not found"),
      expectedCode: "NOT_FOUND",
    },
    {
      name: "generic BusinessRuleError",
      error: new BusinessRuleError("Some business rule violation"),
      expectedCode: "BUSINESS_RULE_VIOLATION",
    },
    {
      name: "generic BusinessRuleError with identical message",
      error: new BusinessRuleError("Sales order reservation has expired."),
      expectedCode: "BUSINESS_RULE_VIOLATION",
    },
    {
      name: "ordinary Error simulating database failure",
      error: new Error("database connection timeout"),
      expectedCode: "INTERNAL_ERROR",
    },
  ])(
    "propagates unrelated error ($name) through service error handling without converting to REFUND_REQUIRED or settling",
    async ({ error, expectedCode }) => {
      const fixture = createFixture();
      const attempt = await fixture.service.initiateForCheckout({
        idempotencyKey: `checkout:payment-unrelated-${randomUUID()}`,
        organizationId,
        requestId: "request-1",
        salesOrderId,
      });

      fixture.confirmOrder.mockImplementation(async () => {
        fixture.facts.salesOrderStatus = "CANCELLED";
        fixture.facts.reservationStatus = "EXPIRED";
        throw error;
      });

      const result = await fixture.service.notification(
        "request-ipn",
        validNotification(attempt),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(expectedCode);
      }

      expect(fixture.repository.settleConfirmedPayment).not.toHaveBeenCalled();
      expect(fixture.repository.createReconciliation).not.toHaveBeenCalled();
      expect(fixture.recordAudit).not.toHaveBeenCalled();
      expect(fixture.attempts[0]?.resolutionStatus).not.toBe("REFUND_REQUIRED");
      expect(fixture.attempts[0]?.status).not.toBe("SUCCEEDED");
    },
  );

  it("records an amount mismatch and never settles it", async () => {
    const fixture = createFixture();
    const attempt = await fixture.service.initiateForCheckout({
      idempotencyKey: "checkout:payment-5",
      organizationId,
      requestId: "request-1",
      salesOrderId,
    });
    vi.mocked(fixture.provider.validateTransaction).mockResolvedValue({
      amountMinor: fixture.facts.totalMinor - 1,
      bankTransactionId: "bank-1",
      currencyCode: "BDT",
      providerStatus: "VALID",
      providerTransactionId: attempt.providerTransactionId,
      riskLevel: 0,
      status: "SUCCEEDED",
      validationId: "validation-1",
    });
    const result = await fixture.service.notification(
      "request-ipn",
      validNotification(attempt),
    );
    expect(result).toEqual({
      data: { accepted: false, replayed: false },
      ok: true,
    });
    expect(fixture.repository.createReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "MISMATCH",
        reasonCode: "AMOUNT_MISMATCH",
      }),
    );
    expect(fixture.repository.settleConfirmedPayment).not.toHaveBeenCalled();
  });

  it("reuses a pending attempt and provider transaction after session response loss", async () => {
    const fixture = createFixture();
    const attempt = await fixture.service.initiateForCheckout({
      idempotencyKey: "checkout:payment-recovery",
      organizationId,
      requestId: "request-1",
      salesOrderId,
    });
    Object.assign(attempt, {
      providerSessionId: null,
      redirectUrl: null,
      status: "PENDING",
    });
    vi.mocked(fixture.provider.queryTransaction).mockResolvedValue({
      amountMinor: fixture.facts.totalMinor,
      bankTransactionId: null,
      currencyCode: "BDT",
      providerStatus: "PENDING",
      providerTransactionId: attempt.providerTransactionId,
      riskLevel: null,
      status: "PENDING",
      validationId: null,
    });

    const result = await fixture.service.retry("request-retry", {
      idempotencyKey: "checkout:payment-recovery-retry",
      publicToken: attempt.publicToken,
    });

    expect(result.ok).toBe(true);
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.provider.createSession).toHaveBeenCalledTimes(2);
    expect(fixture.provider.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        providerTransactionId: attempt.providerTransactionId,
      }),
    );
    expect(attempt).toMatchObject({
      redirectUrl: "https://sandbox.sslcommerz.com/redirect",
      status: "SESSION_READY",
    });
  });

  it("retries a created provider refund without reserving a duplicate", async () => {
    const fixture = createFixture();
    const attempt = await fixture.service.initiateForCheckout({
      idempotencyKey: "checkout:payment-refund",
      organizationId,
      requestId: "request-1",
      salesOrderId,
    });
    Object.assign(attempt, {
      bankTransactionId: "bank-refund-1",
      confirmedAt: now,
      status: "SUCCEEDED",
    });
    fixture.facts.salesOrderStatus = "CANCELLED";
    vi.mocked(fixture.provider.initiateRefund)
      .mockRejectedValueOnce(new Error("provider response lost"))
      .mockResolvedValueOnce({
        providerRefundReference: "refund-reference-1",
        status: "PENDING",
      });
    const context = {
      authenticationState: "AUTHENTICATED" as const,
      organizationId,
      requestId: "request-refund-1",
      source: "ADMIN" as const,
      userId: "33333333-3333-4333-8333-333333333333",
    };
    const input = {
      amountMinor: 5000,
      idempotencyKey: "refund:response-loss",
      paymentAttemptId: attempt.id,
      reason: "Cancelled order",
    };

    const first = await fixture.service.refund(context, input);
    const retry = await fixture.service.refund(
      { ...context, requestId: "request-refund-2" },
      input,
    );

    expect(first.ok).toBe(false);
    expect(retry.ok).toBe(true);
    expect(fixture.refunds).toHaveLength(1);
    expect(fixture.repository.createProviderRefund).toHaveBeenCalledTimes(1);
    expect(fixture.provider.initiateRefund).toHaveBeenCalledTimes(2);
    expect(fixture.provider.initiateRefund).toHaveBeenLastCalledWith(
      expect.objectContaining({
        providerRefundTransactionId:
          fixture.refunds[0]?.providerRefundTransactionId,
      }),
    );
  });

  it("returns only CASH_ON_DELIVERY when provider is disabled and performs no repository or provider I/O", async () => {
    const fixture = createFixture({}, { enabled: false });

    const result = await fixture.service.options("request-options-disabled");

    expect(result).toEqual({
      data: { methods: ["CASH_ON_DELIVERY"] },
      ok: true,
    });
    expect(fixture.provider.createSession).not.toHaveBeenCalled();
    expect(fixture.provider.queryTransaction).not.toHaveBeenCalled();
    expect(fixture.repository.findLatestAttemptForOrder).not.toHaveBeenCalled();
    expect(fixture.repository.createAttempt).not.toHaveBeenCalled();
  });

  it("returns CASH_ON_DELIVERY and ONLINE_PAYMENT when provider is enabled and performs no repository or provider I/O", async () => {
    const fixture = createFixture({}, { enabled: true });

    const result = await fixture.service.options("request-options-enabled");

    expect(result).toEqual({
      data: { methods: ["CASH_ON_DELIVERY", "ONLINE_PAYMENT"] },
      ok: true,
    });
    expect(fixture.provider.createSession).not.toHaveBeenCalled();
    expect(fixture.provider.queryTransaction).not.toHaveBeenCalled();
    expect(fixture.repository.findLatestAttemptForOrder).not.toHaveBeenCalled();
    expect(fixture.repository.createAttempt).not.toHaveBeenCalled();
  });
});

function createFixture(
  overrides: Partial<OnlinePaymentOrderFacts> = {},
  providerOverrides: Partial<OnlinePaymentProviderAdapter> = {},
) {
  const facts: OnlinePaymentOrderFacts = {
    currencyCode: "BDT",
    customerEmail: null,
    customerName: "Customer",
    customerPhone: "01700000000",
    orderNumber: "WEB-1001",
    paymentPreference: "ONLINE_PAYMENT",
    reservationExpiresAt: new Date("2026-08-18T11:00:00.000Z"),
    reservationStatus: "ACTIVE",
    salesOrderId,
    salesOrderStatus: "RESERVED",
    salesOrderVersion: 1,
    totalMinor: 129900,
    ...overrides,
  };
  const attempts: OnlinePaymentAttempt[] = [];
  const refunds: ProviderRefund[] = [];
  const notifications = new Map<
    string,
    { id: string; status: NotificationStatus }
  >();
  const provider: OnlinePaymentProviderAdapter = {
    enabled: true,
    createSession: vi.fn(async () => ({
      expiresAt: null,
      redirectUrl: "https://sandbox.sslcommerz.com/redirect",
      sessionId: "session-1",
    })),
    initiateRefund: vi.fn(),
    queryRefund: vi.fn(),
    queryTransaction: vi.fn(),
    validateNotificationSignature: vi.fn(() => true),
    validateTransaction: vi.fn(async (validationId) => ({
      amountMinor: facts.totalMinor,
      bankTransactionId: "bank-1",
      currencyCode: "BDT",
      providerStatus: "VALID",
      providerTransactionId: attempts[0]?.providerTransactionId ?? "",
      riskLevel: 0,
      status: "SUCCEEDED" as const,
      validationId,
    })),
    ...providerOverrides,
  };
  const repository = createRepository(facts, attempts, refunds, notifications);
  const confirmOrder = vi.fn(async () => ({ id: salesOrderId }));
  const recordAudit = vi.fn(async () => undefined);
  const transactionManager = {
    execute: vi.fn(async (applicationContext, operation) =>
      operation({
        applicationContext,
        auditWriter: { recordWithinTransaction: recordAudit },
        inventoryMovementRepository: {},
        onlinePaymentRepository: repository,
        salesOrderLifecycleRepository: { confirm: confirmOrder },
        salesOrderRepository: {},
      }),
    ),
  } as unknown as ApplicationTransactionManager;
  return {
    attempts,
    confirmOrder,
    facts,
    provider,
    recordAudit,
    repository,
    refunds,
    service: new OnlinePaymentApplicationService({
      clock: { now: () => now },
      provider,
      repository,
      requestIdGenerator: () => "request-generated",
      transactionManager,
    }),
  };
}

function createRepository(
  facts: OnlinePaymentOrderFacts,
  attempts: OnlinePaymentAttempt[],
  refunds: ProviderRefund[],
  notifications: Map<string, { id: string; status: NotificationStatus }>,
): OnlinePaymentRepository {
  return {
    appendConfirmedProviderRefund: vi.fn(),
    createAttempt: vi.fn(async (record) => {
      const attempt: OnlinePaymentAttempt = {
        ...record,
        bankTransactionId: null,
        confirmedAt: null,
        expiresAt: null,
        failureCode: null,
        provider: "SSLCOMMERZ",
        providerSessionId: null,
        redirectUrl: null,
        resolutionStatus: "NORMAL",
        status: "CREATED",
        updatedAt: record.createdAt,
        validationId: null,
        version: 1,
      };
      attempts.push(attempt);
      return attempt;
    }),
    createProviderRefund: vi.fn(async (record) => {
      const refund: ProviderRefund = {
        ...record,
        confirmedAt: null,
        failureCode: null,
        providerRefundReference: null,
        status: "CREATED",
        updatedAt: record.createdAt,
      };
      refunds.push(refund);
      return refund;
    }),
    createReconciliation: vi.fn(async (record) => ({ ...record })),
    findAttemptById: vi.fn(
      async (id, tenantId) =>
        attempts.find(
          (item) => item.id === id && item.organizationId === tenantId,
        ) ?? null,
    ),
    findAttemptByIdempotencyKey: vi.fn(
      async (tenantId, orderId, key) =>
        attempts.find(
          (item) =>
            item.organizationId === tenantId &&
            item.salesOrderId === orderId &&
            item.idempotencyKey === key,
        ) ?? null,
    ),
    findAttemptByProviderTransactionId: vi.fn(
      async (providerTransactionId) =>
        attempts.find(
          (item) => item.providerTransactionId === providerTransactionId,
        ) ?? null,
    ),
    findAttemptByPublicToken: vi.fn(
      async (token) =>
        attempts.find((item) => item.publicToken === token) ?? null,
    ),
    findLatestAttemptForOrder: vi.fn(
      async (tenantId, orderId) =>
        attempts.findLast(
          (item) =>
            item.organizationId === tenantId && item.salesOrderId === orderId,
        ) ?? null,
    ),
    findProviderRefundById: vi.fn(
      async (id, tenantId) =>
        refunds.find(
          (item) => item.id === id && item.organizationId === tenantId,
        ) ?? null,
    ),
    findProviderRefundByIdempotencyKey: vi.fn(
      async (tenantId, paymentAttemptId, key) =>
        refunds.find(
          (item) =>
            item.organizationId === tenantId &&
            item.paymentAttemptId === paymentAttemptId &&
            item.idempotencyKey === key,
        ) ?? null,
    ),
    getOrderFacts: vi.fn(async (tenantId, orderId) =>
      tenantId === organizationId && orderId === salesOrderId ? facts : null,
    ),
    getProjection: vi.fn(),
    lockAttempt: vi.fn(async () => undefined),
    lockOrderLifecycle: vi.fn(async () => undefined),
    recordNotification: vi.fn(async (record) => {
      const existing = notifications.get(record.dedupeKey);
      if (existing)
        return { id: existing.id, replayed: true, status: existing.status };
      notifications.set(record.dedupeKey, {
        id: record.id,
        status: "RECEIVED",
      });
      return { id: record.id, replayed: false, status: "RECEIVED" };
    }),
    settleConfirmedPayment: vi.fn(async (record) => {
      const attempt = attempts.find(
        (item) => item.id === record.paymentAttemptId,
      )!;
      Object.assign(attempt, {
        bankTransactionId: record.bankTransactionId,
        confirmedAt: record.confirmedAt,
        resolutionStatus: record.resolutionStatus,
        status: "SUCCEEDED",
        validationId: record.validationId,
      });
      return attempt;
    }),
    totalReservedRefundMinor: vi.fn(async () => 0),
    updateAttemptSession: vi.fn(async (record) => {
      const attempt = attempts.find((item) => item.id === record.id)!;
      Object.assign(attempt, {
        expiresAt: record.expiresAt,
        providerSessionId: record.sessionId,
        redirectUrl: record.redirectUrl,
        status: "SESSION_READY",
      });
      return attempt;
    }),
    updateAttemptStatus: vi.fn(async (record) => {
      const attempt = attempts.find((item) => item.id === record.id)!;
      Object.assign(attempt, {
        failureCode: record.failureCode,
        status: record.status,
      });
      return attempt;
    }),
    updateNotification: vi.fn(async (record) => {
      for (const [key, value] of notifications) {
        if (value.id === record.id)
          notifications.set(key, { id: value.id, status: record.status });
      }
    }),
    updateProviderRefund: vi.fn(async (record) => {
      const refund = refunds.find(
        (item) =>
          item.id === record.id &&
          item.organizationId === record.organizationId,
      )!;
      Object.assign(refund, {
        confirmedAt: record.confirmedAt,
        failureCode: record.failureCode,
        providerRefundReference: record.providerRefundReference,
        status: record.status,
      });
      return refund;
    }),
  };
}

type NotificationStatus = "FAILED" | "PROCESSED" | "RECEIVED" | "REJECTED";

function validNotification(attempt: OnlinePaymentAttempt) {
  return {
    amount: "1299.00",
    status: "VALID",
    tran_id: attempt.providerTransactionId,
    val_id: "validation-1",
    verify_key: "amount,status,tran_id,val_id",
    verify_sign: "00000000000000000000000000000000",
  };
}
