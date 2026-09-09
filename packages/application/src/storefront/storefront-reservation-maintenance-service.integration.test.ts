/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
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
    providerAdapter?: OnlinePaymentProviderAdapter;
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
        validationId,
      })),
    };

    const onlinePayments = new OnlinePaymentApplicationService({
      clock: testClock,
      provider: params.providerAdapter ?? defaultProvider,
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
    if (params.pastDeadline) {
      await client.inventoryReservation.updateMany({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
        data: { expiresAt: params.pastDeadline },
      });
    }
    const order = await client.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    const attempt =
      params.paymentPreference === "ONLINE_PAYMENT"
        ? await client.onlinePaymentAttempt.findFirst({
            where: { salesOrderId: orderId },
          })
        : null;

    return {
      attempt,
      checkoutResult,
      onlinePayments,
      order,
      orderId,
      payload,
      paymentRepo,
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

    let currentTime = new Date();
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
      currentTime = new Date(Date.now() + 25 * 60 * 60 * 1000);

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
    const client2 = createPrismaClient();

    try {
      // 1. Checkout all 5 available units with past deadline
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const { orderId: orderId1 } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        prismaClient: prisma,
        quantity: 5,
      });

      // Stock is 5 on hand, 5 reserved, 0 available
      const avail0 = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(avail0.reservedQuantity).toBe(5);
      expect(avail0.availableQuantity).toBe(0);

      const reclaimHeld = createDeferred();
      const releaseReclaim = createDeferred();

      // Start reclaim transaction on connection 1, hold it open
      const reclaimPromise = prisma.$transaction(async (tx) => {
        const txSales = createTransactionScopedSalesOrderRepository(tx);
        const res = await txSales.reclaimExpiredStorefrontReservation({
          cutoff: new Date(),
          organizationId: fixture.organization.id,
          salesOrderId: orderId1,
        });
        reclaimHeld.resolve();
        await releaseReclaim.promise;
        return res;
      });

      await reclaimHeld.promise;

      // Reclaim transaction holds row locks on connection 1.
      // Start fresh checkout for 3 units on independent connection 2.
      const storefront2Repo = new PrismaStorefrontRepository(client2);
      const txManager2 = new PrismaTransactionManager(
        client2,
      ) as unknown as ApplicationTransactionManager;
      const storefront2 = new StorefrontApplicationService({
        clock: { now: () => new Date() },
        organizationCode: fixture.organization.code,
        repository: storefront2Repo,
        transactionManager: txManager2,
      });

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

      const checkoutPromise = storefront2.checkout(
        `req-contend-2-${randomUUID()}`,
        payload2,
      );

      // Release reclaim transaction
      releaseReclaim.resolve();

      const [reclaimRes, checkoutRes] = await Promise.all([
        reclaimPromise,
        checkoutPromise,
      ]);

      expect(reclaimRes.reclaimed).toBe(true);
      expect(checkoutRes.ok).toBe(true);

      // Assert invariants: no double allocation, no oversell
      const finalAvail = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(finalAvail.onHandQuantity).toBe(5);
      expect(finalAvail.reservedQuantity).toBe(3);
      expect(finalAvail.availableQuantity).toBe(2);
      expect(finalAvail.onHandQuantity).toBeGreaterThanOrEqual(0);

      // Old reservation is EXPIRED
      const oldRsv = await observerPrisma.inventoryReservation.findFirst({
        where: { referenceId: orderId1, referenceType: "SALES_ORDER" },
      });
      expect(oldRsv?.status).toBe("EXPIRED");

      // New reservation is ACTIVE
      if (checkoutRes.ok) {
        const newRsv = await observerPrisma.inventoryReservation.findFirst({
          where: {
            referenceId: checkoutRes.data.orderId,
            referenceType: "SALES_ORDER",
          },
        });
        expect(newRsv?.status).toBe("ACTIVE");
      }
    } finally {
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  it("resolves cleanup vs confirmation race with confirm winning deterministically", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();

    try {
      // 1. Create valid unexpired order
      const { order, orderId } = await createDueStorefrontOrder({
        fixture,
        prismaClient: prisma,
        quantity: 2,
      });

      const confirmHeld = createDeferred();
      const releaseConfirm = createDeferred();

      // Connection 1: confirmation transaction holds lifecycle lock
      const confirmPromise = prisma.$transaction(async (tx) => {
        const txSales = createTransactionScopedSalesOrderRepository(tx);
        const res = await confirmSalesOrder(txSales, {
          expectedVersion: order.version,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
        confirmHeld.resolve();
        await releaseConfirm.promise;
        return res;
      });

      await confirmHeld.promise;

      // Connection 2: cleanup starts on independent client and contends
      const salesOrderRepo2 = new PrismaSalesOrderRepository(client2);
      const cleanupPromise =
        salesOrderRepo2.reclaimExpiredStorefrontReservation({
          cutoff: new Date(Date.now() + 100000),
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });

      releaseConfirm.resolve();

      const [confirmRes, cleanupRes] = await Promise.all([
        confirmPromise,
        cleanupPromise,
      ]);

      expect(confirmRes.status).toBe("CONFIRMED");
      expect(cleanupRes.reclaimed).toBe(false);

      const dbOrder = await observerPrisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder?.status).toBe("CONFIRMED");

      const dbRsv = await observerPrisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(dbRsv?.status).toBe("ACTIVE");
    } finally {
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  it("resolves cleanup vs confirmation race with reclaim winning deterministically", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();

    try {
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const { order, orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        prismaClient: prisma,
        quantity: 2,
      });

      const reclaimHeld = createDeferred();
      const releaseReclaim = createDeferred();

      // Connection 1: reclaim transaction holds lifecycle lock
      const reclaimPromise = prisma.$transaction(async (tx) => {
        const txSales = createTransactionScopedSalesOrderRepository(tx);
        const res = await txSales.reclaimExpiredStorefrontReservation({
          cutoff: new Date(),
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
        reclaimHeld.resolve();
        await releaseReclaim.promise;
        return res;
      });

      await reclaimHeld.promise;

      // Connection 2: confirmation starts and contends
      const salesOrderRepo2 = new PrismaSalesOrderRepository(client2);
      const confirmPromise = confirmSalesOrder(salesOrderRepo2, {
        expectedVersion: order.version,
        organizationId: fixture.organization.id,
        salesOrderId: orderId,
      });

      releaseReclaim.resolve();

      const [reclaimRes, confirmRes] = await Promise.allSettled([
        reclaimPromise,
        confirmPromise,
      ]);

      expect(reclaimRes.status).toBe("fulfilled");
      if (reclaimRes.status === "fulfilled") {
        expect(reclaimRes.value.reclaimed).toBe(true);
      }
      expect(confirmRes.status).toBe("rejected");

      const dbOrder = await observerPrisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder?.status).toBe("CANCELLED");

      const dbRsv = await observerPrisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(dbRsv?.status).toBe("EXPIRED");
    } finally {
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  it("enforces cleanup vs cancellation race resulting only in valid terminal pairs", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();

    try {
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const { order, orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        prismaClient: prisma,
        quantity: 1,
      });

      const cancelHeld = createDeferred();
      const releaseCancel = createDeferred();

      // Connection 1: manual cancellation transaction holds lifecycle lock
      const cancelPromise = prisma.$transaction(async (tx) => {
        const txSales = createTransactionScopedSalesOrderRepository(tx);
        const res = await cancelSalesOrder(txSales, {
          expectedVersion: order.version,
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
        cancelHeld.resolve();
        await releaseCancel.promise;
        return res;
      });

      await cancelHeld.promise;

      // Connection 2: reclaim starts and contends
      const salesOrderRepo2 = new PrismaSalesOrderRepository(client2);
      const reclaimPromise =
        salesOrderRepo2.reclaimExpiredStorefrontReservation({
          cutoff: new Date(),
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });

      releaseCancel.resolve();

      const [cancelRes, reclaimRes] = await Promise.all([
        cancelPromise,
        reclaimPromise,
      ]);

      expect(cancelRes.status).toBe("CANCELLED");
      expect(reclaimRes.reclaimed).toBe(false);

      const dbOrder = await observerPrisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder?.status).toBe("CANCELLED");

      const dbRsv = await observerPrisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(dbRsv?.status).toBe("RELEASED");
    } finally {
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  it("skips confirmed orders during cleanup and allows fulfillment to consume active hold (DETERMINISTIC_OVERLAP_NO_CANDIDATE)", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();

    try {
      // 1. Create valid unexpired order
      const { order, orderId, salesOrderRepo } = await createDueStorefrontOrder(
        {
          fixture,
          prismaClient: prisma,
          quantity: 1,
        },
      );

      // 2. Confirm order while reservation is ACTIVE and unexpired
      const confirmed = await confirmSalesOrder(salesOrderRepo, {
        expectedVersion: order.version,
        organizationId: fixture.organization.id,
        salesOrderId: orderId,
      });
      expect(confirmed.status).toBe("CONFIRMED");

      // 3. Maintenance sweep on connection 2
      const salesOrderRepo2 = new PrismaSalesOrderRepository(client2);
      const txManager2 = new PrismaTransactionManager(
        client2,
      ) as unknown as ApplicationTransactionManager;
      const maint2 = new StorefrontReservationMaintenanceService({
        clock: { now: () => new Date(Date.now() + 100000) },
        salesOrderRepository: salesOrderRepo2,
        transactionManager: txManager2,
      });

      // Overlap maintenance and fulfillment
      const [reclaimResult, fulfilled] = await Promise.all([
        maint2.reclaimDueReservations({
          organizationId: fixture.organization.id,
        }),
        fulfillSalesOrder(salesOrderRepo, {
          consumptionIdempotencyKey: `consume-ful-${randomUUID()}`,
          expectedVersion: confirmed.version,
          movementNumber: `MV-FUL-${randomUUID().slice(0, 6)}`,
          occurredAt: new Date().toISOString(),
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        }),
      ]);

      // Maintenance candidate discovery excludes CONFIRMED orders
      expect(reclaimResult.candidatesFound).toBe(0);
      expect(reclaimResult.reclaimedCount).toBe(0);

      // Fulfillment completes
      expect(fulfilled.status).toBe("FULFILLED");

      const dbOrder = await observerPrisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder?.status).toBe("FULFILLED");

      // Reservation status is CONFIRMED and consumedByMovementId is set
      const dbRsv = await observerPrisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(dbRsv?.status).toBe("CONFIRMED");
      expect(dbRsv?.consumedByMovementId).toBeTruthy();

      // Exactly one ISSUE inventory movement
      const movement = await observerPrisma.inventoryMovement.findUnique({
        where: { id: dbRsv!.consumedByMovementId! },
      });
      expect(movement?.type).toBe("ISSUE");
      expect(movement?.status).toBe("POSTED");

      // No STOREFRONT_RESERVATION_EXPIRED audit for this order
      const expiryAudits = await observerPrisma.auditEntry.findMany({
        where: {
          action: "STOREFRONT_RESERVATION_EXPIRED",
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
      });
      expect(expiryAudits.length).toBe(0);

      // Stock availability reflects consumption
      const avail = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(avail.onHandQuantity).toBe(4);
      expect(avail.reservedQuantity).toBe(0);
      expect(avail.availableQuantity).toBe(4);
    } finally {
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  it("preserves confirmed order when payment wins before cleanup", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();

    try {
      // 1. Create online checkout with reservation expiry safely in the future
      const { attempt, orderId, paymentRepo } = await createDueStorefrontOrder({
        fixture,
        paymentPreference: "ONLINE_PAYMENT",
        prismaClient: prisma,
        quantity: 1,
      });

      if (!attempt) throw new Error("Online payment attempt must exist");

      const lockAcquired = createDeferred();
      const releasePayment = createDeferred();

      // Gated transaction manager intercepts lockOrderLifecycle inside payment transaction
      const baseTxManager = new PrismaTransactionManager(
        prisma,
      ) as unknown as ApplicationTransactionManager;
      const gatedTxManager: ApplicationTransactionManager = {
        execute: async <TResult>(
          appContext: any,
          operation: any,
        ): Promise<TResult> => {
          return baseTxManager.execute(appContext, async (txContext: any) => {
            if (txContext.onlinePaymentRepository) {
              const origLock =
                txContext.onlinePaymentRepository.lockOrderLifecycle.bind(
                  txContext.onlinePaymentRepository,
                );
              txContext.onlinePaymentRepository.lockOrderLifecycle = async (
                ...args: any[]
              ) => {
                await origLock(...args);
                lockAcquired.resolve();
                await releasePayment.promise;
              };
            }
            return operation(txContext);
          });
        },
      };

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
        transactionManager: gatedTxManager,
      });

      // Start payment settlement
      const payPromise = paymentService.notification("req-pay-win", {
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

      // Wait until payment acquires lifecycle locks
      await lockAcquired.promise;

      // Cleanup starts on connection 2 and contends
      const salesOrderRepo2 = new PrismaSalesOrderRepository(client2);
      const cleanupPromise =
        salesOrderRepo2.reclaimExpiredStorefrontReservation({
          cutoff: new Date(Date.now() + 100000),
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });

      // Release payment lock
      releasePayment.resolve();

      const [payResult, cleanupRes] = await Promise.all([
        payPromise,
        cleanupPromise,
      ]);

      expect(payResult.ok).toBe(true);
      expect(cleanupRes.reclaimed).toBe(false);

      // Order is CONFIRMED and reservation is ACTIVE
      const dbOrder = await observerPrisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder?.status).toBe("CONFIRMED");

      const dbRsv = await observerPrisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(dbRsv?.status).toBe("ACTIVE");

      // Attempt is SUCCEEDED
      const dbAttempt = await observerPrisma.onlinePaymentAttempt.findUnique({
        where: { id: attempt.id },
      });
      expect(dbAttempt?.status).toBe("SUCCEEDED");
      expect(dbAttempt?.resolutionStatus).toBe("NORMAL");

      // Exactly one payment batch / settlement
      const batches = await observerPrisma.paymentBatch.findMany({
        where: { organizationId: fixture.organization.id },
      });
      expect(batches.length).toBe(1);

      // Replay notification remains idempotent
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
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
    }
  });

  it("routes to REFUND_REQUIRED when cleanup wins before payment settlement", async () => {
    const fixture = await createFixture(prisma);
    const client2 = createPrismaClient();

    try {
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const { attempt, orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        paymentPreference: "ONLINE_PAYMENT",
        prismaClient: prisma,
        quantity: 1,
      });

      if (!attempt) throw new Error("Online payment attempt must exist");

      const reclaimHeld = createDeferred();
      const releaseReclaim = createDeferred();

      // Connection 1: reclaim transaction executes reclaim, holds locks
      const reclaimPromise = prisma.$transaction(async (tx) => {
        const txSales = createTransactionScopedSalesOrderRepository(tx);
        const res = await txSales.reclaimExpiredStorefrontReservation({
          cutoff: new Date(),
          organizationId: fixture.organization.id,
          salesOrderId: orderId,
        });
        reclaimHeld.resolve();
        await releaseReclaim.promise;
        return res;
      });

      await reclaimHeld.promise;

      // Connection 2: payment settlement starts on independent connection
      const paymentRepo2 = new PrismaOnlinePaymentRepository(client2);
      const txManager2 = new PrismaTransactionManager(
        client2,
      ) as unknown as ApplicationTransactionManager;

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

      const paymentService2 = new OnlinePaymentApplicationService({
        clock: { now: () => new Date() },
        provider: providerStub,
        repository: paymentRepo2,
        transactionManager: txManager2,
      });

      const payPromise = paymentService2.notification("req-pay-cln", {
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

      // Release reclaim transaction
      releaseReclaim.resolve();

      const [reclaimRes, payResult] = await Promise.all([
        reclaimPromise,
        payPromise,
      ]);

      expect(reclaimRes.reclaimed).toBe(true);
      expect(payResult.ok).toBe(true);

      // Verified provider success settled as SUCCEEDED with REFUND_REQUIRED
      const dbAttempt = await observerPrisma.onlinePaymentAttempt.findUnique({
        where: { id: attempt.id },
      });
      expect(dbAttempt?.status).toBe("SUCCEEDED");
      expect(dbAttempt?.resolutionStatus).toBe("REFUND_REQUIRED");

      const reconciliation =
        await observerPrisma.paymentReconciliation.findFirst({
          where: { paymentAttemptId: attempt.id },
        });
      expect(reconciliation?.reasonCode).toBe(
        "LATE_SUCCESS_RESERVATION_UNAVAILABLE",
      );

      // Order remains CANCELLED, reservation remains EXPIRED
      const dbOrder = await observerPrisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder?.status).toBe("CANCELLED");

      const dbRsv = await observerPrisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(dbRsv?.status).toBe("EXPIRED");

      // Exactly one payment batch / settlement
      const batches = await observerPrisma.paymentBatch.findMany({
        where: { organizationId: fixture.organization.id },
      });
      expect(batches.length).toBe(1);

      // Replay remains idempotent
      const replay = await paymentService2.notification("req-pay-cln", {
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
      expect(replay).toMatchObject({ data: { replayed: true }, ok: true });
    } finally {
      await Promise.all([
        client2.$disconnect(),
        cleanupFixture(prisma, fixture),
      ]);
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
      const { order, orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        prismaClient: prisma,
        quantity: 1,
      });

      const initialRsv =
        await observerPrisma.inventoryReservation.findFirstOrThrow({
          where: { referenceId: orderId, referenceType: "SALES_ORDER" },
        });

      // Wrap findDueStorefrontReservationOrderIds to ensure BOTH discover BEFORE either reclaims
      const aDiscovered = createDeferred();
      const bDiscovered = createDeferred();

      const wrappedRepo1 = Object.create(salesOrderRepo1);
      wrappedRepo1.findDueStorefrontReservationOrderIds = async (
        filter: Parameters<
          PrismaSalesOrderRepository["findDueStorefrontReservationOrderIds"]
        >[0],
      ) => {
        const ids =
          await salesOrderRepo1.findDueStorefrontReservationOrderIds(filter);
        expect(ids).toContain(orderId);
        aDiscovered.resolve();
        await bDiscovered.promise;
        return ids;
      };

      const wrappedRepo2 = Object.create(salesOrderRepo2);
      wrappedRepo2.findDueStorefrontReservationOrderIds = async (
        filter: Parameters<
          PrismaSalesOrderRepository["findDueStorefrontReservationOrderIds"]
        >[0],
      ) => {
        const ids =
          await salesOrderRepo2.findDueStorefrontReservationOrderIds(filter);
        expect(ids).toContain(orderId);
        bDiscovered.resolve();
        await aDiscovered.promise;
        return ids;
      };

      const maint1 = new StorefrontReservationMaintenanceService({
        clock: { now: () => new Date() },
        salesOrderRepository: wrappedRepo1,
        transactionManager: txManager1,
      });
      const maint2 = new StorefrontReservationMaintenanceService({
        clock: { now: () => new Date() },
        salesOrderRepository: wrappedRepo2,
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

      // Order and reservation version incremented exactly once by reclaim
      const dbOrder = await observerPrisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder?.version).toBe(order.version + 1);

      const dbRsv = await observerPrisma.inventoryReservation.findFirst({
        where: { referenceId: orderId, referenceType: "SALES_ORDER" },
      });
      expect(dbRsv?.version).toBe(initialRsv.version + 1);

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

    try {
      const pastDeadline = new Date(Date.now() - 60 * 1000);
      const { order, orderId } = await createDueStorefrontOrder({
        fixture,
        pastDeadline,
        prismaClient: prisma,
        quantity: 2,
      });

      const initialRsv =
        await observerPrisma.inventoryReservation.findFirstOrThrow({
          where: { referenceId: orderId, referenceType: "SALES_ORDER" },
        });

      const nonExistentUserId = "00000000-0000-4000-8000-000000000099";
      await expect(
        prisma.$transaction(async (tx) => {
          const txSales = createTransactionScopedSalesOrderRepository(tx);
          // 1. Reclaim the reservation inside transaction
          await txSales.reclaimExpiredStorefrontReservation({
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
              userId: nonExistentUserId, // REAL FK VIOLATION in PostgreSQL
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
      expect(dbRsv?.version).toBe(initialRsv.version);
      expect(dbRsv?.expiredAt).toBeNull();

      // Filter specifically: NO STOREFRONT_RESERVATION_EXPIRED audit exists
      const expiryAudits = await observerPrisma.auditEntry.findMany({
        where: {
          action: "STOREFRONT_RESERVATION_EXPIRED",
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
      });
      expect(expiryAudits.length).toBe(0);

      // The placement audit must remain
      const placementAudits = await observerPrisma.auditEntry.findMany({
        where: {
          action: "STOREFRONT_ORDER_PLACED",
          organizationId: fixture.organization.id,
          resourceId: orderId,
        },
      });
      expect(placementAudits.length).toBe(1);

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
