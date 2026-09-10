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

type PrismaTransactionClient = Parameters<
  Parameters<ReturnType<typeof createPrismaClient>["$transaction"]>[0]
>[0];

async function getBackendPid(
  clientOrTx: ReturnType<typeof createPrismaClient> | PrismaTransactionClient,
): Promise<number> {
  const rows = await clientOrTx.$queryRaw<Array<{ pid: number }>>`
    SELECT pg_backend_pid()::int AS pid
  `;
  const pid = rows[0]?.pid;
  if (!pid) {
    throw new Error("FAILED_TO_GET_BACKEND_PID");
  }
  return pid;
}

async function waitForBlockerRelationship(
  observerClient: ReturnType<typeof createPrismaClient>,
  blockedPid: number,
  blockerPid: number,
  options?: { timeoutMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const rows = await observerClient.$queryRaw<Array<{ blockers: number[] }>>`
      SELECT pg_blocking_pids(${blockedPid})::int[] AS blockers
    `;
    if (rows[0]?.blockers?.includes(blockerPid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(
    `TEST_BLOCKING_PROOF_TIMEOUT: pid ${blockedPid} is not blocked by blocker ${blockerPid}`,
  );
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

    // Make it a legacy null-expiry reservation unless requested otherwise.
    // InventoryReservation does not have reservedAt; only valid reservation fields are updated.
    if (!params.preserveExpiresAt) {
      updates.push(
        client.inventoryReservation.update({
          where: { id: reservation.id },
          data: {
            expiresAt: null,
          },
        }),
      );
    }

    // SalesOrder.reservedAt is authoritative and preserved here.
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
        applicationTime: now,
        approvedSalesOrderIds: [orderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report.totalProcessed).toBe(1);
      expect(report.committedCount).toBe(1);
      expect(report.reclaimedCount).toBe(0);
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
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
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
        applicationTime: now,
        approvedSalesOrderIds: [orderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report.totalProcessed).toBe(1);
      expect(report.committedCount).toBe(1);
      expect(report.reclaimedCount).toBe(0);
      expect(report.details[0]?.status).toBe("NORMALIZED_STILL_VALID");

      const updatedRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(updatedRsv.expiresAt).toEqual(
        new Date("2026-09-11T02:00:00.000Z"),
      );
      expect(updatedRsv.status).toBe("ACTIVE");

      const audits = await observerPrisma.auditEntry.findMany({
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
      });
      expect(audits.length).toBe(1);
      expect(audits[0]?.action).toBe(
        "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
      );
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
        applicationTime: now,
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
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
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
        applicationTime: now,
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

      const audits = await observerPrisma.auditEntry.findMany({
        orderBy: { createdAt: "asc" },
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
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
          applicationTime: now,
          approvedSalesOrderIds: [orderId],
          cutoff: now,
          organizationId: fixture.organization.id,
        });
        expect(report.totalProcessed).toBe(1);
        expect(report.deferredCount).toBe(1);
        expect(report.committedCount).toBe(0);
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

        const audits = await observerPrisma.auditEntry.findMany({
          where: {
            action: {
              in: [
                "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
                "STOREFRONT_RESERVATION_EXPIRED",
              ],
            },
            organizationId: fixture.organization.id,
            resourceId: orderId,
          },
        });
        expect(audits.length).toBe(0);
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
      const { orderId, reservationId } = await createLegacyStorefrontOrder({
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
        applicationTime: now,
        approvedSalesOrderIds: [orderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report.totalProcessed).toBe(1);
      expect(report.deferredCount).toBe(1);
      expect(report.committedCount).toBe(0);
      expect(report.details[0]?.status).toBe("DEFERRED");
      expect(report.details[0]?.skipOrDeferReason).toBe(
        "PAYMENT_BATCH_EXPOSED",
      );

      const rsv = await observerPrisma.inventoryReservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      expect(rsv.expiresAt).toBeNull();
      expect(rsv.status).toBe("ACTIVE");

      const audits = await observerPrisma.auditEntry.findMany({
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
      });
      expect(audits.length).toBe(0);
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
      const { orderId: orderA, reservationId: rsvA } =
        await createLegacyStorefrontOrder({
          fixture: fixtureA,
          reservedAt: new Date("2026-09-10T10:00:00.000Z"),
        });
      const { orderId: orderB, reservationId: rsvB } =
        await createLegacyStorefrontOrder({
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

      // Attempting to normalize orderB under orgA must be skipped
      const execReport = await service.executeApprovedManifest({
        applicationTime: now,
        approvedSalesOrderIds: [orderB],
        cutoff: now,
        organizationId: fixtureA.organization.id,
      });
      expect(execReport.skippedCount).toBe(1);
      expect(execReport.committedCount).toBe(0);

      // Both tenant orders and reservations must remain completely untouched
      const dbOrderA = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderA },
      });
      const dbRsvA =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: rsvA },
        });
      expect(dbOrderA.status).toBe("RESERVED");
      expect(dbRsvA.expiresAt).toBeNull();
      expect(dbRsvA.status).toBe("ACTIVE");

      const dbOrderB = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderB },
      });
      const dbRsvB =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: rsvB },
        });
      expect(dbOrderB.status).toBe("RESERVED");
      expect(dbRsvB.expiresAt).toBeNull();
      expect(dbRsvB.status).toBe("ACTIVE");

      const auditsA = await observerPrisma.auditEntry.findMany({
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixtureA.organization.id,
        },
      });
      expect(auditsA.length).toBe(0);

      const auditsB = await observerPrisma.auditEntry.findMany({
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixtureB.organization.id,
        },
      });
      expect(auditsB.length).toBe(0);
    } finally {
      await Promise.all([
        cleanupFixture(prisma, fixtureA),
        cleanupFixture(prisma, fixtureB),
      ]);
    }
  });

  // CONTENTION PROOF A: Two normalizers racing on same row (PID-linked)
  it("proves PostgreSQL row lock contention between concurrent normalizers and prevents double reclaim", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-09T10:00:00.000Z"); // 26h ago (overdue for COD 24h TTL)

    const winnerHeld = createDeferred<number>();
    const releaseWinner = createDeferred<void>();
    const contenderPidDeferred = createDeferred<number>();

    try {
      const { orderId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "CASH_ON_DELIVERY",
        reservedAt,
      });

      // Normalizer 1 (winner) locks sales order row FOR UPDATE inside transaction
      const normalizer1Promise = prisma.$transaction(async (tx) => {
        const winnerPid = await getBackendPid(tx);
        await tx.$executeRaw`
          SELECT id
          FROM sales_orders
          WHERE id = ${orderId}::uuid
            AND organization_id = ${fixture.organization.id}::uuid
          FOR UPDATE
        `;
        winnerHeld.resolve(winnerPid);
        await releaseWinner.promise;
        const repo = createTransactionScopedSalesOrderRepository(tx);
        return repo.normalizeLegacyStorefrontReservation({
          applicationTime: now,
          cutoff: now,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      });

      const winnerPid = await winnerHeld.promise;

      // Normalizer 2 (contender) starts on client2 and contends for the row lock
      const normalizer2Promise = client2.$transaction(async (tx) => {
        const contenderPid = await getBackendPid(tx);
        contenderPidDeferred.resolve(contenderPid);
        const repo2 = createTransactionScopedSalesOrderRepository(tx);
        return repo2.normalizeLegacyStorefrontReservation({
          applicationTime: now,
          cutoff: now,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      });

      const contenderPid = await contenderPidDeferred.promise;

      // PROVE contention: contender is blocked by winner PID in pg_blocking_pids
      await waitForBlockerRelationship(observerPrisma, contenderPid, winnerPid);

      // Release winner only after blocker relationship is proven
      releaseWinner.resolve();

      const [res1, res2] = await Promise.all([
        normalizer1Promise,
        normalizer2Promise,
      ]);

      expect(res1.status).toBe("NORMALIZED_AND_RECLAIMED");
      expect(res1.reclaimed).toBe(true);

      // Normalizer 2 unblocks, observes terminal status, and skips
      expect(res2.reclaimed).toBe(false);
      expect(res2.status).toBe("SKIPPED");
      expect(res2.skipOrDeferReason).toBe("TERMINAL_ORDER");

      // Verify exact DB state
      const dbOrder = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(dbOrder.status).toBe("CANCELLED");

      // Direct repository contention produces 0 application audits
      const audits = await observerPrisma.auditEntry.findMany({
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
      });
      expect(audits.length).toBe(0);
    } finally {
      releaseWinner.resolve();
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  // CONTENTION PROOF B: Normalizer vs confirmation race (PID-linked)
  it("proves PostgreSQL row lock contention between normalizer and confirmation", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-09T10:00:00.000Z"); // 26h ago (overdue for COD 24h TTL)

    const winnerHeld = createDeferred<number>();
    const releaseWinner = createDeferred<void>();
    const contenderPidDeferred = createDeferred<number>();

    try {
      const { order, orderId, reservationId } =
        await createLegacyStorefrontOrder({
          fixture,
          paymentPreference: "CASH_ON_DELIVERY",
          reservedAt,
        });

      // Normalizer (winner) holds sales order FOR UPDATE
      const normalizerPromise = prisma.$transaction(async (tx) => {
        const winnerPid = await getBackendPid(tx);
        await tx.$executeRaw`
          SELECT id
          FROM sales_orders
          WHERE id = ${orderId}::uuid
            AND organization_id = ${fixture.organization.id}::uuid
          FOR UPDATE
        `;
        winnerHeld.resolve(winnerPid);
        await releaseWinner.promise;
        const repo = createTransactionScopedSalesOrderRepository(tx);
        return repo.normalizeLegacyStorefrontReservation({
          applicationTime: now,
          cutoff: now,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      });

      const winnerPid = await winnerHeld.promise;

      // Confirmation (contender) contends on client2
      const confirmPromise = client2.$transaction(async (tx) => {
        const contenderPid = await getBackendPid(tx);
        contenderPidDeferred.resolve(contenderPid);
        const txSales = createTransactionScopedSalesOrderRepository(tx);
        return confirmSalesOrder(txSales, {
          expectedVersion: order.version,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      });

      const contenderPid = await contenderPidDeferred.promise;

      // PROVE contention: confirmation contender is blocked by normalizer winner
      await waitForBlockerRelationship(observerPrisma, contenderPid, winnerPid);

      // Release winner
      releaseWinner.resolve();

      const [normRes, confirmResult] = await Promise.allSettled([
        normalizerPromise,
        confirmPromise,
      ]);

      expect(normRes.status).toBe("fulfilled");
      if (normRes.status === "fulfilled") {
        expect(normRes.value.status).toBe("NORMALIZED_AND_RECLAIMED");
        expect(normRes.value.reclaimed).toBe(true);
      }

      // Confirmation fails because order was cancelled and reclaimed by normalizer
      expect(confirmResult.status).toBe("rejected");

      // Verify exact persisted order and reservation state and versions
      const finalOrder = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(finalOrder.status).toBe("CANCELLED");
      expect(finalOrder.version).toBe(order.version + 1);

      const finalRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(finalRsv.status).toBe("EXPIRED");
    } finally {
      releaseWinner.resolve();
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  // CONTENTION PROOF C: Normalizer vs cancellation race (PID-linked)
  it("proves PostgreSQL row lock contention between normalizer and cancellation", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-09T10:00:00.000Z"); // 26h ago (overdue for COD 24h TTL)

    const winnerHeld = createDeferred<number>();
    const releaseWinner = createDeferred<void>();
    const contenderPidDeferred = createDeferred<number>();

    try {
      const { order, orderId, reservationId } =
        await createLegacyStorefrontOrder({
          fixture,
          paymentPreference: "CASH_ON_DELIVERY",
          reservedAt,
        });

      const normalizerPromise = prisma.$transaction(async (tx) => {
        const winnerPid = await getBackendPid(tx);
        await tx.$executeRaw`
          SELECT id
          FROM sales_orders
          WHERE id = ${orderId}::uuid
            AND organization_id = ${fixture.organization.id}::uuid
          FOR UPDATE
        `;
        winnerHeld.resolve(winnerPid);
        await releaseWinner.promise;
        const repo = createTransactionScopedSalesOrderRepository(tx);
        return repo.normalizeLegacyStorefrontReservation({
          applicationTime: now,
          cutoff: now,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      });

      const winnerPid = await winnerHeld.promise;

      const cancelPromise = client2.$transaction(async (tx) => {
        const contenderPid = await getBackendPid(tx);
        contenderPidDeferred.resolve(contenderPid);
        const txSales = createTransactionScopedSalesOrderRepository(tx);
        return cancelSalesOrder(txSales, {
          expectedVersion: order.version,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      });

      const contenderPid = await contenderPidDeferred.promise;

      await waitForBlockerRelationship(observerPrisma, contenderPid, winnerPid);

      releaseWinner.resolve();

      const [normRes, cancelResult] = await Promise.allSettled([
        normalizerPromise,
        cancelPromise,
      ]);

      expect(normRes.status).toBe("fulfilled");
      if (normRes.status === "fulfilled") {
        expect(normRes.value.status).toBe("NORMALIZED_AND_RECLAIMED");
      }
      expect(cancelResult.status).toBe("rejected");

      const finalOrder = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(finalOrder.status).toBe("CANCELLED");
      expect(finalOrder.version).toBe(order.version + 1);

      const finalRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(finalRsv.status).toBe("EXPIRED");
    } finally {
      releaseWinner.resolve();
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  // CONTENTION PROOF D: Normalizer vs verified payment settlement (PID-linked)
  it("proves PostgreSQL row lock contention and preserves verified payment success over normalizer", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-10T11:45:00.000Z");

    const settlementHeld = createDeferred<number>();
    const releaseSettlement = createDeferred<void>();
    const normalizerPidDeferred = createDeferred<number>();

    try {
      // Order with payment attempt created
      const { order, orderId, reservationId } =
        await createLegacyStorefrontOrder({
          fixture,
          paymentPreference: "ONLINE_PAYMENT",
          reservedAt,
          skipDeletePaymentAttempt: true,
        });

      // Winner: Payment settlement holds sales order FOR UPDATE on client2
      const settlementPromise = client2.$transaction(async (tx) => {
        const winnerPid = await getBackendPid(tx);
        await tx.$executeRaw`
          SELECT id
          FROM sales_orders
          WHERE id = ${orderId}::uuid
            AND organization_id = ${fixture.organization.id}::uuid
          FOR UPDATE
        `;
        settlementHeld.resolve(winnerPid);
        await releaseSettlement.promise;
        const txSales = createTransactionScopedSalesOrderRepository(tx);
        return confirmSalesOrder(txSales, {
          expectedVersion: order.version,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      });

      const winnerPid = await settlementHeld.promise;

      // Contender: Normalizer attempts to normalize on prisma
      const normalizerPromise = prisma.$transaction(async (tx) => {
        const contenderPid = await getBackendPid(tx);
        normalizerPidDeferred.resolve(contenderPid);
        const repo = createTransactionScopedSalesOrderRepository(tx);
        return repo.normalizeLegacyStorefrontReservation({
          applicationTime: now,
          cutoff: now,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      });

      const contenderPid = await normalizerPidDeferred.promise;

      // PROVE contention: normalizer contender is blocked by payment settlement winner
      await waitForBlockerRelationship(observerPrisma, contenderPid, winnerPid);

      // Release payment settlement
      releaseSettlement.resolve();

      const [settleRes, normRes] = await Promise.all([
        settlementPromise,
        normalizerPromise,
      ]);

      // Payment settlement successfully confirmed the order
      expect(settleRes.status).toBe("CONFIRMED");

      // Normalizer unblocks, observes terminal CONFIRMED status, and skips without mutation
      expect(normRes.status).toBe("SKIPPED");
      expect(normRes.skipOrDeferReason).toBe("TERMINAL_ORDER");
      expect(normRes.reclaimed).toBe(false);

      const dbOrder = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(dbOrder.status).toBe("CONFIRMED");

      const dbRsv = await observerPrisma.inventoryReservation.findUniqueOrThrow(
        {
          where: { id: reservationId },
        },
      );
      expect(dbRsv.status).toBe("ACTIVE");
    } finally {
      releaseSettlement.resolve();
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  // CONTENTION PROOF E: Payment attempt insertion races normalizer eligibility (PID-linked)
  it("proves PostgreSQL row lock contention when payment attempt insertion races normalizer", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-10T11:45:00.000Z"); // 15m ago -> still valid

    const winnerHeld = createDeferred<number>();
    const releaseWinner = createDeferred<void>();
    const contenderPidDeferred = createDeferred<number>();

    try {
      const { orderId, reservationId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "ONLINE_PAYMENT",
        reservedAt,
        skipDeletePaymentAttempt: false, // 0 payment attempts initially
      });

      // Winner: Normalizer holds sales order row FOR UPDATE
      const normalizerPromise = prisma.$transaction(async (tx) => {
        const winnerPid = await getBackendPid(tx);
        await tx.$executeRaw`
          SELECT id
          FROM sales_orders
          WHERE id = ${orderId}::uuid
            AND organization_id = ${fixture.organization.id}::uuid
          FOR UPDATE
        `;
        winnerHeld.resolve(winnerPid);
        await releaseWinner.promise;
        const repo = createTransactionScopedSalesOrderRepository(tx);
        return repo.normalizeLegacyStorefrontReservation({
          applicationTime: now,
          cutoff: now,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      });

      const winnerPid = await winnerHeld.promise;

      // Contender: Client 2 attempts to INSERT OnlinePaymentAttempt referencing orderId.
      // In PostgreSQL, FK validation acquires FOR KEY SHARE on sales_orders row,
      // which blocks against winner's FOR UPDATE lock.
      const insertPromise = client2.$transaction(async (tx) => {
        const contenderPid = await getBackendPid(tx);
        contenderPidDeferred.resolve(contenderPid);
        return tx.onlinePaymentAttempt.create({
          data: {
            amountMinor: 259800,
            currencyCode: "BDT",
            expiresAt: new Date("2026-09-10T12:30:00.000Z"),
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
      });

      const contenderPid = await contenderPidDeferred.promise;

      // PROVE contention: contender INSERT is blocked by normalizer winner PID
      await waitForBlockerRelationship(observerPrisma, contenderPid, winnerPid);

      // Release winner: normalizer completes normalization and commits
      releaseWinner.resolve();

      const [normResult, insertResult] = await Promise.all([
        normalizerPromise,
        insertPromise,
      ]);

      expect(normResult.status).toBe("NORMALIZED_STILL_VALID");
      expect(normResult.reclaimed).toBe(false);
      expect(insertResult.id).toBeDefined();

      // Verify persisted state: reservation has normalized finite expiry, attempt exists
      const dbRsv = await observerPrisma.inventoryReservation.findUniqueOrThrow(
        {
          where: { id: reservationId },
        },
      );
      expect(dbRsv.expiresAt).toEqual(new Date("2026-09-10T12:15:00.000Z"));
      expect(dbRsv.status).toBe("ACTIVE");

      const dbAttempt =
        await observerPrisma.onlinePaymentAttempt.findUniqueOrThrow({
          where: { id: insertResult.id },
        });
      expect(dbAttempt.status).toBe("CREATED");
    } finally {
      releaseWinner.resolve();
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  // CONTENTION PROOF F: Normalization vs Phase 2A reclaim interaction
  it("proves Phase 2A reclaim safely ignores null-expiry and avoids double transition after normalization", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-08T10:00:00.000Z"); // 50h ago (overdue COD)

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

      const maintenanceService = new StorefrontReservationMaintenanceService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      const normalizationService =
        new StorefrontReservationNormalizationService({
          clock: { now: () => now },
          salesOrderRepository: salesOrderRepo,
          transactionManager,
        });

      // 1. Phase 2A reclaim query: expiresAt IS NULL means ordinary reclaim cannot select row.
      // Classified honestly as DETERMINISTIC_NO_CANDIDATE.
      const initialReclaimReport =
        await maintenanceService.reclaimDueReservations({
          cutoff: now,
          organizationId: fixture.organization.id,
        });
      expect(initialReclaimReport.candidatesFound).toBe(0);
      expect(initialReclaimReport.reclaimedCount).toBe(0);

      // Verify row is completely untouched
      const rsvBefore =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(rsvBefore.expiresAt).toBeNull();
      expect(rsvBefore.status).toBe("ACTIVE");

      // 2. Normalization service executes approved manifest
      const normReport = await normalizationService.executeApprovedManifest({
        applicationTime: now,
        approvedSalesOrderIds: [orderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });
      expect(normReport.committedCount).toBe(1);
      expect(normReport.reclaimedCount).toBe(1);
      expect(normReport.details[0]?.status).toBe("NORMALIZED_AND_RECLAIMED");

      // 3. Phase 2A reclaim runs again after normalization: must find 0 candidates and produce 0 transitions
      const secondReclaimReport =
        await maintenanceService.reclaimDueReservations({
          cutoff: now,
          organizationId: fixture.organization.id,
        });
      expect(secondReclaimReport.candidatesFound).toBe(0);
      expect(secondReclaimReport.reclaimedCount).toBe(0);

      // Exactly 2 relevant audits total (from normalization atomic reclaim)
      const audits = await observerPrisma.auditEntry.findMany({
        orderBy: { createdAt: "asc" },
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
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

  // AUDIT ROLLBACK PROOF: Real database audit INSERT failure rollback (Proof G)
  it("rolls back all normalization mutations and audits when a real DB constraint fails during audit insert", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const reservedAt = new Date("2026-09-09T10:00:00.000Z"); // 26h ago (overdue COD)
    const constraintName = `chk_test_fail_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

    try {
      const { orderId, reservationId } = await createLegacyStorefrontOrder({
        fixture,
        paymentPreference: "CASH_ON_DELIVERY",
        reservedAt,
      });

      const rsvBefore =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      const orderBefore = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });

      // Add temporary check constraint on audit_entries table to force real DB INSERT failure
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "audit_entries"
        ADD CONSTRAINT "${constraintName}"
        CHECK ("action" != 'STOREFRONT_RESERVATION_EXPIRY_NORMALIZED');
      `);

      const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
      const transactionManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      // Real execution reaches PostgreSQL and fails on real audit INSERT
      await expect(
        service.executeApprovedManifest({
          applicationTime: now,
          approvedSalesOrderIds: [orderId],
          cutoff: now,
          organizationId: fixture.organization.id,
        }),
      ).rejects.toThrow();

      // Observer proves complete transaction rollback
      const rolledBackOrder = await observerPrisma.salesOrder.findUniqueOrThrow(
        {
          where: { id: orderId },
        },
      );
      expect(rolledBackOrder.status).toBe("RESERVED");
      expect(rolledBackOrder.version).toBe(orderBefore.version);
      expect(rolledBackOrder.cancelledAt).toBeNull();
      expect(rolledBackOrder.confirmedAt).toBeNull();
      expect(rolledBackOrder.fulfilledAt).toBeNull();

      const rolledBackRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(rolledBackRsv.expiresAt).toBeNull();
      expect(rolledBackRsv.status).toBe("ACTIVE");
      expect(rolledBackRsv.version).toBe(rsvBefore.version);
      expect(rolledBackRsv.expiredAt).toBeNull();
      expect(rolledBackRsv.releasedAt).toBeNull();
      expect(rolledBackRsv.confirmedAt).toBeNull();

      const audits = await observerPrisma.auditEntry.findMany({
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
      });
      expect(audits.length).toBe(0);
    } finally {
      await prisma
        .$executeRawUnsafe(
          `
          ALTER TABLE "audit_entries"
          DROP CONSTRAINT IF EXISTS "${constraintName}";
        `,
        )
        .catch(() => undefined);
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

      const orderBefore = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      const rsvBefore =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
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
          applicationTime: now,
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
      expect(untouchedOrder.version).toBe(orderBefore.version);

      const untouchedRsv =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      expect(untouchedRsv.expiresAt).toBeNull();
      expect(untouchedRsv.status).toBe("ACTIVE");
      expect(untouchedRsv.version).toBe(rsvBefore.version);

      const audits = await observerPrisma.auditEntry.findMany({
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
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
          applicationTime: now,
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
          applicationTime: now,
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

  // TEST: Rerun idempotency (Overdue and Still-Valid)
  it("proves rerun idempotency: second run skips without duplicate reclaim or audit", async () => {
    const fixture = await createFixture(prisma);
    const now = new Date("2026-09-10T12:00:00.000Z");
    const overdueReservedAt = new Date("2026-09-09T10:00:00.000Z"); // 26h ago (overdue COD)
    const validReservedAt = new Date("2026-09-10T02:00:00.000Z"); // 10h ago (still valid COD)

    try {
      const { orderId: overdueOrderId, reservationId: overdueRsvId } =
        await createLegacyStorefrontOrder({
          fixture,
          paymentPreference: "CASH_ON_DELIVERY",
          reservedAt: overdueReservedAt,
        });

      const { orderId: validOrderId, reservationId: validRsvId } =
        await createLegacyStorefrontOrder({
          fixture,
          paymentPreference: "CASH_ON_DELIVERY",
          reservedAt: validReservedAt,
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

      // --- Part 1: Overdue order ---
      const report1 = await service.executeApprovedManifest({
        applicationTime: now,
        approvedSalesOrderIds: [overdueOrderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report1.totalProcessed).toBe(1);
      expect(report1.committedCount).toBe(1);
      expect(report1.reclaimedCount).toBe(1);
      expect(report1.details[0]?.status).toBe("NORMALIZED_AND_RECLAIMED");

      const orderAfterRun1 = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: overdueOrderId },
      });
      const rsvAfterRun1 =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: overdueRsvId },
        });

      // Second run on same overdue order: must skip with TERMINAL_ORDER
      const report2 = await service.executeApprovedManifest({
        applicationTime: now,
        approvedSalesOrderIds: [overdueOrderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(report2.totalProcessed).toBe(1);
      expect(report2.committedCount).toBe(0);
      expect(report2.reclaimedCount).toBe(0);
      expect(report2.skippedCount).toBe(1);
      expect(report2.details[0]?.status).toBe("SKIPPED");
      expect(report2.details[0]?.skipOrDeferReason).toBe("TERMINAL_ORDER");

      const orderAfterRun2 = await observerPrisma.salesOrder.findUniqueOrThrow({
        where: { id: overdueOrderId },
      });
      const rsvAfterRun2 =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: overdueRsvId },
        });

      // Versions unchanged on rerun
      expect(orderAfterRun2.version).toBe(orderAfterRun1.version);
      expect(rsvAfterRun2.version).toBe(rsvAfterRun1.version);

      // Audit entries count must remain exactly 2 (no duplicate audits created on rerun)
      const overdueAudits = await observerPrisma.auditEntry.findMany({
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixture.organization.id,
          resourceId: overdueOrderId,
        },
      });
      expect(overdueAudits.length).toBe(2);

      // --- Part 2: Still-valid order ---
      const validReport1 = await service.executeApprovedManifest({
        applicationTime: now,
        approvedSalesOrderIds: [validOrderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(validReport1.totalProcessed).toBe(1);
      expect(validReport1.committedCount).toBe(1);
      expect(validReport1.reclaimedCount).toBe(0);
      expect(validReport1.details[0]?.status).toBe("NORMALIZED_STILL_VALID");

      const validOrderAfter1 =
        await observerPrisma.salesOrder.findUniqueOrThrow({
          where: { id: validOrderId },
        });
      const validRsvAfter1 =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: validRsvId },
        });

      // Second run on same still-valid order: must skip with ALREADY_HAS_EXPIRY
      const validReport2 = await service.executeApprovedManifest({
        applicationTime: now,
        approvedSalesOrderIds: [validOrderId],
        cutoff: now,
        organizationId: fixture.organization.id,
      });

      expect(validReport2.totalProcessed).toBe(1);
      expect(validReport2.committedCount).toBe(0);
      expect(validReport2.reclaimedCount).toBe(0);
      expect(validReport2.skippedCount).toBe(1);
      expect(validReport2.details[0]?.status).toBe("SKIPPED");
      expect(validReport2.details[0]?.skipOrDeferReason).toBe(
        "ALREADY_HAS_EXPIRY",
      );

      const validOrderAfter2 =
        await observerPrisma.salesOrder.findUniqueOrThrow({
          where: { id: validOrderId },
        });
      const validRsvAfter2 =
        await observerPrisma.inventoryReservation.findUniqueOrThrow({
          where: { id: validRsvId },
        });

      expect(validOrderAfter2.version).toBe(validOrderAfter1.version);
      expect(validRsvAfter2.version).toBe(validRsvAfter1.version);

      const validAudits = await observerPrisma.auditEntry.findMany({
        where: {
          action: {
            in: [
              "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
              "STOREFRONT_RESERVATION_EXPIRED",
            ],
          },
          organizationId: fixture.organization.id,
          resourceId: validOrderId,
        },
      });
      expect(validAudits.length).toBe(1);
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
