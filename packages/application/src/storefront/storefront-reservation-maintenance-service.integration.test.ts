/* eslint-disable @typescript-eslint/require-await */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cancelSalesOrder,
  confirmSalesOrder,
  fulfillSalesOrder,
  type OnlinePaymentProviderAdapter,
} from "@senvo/domain";
import {
  createPrismaClient,
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

describe("StorefrontReservationMaintenanceService coordinated reclaim integration", () => {
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

  async function createDueStorefrontOrder(params: {
    fixture: StorefrontFixture;
    prismaClient?: ReturnType<typeof createPrismaClient>;
    pastDeadline?: Date;
    quantity?: number;
    paymentPreference?: "CASH_ON_DELIVERY" | "ONLINE_PAYMENT";
  }) {
    const client = params.prismaClient ?? prisma;
    const quantity = params.quantity ?? 1;
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
    const storefront = new StorefrontApplicationService({
      clock: testClock,
      maintenanceService,
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
      idempotencyKey: `idem-due-${randomUUID()}`,
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
    const pastDeadline =
      params.pastDeadline ?? new Date(Date.now() - 60 * 1000);
    await client.inventoryReservation.updateMany({
      where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      data: { expiresAt: pastDeadline },
    });
    const order = await client.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    return {
      order,
      orderId,
      payload,
      salesOrderRepo,
      storefront,
      transactionManager,
    };
  }

  it("atomically reclaims expired storefront reservations and enforces replay conflict", async () => {
    const fixture = await createFixture(prisma);
    const storefrontRepo = new PrismaStorefrontRepository(prisma);
    const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
    const transactionManager = new PrismaTransactionManager(
      prisma,
    ) as unknown as ApplicationTransactionManager;

    let currentTime = new Date("2026-09-07T12:00:00.000Z");
    const testClock = { now: () => currentTime };

    const maintenanceService = new StorefrontReservationMaintenanceService({
      clock: testClock,
      salesOrderRepository: salesOrderRepo,
      transactionManager,
    });

    const storefront = new StorefrontApplicationService({
      clock: testClock,
      maintenanceService,
      organizationCode: fixture.organization.code,
      repository: storefrontRepo,
      transactionManager,
    });

    try {
      // 1. Initial inventory: 5 on hand, 0 reserved, 5 available
      const initialAvailability = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(initialAvailability.onHandQuantity).toBe(5);
      expect(initialAvailability.reservedQuantity).toBe(0);
      expect(initialAvailability.availableQuantity).toBe(5);

      // 2. Checkout 2 units with CASH_ON_DELIVERY (24 hour TTL)
      const idempotencyKey = `idem-expire-${randomUUID()}`;
      const payload = {
        customer: { name: "Sharif Ahmed", phone: "01712345678" },
        deliveryAddress: {
          city: "Dhaka",
          district: "Dhaka",
          line1: "House 10, Road 2",
        },
        idempotencyKey,
        lines: [
          {
            productVariantId: fixture.variant.id,
            quantity: 2,
            reviewedUnitPriceMinor: 129900,
          },
        ],
        paymentPreference: "CASH_ON_DELIVERY" as const,
      };

      const checkoutResult = await storefront.checkout(
        "request-maint-checkout-1",
        payload,
      );
      expect(checkoutResult.ok).toBe(true);
      if (!checkoutResult.ok) return;

      const orderId = checkoutResult.data.orderId;

      // 3. Verify hold is active: 2 reserved, 3 available
      const heldAvailability = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(heldAvailability.reservedQuantity).toBe(2);
      expect(heldAvailability.availableQuantity).toBe(3);

      // 4. Running maintenance before expiry should reclaim 0
      const earlyReclaim = await maintenanceService.reclaimDueReservations({
        organizationId: fixture.organization.id,
      });
      expect(earlyReclaim.reclaimedCount).toBe(0);
      expect(earlyReclaim.candidatesFound).toBe(0);

      // 5. Fast-forward clock past the 24 hour expiry TTL
      currentTime = new Date("2026-09-08T12:00:01.000Z");

      // 6. Run maintenance sweep now that reservation has expired
      const reclaimResult = await maintenanceService.reclaimDueReservations({
        organizationId: fixture.organization.id,
      });
      expect(reclaimResult.candidatesFound).toBe(1);
      expect(reclaimResult.reclaimedCount).toBe(1);

      // 7. Verify inventory availability is restored: 0 reserved, 5 available
      const restoredAvailability = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(restoredAvailability.onHandQuantity).toBe(5);
      expect(restoredAvailability.reservedQuantity).toBe(0);
      expect(restoredAvailability.availableQuantity).toBe(5);

      // 8. Verify sales order status changed to CANCELLED and reservation to EXPIRED
      const salesOrderRecord = await observerPrisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(salesOrderRecord?.status).toBe("CANCELLED");
      expect(salesOrderRecord?.cancelledAt).toBeInstanceOf(Date);

      const reservationRecord =
        await observerPrisma.inventoryReservation.findFirst({
          where: { referenceId: orderId, referenceType: "SALES_ORDER" },
        });
      expect(reservationRecord?.status).toBe("EXPIRED");

      // 9. Verify STOREFRONT_RESERVATION_EXPIRED audit entry
      const auditEntries = await observerPrisma.auditEntry.findMany({
        where: {
          action: "STOREFRONT_RESERVATION_EXPIRED",
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
      });
      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0]?.resource).toBe("SALES_ORDER");

      // 10. Replay of the same idempotency key must now return CONFLICT
      const replayResult = await storefront.checkout(
        "request-maint-replay-1",
        payload,
      );
      expect(replayResult.ok).toBe(false);
      if (!replayResult.ok) {
        expect(replayResult.error.code).toBe("CONFLICT");
        expect(replayResult.error.message).toBe(
          "The existing storefront order is no longer reserved.",
        );
      }
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  it("enforces cleanup vs checkout concurrency so stock is never double allocated", async () => {
    const fixture = await createFixture(prisma);
    const storefrontRepo = new PrismaStorefrontRepository(prisma);
    const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
    const transactionManager = new PrismaTransactionManager(
      prisma,
    ) as unknown as ApplicationTransactionManager;

    let currentTime = new Date("2026-09-07T12:00:00.000Z");
    const testClock = { now: () => currentTime };
    const maintenanceService = new StorefrontReservationMaintenanceService({
      clock: testClock,
      salesOrderRepository: salesOrderRepo,
      transactionManager,
    });
    const storefront = new StorefrontApplicationService({
      clock: testClock,
      maintenanceService,
      organizationCode: fixture.organization.code,
      repository: storefrontRepo,
      transactionManager,
    });

    try {
      // 1. Checkout all 5 available units
      const payload1 = {
        customer: { name: "Buyer 1", phone: "01711111111" },
        deliveryAddress: {
          city: "Dhaka",
          district: "Dhaka",
          line1: "Street 1",
        },
        idempotencyKey: `idem-contend-1-${randomUUID()}`,
        lines: [
          {
            productVariantId: fixture.variant.id,
            quantity: 5,
            reviewedUnitPriceMinor: 129900,
          },
        ],
        paymentPreference: "CASH_ON_DELIVERY" as const,
      };
      const order1Result = await storefront.checkout("req-contend-1", payload1);
      expect(order1Result.ok).toBe(true);

      // Available stock is now 0
      const avail0 = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(avail0.reservedQuantity).toBe(5);
      expect(avail0.availableQuantity).toBe(0);

      // Second checkout fails due to INSUFFICIENT_STOCK
      const payload2 = {
        customer: { name: "Buyer 2", phone: "01722222222" },
        deliveryAddress: {
          city: "Dhaka",
          district: "Dhaka",
          line1: "Street 2",
        },
        idempotencyKey: `idem-contend-2-${randomUUID()}`,
        lines: [
          {
            productVariantId: fixture.variant.id,
            quantity: 3,
            reviewedUnitPriceMinor: 129900,
          },
        ],
        paymentPreference: "CASH_ON_DELIVERY" as const,
      };
      const failOrder2 = await storefront.checkout("req-contend-2", payload2);
      expect(failOrder2.ok).toBe(false);

      // Fast-forward past expiry
      currentTime = new Date("2026-09-08T12:00:01.000Z");

      // Concurrent sweep and second checkout
      const [reclaimRes, order2Res] = await Promise.all([
        maintenanceService.reclaimDueReservations({
          organizationId: fixture.organization.id,
        }),
        storefront.checkout(`req-contend-3-${randomUUID()}`, payload2),
      ]);

      expect(reclaimRes.reclaimedCount).toBe(1);
      expect(order2Res.ok).toBe(true);

      // Final availability: 3 reserved by buyer 2, 2 remaining available
      const finalAvail = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(finalAvail.onHandQuantity).toBe(5);
      expect(finalAvail.reservedQuantity).toBe(3);
      expect(finalAvail.availableQuantity).toBe(2);
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  it("resolves cleanup vs confirmation race with exactly one valid terminal outcome", async () => {
    const fixture = await createFixture(prisma);
    const salesOrderRepo = new PrismaSalesOrderRepository(prisma);

    try {
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const { order, orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        prismaClient: prisma,
        quantity: 2,
      });

      // Reclaim wins
      const reclaimResult =
        await salesOrderRepo.reclaimExpiredStorefrontReservation({
          cutoff: new Date(),
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
      expect(reclaimResult.reclaimed).toBe(true);

      // Subsequent confirmation MUST fail
      await expect(
        confirmSalesOrder(salesOrderRepo, {
          expectedVersion: order.version,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        }),
      ).rejects.toThrow();

      // State is CANCELLED + EXPIRED, never mixed
      const dbOrder = await prisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder?.status).toBe("CANCELLED");
      const dbRsv = await prisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(dbRsv?.status).toBe("EXPIRED");
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  it("enforces cleanup vs cancellation race resulting only in valid terminal pairs", async () => {
    const fixture = await createFixture(prisma);
    const salesOrderRepo = new PrismaSalesOrderRepository(prisma);

    try {
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const { order, orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        prismaClient: prisma,
        quantity: 1,
      });

      // Manual cancellation wins
      await cancelSalesOrder(salesOrderRepo, {
        expectedVersion: order.version,
        organizationId: fixture.organization.id,
        salesOrderId: orderId,
      });

      // Reclaim attempt skips
      const reclaimA = await salesOrderRepo.reclaimExpiredStorefrontReservation(
        {
          cutoff: new Date(),
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        },
      );
      expect(reclaimA.reclaimed).toBe(false);

      // Valid terminal pair: CANCELLED / RELEASED (never EXPIRED)
      const rsvA = await prisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(rsvA?.status).toBe("RELEASED");
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  it("skips confirmed orders during cleanup and allows fulfillment to consume active hold", async () => {
    const fixture = await createFixture(prisma);
    const salesOrderRepo = new PrismaSalesOrderRepository(prisma);

    try {
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const { order, orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        prismaClient: prisma,
        quantity: 1,
      });

      const confirmed = await confirmSalesOrder(salesOrderRepo, {
        expectedVersion: order.version,
        organizationId: fixture.organization.id,
        salesOrderId: orderId,
      });
      expect(confirmed.status).toBe("CONFIRMED");

      // Cleanup must skip confirmed order
      const reclaim = await salesOrderRepo.reclaimExpiredStorefrontReservation({
        cutoff: new Date(),
        organizationId: fixture.organization.id,
        salesOrderId: orderId,
      });
      expect(reclaim.reclaimed).toBe(false);

      // Fulfillment proceeds
      const fulfilled = await fulfillSalesOrder(salesOrderRepo, {
        consumptionIdempotencyKey: `consume-ful-${randomUUID()}`,
        expectedVersion: confirmed.version,
        movementNumber: `MV-FUL-${randomUUID().slice(0, 6)}`,
        occurredAt: new Date().toISOString(),
        organizationId: fixture.organization.id,
        salesOrderId: orderId,
      });
      expect(fulfilled.status).toBe("FULFILLED");

      // Final valid pair: FULFILLED / CONSUMED
      const rsv = await prisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(rsv?.status).toBe("CONSUMED");
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  it("preserves confirmed order when payment wins before cleanup", async () => {
    const fixture = await createFixture(prisma);
    const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
    const paymentRepo = new PrismaOnlinePaymentRepository(prisma);
    const transactionManager = new PrismaTransactionManager(
      prisma,
    ) as unknown as ApplicationTransactionManager;

    try {
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const { orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        paymentPreference: "ONLINE_PAYMENT",
        prismaClient: prisma,
        quantity: 1,
      });

      const attempt = await paymentRepo.createAttempt({
        amountMinor: 129900,
        createdAt: new Date(),
        currencyCode: "BDT",
        id: randomUUID(),
        idempotencyKey: `idem-attempt-win-${randomUUID()}`,
        organizationId: fixture.organization.id,
        providerTransactionId: `TX-WIN-${randomUUID()}`,
        publicToken: randomUUID(),
        requestSignature: "sig-attempt-win",
        salesOrderId: orderId,
      });

      const providerStub: OnlinePaymentProviderAdapter = {
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
        validateTransaction: vi.fn(async () => ({
          amountMinor: 129900,
          bankTransactionId: "BANK-WIN-1",
          currencyCode: "BDT",
          providerStatus: "VALID",
          providerTransactionId: attempt.providerTransactionId,
          riskLevel: 0,
          status: "SUCCEEDED" as const,
          validationId: "VAL-WIN-1",
        })),
      };

      const paymentService = new OnlinePaymentApplicationService({
        clock: { now: () => new Date() },
        provider: providerStub,
        repository: paymentRepo,
        transactionManager,
      });

      // Settle payment (payment wins)
      const payResult = await paymentService.notification("req-pay-win", {
        amountMinor: 129900,
        bankTransactionId: "BANK-WIN-1",
        currencyCode: "BDT",
        providerPayload: {},
        providerTransactionId: attempt.providerTransactionId,
        rawPayload: "{}",
        riskLevel: 0,
        signature: "sig",
        status: "SUCCEEDED",
        validationId: "VAL-WIN-1",
      });
      expect(payResult.ok).toBe(true);

      // Reclaim runs after payment confirmed order
      const reclaim = await salesOrderRepo.reclaimExpiredStorefrontReservation({
        cutoff: new Date(),
        organizationId: fixture.organization.id,
        salesOrderId: orderId,
      });
      expect(reclaim.reclaimed).toBe(false);

      // State remains CONFIRMED and ACTIVE
      const dbOrder = await prisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder?.status).toBe("CONFIRMED");
      const dbRsv = await prisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(dbRsv?.status).toBe("ACTIVE");

      // Replay payment notification
      const replay = await paymentService.notification("req-pay-win", {
        amountMinor: 129900,
        bankTransactionId: "BANK-WIN-1",
        currencyCode: "BDT",
        providerPayload: {},
        providerTransactionId: attempt.providerTransactionId,
        rawPayload: "{}",
        riskLevel: 0,
        signature: "sig",
        status: "SUCCEEDED",
        validationId: "VAL-WIN-1",
      });
      expect(replay).toMatchObject({ data: { replayed: true }, ok: true });
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  it("routes to REFUND_REQUIRED when cleanup wins before payment settlement", async () => {
    const fixture = await createFixture(prisma);
    const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
    const paymentRepo = new PrismaOnlinePaymentRepository(prisma);
    const transactionManager = new PrismaTransactionManager(
      prisma,
    ) as unknown as ApplicationTransactionManager;

    try {
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const { orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        paymentPreference: "ONLINE_PAYMENT",
        prismaClient: prisma,
        quantity: 1,
      });

      const attempt = await paymentRepo.createAttempt({
        amountMinor: 129900,
        createdAt: new Date(),
        currencyCode: "BDT",
        id: randomUUID(),
        idempotencyKey: `idem-attempt-cln-${randomUUID()}`,
        organizationId: fixture.organization.id,
        providerTransactionId: `TX-CLN-${randomUUID()}`,
        publicToken: randomUUID(),
        requestSignature: "sig-attempt-cln",
        salesOrderId: orderId,
      });

      // Cleanup runs first and reclaims
      const reclaim = await salesOrderRepo.reclaimExpiredStorefrontReservation({
        cutoff: new Date(),
        organizationId: fixture.organization.id,
        salesOrderId: orderId,
      });
      expect(reclaim.reclaimed).toBe(true);

      const providerStub: OnlinePaymentProviderAdapter = {
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
        validateTransaction: vi.fn(async () => ({
          amountMinor: 129900,
          bankTransactionId: "BANK-CLN-1",
          currencyCode: "BDT",
          providerStatus: "VALID",
          providerTransactionId: attempt.providerTransactionId,
          riskLevel: 0,
          status: "SUCCEEDED" as const,
          validationId: "VAL-CLN-1",
        })),
      };

      const paymentService = new OnlinePaymentApplicationService({
        clock: { now: () => new Date() },
        provider: providerStub,
        repository: paymentRepo,
        transactionManager,
      });

      // Payment settlement runs after reclaim
      const payResult = await paymentService.notification("req-pay-cln", {
        amountMinor: 129900,
        bankTransactionId: "BANK-CLN-1",
        currencyCode: "BDT",
        providerPayload: {},
        providerTransactionId: attempt.providerTransactionId,
        rawPayload: "{}",
        riskLevel: 0,
        signature: "sig",
        status: "SUCCEEDED",
        validationId: "VAL-CLN-1",
      });
      expect(payResult.ok).toBe(true);

      // Verified provider success settled as SUCCEEDED with REFUND_REQUIRED
      const dbAttempt = await prisma.onlinePaymentAttempt.findUnique({
        where: { id: attempt.id },
      });
      expect(dbAttempt?.status).toBe("SUCCEEDED");
      expect(dbAttempt?.resolutionStatus).toBe("REFUND_REQUIRED");

      const reconciliation = await prisma.paymentReconciliation.findFirst({
        where: { paymentAttemptId: attempt.id },
      });
      expect(reconciliation?.reasonCode).toBe(
        "LATE_SUCCESS_RESERVATION_UNAVAILABLE",
      );

      // Order remains CANCELLED, reservation remains EXPIRED (no resurrection)
      const dbOrder = await prisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder?.status).toBe("CANCELLED");
      const dbRsv = await prisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(dbRsv?.status).toBe("EXPIRED");
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  it("serializes two concurrent maintenance services with exactly one reclaim and one audit row", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();

    try {
      const salesOrderRepo1 = new PrismaSalesOrderRepository(prisma);
      const salesOrderRepo2 = new PrismaSalesOrderRepository(client2);
      const txManager1 = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;
      const txManager2 = new PrismaTransactionManager(
        client2,
      ) as unknown as ApplicationTransactionManager;

      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const now = new Date();

      const { orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        prismaClient: prisma,
        quantity: 1,
      });

      const maint1 = new StorefrontReservationMaintenanceService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo1,
        transactionManager: txManager1,
      });
      const maint2 = new StorefrontReservationMaintenanceService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo2,
        transactionManager: txManager2,
      });

      // Run both maintenance sweeps concurrently against real PostgreSQL
      const [res1, res2] = await Promise.all([
        maint1.reclaimDueReservations({
          organizationId: fixture.organization.id,
        }),
        maint2.reclaimDueReservations({
          organizationId: fixture.organization.id,
        }),
      ]);

      // Exactly one service reclaims the reservation
      const totalReclaimed = res1.reclaimedCount + res2.reclaimedCount;
      expect(totalReclaimed).toBe(1);

      // Exactly one audit row exists for this reclaim
      const audits = await observerPrisma.auditEntry.findMany({
        where: {
          action: "STOREFRONT_RESERVATION_EXPIRED",
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
      });
      expect(audits.length).toBe(1);
      expect(audits[0]?.resource).toBe("SALES_ORDER");
    } finally {
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  it("rolls back order and reservation changes on real database audit failure", async () => {
    const fixture = await createFixture(prisma);
    const salesOrderRepo = new PrismaSalesOrderRepository(prisma);

    try {
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const { order, orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        prismaClient: prisma,
        quantity: 2,
      });

      const nonExistentUserId = "00000000-0000-4000-8000-000000000099";
      await expect(
        prisma.$transaction(async (tx) => {
          // 1. Reclaim the reservation inside transaction
          await salesOrderRepo.reclaimExpiredStorefrontReservation({
            cutoff: new Date(),
            organizationId: fixture.organization.id,
            salesOrderId: orderId,
          });
          // 2. Insert real audit entry violating user_id foreign key constraint
          await tx.auditEntry.create({
            data: {
              action: "STOREFRONT_RESERVATION_EXPIRED",
              createdAt: new Date(),
              metadata: {},
              organizationId: fixture.organization.id,
              resource: "SALES_ORDER",
              resourceId: orderId,
              userId: nonExistentUserId, // FK VIOLATION in real Postgres
            },
          });
        }),
      ).rejects.toThrow();

      // Independent observer connection verifies state was completely rolled back:
      const dbOrder = await observerPrisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder?.status).toBe("RESERVED");
      expect(dbOrder?.version).toBe(order.version);
      expect(dbOrder?.cancelledAt).toBeNull();

      const dbRsv = await observerPrisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(dbRsv?.status).toBe("ACTIVE");
      expect(dbRsv?.version).toBe(1);
      expect(dbRsv?.expiredAt).toBeNull();

      // No audit row persisted
      const audits = await observerPrisma.auditEntry.findMany({
        where: { resourceId: orderId },
      });
      expect(audits.length).toBe(0);

      // Stock availability still reflects active hold (3 available, 2 reserved)
      const avail = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(avail.reservedQuantity).toBe(2);
      expect(avail.availableQuantity).toBe(3);
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  it("enforces cross-tenant audit isolation during maintenance discovery and reclaim", async () => {
    const fixtureA = await createFixture(prisma);
    const fixtureB = await createFixture(prisma);
    const salesOrderRepo = new PrismaSalesOrderRepository(prisma);
    const transactionManager = new PrismaTransactionManager(
      prisma,
    ) as unknown as ApplicationTransactionManager;

    try {
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const now = new Date();

      // Create due order in Org A
      const { orderId: orderIdA } = await createDueStorefrontOrder({
        fixture: fixtureA,
        pastDeadline,
        prismaClient: prisma,
        quantity: 1,
      });

      const maintB = new StorefrontReservationMaintenanceService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });

      // Org B maintenance runs: must find 0, reclaim 0
      const resB = await maintB.reclaimDueReservations({
        organizationId: fixtureB.organization.id,
      });
      expect(resB.candidatesFound).toBe(0);
      expect(resB.reclaimedCount).toBe(0);

      // Org A maintenance runs: reclaims 1
      const maintA = new StorefrontReservationMaintenanceService({
        clock: { now: () => now },
        salesOrderRepository: salesOrderRepo,
        transactionManager,
      });
      const resA = await maintA.reclaimDueReservations({
        organizationId: fixtureA.organization.id,
      });
      expect(resA.reclaimedCount).toBe(1);

      // Assert audit entry belongs to Org A, none under Org B
      const auditA = await prisma.auditEntry.findMany({
        where: {
          action: "STOREFRONT_RESERVATION_EXPIRED",
          organizationId: fixtureA.organization.id,
          resourceId: orderIdA,
        },
      });
      expect(auditA.length).toBe(1);

      const auditB = await prisma.auditEntry.findMany({
        where: {
          action: "STOREFRONT_RESERVATION_EXPIRED",
          organizationId: fixtureB.organization.id,
        },
      });
      expect(auditB.length).toBe(0);
    } finally {
      await cleanupFixture(prisma, fixtureA);
      await cleanupFixture(prisma, fixtureB);
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
      occurredAt: new Date("2026-08-11T00:00:00.000Z"),
      organizationId: organization.id,
      payloadSignature: "{}",
      postedAt: new Date("2026-08-11T00:00:00.000Z"),
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
