/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from "vitest";
import type {
  OnlinePaymentAttempt,
  OnlinePaymentProviderAdapter,
  OnlinePaymentRepository,
  SalesOrder,
  SalesOrderRepository,
  StorefrontRepository,
} from "@senvo/domain";
import { StorefrontApplicationService } from "./storefront-application-service.js";
import { OnlinePaymentApplicationService } from "../payment/online-payment-application-service.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const variantId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const payload = {
  customer: { name: "Sharif Ahmed", phone: "01712345678" },
  deliveryAddress: {
    city: "Dhaka",
    district: "Dhaka",
    line1: "House 10, Road 2",
  },
  idempotencyKey: "web:test-order-1",
  lines: [
    {
      productVariantId: variantId,
      quantity: 2,
      reviewedUnitPriceMinor: 129900,
    },
  ],
  paymentPreference: "CASH_ON_DELIVERY" as const,
};

describe("StorefrontApplicationService", () => {
  it("uses configured tenant, authoritative price, and one atomic reservation transaction", async () => {
    const created: { organizationId?: string; unitPriceMinor?: number } = {};
    const sales = salesRepository(created);
    const storefront = storefrontRepository();
    const service = new StorefrontApplicationService({
      organizationCode: "senvo",
      repository: storefront,
      transactionManager: transactionManager(storefront, sales),
    });
    const result = await service.checkout("request-12345", payload);
    expect(result.ok).toBe(true);
    expect(storefront.resolveActiveOrganizationByCode).toHaveBeenCalledWith(
      "SENVO",
    );
    expect(created).toEqual({ organizationId, unitPriceMinor: 129900 });
    expect(storefront.createCommerceProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        paymentPreference: "CASH_ON_DELIVERY",
        salesOrderId: orderId,
        source: "STOREFRONT",
      }),
    );
  });

  it("rejects a changed price before order, profile, or audit writes", async () => {
    const storefront = storefrontRepository();
    const sales = salesRepository({});
    const recordAudit = vi.fn(async () => undefined);
    const service = new StorefrontApplicationService({
      organizationCode: "SENVO",
      repository: storefront,
      transactionManager: transactionManager(storefront, sales, recordAudit),
    });

    const result = await service.checkout("request-price-change", {
      ...payload,
      lines: [
        {
          ...payload.lines[0],
          reviewedUnitPriceMinor: 1,
        },
      ],
    });

    expect(result).toMatchObject({
      error: {
        code: "BUSINESS_RULE_VIOLATION",
        message:
          "Product prices changed. Refresh and review the current total.",
      },
      ok: false,
    });
    expect(sales.createDraft).not.toHaveBeenCalled();
    expect(storefront.createCommerceProfile).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("replays a completed same-key checkout without creating a duplicate order", async () => {
    const storefront = storefrontRepository();
    const sales = salesRepository({});
    const service = new StorefrontApplicationService({
      organizationCode: "SENVO",
      repository: storefront,
      transactionManager: transactionManager(storefront, sales),
    });
    const first = await service.checkout("request-12345", payload);
    const profile = vi.mocked(storefront.createCommerceProfile).mock
      .calls[0]?.[0];
    vi.mocked(storefront.findCheckoutByIdempotencyKey).mockResolvedValue({
      currencyCode: "BDT",
      orderId,
      orderNumber: "WEB-ABC",
      paymentPreference: "CASH_ON_DELIVERY",
      requestSignature: profile?.requestSignature ?? "",
      status: "RESERVED",
      totalMinor: 259800,
    });
    const retry = await service.checkout("request-67890", payload);
    expect(first.ok).toBe(true);
    expect(retry).toMatchObject({ data: { orderId }, ok: true });
    expect(sales.createDraft).toHaveBeenCalledTimes(1);
    expect(storefront.createCommerceProfile).toHaveBeenCalledTimes(1);
  });

  it("rejects a different payload with the same checkout key", async () => {
    const storefront = storefrontRepository();
    const sales = salesRepository({});
    const service = new StorefrontApplicationService({
      organizationCode: "SENVO",
      repository: storefront,
      transactionManager: transactionManager(storefront, sales),
    });
    await service.checkout("request-12345", payload);
    const profile = vi.mocked(storefront.createCommerceProfile).mock
      .calls[0]?.[0];
    vi.mocked(storefront.findCheckoutByIdempotencyKey).mockResolvedValue({
      currencyCode: "BDT",
      orderId,
      orderNumber: "WEB-ABC",
      paymentPreference: "CASH_ON_DELIVERY",
      requestSignature: profile?.requestSignature ?? "",
      status: "RESERVED",
      totalMinor: 259800,
    });
    const conflict = await service.checkout("request-67890", {
      ...payload,
      customer: { ...payload.customer, name: "Different Customer" },
    });
    expect(conflict).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
      ok: false,
    });
  });

  it("never accepts organization, channel, price, or payment records in checkout input", async () => {
    const storefront = storefrontRepository();
    const service = new StorefrontApplicationService({
      organizationCode: "SENVO",
      repository: storefront,
      transactionManager: transactionManager(storefront, salesRepository({})),
    });
    const result = await service.checkout("request-12345", {
      ...payload,
      organizationId,
      channel: "POS",
      unitPriceMinor: 1,
    });
    expect(result).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
      ok: false,
    });
  });

  it("rejects ONLINE_PAYMENT when onlinePayments service is not configured before any writes or fact loading", async () => {
    const storefront = storefrontRepository();
    const sales = salesRepository({});
    const recordAudit = vi.fn(async () => undefined);
    const service = new StorefrontApplicationService({
      organizationCode: "SENVO",
      repository: storefront,
      transactionManager: transactionManager(storefront, sales, recordAudit),
    });

    const result = await service.checkout("request-online-no-service", {
      ...payload,
      paymentPreference: "ONLINE_PAYMENT",
    });

    expect(result).toMatchObject({
      error: {
        code: "BUSINESS_RULE_VIOLATION",
        message: "Online payment is unavailable.",
      },
      ok: false,
    });
    expect(sales.createDraft).not.toHaveBeenCalled();
    expect(sales.reserve).not.toHaveBeenCalled();
    expect(storefront.createCommerceProfile).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(storefront.loadCheckoutFacts).not.toHaveBeenCalled();
  });

  it("rejects ONLINE_PAYMENT when payment provider is disabled before any commerce writes or payment attempt creation", async () => {
    const storefront = storefrontRepository();
    const sales = salesRepository({});
    const recordAudit = vi.fn(async () => undefined);
    const payment = onlinePaymentService(false);
    const service = new StorefrontApplicationService({
      onlinePayments: payment.service,
      organizationCode: "SENVO",
      repository: storefront,
      transactionManager: transactionManager(storefront, sales, recordAudit),
    });

    const result = await service.checkout("request-online-disabled", {
      ...payload,
      paymentPreference: "ONLINE_PAYMENT",
    });

    expect(result).toMatchObject({
      error: {
        code: "BUSINESS_RULE_VIOLATION",
        message: "Online payment is unavailable.",
      },
      ok: false,
    });
    expect(sales.createDraft).not.toHaveBeenCalled();
    expect(sales.reserve).not.toHaveBeenCalled();
    expect(storefront.createCommerceProfile).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(storefront.loadCheckoutFacts).not.toHaveBeenCalled();
    expect(payment.repository.createAttempt).not.toHaveBeenCalled();
    expect(payment.provider.createSession).not.toHaveBeenCalled();
  });

  it("allows CASH_ON_DELIVERY even when online payment is disabled or unavailable", async () => {
    const storefront = storefrontRepository();
    const sales = salesRepository({});
    const recordAudit = vi.fn(async () => undefined);
    const payment = onlinePaymentService(false);
    const service = new StorefrontApplicationService({
      onlinePayments: payment.service,
      organizationCode: "SENVO",
      repository: storefront,
      transactionManager: transactionManager(storefront, sales, recordAudit),
    });

    const result = await service.checkout("request-cod-disabled-online", {
      ...payload,
      paymentPreference: "CASH_ON_DELIVERY",
    });

    expect(result.ok).toBe(true);
    expect(sales.createDraft).toHaveBeenCalledTimes(1);
    expect(sales.reserve).toHaveBeenCalledTimes(1);
    expect(storefront.createCommerceProfile).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(payment.provider.createSession).not.toHaveBeenCalled();
    expect(payment.repository.createAttempt).not.toHaveBeenCalled();
  });

  it("completes order, reservation, commerce profile, audit, and initiates online payment when enabled", async () => {
    const storefront = storefrontRepository();
    const sales = salesRepository({});
    const recordAudit = vi.fn(async () => undefined);
    const payment = onlinePaymentService(true);
    const service = new StorefrontApplicationService({
      onlinePayments: payment.service,
      organizationCode: "SENVO",
      repository: storefront,
      transactionManager: transactionManager(storefront, sales, recordAudit),
    });

    const result = await service.checkout("request-online-enabled", {
      ...payload,
      paymentPreference: "ONLINE_PAYMENT",
    });

    expect(result.ok).toBe(true);
    expect(sales.createDraft).toHaveBeenCalledTimes(1);
    expect(sales.reserve).toHaveBeenCalledTimes(1);
    expect(storefront.createCommerceProfile).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(payment.provider.createSession).toHaveBeenCalledTimes(1);
    expect(payment.repository.createAttempt).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      data: {
        orderId,
        payment: {
          redirectUrl: "https://sandbox.sslcommerz.com/easycheckout.php",
          status: "SESSION_READY",
        },
        paymentPreference: "ONLINE_PAYMENT",
      },
      ok: true,
    });
  });
});

function storefrontRepository(): StorefrontRepository {
  return {
    createCommerceProfile: vi.fn(async (input) => ({
      paymentPreference: input.paymentPreference,
      requestSignature: input.requestSignature,
      salesOrderId: input.salesOrderId,
      source: input.source,
    })),
    findCheckoutByIdempotencyKey: vi.fn(async () => null),
    getProductBySlug: vi.fn(async () => null),
    listCatalog: vi.fn(async () => ({
      categories: [],
      collections: [],
      hasMore: false,
      page: 1,
      pageSize: 24,
      products: [],
    })),
    loadCheckoutFacts: vi.fn(async () => ({
      allocationPolicyId: "44444444-4444-4444-8444-444444444444",
      variants: [
        {
          id: variantId,
          productName: "Everyday Tee",
          sellingPriceMinor: 129900,
        },
      ],
    })),
    lockCheckoutAttempt: vi.fn(async () => undefined),
    resolveActiveOrganizationByCode: vi.fn(async () => ({
      id: organizationId,
      name: "SENVO Wear",
    })),
  };
}

function salesRepository(captured: {
  organizationId?: string;
  unitPriceMinor?: number;
}): SalesOrderRepository {
  const draft = order("DRAFT", 1);
  return {
    amendDraft: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn(),
    createDraft: vi.fn(async (record) => {
      captured.organizationId = record.organizationId;
      captured.unitPriceMinor = record.lines[0]?.unitPriceMinor;
      return draft;
    }),
    findById: vi.fn(),
    findByIdempotencyKey: vi.fn(async () => null),
    findByOrderNumber: vi.fn(),
    fulfill: vi.fn(),
    list: vi.fn(),
    reserve: vi.fn(async () => order("RESERVED", 2)),
  } as unknown as SalesOrderRepository;
}

function transactionManager(
  storefront: StorefrontRepository,
  sales: SalesOrderRepository,
  recordAudit = vi.fn(async () => undefined),
): ApplicationTransactionManager {
  return {
    execute: vi.fn(async (context, operation) =>
      operation({
        applicationContext: context,
        auditWriter: { recordWithinTransaction: recordAudit },
        inventoryMovementRepository: {} as never,
        salesOrderLifecycleRepository: sales,
        salesOrderRepository: sales,
        storefrontRepository: storefront,
      }),
    ),
  };
}

function order(status: "DRAFT" | "RESERVED", version: number): SalesOrder {
  return {
    allocationPolicyId: "44444444-4444-4444-8444-444444444444",
    boothId: null,
    cancelledAt: null,
    channel: "ONLINE",
    confirmedAt: null,
    createdAt: new Date(),
    currencyCode: "BDT",
    customerEmail: null,
    customerName: "Sharif Ahmed",
    customerPhone: "+8801712345678",
    deliveryAddressLine1: "House 10",
    deliveryAddressLine2: null,
    deliveryCity: "Dhaka",
    deliveryDistrict: "Dhaka",
    deliveryMinor: 0,
    deliveryPostalCode: null,
    discountMinor: 0,
    fulfilledAt: null,
    fulfillmentMovementId: null,
    id: orderId,
    idempotencyKey: payload.idempotencyKey,
    inventoryReservationId:
      status === "RESERVED" ? "55555555-5555-4555-8555-555555555555" : null,
    lines: [],
    note: null,
    orderNumber: "WEB-ABC",
    organizationId,
    payloadSignature: "signature",
    reservedAt: status === "RESERVED" ? new Date() : null,
    status,
    subtotalMinor: 259800,
    totalMinor: 259800,
    updatedAt: new Date(),
    version,
  };
}

function onlinePaymentService(providerEnabled = true) {
  const attempts: OnlinePaymentAttempt[] = [];
  const provider: OnlinePaymentProviderAdapter = {
    createSession: vi.fn(async () => ({
      expiresAt: null,
      redirectUrl: "https://sandbox.sslcommerz.com/easycheckout.php",
      sessionId: "session-12345",
    })),
    enabled: providerEnabled,
    initiateRefund: vi.fn(),
    queryRefund: vi.fn(),
    queryTransaction: vi.fn(),
    validateNotificationSignature: vi.fn(() => true),
    validateTransaction: vi.fn(),
  };
  const repository: OnlinePaymentRepository = {
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
        redirectUrl: "https://sandbox.sslcommerz.com/easycheckout.php",
        resolutionStatus: "NORMAL",
        status: "CREATED",
        updatedAt: record.createdAt,
        validationId: null,
        version: 1,
      };
      attempts.push(attempt);
      return attempt;
    }),
    createProviderRefund: vi.fn(),
    createReconciliation: vi.fn(),
    findAttemptById: vi.fn(),
    findAttemptByIdempotencyKey: vi.fn(async () => null),
    findAttemptByProviderTransactionId: vi.fn(),
    findAttemptByPublicToken: vi.fn(),
    findLatestAttemptForOrder: vi.fn(async () => null),
    findProviderRefundById: vi.fn(),
    findProviderRefundByIdempotencyKey: vi.fn(),
    getOrderFacts: vi.fn(async () => ({
      amountMinor: 259800,
      currencyCode: "BDT" as const,
      customerEmail: null,
      customerName: "Sharif Ahmed",
      customerPhone: "+8801712345678",
      orderNumber: "WEB-ABC",
      paymentPreference: "ONLINE_PAYMENT" as const,
      reservationExpiresAt: new Date(Date.now() + 1800000),
      reservationId: "55555555-5555-4555-8555-555555555555",
      reservationStatus: "ACTIVE" as const,
      salesOrderId: orderId,
      salesOrderStatus: "RESERVED" as const,
      salesOrderVersion: 1,
      totalMinor: 259800,
    })),
    getProjection: vi.fn(),
    lockAttempt: vi.fn(async () => undefined),
    recordNotification: vi.fn(),
    settleConfirmedPayment: vi.fn(),
    totalReservedRefundMinor: vi.fn(async () => 0),
    updateAttemptSession: vi.fn(async (record) => {
      const attempt = attempts.find((a) => a.id === record.id);
      if (attempt) {
        attempt.redirectUrl = record.redirectUrl;
        attempt.status = "SESSION_READY";
      }
      return attempt!;
    }),
    updateAttemptStatus: vi.fn(),
    updateNotification: vi.fn(),
    updateProviderRefund: vi.fn(),
  };
  const service = new OnlinePaymentApplicationService({
    provider,
    repository,
    transactionManager: {
      execute: vi.fn(async (ctx, op) =>
        op({
          applicationContext: ctx,
          auditWriter: { recordWithinTransaction: vi.fn() },
          inventoryMovementRepository: {} as never,
          onlinePaymentRepository: repository,
          salesOrderLifecycleRepository: {} as never,
          salesOrderRepository: {} as never,
        }),
      ),
    } as unknown as ApplicationTransactionManager,
  });
  return { attempts, provider, repository, service };
}
