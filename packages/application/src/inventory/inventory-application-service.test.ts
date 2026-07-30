import {
  AuthorizationError,
  type AuditWriter,
  type InventoryMovement,
  type InventoryMovementRepository,
  type InventoryReadRepository,
  type RecordAuditEntryInput,
} from "@senvo/domain";
import type { Logger, LogContext, LogMetadata } from "@senvo/logger";
import { beforeEach, describe, expect, it } from "vitest";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import type { Clock } from "../context/clock.js";
import type {
  ApplicationExecutionContext,
  ValidatedApplicationExecutionContext,
} from "../context/execution-context.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import { InventoryApplicationService } from "./inventory-application-service.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const movementId = "22222222-2222-4222-8222-222222222222";
const productVariantId = "33333333-3333-4333-8333-333333333333";
const actorId = "77777777-7777-4777-8777-777777777777";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const context: ApplicationExecutionContext = {
  actorId,
  actorType: "INTERNAL",
  authenticationState: "AUTHENTICATED",
  organizationId,
  role: "MANAGER",
  requestId: "req_inventory_app_1",
  source: "ADMIN",
  userId,
};

describe("InventoryApplicationService", () => {
  let authorization: FakeAuthorizationService;
  let auditWriter: FakeAuditWriter;
  let logger: MemoryLogger;
  let repository: FakeInventoryMovementRepository;
  let readRepository: FakeInventoryReadRepository;
  let service: InventoryApplicationService;

  beforeEach(() => {
    auditWriter = new FakeAuditWriter();
    authorization = new FakeAuthorizationService();
    logger = new MemoryLogger();
    repository = new FakeInventoryMovementRepository();
    readRepository = new FakeInventoryReadRepository();
    service = new InventoryApplicationService({
      authorizationService: authorization,
      clock: new StepClock(),
      inventoryMovementRepository: repository,
      inventoryReadRepository: readRepository,
      logger,
      requestIdGenerator: () => "generated_request_1",
      transactionManager: new FakeTransactionManager(repository, auditWriter),
    });
  });

  it("checks authorization before posting inventory movement", async () => {
    const result = await service.postMovement(context, { movementId });

    expect(result.ok).toBe(true);
    expect(repository.lastPost).toEqual({ movementId, organizationId });
    expect(authorization.calls).toEqual([
      {
        organizationId,
        permission: { action: "UPDATE", resource: "INVENTORY" },
        role: "MANAGER",
        userId,
      },
    ]);
    expect(auditWriter.records).toEqual([
      expect.objectContaining({
        action: "INVENTORY_MOVEMENT_POSTED",
        actor: { userId },
        organizationId,
        resource: "INVENTORY_MOVEMENT",
        resourceId: movementId,
      }),
    ]);
  });

  it("returns safe denial results without posting inventory movement", async () => {
    authorization.error = new AuthorizationError("Permission denied.");

    const result = await service.postMovement(context, { movementId });

    expect(result).toMatchObject({
      error: {
        code: "FORBIDDEN",
        message: "You are not allowed to perform this action.",
      },
      ok: false,
    });
    expect(repository.lastPost).toBeNull();
  });

  it("queries organization-scoped availability with INVENTORY.READ", async () => {
    const result = await service.listInventoryAvailability(context, {
      pageSize: 1,
      search: "SKU",
    });

    expect(result).toMatchObject({
      data: {
        hasMore: true,
        items: [
          {
            availableToSell: 15,
            onHand: 20,
            reserved: 5,
          },
        ],
        nextCursor: "next-inventory-page",
      },
      ok: true,
    });
    expect(readRepository.availabilityFilter).toMatchObject({
      organizationId,
      pageSize: 1,
      search: "SKU",
    });
    expect(authorization.calls.at(-1)?.permission).toEqual({
      action: "READ",
      resource: "INVENTORY",
    });
  });
});

class FakeInventoryReadRepository implements InventoryReadRepository {
  availabilityFilter:
    Parameters<InventoryReadRepository["listAvailability"]>[0] | undefined;

  getVariantAvailability() {
    return Promise.resolve(null);
  }

  listAvailability(
    filter: Parameters<InventoryReadRepository["listAvailability"]>[0],
  ) {
    this.availabilityFilter = filter;
    return Promise.resolve({
      hasMore: true,
      items: [
        {
          availableToSell: 15,
          location: {
            id: "55555555-5555-4555-8555-555555555555",
            name: "Main Warehouse",
          },
          onHand: 20,
          reserved: 5,
          variant: {
            color: "Black",
            id: productVariantId,
            productId: "66666666-6666-4666-8666-666666666666",
            productName: "Classic Tee",
            size: "M",
            sku: "SKU-BLACK-M",
          },
        },
      ],
      nextCursor: "next-inventory-page",
    });
  }

  listLocations() {
    return Promise.resolve({ hasMore: false, items: [], nextCursor: null });
  }

  listMovements() {
    return Promise.resolve({ hasMore: false, items: [], nextCursor: null });
  }
}

class FakeInventoryMovementRepository implements InventoryMovementRepository {
  lastPost: { movementId: string; organizationId: string } | null = null;

  createDraft(): Promise<InventoryMovement> {
    return Promise.reject(unreachableError());
  }

  findById(id: string, orgId: string): Promise<InventoryMovement | null> {
    return Promise.resolve(
      id === movementId ? baseMovement({ organizationId: orgId }) : null,
    );
  }

  findByIdempotencyKey(): Promise<InventoryMovement | null> {
    return Promise.resolve(null);
  }

  getPayloadSignature(): Promise<string | null> {
    return Promise.resolve(null);
  }

  list(): Promise<{
    hasMore: boolean;
    items: InventoryMovement[];
    nextCursor: null;
  }> {
    return Promise.resolve({ hasMore: false, items: [], nextCursor: null });
  }

  post(record: {
    movementId: string;
    organizationId: string;
  }): Promise<InventoryMovement> {
    this.lastPost = record;
    return Promise.resolve(
      baseMovement({ organizationId: record.organizationId, status: "POSTED" }),
    );
  }

  replaceDraftLines(): Promise<InventoryMovement> {
    return Promise.reject(unreachableError());
  }

  reversePostedMovement(): Promise<InventoryMovement> {
    return Promise.reject(unreachableError());
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
    private readonly inventoryMovementRepository: InventoryMovementRepository,
    private readonly auditWriter: AuditWriter,
  ) {}

  execute<TResult>(
    applicationContext: ValidatedApplicationExecutionContext,
    operation: Parameters<ApplicationTransactionManager["execute"]>[1],
  ): Promise<TResult> {
    return operation({
      applicationContext,
      auditWriter: this.auditWriter,
      inventoryMovementRepository: this.inventoryMovementRepository,
      salesOrderRepository: {
        createDraft: () => Promise.reject(unreachableError()),
        findByIdempotencyKey: () => Promise.reject(unreachableError()),
      },
    }) as Promise<TResult>;
  }
}

function baseMovement(
  overrides: Partial<InventoryMovement> = {},
): InventoryMovement {
  const timestamp = new Date("2026-07-03T00:00:00.000Z");
  return {
    consumesReservationId: null,
    createdAt: timestamp,
    destinationLocationId: null,
    id: movementId,
    idempotencyKey: "movement-123",
    isReservationConsumption: false,
    isReversal: false,
    isReversed: false,
    lines: [
      {
        createdAt: timestamp,
        id: "44444444-4444-4444-8444-444444444444",
        lineNumber: 1,
        movementId,
        note: null,
        organizationId,
        productVariantId,
        quantity: 2,
      },
    ],
    movementNumber: "MOVE-1",
    note: null,
    occurredAt: timestamp,
    organizationId,
    postedAt: overrides.status === "POSTED" ? timestamp : null,
    referenceId: null,
    referenceType: null,
    reversalReason: null,
    reversedByMovementId: null,
    reversesMovementId: null,
    sourceLocationId: null,
    status: "DRAFT",
    type: "RECEIPT",
    updatedAt: timestamp,
    version: 1,
    ...overrides,
  };
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
  return new Error("Unexpected repository call.");
}
