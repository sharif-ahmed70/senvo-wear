/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/require-await */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cancelSalesOrder,
  confirmSalesOrder,
  type OnlinePaymentProviderAdapter,
} from "@senvo/domain";
import {
  createPrismaClient,
  createTransactionScopedSalesOrderRepository,
  PrismaInventoryAvailabilityQueryRepository,
  PrismaOnlinePaymentRepository,
  PrismaSalesOrderRepository,
  PrismaStorefrontRepository,
  PrismaTransactionManager,
} from "@senvo/database";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import { OnlinePaymentApplicationService } from "../payment/online-payment-application-service.js";
import { StorefrontApplicationService } from "./storefront-application-service.js";
import { StorefrontReservationMaintenanceService } from "./storefront-reservation-maintenance-service.js";
import {
  StorefrontReservationNormalizationService,
  type CandidateManifestEntry,
} from "./storefront-reservation-normalization-service.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

type StorefrontFixture = {
  branch: { id: string };
  category: { id: string };
  color: { id: string };
  location: { id: string };
  movement: { id: string };
  organization: { code: string; id: string };
  policy: { id: string };
  product: { id: string };
  size: { id: string };
  variant: { id: string };
};

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type BlockedSession = {
  pid: number;
  query: string;
  wait_event_type: string;
  wait_event: string;
  blockers: number[];
};

async function getBlockedSessions(
  observerClient: ReturnType<typeof createPrismaClient>,
): Promise<BlockedSession[]> {
  const rows = await observerClient.$queryRaw<
    Array<{
      pid: number;
      query: string;
      wait_event_type: string;
      wait_event: string;
      blockers: number[];
    }>
  >`
    SELECT
      pid::int,
      query,
      wait_event_type,
      wait_event,
      pg_blocking_pids(pid)::int[] AS blockers
    FROM pg_stat_activity
    WHERE wait_event_type = 'Lock'
      AND cardinality(pg_blocking_pids(pid)) > 0
  `;
  return rows;
}

async function captureBaselineBlockedPids(
  observerClient: ReturnType<typeof createPrismaClient>,
): Promise<Set<number>> {
  const sessions = await getBlockedSessions(observerClient);
  return new Set(sessions.map((s) => s.pid));
}

async function waitForBlockedContender(
  observerClient: ReturnType<typeof createPrismaClient>,
  baselinePids: Set<number>,
  options?: {
    expectedQueryPattern?: RegExp | string;
    timeoutMs?: number;
  },
): Promise<BlockedSession> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const sessions = await getBlockedSessions(observerClient);
    for (const session of sessions) {
      if (!baselinePids.has(session.pid)) {
        if (options?.expectedQueryPattern) {
          const matches =
            typeof options.expectedQueryPattern === "string"
              ? session.query.includes(options.expectedQueryPattern)
              : options.expectedQueryPattern.test(session.query);
          if (matches) {
            return session;
          }
        } else {
          return session;
        }
      }
    }
  }

  throw new Error("TEST_BLOCKING_PROOF_TIMEOUT");
}

describe("StorefrontReservationNormalizationService PostgreSQL integration", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let observerPrisma: ReturnType<typeof createPrismaClient>;
  let availabilityRepo: PrismaInventoryAvailabilityQueryRepository;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    observerPrisma = createPrismaClient();
    availabilityRepo = new PrismaInventoryAvailabilityQueryRepository(
      observerPrisma,
    );
  });

  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), observerPrisma.$disconnect()]);
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  async function createLegacyStorefrontOrder(params: {
    fixture: StorefrontFixture;
    prismaClient?: ReturnType<typeof createPrismaClient>;
    quantity?: number;
    paymentPreference?: "CASH_ON_DELIVERY" | "ONLINE_PAYMENT";
    reservedAt?: Date;
    channel?: "STOREFRONT" | "POS" | "ADMIN";
    orderStatus?:
      "RESERVED" | "CONFIRMED" | "FULFILLED" | "CANCELLED" | "DRAFT";
    preserveExpiresAt?: boolean;
    skipDeletePaymentAttempt?: boolean;
  }) {
    const client = params.prismaClient ?? prisma;
    const quantity = params.quantity ?? 2;

    const storefrontRepo = new PrismaStorefrontRepository(client);
    const salesOrderRepo = new PrismaSalesOrderRepository(client);
    const transactionManager = new PrismaTransactionManager(
      client,
    ) as unknown as ApplicationTransactionManager;

    const testClock = { now: () => new Date() };

    const maintenanceService = new StorefrontReservationMaintenanceService({
      clock: testClock,
      salesOrderRepository: salesOrderRepo,
      transactionManager,
    });

    const paymentRepo = new PrismaOnlinePaymentRepository(client);
    const defaultProvider: OnlinePaymentProviderAdapter = {
      createSession: vi.fn(async () => ({
        expiresAt: null,
        redirectUrl: "https://sandbox.sslcommerz.com/redirect",
        sessionId: "session-1",
      })),
      enabled: true,
      initiateRefund: vi.fn(),
      queryRefund: vi.fn(),
      queryTransaction: vi.fn(),
      validateNotificationSignature: vi.fn(() => true),
      validateTransaction: vi.fn(async (validationId) => ({
        amountMinor: 129900 * quantity,
        bankTransactionId: "BANK-1",
        currencyCode: "BDT",
        providerStatus: "VALID",
        providerTransactionId: `TX-${randomUUID()}`,
        riskLevel: 0,
        status: "SUCCEEDED" as const,
        validationId: String(validationId),
      })),
    };

    const onlinePayments = new OnlinePaymentApplicationService({
      clock: testClock,
      provider: defaultProvider,
      repository: paymentRepo,
      transactionManager,
    });

    const storefront = new StorefrontApplicationService({
      clock: testClock,
      maintenanceService,
      onlinePayments,
      organizationCode: params.fixture.organization.code,
      repository: storefrontRepo,
      transactionManager,
    });

    const payload = {
      customer: { name: "Test Buyer", phone: "01711111111" },
      deliveryAddress: {
        city: "Dhaka",
        district: "Dhaka",
        line1: "Street 1",
      },
      idempotencyKey: `idem-norm-${randomUUID()}`,
      lines: [
        {
          productVariantId: params.fixture.variant.id,
          quantity,
          reviewedUnitPriceMinor: 129900,
        },
      ],
      paymentPreference:
        params.paymentPreference ?? ("CASH_ON_DELIVERY" as const),
    };

    const checkoutResult = await storefront.checkout(
      `req-${randomUUID()}`,
      payload,
    );
    if (!checkoutResult.ok) {
      throw new Error(`Checkout failed: ${JSON.stringify(checkoutResult)}`);
    }
    const orderId = checkoutResult.data.orderId;

    const reservation = await client.inventoryReservation.findFirstOrThrow({
      where: { referenceId: orderId, referenceType: "SALES_ORDER" },
    });

    const updates: Promise<any>[] = [];

    // Delete any online payment attempt created during checkout unless explicitly preserved,
    // so eligible legacy online orders have 0 payment attempts.
    if (
      params.paymentPreference === "ONLINE_PAYMENT" &&
      !params.skipDeletePaymentAttempt
    ) {
      await client.onlinePaymentAttempt.deleteMany({
        where: { salesOrderId: orderId },
      });
    }

    // Make it a legacy null-expiry reservation unless requested otherwise
    if (!params.preserveExpiresAt) {
      updates.push(
        client.inventoryReservation.update({
          where: { id: reservation.id },
          data: {
            expiresAt: null,
            ...(params.reservedAt ? { reservedAt: params.reservedAt } : {}),
          },
        }),
      );
    }

    if (params.reservedAt || params.channel || params.orderStatus) {
      updates.push(
        client.salesOrder.update({
          where: { id: orderId },
          data: {
            ...(params.reservedAt ? { reservedAt: params.reservedAt } : {}),
            ...(params.channel ? { salesChannel: params.channel } : {}),
            ...(params.orderStatus ? { status: params.orderStatus } : {}),
          },
        }),
      );
    }

    await Promise.all(updates);

    const order = await client.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    const updatedReservation =
      await client.inventoryReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });

    return {
      order,
      orderId,
      reservation: updatedReservation,
      reservationId: reservation.id,
    };
  }

  // TEST 1: Online payment still-valid null-expiry (+30m)
  it("normalizes still-valid online payment legacy reservation (+30m) without stock movement", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-10T11:45:00.000Z"); // 15m ago -> expiry 12:15:00 (future)

    try {
      const { orderId, reservationId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "ONLINE_PAYMENT",
        reservedAt,
      });

      const initialAvail = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(initialAvail.reservedQuantity).toBe(2);

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      const report = await service.executeApprovedManifest({
        approvedSalesOrderIds: [orderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report.totalProcessed).toBe(1);
      expect(report.committedCount).toBe(1);
      expect(report.reclaimedCount).toBe(0);
      expect(report.details[0]?.status).toBe("NORMALIZED_VALID");
      expect(report.details[0]?.status).toBe("NORMALIZED_STILL_VALID");

      const updatedRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(updatedRsv.expiresAt).toEqual(
        new Date("2026-09-10T12:15:00.000Z"),
      );
      expect(updatedRsv.status).toBe("ACTIVE");

      const updatedOrder = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(updatedOrder.status).toBe("RESERVED");

      // 0 stock movement
      const finalAvail = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(finalAvail.reservedQuantity).toBe(initialAvail.reservedQuantity);
      expect(finalAvail.availableQuantity).toBe(initialAvail.availableQuantity);

      // Exactly 1 normalization audit
      const audits = await observerPrisma.auditEntry.findMany({
        where: { organizationId: fixture.organization.id, resourceId: orderId },
      });
      expect(audits.length).toBe(1);
      expect(audits[0]?.action).toBe(
        "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
      );
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  // TEST 2: COD still-valid null-expiry (+24h)
  it("normalizes still-valid COD legacy reservation (+24h) without stock movement", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-10T02:00:00.000Z"); // 10h ago -> expiry 2026-09-11T02:00:00 (future)

    try {
      const { orderId, reservationId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "CASH_ON_DELIVERY",
        reservedAt,
      });

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      const report = await service.executeApprovedManifest({
        approvedSalesOrderIds: [orderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report.totalProcessed).toBe(1);
      expect(report.committedCount).toBe(1);
      expect(report.reclaimedCount).toBe(0);
      expect(report.details[0]?.status).toBe("NORMALIZED_VALID");
      expect(report.details[0]?.status).toBe("NORMALIZED_STILL_VALID");

      const updatedRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(updatedRsv.expiresAt).toEqual(
        new Date("2026-09-11T02:00:00.000Z"),
      );
      expect(updatedRsv.status).toBe("ACTIVE");
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  // TEST 3: Overdue online payment null-expiry (+30m)
  it("normalizes overdue online payment legacy reservation and atomically reclaims with 2 audits", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-10T11:00:00.000Z"); // 1h ago -> expiry 11:30:00 (past)

    try {
      const { orderId, reservationId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "ONLINE_PAYMENT",
        reservedAt,
      });

      const initialAvail = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(initialAvail.reservedQuantity).toBe(2);

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      const report = await service.executeApprovedManifest({
        approvedSalesOrderIds: [orderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report.totalProcessed).toBe(1);
      expect(report.committedCount).toBe(1);
      expect(report.reclaimedCount).toBe(1);
      expect(report.details[0]?.status).toBe("NORMALIZED_AND_RECLAIMED");

      const updatedRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(updatedRsv.expiresAt).toEqual(
        new Date("2026-09-10T11:30:00.000Z"),
      );
      expect(updatedRsv.status).toBe("EXPIRED");

      const updatedOrder = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(updatedOrder.status).toBe("CANCELLED");

      // Inventory released
      const finalAvail = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(finalAvail.reservedQuantity).toBe(0);
      expect(finalAvail.availableQuantity).toBe(
        initialAvail.availableQuantity + 2,
      );

      // Exactly 2 audits: STOREFRONT_RESERVATION_EXPIRY_NORMALIZED & STOREFRONT_RESERVATION_EXPIRED
      const audits = await observerPrisma.auditEntry.findMany({
        orderBy: { createdAt: "asc" },
        where: { organizationId: fixture.organization.id, resourceId: orderId },
      });
      expect(audits.length).toBe(2);
      expect(audits[0]?.action).toBe(
        "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
      );
      expect(audits[1]?.action).toBe("STOREFRONT_RESERVATION_EXPIRED");
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  // TEST 4: Overdue COD null-expiry (+24h)
  it("normalizes overdue COD legacy reservation and atomically reclaims", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-08T10:00:00.000Z"); // 50h ago -> expiry 2026-09-09T10:00:00 (past)

    try {
      const { orderId, reservationId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "CASH_ON_DELIVERY",
        reservedAt,
      });

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      const report = await service.executeApprovedManifest({
        approvedSalesOrderIds: [orderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report.totalProcessed).toBe(1);
      expect(report.committedCount).toBe(1);
      expect(report.reclaimedCount).toBe(1);
      expect(report.details[0]?.status).toBe("NORMALIZED_AND_RECLAIMED");

      const updatedRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(updatedRsv.status).toBe("EXPIRED");

      const updatedOrder = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(updatedOrder.status).toBe("CANCELLED");
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  // TEST 5: Payment attempt guard across statuses
  it("excludes rows with any online payment attempt across all statuses", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-10T11:00:00.000Z");

    const statuses = [
      "CREATED",
      "SESSION_READY",
      "PENDING",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
      "EXPIRED",
    ] as const;

    try {
      for (const status of statuses) {
        const { orderId, reservationId } = await createLegacyStorefrontOrder({
          fixture,
          paymentPreference: "ONLINE_PAYMENT",
          reservedAt,
        });

        // Add payment attempt in current status
        await prisma.onlinePaymentAttempt.create({
          data: {
            amountMinor: 259800,
            currencyCode: "BDT",
            expiresAt: new Date("2026-09-10T11:30:00.000Z"),
            idempotencyKey: `pay-${status}-${randomUUID()}`,
            organizationId: fixture.organization.id,
            provider: "SSLCOMMERZ",
            providerTransactionId: `TX-${randomUUID()}`,
            publicToken: `token-${randomUUID()}`,
            requestSignature: "sig",
            salesOrderId: orderId,
            status,
            version: 1,
          },
        });

        const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
        const transactionManager = new PrismaTransactionManager(
          prisma,
        ) as unknown as ApplicationTransactionManager;

        const service = new StorefrontReservationNormalizationService({
          clock: { now: () => now },
          salesOrderRepository: salesOrderRepo,
          transactionManager,
        });

        // 1. Candidate discovery must exclude it
        const dryRun = await service.dryRun({
          cutoff: now,
          organizationId: fixture.organization.id,
        });
        const found = dryRun.manifest.candidates.some(
          (c: CandidateManifestEntry) => c.salesOrderId === orderId,
        );
        expect(found).toBe(false);

        // 2. Execution must defer it
        const report = await service.executeApprovedManifest({
          approvedSalesOrderIds: [orderId],
          cutoff: now,
          organizationId: fixture.organization.id,
        });
        expect(report.totalProcessed).toBe(1);
        expect(report.deferredCount).toBe(1);
        expect(report.committedCount).toBe(0);
        expect(report.details[0]?.status).toBe("DEFERRED_PAYMENT_EXPOSED");
        expect(report.details[0]?.status).toBe("DEFERRED");
        expect(report.details[0]?.skipOrDeferReason).toBe("PAYMENT_EXPOSED");

        // Verify untouched
        const rsv = await observerPrisma.inventoryReservation.findUniqueOrThrow(
          {
            where: { id: reservationId },
          },
        );
        expect(rsv.expiresAt).toBeNull();
        expect(rsv.status).toBe("ACTIVE");
      }
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  // TEST 6: Payment batch exclusion
  it("excludes rows associated with a payment batch", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-10T11:00:00.000Z");

    try {
      const { orderId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "CASH_ON_DELIVERY",
        reservedAt,
      });

      await prisma.paymentBatch.create({
        data: {
          currencyCode: "BDT",
          idempotencyKey: `idem-${randomUUID()}`,
          organizationId: fixture.organization.id,
          outstandingMinor: 259800,
          paidMinor: 0,
          payableMinor: 259800,
          requestSignature: "sig",
          salesOrderId: orderId,
          status: "UNPAID",
        },
      });

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      const report = await service.executeApprovedManifest({
        approvedSalesOrderIds: [orderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report.totalProcessed).toBe(1);
      expect(report.deferredCount).toBe(1);
      expect(report.details[0]?.status).toBe("DEFERRED_PAYMENT_BATCH_EXPOSED");
      expect(report.details[0]?.status).toBe("DEFERRED");
      expect(report.details[0]?.skipOrDeferReason).toBe(
        "PAYMENT_BATCH_EXPOSED",
      );
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  // TEST 7: Keyset pagination without duplicates or skipped rows
  it("discovers candidates across multiple pages using keyset pagination without skips", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");

    try {
      const orderIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const reservedAt = new Date(
          new Date("2026-09-10T10:00:00.000Z").getTime() + i * 60000,
        );
        const { orderId } = await createLegacyStorefrontOrder({
          fixture,
          paymentPreference: "CASH_ON_DELIVERY",
          reservedAt,
        });
        orderIds.push(orderId);
      }

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      // Scan with small batch size of 2 to force keyset pagination across 3 batches
      const dryRun = await service.dryRun({
        batchSize: 2,
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(dryRun.candidatesFound).toBe(5);
      const discoveredIds = dryRun.manifest.candidates.map(
        (c: CandidateManifestEntry) => c.salesOrderId,
      );
      for (const id of orderIds) {
        expect(discoveredIds).toContain(id);
      }
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  // TEST 8: Cross-tenant isolation
  it("strictly isolates legacy candidates by organization ID", async () => {
    const fixtureA = await createFixture(prisma);
    const fixtureB = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");

    try {
      const { orderId: orderA } = await createLegacyStorefrontOrder({
        fixture: fixtureA,
        reservedAt: new Date("2026-09-10T10:00:00.000Z"),
      });
      const { orderId: orderB } = await createLegacyStorefrontOrder({
        fixture: fixtureB,
        reservedAt: new Date("2026-09-10T10:00:00.000Z"),
      });

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      const reportA = await service.dryRun({
        cutoff: now,
        organizationId: fixtureA.organization.id,
      });

      expect(
        reportA.manifest.candidates.some(
          (c: CandidateManifestEntry) => c.salesOrderId === orderA,
        ),
      ).toBe(true);
      expect(
        reportA.manifest.candidates.some(
          (c: CandidateManifestEntry) => c.salesOrderId === orderB,
        ),
      ).toBe(false);

      // Attempting to normalize orderB under orgA must fail or be skipped
      const execReport = await service.executeApprovedManifest({
        approvedSalesOrderIds: [orderB],
        cutoff: now,
        organizationId: fixtureA.organization.id,
      });
      expect(execReport.skippedCount).toBe(1);
    } finally {
      await Promise.all([
        cleanupFixture(prisma, fixtureA),
        cleanupFixture(prisma, fixtureB),
      ]);
    }
  });

  // CONTENTION PROOF A: Two normalizers racing on same row
  it("proves PostgreSQL row lock contention between concurrent normalizers and prevents double reclaim", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-09T10:00:00.000Z"); // 26h ago (overdue for COD 24h TTL)

    const normalizerHeld = createDeferred();
    const releaseNormalizer = createDeferred();

    try {
      const { orderId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "CASH_ON_DELIVERY",
        reservedAt,
      });

      // Normalizer 1 holds row lock inside transaction
      const normalizer1Promise = prisma.$transaction(async (tx) => {
        const repo = createTransactionScopedSalesOrderRepository(tx);
        const result = await repo.normalizeLegacyStorefrontReservation({
          cutoff: now,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
        normalizerHeld.resolve();
        await releaseNormalizer.promise;
        return result;
      });

      // Signal: NORMALIZER_HELD
      await normalizerHeld.promise;

      // Capture baseline
      const baseline = await captureBaselineBlockedPids(observerPrisma);

      // Normalizer 2 starts on client2 and contends on row lock
      const repo2 = new PrismaSalesOrderRepository(client2);
      const normalizer2Promise = repo2.normalizeLegacyStorefrontReservation({
        cutoff: now,
        organizationId: fixture.organization.id,
        salesOrderId: orderId,
      });

      // PROVE contention: Normalizer 2 is blocked on sales_orders row lock
      await waitForBlockedContender(observerPrisma, baseline, {
        expectedQueryPattern: /sales_orders/i,
      });

      // Release Normalizer 1
      releaseNormalizer.resolve();

      const [res1, res2] = await Promise.all([
        normalizer1Promise,
        normalizer2Promise,
      ]);

      expect(res1.status).toBe("NORMALIZED_AND_RECLAIMED");
      expect(res1.reclaimed).toBe(true);

      // Normalizer 2 must detect row was already normalized/reclaimed and skip
      expect(res2.reclaimed).toBe(false);
      expect(res2.status).toMatch(/ALREADY_/);

      // Exactly 2 audits total (from first normalizer)
      const audits = await observerPrisma.auditEntry.findMany({
        where: { organizationId: fixture.organization.id, resourceId: orderId },
      });
      expect(audits.length).toBe(2);
      expect(res2.status).toBe("SKIPPED");
      expect(res2.skipOrDeferReason).toBe("ALREADY_NORMALIZED");
    } finally {
      releaseNormalizer.resolve();
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  // CONTENTION PROOF B: Normalizer vs confirmation race
  it("proves PostgreSQL row lock contention between normalizer and confirmation", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-09T10:00:00.000Z"); // 26h ago (overdue for COD 24h TTL)

    const normalizerHeld = createDeferred();
    const releaseNormalizer = createDeferred();

    try {
      const { order, orderId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "CASH_ON_DELIVERY",
        reservedAt,
      });

      // Normalizer holds row lock
      const normalizerPromise = prisma.$transaction(async (tx) => {
        const repo = createTransactionScopedSalesOrderRepository(tx);
        const result = await repo.normalizeLegacyStorefrontReservation({
          cutoff: now,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
        normalizerHeld.resolve();
        await releaseNormalizer.promise;
        return result;
      });

      await normalizerHeld.promise;

      // Capture baseline
      const baseline = await captureBaselineBlockedPids(observerPrisma);

      // Confirmation contends on client2
      const confirmPromise = client2.$transaction(async (tx) => {
        const txSales = createTransactionScopedSalesOrderRepository(tx);
        return confirmSalesOrder(txSales, {
          expectedVersion: order.version,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      });

      // PROVE contention: confirmation is blocked on sales_orders row lock
      await waitForBlockedContender(observerPrisma, baseline, {
        expectedQueryPattern: /sales_orders/i,
      });

      // Release normalizer
      releaseNormalizer.resolve();

      const [normRes, confirmResult] = await Promise.allSettled([
        normalizerPromise,
        confirmPromise,
      ]);

      expect(normRes.status).toBe("fulfilled");
      if (normRes.status === "fulfilled") {
        expect(normRes.value.status).toBe("NORMALIZED_AND_RECLAIMED");
      }

      // Confirmation fails because order was reclaimed and cancelled by normalizer
      expect(confirmResult.status).toBe("rejected");
    } finally {
      releaseNormalizer.resolve();
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  // CONTENTION PROOF C: Normalizer vs cancellation race
  it("proves PostgreSQL row lock contention between normalizer and cancellation", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-09T10:00:00.000Z"); // 26h ago (overdue for COD 24h TTL)

    const normalizerHeld = createDeferred();
    const releaseNormalizer = createDeferred();

    try {
      const { order, orderId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "CASH_ON_DELIVERY",
        reservedAt,
      });

      const normalizerPromise = prisma.$transaction(async (tx) => {
        const repo = createTransactionScopedSalesOrderRepository(tx);
        const result = await repo.normalizeLegacyStorefrontReservation({
          cutoff: now,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
        normalizerHeld.resolve();
        await releaseNormalizer.promise;
        return result;
      });

      await normalizerHeld.promise;
      const baseline = await captureBaselineBlockedPids(observerPrisma);

      const cancelPromise = client2.$transaction(async (tx) => {
        const txSales = createTransactionScopedSalesOrderRepository(tx);
        return cancelSalesOrder(txSales, {
          expectedVersion: order.version,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      });

      await waitForBlockedContender(observerPrisma, baseline, {
        expectedQueryPattern: /sales_orders/i,
      });

      releaseNormalizer.resolve();

      const [normRes, cancelResult] = await Promise.allSettled([
        normalizerPromise,
        cancelPromise,
      ]);

      expect(normRes.status).toBe("fulfilled");
      // Cancellation after order is already cancelled should fail with ConcurrencyError
      expect(cancelResult.status).toBe("rejected");
    } finally {
      releaseNormalizer.resolve();
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  // CONTENTION PROOF D: Payment attempt insertion races normalizer eligibility
  it("defers normalization if payment attempt is inserted before normalizer acquires lock", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-10T11:00:00.000Z");

    try {
      const { orderId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "ONLINE_PAYMENT",
        reservedAt,
      });

      // Insert payment attempt on client2 right before normalizer executes
      await client2.onlinePaymentAttempt.create({
        data: {
          amountMinor: 259800,
          currencyCode: "BDT",
          expiresAt: new Date("2026-09-10T11:30:00.000Z"),
          idempotencyKey: `race-pay-${randomUUID()}`,
          organizationId: fixture.organization.id,
          provider: "SSLCOMMERZ",
          providerTransactionId: `TX-${randomUUID()}`,
          publicToken: `token-${randomUUID()}`,
          requestSignature: "sig",
          salesOrderId: orderId,
          status: "CREATED",
          version: 1,
        },
      });

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const res = await salesOrderRepo.normalizeLegacyStorefrontReservation({
        cutoff: now,
        organizationId: fixture.organization.id,
        salesOrderId: orderId,
      });

      expect(res.status).toBe("DEFERRED_PAYMENT_EXPOSED");
      expect(res.status).toBe("DEFERRED");
      expect(res.skipOrDeferReason).toBe("PAYMENT_EXPOSED");
      expect(res.reclaimed).toBe(false);

      const dbOrder = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(dbOrder.status).toBe("RESERVED");
    } finally {
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  // AUDIT ROLLBACK PROOF: Real transaction rollback upon failure
  it("rolls back all normalization mutations and audits when an error occurs in transaction", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-09T10:00:00.000Z"); // 26h ago (overdue for COD 24h TTL)

    try {
      const { orderId, reservationId, order } =
        await createLegacyStorefrontOrder({
          fixture,
          paymentPreference: "CASH_ON_DELIVERY",
          reservedAt,
        });

      const failingTxManager: ApplicationTransactionManager = {
        execute: async (ctx, op) => {
          return prisma.$transaction(async (tx) => {
            const txContext = {
              applicationContext: ctx,
              auditWriter: {
                recordWithinTransaction: async () => {
                  throw new Error("SIMULATED_AUDIT_FAILURE");
                },
              },
              salesOrderLifecycleRepository:
                createTransactionScopedSalesOrderRepository(tx),
            };
            return op(txContext as never);
          });
        },
      };

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager: failingTxManager,
      });

      await expect(
        service.executeApprovedManifest({
          approvedSalesOrderIds: [orderId],
          cutoff: now,
          organizationId: fixture.organization.id,
        }),
      ).rejects.toThrow("SIMULATED_AUDIT_FAILURE");

      // Verify full rollback
      const rolledBackOrder = await observerPrisma.salesOrder.findUniqueOrThrow(
        {
          where: { id: orderId },
        },
      );
      expect(rolledBackOrder.status).toBe("RESERVED");
      expect(rolledBackOrder.version).toBe(order.version);

      const rolledBackRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(rolledBackRsv.expiresAt).toBeNull();
      expect(rolledBackRsv.status).toBe("ACTIVE");

      const audits = await observerPrisma.auditEntry.findMany({
        where: { organizationId: fixture.organization.id, resourceId: orderId },
      });
      expect(audits.length).toBe(0);
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  // TEST: Future cutoff rejection produces zero mutations and zero audits
  it("rejects future cutoff before starting mutations and leaves database completely untouched", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const futureCutoff = new Date("2026-09-10T13:00:00.000Z");
    const reservedAt = new Date("2026-09-10T11:00:00.000Z");

    try {
      const { orderId, reservationId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "ONLINE_PAYMENT",
        reservedAt,
      });

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      await expect(
        service.executeApprovedManifest({
          approvedSalesOrderIds: [orderId],
          cutoff: futureCutoff,
          organizationId: fixture.organization.id,
        }),
      ).rejects.toThrow("Cutoff timestamp cannot be in the future.");

      // Database state must be 100% untouched
      const untouchedOrder = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(untouchedOrder.status).toBe("RESERVED");

      const untouchedRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(untouchedRsv.expiresAt).toBeNull();
      expect(untouchedRsv.status).toBe("ACTIVE");

      const audits = await observerPrisma.auditEntry.findMany({
        where: { organizationId: fixture.organization.id, resourceId: orderId },
      });
      expect(audits.length).toBe(0);
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  // TEST: Manifest cutoff/policy binding rejection
  it("rejects execution when manifest policy version is unsupported or cutoff conflicts", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-10T11:00:00.000Z");

    try {
      const { orderId, reservationId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "ONLINE_PAYMENT",
        reservedAt,
      });

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      // 1. Unsupported policy version
      await expect(
        service.executeApprovedManifest({
          approvedManifest: {
            candidates: [],
            cutoff: now.toISOString(),
            generatedAt: now.toISOString(),
            organizationId: fixture.organization.id,
            policyVersion: "phase-unknown" as unknown as "phase-2b-v1",
            totalCandidates: 0,
          },
          organizationId: fixture.organization.id,
        }),
      ).rejects.toThrow("Unsupported policy version");

      // 2. Conflicting cutoff override
      await expect(
        service.executeApprovedManifest({
          approvedManifest: {
            candidates: [],
            cutoff: "2026-09-10T10:00:00.000Z",
            generatedAt: now.toISOString(),
            organizationId: fixture.organization.id,
            policyVersion: "phase-2b-v1",
            totalCandidates: 0,
          },
          cutoff: new Date("2026-09-10T11:00:00.000Z"),
          organizationId: fixture.organization.id,
        }),
      ).rejects.toThrow("Conflicting cutoff override");

      const untouched = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(untouched.status).toBe("RESERVED");

      const untouchedRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(untouchedRsv.expiresAt).toBeNull();
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  // TEST: Rerun idempotency
  it("proves rerun idempotency: second run skips already normalized order without duplicate reclaim", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-09T10:00:00.000Z"); // 26h ago (overdue COD)

    try {
      const { orderId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "CASH_ON_DELIVERY",
        reservedAt,
      });

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      // First run: normalizes and reclaims
      const report1 = await service.executeApprovedManifest({
        approvedSalesOrderIds: [orderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report1.totalProcessed).toBe(1);
      expect(report1.committedCount).toBe(1);
      expect(report1.reclaimedCount).toBe(1);
      expect(report1.details[0]?.status).toBe("NORMALIZED_AND_RECLAIMED");

      const availAfterFirstRun = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });

      // Second run on same order: must skip
      const report2 = await service.executeApprovedManifest({
        approvedSalesOrderIds: [orderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report2.totalProcessed).toBe(1);
      expect(report2.committedCount).toBe(0);
      expect(report2.reclaimedCount).toBe(0);
      expect(report2.skippedCount).toBe(1);
      expect(report2.details[0]?.status).toBe("SKIPPED");
      expect(report2.details[0]?.skipOrDeferReason).toBe("ALREADY_NORMALIZED");

      // Availability must not change on rerun
      const availAfterSecondRun = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(availAfterSecondRun.availableQuantity).toBe(
        availAfterFirstRun.availableQuantity,
      );
      expect(availAfterSecondRun.reservedQuantity).toBe(
        availAfterFirstRun.reservedQuantity,
      );

      // Audit entries count must remain 2 (no duplicate audits created on rerun)
      const audits = await observerPrisma.auditEntry.findMany({
        where: { organizationId: fixture.organization.id, resourceId: orderId },
      });
      expect(audits.length).toBe(2);
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  // TEST: Dry-run payment attempt and batch classification
  it("classifies payment exposed rows in dry-run exclusion counts", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-10T11:00:00.000Z");

    try {
      // 1. Order with payment attempt preserved
      const { orderId: orderWithAttempt } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "ONLINE_PAYMENT",
        reservedAt,
        skipDeletePaymentAttempt: true,
      });

      // 2. Order with payment batch
      const { orderId: orderWithBatch } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "CASH_ON_DELIVERY",
        reservedAt,
      });
      await prisma.paymentBatch.create({
        data: {
          currencyCode: "BDT",
          idempotencyKey: `batch-dry-${randomUUID()}`,
          organizationId: fixture.organization.id,
          outstandingMinor: 259800,
          paidMinor: 0,
          payableMinor: 259800,
          requestSignature: "sig",
          salesOrderId: orderWithBatch,
          status: "UNPAID",
        },
      });

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      const report = await service.dryRun({
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report.exclusionCounts.PAYMENT_EXPOSED).toBeGreaterThanOrEqual(1);
      expect(
        report.exclusionCounts.PAYMENT_BATCH_EXPOSED,
      ).toBeGreaterThanOrEqual(1);

      const candidateIds = report.manifest.candidates.map(
        (c: CandidateManifestEntry) => c.salesOrderId,
      );
      expect(candidateIds).not.toContain(orderWithAttempt);
      expect(candidateIds).not.toContain(orderWithBatch);
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });
});

async function createFixture(
  client: ReturnType<typeof createPrismaClient>,
): Promise<StorefrontFixture> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const organization = await client.organization.create({
    data: {
      code: `SENVO_${suffix}`.slice(0, 12).toUpperCase(),
      name: `SENVO Wear ${suffix}`,
    },
  });

  const branch = await client.branch.create({
    data: {
      code: `BR-${suffix}`,
      name: `Branch ${suffix}`,
      organizationId: organization.id,
    },
  });

  const location = await client.stockLocation.create({
    data: {
      branchId: branch.id,
      code: `LOC-${suffix}`,
      isSellable: true,
      name: `Location ${suffix}`,
      organizationId: organization.id,
      status: "ACTIVE",
      type: "WAREHOUSE",
    },
  });

  const category = await client.category.create({
    data: {
      name: `Category ${suffix}`,
      organizationId: organization.id,
      slug: `category-${suffix.toLowerCase()}`,
    },
  });

  const color = await client.color.create({
    data: {
      code: `COL-${suffix}`,
      name: `Color ${suffix}`,
      normalizedName: `color-${suffix.toLowerCase()}`,
      organizationId: organization.id,
    },
  });

  const size = await client.size.create({
    data: {
      code: `SZ-${suffix}`,
      name: `Size ${suffix}`,
      organizationId: organization.id,
    },
  });

  const product = await client.product.create({
    data: {
      categoryId: category.id,
      name: `Everyday Tee ${suffix}`,
      organizationId: organization.id,
      productCode: `PROD-${suffix}`,
      slug: `everyday-tee-${suffix}`.toLowerCase(),
      status: "ACTIVE",
    },
  });

  const variant = await client.productVariant.create({
    data: {
      colorId: color.id,
      organizationId: organization.id,
      productId: product.id,
      sellingPriceMinor: 129900,
      sizeId: size.id,
      sku: `SKU-${suffix}`,
      status: "ACTIVE",
    },
  });

  const policy = await client.inventoryAllocationPolicy.create({
    data: {
      code: `POLICY-${suffix}`,
      name: `Policy ${suffix}`,
      organizationId: organization.id,
      status: "ACTIVE",
    },
  });

  await client.inventoryAllocationPolicyLocation.create({
    data: {
      isEnabled: true,
      organizationId: organization.id,
      policyId: policy.id,
      priority: 1,
      stockLocationId: location.id,
    },
  });

  const movement = await client.inventoryMovement.create({
    data: {
      destinationLocationId: location.id,
      idempotencyKey: `seed-${suffix}`,
      movementNumber: `MOVE-${suffix}`,
      occurredAt: new Date(),
      organizationId: organization.id,
      payloadSignature: "{}",
      postedAt: new Date(),
      status: "POSTED",
      type: "OPENING",
      version: 2,
    },
  });

  await client.inventoryMovementLine.create({
    data: {
      lineNumber: 1,
      movementId: movement.id,
      organizationId: organization.id,
      productVariantId: variant.id,
      quantity: 5,
    },
  });

  return {
    branch,
    category,
    color,
    location,
    movement,
    organization,
    policy,
    product,
    size,
    variant,
  };
}

async function cleanupFixture(
  client: ReturnType<typeof createPrismaClient>,
  fixture: StorefrontFixture,
) {
  const organizationId = fixture.organization.id;
  await client.auditEntry.deleteMany({ where: { organizationId } });
  await client.paymentReconciliation.deleteMany({ where: { organizationId } });
  await client.providerNotification.deleteMany({ where: { organizationId } });
  await client.paymentLine.deleteMany({ where: { organizationId } });
  await client.paymentBatch.deleteMany({ where: { organizationId } });
  await client.onlinePaymentAttempt.deleteMany({ where: { organizationId } });
  await client.salesOrderCommerceProfile.deleteMany({
    where: { organizationId },
  });
  await client.salesOrderLine.deleteMany({ where: { organizationId } });
  await client.salesOrder.deleteMany({ where: { organizationId } });
  await client.inventoryReservationLine.deleteMany({
    where: { organizationId },
  });
  await client.inventoryReservation.deleteMany({ where: { organizationId } });
  await client.inventoryMovementLine.deleteMany({ where: { organizationId } });
  await client.inventoryMovement.deleteMany({ where: { organizationId } });
  await client.inventoryAllocationPolicyLocation.deleteMany({
    where: { organizationId },
  });
  await client.inventoryAllocationPolicy.deleteMany({
    where: { organizationId },
  });
  await client.productVariant.deleteMany({ where: { organizationId } });
  await client.product.deleteMany({ where: { organizationId } });
  await client.size.deleteMany({ where: { organizationId } });
  await client.color.deleteMany({ where: { organizationId } });
  await client.category.deleteMany({ where: { organizationId } });
  await client.stockLocation.deleteMany({ where: { organizationId } });
  await client.branch.deleteMany({ where: { organizationId } });
  await client.organization.deleteMany({ where: { id: organizationId } });
}
