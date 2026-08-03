import {
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  ConcurrencyError,
  type AuditWriter,
  type RecordAuditEntryInput,
  type CreateDraftSalesOrderRecord,
  type FulfillSalesOrderRecord,
  type ReserveSalesOrderRecord,
  type SalesCursorPageResult,
  type SalesOrder,
  type SalesOrderRepository,
} from "@senvo/domain";
import type { Logger, LogContext, LogMetadata } from "@senvo/logger";
import { beforeEach, describe, expect, it } from "vitest";
import type { ApplicationAuthenticationService } from "../context/authentication.js";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import type { Clock } from "../context/clock.js";
import type {
  ApplicationExecutionContext,
  ValidatedApplicationExecutionContext,
} from "../context/execution-context.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import { SalesApplicationService } from "./sales-application-service.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "99999999-9999-4999-8999-999999999999";
const salesOrderId = "22222222-2222-4222-8222-222222222222";
const productVariantId = "33333333-3333-4333-8333-333333333333";
const allocationPolicyId = "44444444-4444-4444-8444-444444444444";
const reservationId = "55555555-5555-4555-8555-555555555555";
const movementId = "66666666-6666-4666-8666-666666666666";
const actorId = "77777777-7777-4777-8777-777777777777";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const context: ApplicationExecutionContext = {
  actorId,
  actorType: "INTERNAL",
  authenticationState: "AUTHENTICATED",
  organizationId,
  role: "ADMIN",
  requestId: "req_sales_app_1",
  source: "ADMIN",
  userId,
};

describe("SalesApplicationService", () => {
  let repository: FakeSalesOrderRepository;
  let auditWriter: FakeAuditWriter;
  let logger: MemoryLogger;
  let service: SalesApplicationService;

  beforeEach(() => {
    auditWriter = new FakeAuditWriter();
    repository = new FakeSalesOrderRepository();
    logger = new MemoryLogger();
    service = new SalesApplicationService({
      clock: new StepClock(),
      logger,
      requestIdGenerator: () => "generated_request_1",
      salesOrderRepository: repository,
      transactionManager: new FakeTransactionManager(repository, auditWriter),
    });
  });

  it("injects organization identity from trusted context and redacts internal output fields", async () => {
    const result = await service.createOrder(context, createOrderPayload());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(repository.lastCreate?.organizationId).toBe(organizationId);
    expect(result.data.organizationId).toBe(organizationId);
    expect(result.data.createdAt).toBe("2026-07-03T00:00:00.000Z");
    expect(result.data).not.toHaveProperty("idempotencyKey");
    expect(result.data).not.toHaveProperty("payloadSignature");
    expect(auditWriter.records).toEqual([
      expect.objectContaining({
        action: "SALES_ORDER_CREATED",
        actor: { userId },
        organizationId,
        resource: "SALES_ORDER",
        resourceId: salesOrderId,
      }),
    ]);
  });

  it("checks authorization for protected order creation and returns safe denials", async () => {
    const authorization = new FakeAuthorizationService();
    const authorizedService = new SalesApplicationService({
      authorizationService: authorization,
      clock: new StepClock(),
      logger,
      requestIdGenerator: () => "generated_request_1",
      salesOrderRepository: repository,
      transactionManager: new FakeTransactionManager(repository, auditWriter),
    });

    const allowed = await authorizedService.createOrder(
      context,
      createOrderPayload(),
    );

    expect(allowed.ok).toBe(true);
    expect(authorization.calls).toEqual([
      {
        organizationId,
        permission: { action: "CREATE", resource: "SALES_ORDER" },
        role: "ADMIN",
        userId,
      },
    ]);

    authorization.error = new AuthorizationError("Permission denied.");
    const denied = await authorizedService.createOrder(
      context,
      createOrderPayload(),
    );

    expect(denied).toMatchObject({
      error: {
        code: "FORBIDDEN",
        message: "You are not allowed to perform this action.",
      },
      ok: false,
    });
  });

  it("checks authentication before protected order creation and returns safe denials", async () => {
    const authentication = new FakeAuthenticationService();
    const authenticatedService = new SalesApplicationService({
      authenticationService: authentication,
      clock: new StepClock(),
      logger,
      requestIdGenerator: () => "generated_request_1",
      salesOrderRepository: repository,
      transactionManager: new FakeTransactionManager(repository, auditWriter),
    });

    const allowed = await authenticatedService.createOrder(
      context,
      createOrderPayload(),
    );

    expect(allowed.ok).toBe(true);
    expect(authentication.calls).toEqual([
      { requestId: "req_sales_app_1", userId },
    ]);

    authentication.error = new AuthenticationError("Missing identity.");
    const denied = await authenticatedService.createOrder(
      context,
      createOrderPayload(),
    );

    expect(denied).toMatchObject({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
      },
      ok: false,
    });
  });

  it("rejects caller-supplied organizationId in service payloads", async () => {
    const result = await service.createOrder(context, {
      ...createOrderPayload(),
      organizationId: otherOrganizationId,
    });

    expect(result).toMatchObject({
      error: { code: "VALIDATION_ERROR", requestId: "req_sales_app_1" },
      ok: false,
    });
    expect(repository.lastCreate).toBeNull();
  });

  it("generates request IDs when callers omit them", async () => {
    const result = await service.getOrderById(
      { organizationId },
      { salesOrderId },
    );

    expect(result.ok).toBe(true);
    expect(logger.entries.at(-1)).toMatchObject({
      context: { requestId: "generated_request_1" },
      metadata: { requestId: "generated_request_1" },
    });
  });

  it("validates future identity context without authentication transport", async () => {
    await expectError(
      service.getOrderById(
        {
          organizationId,
          requestId: "req_sales_app_1",
          role: "OWNER",
          userId: "not-a-user-id",
        },
        { salesOrderId },
      ),
      "VALIDATION_ERROR",
      false,
    );
    await expectError(
      service.getOrderById(
        {
          organizationId,
          requestId: "req_sales_app_1",
          role: "SUPERUSER" as "OWNER",
          userId,
        },
        { salesOrderId },
      ),
      "VALIDATION_ERROR",
      false,
    );

    await service.getOrderById(context, { salesOrderId });

    expect(logger.entries.at(-1)).toMatchObject({
      metadata: { role: "ADMIN", userId },
    });
  });

  it("delegates cross-organization isolation to the repository using context organizationId", async () => {
    await service.getOrderById(context, { salesOrderId });

    expect(repository.lastFindById).toEqual({
      id: salesOrderId,
      organizationId,
    });
  });

  it("normalizes domain errors into service result errors", async () => {
    repository.confirmError = new ConcurrencyError("Version mismatch.");
    await expectError(
      service.confirmOrder(context, { expectedVersion: 1, salesOrderId }),
      "CONCURRENCY_CONFLICT",
      true,
    );

    repository.reserveError = new BusinessRuleError("Allocation failed.");
    await expectError(
      service.reserveOrder(context, {
        expectedVersion: 1,
        expiresAt: "2999-01-01T00:00:00.000Z",
        reservationIdempotencyKey: "reserve-123",
        reservationNumber: "RSV-SO-1",
        salesOrderId,
      }),
      "BUSINESS_RULE_VIOLATION",
      false,
    );

    await expectError(
      service.getOrderById(context, {
        salesOrderId: "88888888-8888-4888-8888-888888888888",
      }),
      "NOT_FOUND",
      false,
    );

    await expectError(
      service.createOrder(context, {
        ...createOrderPayload(),
        idempotencyKey: "idempotency-conflict",
      }),
      "IDEMPOTENCY_CONFLICT",
      false,
    );
  });

  it("hides unexpected infrastructure details from callers and logs only safe metadata", async () => {
    repository.listError = new Error(
      "PrismaClientKnownRequestError: duplicate phone +8801711111111",
    );
    const result = await service.listOrders(context, { pageSize: 25 });

    expect(result).toMatchObject({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
      ok: false,
    });
    const logged = JSON.stringify(logger.entries);
    expect(logged).toContain("sales.listOrders");
    expect(logged).not.toContain("+8801711111111");
    expect(logged).not.toContain("buyer@senvo.test");
    expect(logged).not.toContain("PrismaClientKnownRequestError");
  });

  it("keeps list pagination bounded and maps pages through service contracts", async () => {
    const invalid = await service.listOrders(context, { pageSize: 101 });
    expect(invalid).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
      ok: false,
    });

    const result = await service.listOrders(context, { pageSize: 25 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toEqual({
      hasMore: false,
      items: [expect.objectContaining({ id: salesOrderId })],
      nextCursor: null,
    });
  });

  it("rejects inventory movement lines and draft snapshot tampering at the application edge", async () => {
    await expectError(
      service.fulfillOrder(context, {
        consumptionIdempotencyKey: "consume-123",
        expectedVersion: 3,
        movementLines: [{ productVariantId, quantity: 1 }],
        movementNumber: "MOVE-SO-1",
        occurredAt: "2026-07-03T00:00:00.000Z",
        salesOrderId,
      }),
      "VALIDATION_ERROR",
      false,
    );

    await expectError(
      service.amendDraftOrder(context, {
        expectedVersion: 1,
        metadata: { note: "Updated", totalMinor: 1 },
        salesOrderId,
      }),
      "VALIDATION_ERROR",
      false,
    );
  });

  it("passes service lifecycle commands through the domain use cases", async () => {
    await service.updateDraftOrderMetadata(context, {
      expectedVersion: 1,
      note: "Updated",
      salesOrderId,
    });
    await service.replaceDraftOrderLines(context, {
      expectedVersion: 2,
      lines: [{ productVariantId, quantity: 1, unitPriceMinor: 1000 }],
      salesOrderId,
    });
    await service.cancelOrder(context, { expectedVersion: 3, salesOrderId });
    await service.fulfillOrder(context, {
      consumptionIdempotencyKey: "consume-123",
      expectedVersion: 4,
      movementNumber: "MOVE-SO-1",
      occurredAt: "2026-07-03T00:00:00.000Z",
      salesOrderId,
    });

    expect(repository.lastAmend?.organizationId).toBe(organizationId);
    expect(repository.lastCancel?.organizationId).toBe(organizationId);
    expect(repository.lastFulfill?.organizationId).toBe(organizationId);
  });

  it("derives lifecycle integration metadata for admin actions", async () => {
    await service.reserveManagedOrder(context, {
      expectedVersion: 1,
      salesOrderId,
    });
    expect(repository.lastReserve).toMatchObject({
      expectedVersion: 1,
      organizationId,
      reservationIdempotencyKey: `sales:${salesOrderId}:reserve:1`,
      reservationNumber: `RSV-${salesOrderId}-1`,
      salesOrderId,
    });

    await service.fulfillManagedOrder(context, {
      expectedVersion: 3,
      salesOrderId,
    });
    expect(repository.lastFulfill).toMatchObject({
      consumptionIdempotencyKey: `sales:${salesOrderId}:fulfill:3`,
      expectedVersion: 3,
      movementNumber: `FUL-${salesOrderId}-3`,
      organizationId,
      salesOrderId,
    });
  });
});

async function expectError(
  promise: Promise<
    Awaited<ReturnType<SalesApplicationService["getOrderById"]>>
  >,
  code: string,
  retryable: boolean,
) {
  const result = await promise;
  expect(result).toMatchObject({
    error: { code, retryable, requestId: "req_sales_app_1" },
    ok: false,
  });
}

function createOrderPayload() {
  return {
    allocationPolicyId,
    channel: "ONLINE",
    currencyCode: "BDT",
    customerEmail: "buyer@senvo.test",
    customerName: "A Buyer",
    customerPhone: "+8801711111111",
    deliveryAddressLine1: "Road 1",
    deliveryCity: "Dhaka",
    deliveryMinor: 100,
    idempotencyKey: "order-123",
    lines: [{ productVariantId, quantity: 2, unitPriceMinor: 1000 }],
    orderDiscountMinor: 50,
    orderNumber: "SO-1",
  };
}

function baseOrder(overrides: Partial<SalesOrder> = {}): SalesOrder {
  const timestamp = new Date("2026-07-03T00:00:00.000Z");
  return {
    allocationPolicyId,
    cancelledAt: null,
    channel: "ONLINE",
    confirmedAt: null,
    createdAt: timestamp,
    currencyCode: "BDT",
    customerEmail: "buyer@senvo.test",
    customerName: "A Buyer",
    customerPhone: "+8801711111111",
    deliveryAddressLine1: "Road 1",
    deliveryAddressLine2: null,
    deliveryCity: "Dhaka",
    deliveryDistrict: null,
    deliveryMinor: 100,
    deliveryPostalCode: null,
    discountMinor: 50,
    fulfilledAt: null,
    fulfillmentMovementId: null,
    id: salesOrderId,
    idempotencyKey: "order-123",
    inventoryReservationId: reservationId,
    lines: [
      {
        colorSnapshot: "Black",
        createdAt: timestamp,
        discountMinor: 0,
        id: "88888888-8888-4888-8888-888888888888",
        lineNumber: 1,
        lineTotalMinor: 2000,
        organizationId,
        productNameSnapshot: "Oxford Shirt",
        productVariantId,
        quantity: 2,
        salesOrderId,
        sizeSnapshot: "L",
        skuSnapshot: "OX-BLK-L",
        unitPriceMinor: 1000,
      },
    ],
    note: null,
    orderNumber: "SO-1",
    organizationId,
    payloadSignature: "internal-payload-signature",
    reservedAt: null,
    status: "DRAFT",
    subtotalMinor: 2000,
    totalMinor: 2050,
    updatedAt: timestamp,
    version: 1,
    ...overrides,
  };
}

class FakeSalesOrderRepository implements SalesOrderRepository {
  confirmError: Error | null = null;
  lastAmend: { organizationId: string } | null = null;
  lastCancel: { organizationId: string } | null = null;
  lastCreate: CreateDraftSalesOrderRecord | null = null;
  lastFindById: { id: string; organizationId: string } | null = null;
  lastFulfill: FulfillSalesOrderRecord | null = null;
  listError: Error | null = null;
  reserveError: Error | null = null;
  lastReserve: ReserveSalesOrderRecord | null = null;

  amendDraft(record: { organizationId: string }): Promise<SalesOrder> {
    this.lastAmend = record;
    return Promise.resolve(
      baseOrder({ organizationId: record.organizationId, version: 2 }),
    );
  }

  cancel(record: { organizationId: string }): Promise<SalesOrder> {
    this.lastCancel = record;
    return Promise.resolve(
      baseOrder({
        organizationId: record.organizationId,
        status: "CANCELLED",
      }),
    );
  }

  confirm(record: { organizationId: string }): Promise<SalesOrder> {
    if (this.confirmError) {
      return Promise.reject(this.confirmError);
    }
    return Promise.resolve(
      baseOrder({
        organizationId: record.organizationId,
        status: "CONFIRMED",
      }),
    );
  }

  createDraft(
    record: CreateDraftSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder> {
    this.lastCreate = record;
    return Promise.resolve(
      baseOrder({
        idempotencyKey: record.idempotencyKey,
        organizationId: record.organizationId,
        payloadSignature,
        totalMinor: record.totalMinor,
      }),
    );
  }

  findById(id: string, orgId: string): Promise<SalesOrder | null> {
    this.lastFindById = { id, organizationId: orgId };
    return Promise.resolve(
      id === salesOrderId ? baseOrder({ organizationId: orgId }) : null,
    );
  }

  findByIdempotencyKey(
    orgId: string,
    idempotencyKey: string,
  ): Promise<SalesOrder | null> {
    if (idempotencyKey === "idempotency-conflict") {
      return Promise.resolve(
        baseOrder({
          idempotencyKey,
          organizationId: orgId,
          payloadSignature: "different-payload",
        }),
      );
    }
    return Promise.resolve(null);
  }

  findByOrderNumber(): Promise<SalesOrder | null> {
    return Promise.resolve(null);
  }

  fulfill(
    record: FulfillSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder> {
    this.lastFulfill = record;
    return Promise.resolve(
      baseOrder({
        fulfillmentMovementId: movementId,
        organizationId: record.organizationId,
        payloadSignature,
        status: "FULFILLED",
      }),
    );
  }

  list(): Promise<SalesCursorPageResult<SalesOrder>> {
    if (this.listError) {
      return Promise.reject(this.listError);
    }
    return Promise.resolve({
      hasMore: false,
      items: [baseOrder()],
      nextCursor: null,
    });
  }

  reserve(
    record: ReserveSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder> {
    this.lastReserve = record;
    if (this.reserveError) {
      return Promise.reject(this.reserveError);
    }
    return Promise.resolve(
      baseOrder({
        inventoryReservationId: reservationId,
        organizationId: record.organizationId,
        payloadSignature,
        status: "RESERVED",
      }),
    );
  }
}

class FakeAuditWriter implements AuditWriter {
  readonly records: RecordAuditEntryInput[] = [];

  record(input: RecordAuditEntryInput) {
    this.records.push(input);
    return Promise.resolve({
      action: input.action,
      createdAt: new Date("2026-07-03T00:00:00.000Z"),
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      metadata: input.metadata ?? {},
      organizationId: input.organizationId,
      resource: input.resource,
      resourceId: input.resourceId,
      userId: input.actor.userId,
    });
  }

  recordWithinTransaction(input: RecordAuditEntryInput) {
    return this.record(input);
  }
}

class FakeTransactionManager implements ApplicationTransactionManager {
  constructor(
    private readonly salesOrderRepository: SalesOrderRepository,
    private readonly auditWriter: AuditWriter,
  ) {}

  execute<TResult>(
    applicationContext: ValidatedApplicationExecutionContext,
    operation: Parameters<ApplicationTransactionManager["execute"]>[1],
  ): Promise<TResult> {
    return operation({
      applicationContext,
      auditWriter: this.auditWriter,
      inventoryMovementRepository: {
        findById: () => Promise.reject(unreachableError()),
        post: () => Promise.reject(unreachableError()),
      },
      salesOrderRepository: this.salesOrderRepository,
    }) as Promise<TResult>;
  }
}

class FakeAuthorizationService implements ApplicationAuthorizationService {
  calls: {
    organizationId: string;
    permission: { action: string; resource: string };
    role: string | null;
    userId: string | null;
  }[] = [];
  error: Error | null = null;

  authorize(
    authContext: Parameters<ApplicationAuthorizationService["authorize"]>[0],
    permission: Parameters<ApplicationAuthorizationService["authorize"]>[1],
  ): Promise<void> {
    this.calls.push({
      organizationId: authContext.organizationId,
      permission,
      role: authContext.role,
      userId: authContext.userId,
    });
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve();
  }
}

class FakeAuthenticationService implements ApplicationAuthenticationService {
  calls: { requestId: string; userId: string | null }[] = [];
  error: Error | null = null;

  authenticate(
    request: Parameters<ApplicationAuthenticationService["authenticate"]>[0],
  ): ReturnType<ApplicationAuthenticationService["authenticate"]> {
    this.calls.push(request);
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve({
      authenticatedUserId: request.userId ?? userId,
      provider: "PASSWORD",
      requestId: request.requestId,
    });
  }
}

class StepClock implements Clock {
  private next = 0;

  now(): Date {
    const value = new Date(Date.UTC(2026, 6, 3, 0, 0, this.next));
    this.next += 1;
    return value;
  }
}

class MemoryLogger implements Logger {
  readonly entries: {
    context?: LogContext;
    level: string;
    message: string;
    metadata?: LogMetadata;
  }[] = [];

  debug(message: string, metadata?: LogMetadata, context?: LogContext): void {
    this.entries.push({ context, level: "debug", message, metadata });
  }

  error(message: string, metadata?: LogMetadata, context?: LogContext): void {
    this.entries.push({ context, level: "error", message, metadata });
  }

  info(message: string, metadata?: LogMetadata, context?: LogContext): void {
    this.entries.push({ context, level: "info", message, metadata });
  }

  warn(message: string, metadata?: LogMetadata, context?: LogContext): void {
    this.entries.push({ context, level: "warn", message, metadata });
  }
}

function unreachableError(): Error {
  return new Error("Unexpected transaction repository call.");
}
