import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  PrismaInventoryAvailabilityQueryRepository,
  PrismaSalesOrderRepository,
  PrismaStorefrontRepository,
  PrismaTransactionManager,
} from "@senvo/database";
import type { ApplicationTransactionManager } from "../context/transaction.js";
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

      // 5. Advance clock past 24 hours
      currentTime = new Date("2026-09-08T13:00:00.000Z");

      // 6. Running maintenance now should reclaim the order
      const overdueReclaim = await maintenanceService.reclaimDueReservations({
        organizationId: fixture.organization.id,
      });
      expect(overdueReclaim.reclaimedCount).toBe(1);
      expect(overdueReclaim.candidatesFound).toBe(1);
      expect(overdueReclaim.reclaimedOrderIds).toEqual([orderId]);

      // 7. Verify stock availability restored: 0 reserved, 5 available
      const restoredAvailability = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(restoredAvailability.reservedQuantity).toBe(0);
      expect(restoredAvailability.availableQuantity).toBe(5);

      // 8. Verify order and reservation records in DB
      const orderRecord = await observerPrisma.salesOrder.findUnique({
        where: { id: orderId },
      });
      expect(orderRecord?.status).toBe("CANCELLED");

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
