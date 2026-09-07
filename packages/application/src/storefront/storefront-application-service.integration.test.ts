import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OnlinePaymentProviderAdapter } from "@senvo/domain";
import {
  createPrismaClient,
  PrismaInventoryAvailabilityQueryRepository,
  PrismaOnlinePaymentRepository,
  PrismaStorefrontRepository,
  PrismaTransactionManager,
} from "@senvo/database";
import { StorefrontApplicationService } from "./storefront-application-service.js";
import { OnlinePaymentApplicationService } from "../payment/online-payment-application-service.js";

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

describe("StorefrontApplicationService online payment pre-write integrity", () => {
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

  it("rejects online checkout before writes when online payments service is missing", async () => {
    const fixture = await createFixture(prisma);
    const storefrontRepo = new PrismaStorefrontRepository(prisma);
    const storefront = new StorefrontApplicationService({
      organizationCode: fixture.organization.code,
      repository: storefrontRepo,
      transactionManager: new PrismaTransactionManager(prisma),
    });

    try {
      const baseline = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(baseline.onHandQuantity).toBe(5);
      expect(baseline.reservedQuantity).toBe(0);
      expect(baseline.availableQuantity).toBe(5);

      const idempotencyKey = `idem-missing-${randomUUID()}`;
      const payload = checkoutPayload(fixture, idempotencyKey);

      const result = await storefront.checkout("req-missing-service", payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BUSINESS_RULE_VIOLATION");
        expect(result.error.message).toBe("Online payment is unavailable.");
      }

      await assertZeroDelta(observerPrisma, fixture.organization.id);

      const replay = await storefrontRepo.findCheckoutByIdempotencyKey(
        fixture.organization.id,
        idempotencyKey,
      );
      expect(replay).toBeNull();

      const unchanged = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(unchanged.onHandQuantity).toBe(5);
      expect(unchanged.reservedQuantity).toBe(0);
      expect(unchanged.availableQuantity).toBe(5);
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });

  it("rejects online checkout before writes when provider is disabled and permits retry after enablement", async () => {
    const fixture = await createFixture(prisma);
    const storefrontRepo = new PrismaStorefrontRepository(prisma);

    const createSession = vi.fn(() =>
      Promise.resolve({
        expiresAt: null,
        redirectUrl: "https://sandbox.sslcommerz.com/redirect",
        sessionId: "session-integration-1",
      }),
    );

    const providerState = { enabled: false };
    const provider: OnlinePaymentProviderAdapter = {
      get enabled() {
        return providerState.enabled;
      },
      createSession,
      initiateRefund: vi.fn(),
      queryRefund: vi.fn(),
      queryTransaction: vi.fn(),
      validateNotificationSignature: vi.fn(() => true),
      validateTransaction: vi.fn(),
    };

    const onlinePayments = new OnlinePaymentApplicationService({
      provider,
      repository: new PrismaOnlinePaymentRepository(prisma),
      transactionManager: new PrismaTransactionManager(prisma),
    });

    const storefront = new StorefrontApplicationService({
      onlinePayments,
      organizationCode: fixture.organization.code,
      repository: storefrontRepo,
      transactionManager: new PrismaTransactionManager(prisma),
    });

    try {
      const baseline = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(baseline.onHandQuantity).toBe(5);
      expect(baseline.reservedQuantity).toBe(0);
      expect(baseline.availableQuantity).toBe(5);

      const idempotencyKey = `idem-disabled-${randomUUID()}`;
      const payload = checkoutPayload(fixture, idempotencyKey);

      const failedResult = await storefront.checkout(
        "req-disabled-provider",
        payload,
      );

      expect(failedResult.ok).toBe(false);
      if (!failedResult.ok) {
        expect(failedResult.error.code).toBe("BUSINESS_RULE_VIOLATION");
        expect(failedResult.error.message).toBe(
          "Online payment is unavailable.",
        );
      }

      await assertZeroDelta(observerPrisma, fixture.organization.id);

      const replayBefore = await storefrontRepo.findCheckoutByIdempotencyKey(
        fixture.organization.id,
        idempotencyKey,
      );
      expect(replayBefore).toBeNull();

      const unchanged = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(unchanged.onHandQuantity).toBe(5);
      expect(unchanged.reservedQuantity).toBe(0);
      expect(unchanged.availableQuantity).toBe(5);
      expect(createSession).not.toHaveBeenCalled();

      // Retry with enabled provider and identical idempotency key
      providerState.enabled = true;

      const successResult = await storefront.checkout(
        "req-retry-enabled",
        payload,
      );

      expect(successResult.ok).toBe(true);
      if (successResult.ok) {
        expect(successResult.data.status).toBe("RESERVED");
        expect(successResult.data.totalMinor).toBe(259800);
        expect(successResult.data.payment?.status).toBe("SESSION_READY");
      }

      await expect(
        observerPrisma.salesOrder.count({
          where: { organizationId: fixture.organization.id },
        }),
      ).resolves.toBe(1);
      await expect(
        observerPrisma.salesOrderLine.count({
          where: { organizationId: fixture.organization.id },
        }),
      ).resolves.toBe(1);
      await expect(
        observerPrisma.inventoryReservation.count({
          where: { organizationId: fixture.organization.id },
        }),
      ).resolves.toBe(1);
      await expect(
        observerPrisma.inventoryReservationLine.count({
          where: { organizationId: fixture.organization.id },
        }),
      ).resolves.toBe(1);
      await expect(
        observerPrisma.salesOrderCommerceProfile.count({
          where: { organizationId: fixture.organization.id },
        }),
      ).resolves.toBe(1);
      await expect(
        observerPrisma.auditEntry.count({
          where: {
            action: "STOREFRONT_ORDER_PLACED",
            organizationId: fixture.organization.id,
          },
        }),
      ).resolves.toBe(1);
      await expect(
        observerPrisma.onlinePaymentAttempt.count({
          where: { organizationId: fixture.organization.id },
        }),
      ).resolves.toBe(1);

      const afterRetry = await availabilityRepo.getAvailability({
        organizationId: fixture.organization.id,
        productVariantId: fixture.variant.id,
        stockLocationId: fixture.location.id,
      });
      expect(afterRetry.onHandQuantity).toBe(5);
      expect(afterRetry.reservedQuantity).toBe(2);
      expect(afterRetry.availableQuantity).toBe(3);

      expect(createSession).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupFixture(prisma, fixture);
    }
  });
});

function checkoutPayload(fixture: StorefrontFixture, idempotencyKey: string) {
  return {
    customer: {
      email: "guest@example.test",
      name: "Guest Customer",
      phone: "+8801700000000",
    },
    deliveryAddress: {
      city: "Dhaka",
      district: "Dhaka",
      line1: "123 Test Avenue",
    },
    idempotencyKey,
    lines: [
      {
        productVariantId: fixture.variant.id,
        quantity: 2,
        reviewedUnitPriceMinor: 129900,
      },
    ],
    paymentPreference: "ONLINE_PAYMENT" as const,
  };
}

async function assertZeroDelta(
  observer: ReturnType<typeof createPrismaClient>,
  organizationId: string,
) {
  await expect(
    observer.salesOrder.count({ where: { organizationId } }),
  ).resolves.toBe(0);
  await expect(
    observer.salesOrderLine.count({ where: { organizationId } }),
  ).resolves.toBe(0);
  await expect(
    observer.inventoryReservation.count({ where: { organizationId } }),
  ).resolves.toBe(0);
  await expect(
    observer.inventoryReservationLine.count({ where: { organizationId } }),
  ).resolves.toBe(0);
  await expect(
    observer.salesOrderCommerceProfile.count({ where: { organizationId } }),
  ).resolves.toBe(0);
  await expect(
    observer.auditEntry.count({
      where: { action: "STOREFRONT_ORDER_PLACED", organizationId },
    }),
  ).resolves.toBe(0);
  await expect(
    observer.onlinePaymentAttempt.count({ where: { organizationId } }),
  ).resolves.toBe(0);
}

async function createFixture(
  client: ReturnType<typeof createPrismaClient>,
): Promise<StorefrontFixture> {
  const uid = randomUUID();
  const suffix = uid.slice(0, 8).toUpperCase();
  const organization = await client.organization.create({
    data: {
      code: `SENVO-${suffix}`,
      name: `SENVO Test Org ${suffix}`,
      status: "ACTIVE",
    },
  });

  const branch = await client.branch.create({
    data: {
      code: `BR-${suffix}`,
      name: `Branch ${suffix}`,
      organizationId: organization.id,
      status: "ACTIVE",
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
      code: `COLOR-${suffix}`,
      name: `Color ${suffix}`,
      normalizedName: `color-${suffix.toLowerCase()}`,
      organizationId: organization.id,
    },
  });

  const size = await client.size.create({
    data: {
      code: `SIZE-${suffix}`,
      name: `Size ${suffix}`,
      organizationId: organization.id,
    },
  });

  const product = await client.product.create({
    data: {
      categoryId: category.id,
      name: `Product ${suffix}`,
      organizationId: organization.id,
      productCode: `PRODUCT-${suffix}`,
      slug: `product-${suffix.toLowerCase()}`,
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
