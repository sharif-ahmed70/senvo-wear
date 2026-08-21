import {
  BusinessRuleError,
  ConflictError,
  addPosCartItem,
  checkoutCart,
  collectOutstandingPayment,
  recordCheckoutRefund,
  recordPosSaleReturn,
  openSalesSession,
} from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import {
  PrismaOrganizationMembershipRepository,
  PrismaUserRepository,
} from "../identity/repositories.js";
import { PrismaPosRepository } from "./repository.js";
import { PrismaPosCheckoutRepository } from "./checkout-repository.js";
import { PrismaPosReturnRepository } from "./return-repository.js";
import { PrismaPaymentRefundRepository } from "../payment/refund-repository.js";
import { PrismaReceiptRepository } from "../receipt/repository.js";
import { PrismaOperationalReportRepository } from "../reporting/operational-report-repository.js";
import { PrismaTransactionManager } from "../transaction/prisma-transaction-manager.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
let prisma: ReturnType<typeof createPrismaClient>;
let repository: PrismaPosRepository;
type CheckoutTestContext = {
  organizationId: string;
  requestId: string;
  userId: string | null;
};

describeWithDatabase("Prisma offline POS repository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    repository = new PrismaPosRepository(prisma);
  });
  beforeEach(cleanDatabase);
  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("preserves organization isolation and unique counter codes", async () => {
    const first = await seedOrganization("POS-A");
    const second = await seedOrganization("POS-B");
    const counter = await repository.createCounter({
      boothId: null,
      branchId: first.branch.id,
      code: "MAIN-01",
      name: "Main counter",
      organizationId: first.organization.id,
      status: "ACTIVE",
      type: "STORE",
    });
    await expect(
      repository.createCounter({
        boothId: null,
        branchId: first.branch.id,
        code: "MAIN-01",
        name: "Duplicate",
        organizationId: first.organization.id,
        status: "ACTIVE",
        type: "STORE",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      repository.findCounterById(counter.id, second.organization.id),
    ).resolves.toBeNull();
  });

  it("creates one cart with the session and enforces one open session per counter", async () => {
    const base = await seedOrganization("SESSION");
    const input = {
      counterId: base.counter.id,
      openedAt: new Date("2026-08-03T09:00:00.000Z"),
      organizationId: base.organization.id,
      userId: base.user.id,
    };
    const users = new PrismaUserRepository(prisma);
    const memberships = new PrismaOrganizationMembershipRepository(prisma);
    const opened = await openSalesSession(
      { memberships, pos: repository, users },
      input,
    );
    expect(opened.cartId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(opened.status).toBe("OPEN");
    await expect(
      repository.listOpenSessionsByUser(base.organization.id, base.user.id),
    ).resolves.toEqual([expect.objectContaining({ id: opened.id })]);
    await expect(
      repository.openSession({
        counterId: base.counter.id,
        openedAt: new Date(),
        openedByUserId: base.user.id,
        organizationId: base.organization.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      await prisma.posCart.count({ where: { salesSessionId: opened.id } }),
    ).toBe(1);
  });

  it("stores server-derived cart prices and keeps closed session history", async () => {
    const base = await seedOrganization("CART");
    const variant = await seedVariant(base.organization.id);
    const otherCashier = await seedOrganizationMember(
      base.organization.id,
      "CART-OTHER-CASHIER",
    );
    const opened = await repository.openSession({
      counterId: base.counter.id,
      openedAt: new Date("2026-08-03T09:00:00.000Z"),
      openedByUserId: base.user.id,
      organizationId: base.organization.id,
    });
    const line = await addPosCartItem(
      {
        inventory: {
          getVariantAvailability: () =>
            Promise.resolve({ locations: [{ availableToSell: 2 }] }),
        } as never,
        pos: repository,
      },
      {
        cartId: opened.cartId,
        organizationId: base.organization.id,
        productVariantId: variant.id,
        quantity: 2,
        userId: base.user.id,
      },
    );
    expect(line).toMatchObject({
      lineSubtotalMinor: 5000,
      unitPriceMinor: 2500,
    });
    await expect(
      repository.findCartDetailsById(
        opened.cartId,
        base.organization.id,
        base.user.id,
      ),
    ).resolves.toMatchObject({
      checkoutId: null,
      lines: [
        {
          color: "Black",
          productName: "Oxford Shirt",
          quantity: 2,
          size: "Large",
          sku: variant.sku,
        },
      ],
      sessionStatus: "OPEN",
    });
    const other = await seedOrganization("CART-OTHER");
    await expect(
      repository.findCartDetailsById(
        opened.cartId,
        other.organization.id,
        other.user.id,
      ),
    ).resolves.toBeNull();
    await expect(
      repository.findCartDetailsById(
        opened.cartId,
        base.organization.id,
        otherCashier.id,
      ),
    ).resolves.toBeNull();
    const closed = await repository.closeSession({
      closedAt: new Date("2026-08-03T10:00:00.000Z"),
      expectedVersion: 1,
      id: opened.id,
      organizationId: base.organization.id,
    });
    expect(closed).toMatchObject({ status: "CLOSED" });
    expect(await repository.listSessions(base.organization.id)).toHaveLength(1);
    await expect(
      prisma.salesCounter.delete({ where: { id: base.counter.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("atomically completes a sale, consumes inventory, and writes audit history", async () => {
    const base = await seedCheckout("CHECKOUT", 5, 2);
    const result = await completeCheckout(base, "checkout-success-001");
    expect(result.checkout).toMatchObject({
      status: "COMPLETED",
      subtotalMinor: 5000,
      totalMinor: 5000,
    });
    await expect(
      repository.findCartDetailsById(
        base.session.cartId,
        base.organization.id,
        base.user.id,
      ),
    ).resolves.toMatchObject({ checkoutId: result.checkout.id });
    await expect(
      prisma.salesOrder.findUnique({
        where: { id: result.checkout.salesOrderId },
      }),
    ).resolves.toMatchObject({
      channel: "OFFLINE_STORE",
      status: "FULFILLED",
      totalMinor: 5000,
    });
    await expect(
      prisma.paymentBatch.findFirst({
        include: { lines: true },
        where: { checkoutId: result.checkout.id },
      }),
    ).resolves.toMatchObject({
      lines: [{ amountMinor: 5000, method: "CASH" }],
      outstandingMinor: 0,
      paidMinor: 5000,
      status: "PAID",
    });
    await expect(
      prisma.salesReceipt.findFirst({
        include: { lines: true, payments: true },
        where: { checkoutId: result.checkout.id },
      }),
    ).resolves.toMatchObject({
      lines: [
        {
          productName: "Oxford Shirt",
          quantity: 2,
          sku: "OX-BLK-L",
        },
      ],
      organizationName: "Organization CHECKOUT",
      paymentStatus: "PAID",
      payments: [{ amountMinor: 5000, method: "CASH" }],
      totalMinor: 5000,
    });
    await prisma.organization.update({
      data: { name: "Renamed organization" },
      where: { id: base.organization.id },
    });
    await prisma.salesCounter.update({
      data: { name: "Renamed counter" },
      where: { id: base.counter.id },
    });
    await expect(
      prisma.salesReceipt.findFirst({
        where: { checkoutId: result.checkout.id },
      }),
    ).resolves.toMatchObject({
      counterName: "Counter 1",
      organizationName: "Organization CHECKOUT",
    });
    await expect(
      prisma.inventoryReservation.findFirst({
        where: { referenceId: result.checkout.salesOrderId },
      }),
    ).resolves.toMatchObject({ status: "CONFIRMED" });
    expect(
      await prisma.inventoryMovementLine.aggregate({
        _sum: { quantity: true },
        where: {
          movement: { status: "POSTED", type: "ISSUE" },
          productVariantId: base.variant.id,
        },
      }),
    ).toMatchObject({ _sum: { quantity: 2 } });
    await expect(
      prisma.auditEntry.count({
        where: {
          action: {
            in: [
              "POS_CHECKOUT_COMPLETED",
              "POS_PAYMENT_RECORDED",
              "SALES_RECEIPT_ISSUED",
            ],
          },
          organizationId: base.organization.id,
        },
      }),
    ).resolves.toBe(3);
  });

  it("records repeated partial returns into Return hold with isolated immutable history", async () => {
    const base = await seedCheckout("RETURN", 5, 2);
    const completed = await completeCheckout(base, "checkout-return-001");
    const originalOrder = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: completed.checkout.salesOrderId },
    });
    const originalPayment = await prisma.paymentBatch.findFirstOrThrow({
      where: { checkoutId: completed.checkout.id },
    });
    const originalReceipt = await prisma.salesReceipt.findFirstOrThrow({
      where: { checkoutId: completed.checkout.id },
    });
    const originalFulfillment =
      await prisma.inventoryMovement.findUniqueOrThrow({
        where: { id: originalOrder.fulfillmentMovementId! },
      });
    const originalCollectionCount = await prisma.paymentCollection.count({
      where: { checkoutId: completed.checkout.id },
    });
    const originalCollectionReceiptCount =
      await prisma.paymentCollectionReceipt.count({
        where: { checkoutId: completed.checkout.id },
      });
    const destination = await prisma.stockLocation.create({
      data: {
        branchId: base.branch.id,
        code: "RETURN-HOLD",
        isSellable: false,
        name: "Return hold",
        organizationId: base.organization.id,
        status: "ACTIVE",
        type: "RETURN_HOLD",
      },
    });
    const other = await seedOrganization("RETURN-OTHER");
    const foreignDestination = await prisma.stockLocation.create({
      data: {
        branchId: other.branch.id,
        code: "RETURN-HOLD",
        isSellable: false,
        name: "Foreign return hold",
        organizationId: other.organization.id,
        status: "ACTIVE",
        type: "RETURN_HOLD",
      },
    });
    const orderLine = await prisma.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: completed.checkout.salesOrderId },
    });
    await expect(
      recordReturn(
        base,
        completed.checkout.id,
        foreignDestination.id,
        orderLine.id,
        1,
        "return-foreign-location-001",
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    const first = await recordReturn(
      base,
      completed.checkout.id,
      destination.id,
      orderLine.id,
      1,
      "return-partial-001",
    );
    expect(first.saleReturn.totalCreditMinor).toBe(2500);
    const second = await recordReturn(
      base,
      completed.checkout.id,
      destination.id,
      orderLine.id,
      1,
      "return-partial-002",
    );
    expect(second.account).toMatchObject({
      adjustedPayableMinor: 0,
      refundableMinor: 5000,
      returnCreditMinor: 5000,
      settlementStatus: "REFUND_DUE",
    });
    await expect(
      recordReturn(
        base,
        completed.checkout.id,
        destination.id,
        orderLine.id,
        1,
        "return-over-001",
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      prisma.posSaleReturn.count({
        where: { checkoutId: completed.checkout.id },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.inventoryMovement.count({
        where: { referenceType: "POS_RETURN", status: "POSTED" },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.salesOrder.findUniqueOrThrow({ where: { id: originalOrder.id } }),
    ).resolves.toEqual(originalOrder);
    await expect(
      prisma.paymentBatch.findUniqueOrThrow({
        where: { id: originalPayment.id },
      }),
    ).resolves.toEqual(originalPayment);
    await expect(
      prisma.salesReceipt.findUniqueOrThrow({
        where: { id: originalReceipt.id },
      }),
    ).resolves.toEqual(originalReceipt);
    await expect(
      prisma.inventoryMovement.findUniqueOrThrow({
        where: { id: originalFulfillment.id },
      }),
    ).resolves.toEqual(originalFulfillment);
    await expect(
      prisma.paymentCollection.count({
        where: { checkoutId: completed.checkout.id },
      }),
    ).resolves.toBe(originalCollectionCount);
    await expect(
      prisma.paymentCollectionReceipt.count({
        where: { checkoutId: completed.checkout.id },
      }),
    ).resolves.toBe(originalCollectionReceiptCount);
    expect(originalOrder.status).toBe("FULFILLED");
    expect(originalFulfillment.reversesMovementId).toBeNull();
    const returns = new PrismaPosReturnRepository(prisma);
    await expect(
      returns.findAccount(completed.checkout.id, other.organization.id),
    ).resolves.toBeNull();
    await expect(
      prisma.posCheckoutRecord.delete({ where: { id: completed.checkout.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("rolls back return, movement, receipt, and audit together", async () => {
    const base = await seedCheckout("RETURN-ROLLBACK", 5, 1);
    const completed = await completeCheckout(
      base,
      "checkout-return-rollback-001",
    );
    const destination = await prisma.stockLocation.create({
      data: {
        branchId: base.branch.id,
        code: "RETURN-HOLD",
        isSellable: false,
        name: "Return hold",
        organizationId: base.organization.id,
        status: "ACTIVE",
        type: "RETURN_HOLD",
      },
    });
    const orderLine = await prisma.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: completed.checkout.salesOrderId },
    });
    await expect(
      recordReturn(
        base,
        completed.checkout.id,
        destination.id,
        orderLine.id,
        1,
        "return-rollback-001",
        true,
      ),
    ).rejects.toThrow("Simulated return audit failure");
    await expect(
      prisma.posSaleReturn.count({
        where: { checkoutId: completed.checkout.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.inventoryMovement.count({
        where: { referenceType: "POS_RETURN" },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.posReturnReceipt.count({
        where: { checkoutId: completed.checkout.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditEntry.count({
        where: { action: "POS_SALE_RETURN_RECORDED" },
      }),
    ).resolves.toBe(0);
  });

  it("serializes identical retries and competing returns without duplicate stock or credit", async () => {
    const base = await seedCheckout("RETURN-RACE", 5, 2);
    const completed = await completeCheckout(base, "checkout-return-race-001");
    const destination = await prisma.stockLocation.create({
      data: {
        branchId: base.branch.id,
        code: "RETURN-HOLD",
        isSellable: false,
        name: "Return hold",
        organizationId: base.organization.id,
        status: "ACTIVE",
        type: "RETURN_HOLD",
      },
    });
    const orderLine = await prisma.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: completed.checkout.salesOrderId },
    });
    const identical = await Promise.all([
      recordReturn(
        base,
        completed.checkout.id,
        destination.id,
        orderLine.id,
        1,
        "return-race-same-001",
      ),
      recordReturn(
        base,
        completed.checkout.id,
        destination.id,
        orderLine.id,
        1,
        "return-race-same-001",
      ),
    ]);
    expect(identical.filter((result) => result.replayed)).toHaveLength(1);
    await expect(
      prisma.posSaleReturn.count({
        where: { checkoutId: completed.checkout.id },
      }),
    ).resolves.toBe(1);
    await expect(
      recordReturn(
        base,
        completed.checkout.id,
        destination.id,
        orderLine.id,
        2,
        "return-race-same-001",
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    const competing = await Promise.allSettled([
      recordReturn(
        base,
        completed.checkout.id,
        destination.id,
        orderLine.id,
        1,
        "return-race-new-001",
      ),
      recordReturn(
        base,
        completed.checkout.id,
        destination.id,
        orderLine.id,
        1,
        "return-race-new-002",
      ),
    ]);
    expect(
      competing.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      competing.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expect(
      prisma.posSaleReturn.count({
        where: { checkoutId: completed.checkout.id },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.inventoryMovement.count({
        where: { referenceType: "POS_RETURN" },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.posReturnReceipt.count({
        where: { checkoutId: completed.checkout.id },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.auditEntry.count({
        where: {
          action: "POS_SALE_RETURN_RECORDED",
          organizationId: base.organization.id,
        },
      }),
    ).resolves.toBe(2);
  });

  it("serializes return and payment collection on the checkout settlement lock", async () => {
    const base = await seedCheckout("RETURN-PAYMENT-RACE", 5, 2);
    const completed = await completeCheckout(
      base,
      "checkout-return-payment-race-001",
      {
        allowOutstanding: true,
        payments: [{ amountMinor: 1_000, method: "CASH" }],
      },
    );
    const destination = await prisma.stockLocation.create({
      data: {
        branchId: base.branch.id,
        code: "RETURN-HOLD",
        isSellable: false,
        name: "Return hold",
        organizationId: base.organization.id,
        status: "ACTIVE",
        type: "RETURN_HOLD",
      },
    });
    const orderLine = await prisma.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: completed.checkout.salesOrderId },
    });
    const race = await Promise.allSettled([
      recordReturn(
        base,
        completed.checkout.id,
        destination.id,
        orderLine.id,
        1,
        "return-payment-race-001",
      ),
      collectPayment(
        base,
        completed.checkout.id,
        4_000,
        "collection-return-race-001",
      ),
    ]);
    expect(race[0]?.status).toBe("fulfilled");
    const account = await new PrismaPosReturnRepository(prisma).findAccount(
      completed.checkout.id,
      base.organization.id,
    );
    expect(account).not.toBeNull();
    expect(account!.adjustedPayableMinor).toBe(2_500);
    expect(account!.outstandingMinor).toBeGreaterThanOrEqual(0);
    expect(account!.refundableMinor).toBeGreaterThanOrEqual(0);
    const collectionCount = await prisma.paymentCollection.count({
      where: { checkoutId: completed.checkout.id },
    });
    expect(collectionCount === 0 || collectionCount === 1).toBe(true);
    if (collectionCount === 0) {
      expect(account).toMatchObject({
        cumulativeReceivedMinor: 1_000,
        outstandingMinor: 1_500,
        refundableMinor: 0,
      });
    } else {
      expect(account).toMatchObject({
        cumulativeReceivedMinor: 5_000,
        outstandingMinor: 0,
        refundableMinor: 2_500,
      });
    }
  });

  it("records split refunds with immutable history, idempotency, and organization isolation", async () => {
    const base = await seedCheckout("REFUND", 5, 2);
    const completed = await completeCheckout(base, "checkout-refund-001");
    const destination = await seedReturnHold(base);
    const orderLine = await prisma.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: completed.checkout.salesOrderId },
    });
    await recordReturn(
      base,
      completed.checkout.id,
      destination.id,
      orderLine.id,
      1,
      "refund-source-return-001",
    );
    const identical = await Promise.all([
      recordRefund(base, completed.checkout.id, "refund-record-001", [
        { amountMinor: 1_000, method: "CASH" },
        { amountMinor: 500, method: "CARD", reference: "REFUND-CARD-001" },
      ]),
      recordRefund(base, completed.checkout.id, "refund-record-001", [
        { amountMinor: 1_000, method: "CASH" },
        { amountMinor: 500, method: "CARD", reference: "REFUND-CARD-001" },
      ]),
    ]);
    const first = identical.find((result) => !result.replayed)!;
    const replay = identical.find((result) => result.replayed)!;
    expect(first).toMatchObject({
      account: {
        cumulativeRefundedMinor: 1_500,
        grossReceivedMinor: 5_000,
        netReceivedMinor: 3_500,
        refundableMinor: 1_000,
      },
      replayed: false,
    });
    expect(replay).toMatchObject({
      refund: { id: first.refund.id },
      replayed: true,
    });
    await expect(prisma.paymentRefund.count()).resolves.toBe(1);
    await expect(prisma.paymentRefundLine.count()).resolves.toBe(2);
    await expect(prisma.paymentRefundReceipt.count()).resolves.toBe(1);
    await expect(
      prisma.auditEntry.count({
        where: {
          action: "POS_REFUND_ISSUED",
          organizationId: base.organization.id,
        },
      }),
    ).resolves.toBe(1);
    const receipt = await prisma.paymentRefundReceipt.findUniqueOrThrow({
      where: {
        refundId_organizationId: {
          organizationId: base.organization.id,
          refundId: first.refund.id,
        },
      },
    });
    expect(receipt).toMatchObject({
      cumulativeRefundedMinor: 1_500,
      grossReceivedMinor: 5_000,
      netReceivedMinor: 3_500,
      refundableMinor: 1_000,
    });
    await expect(
      prisma.paymentRefund.delete({ where: { id: first.refund.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.posCheckoutRecord.delete({ where: { id: completed.checkout.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.paymentBatch.findUniqueOrThrow({
        where: {
          checkoutId_organizationId: {
            checkoutId: completed.checkout.id,
            organizationId: base.organization.id,
          },
        },
      }),
    ).resolves.toMatchObject({ paidMinor: 5_000 });
    await expect(
      prisma.posSaleReturn.count({
        where: { checkoutId: completed.checkout.id },
      }),
    ).resolves.toBe(1);
    const other = await seedOrganization("REFUND-OTHER");
    const refunds = new PrismaPaymentRefundRepository(prisma);
    await expect(
      refunds.findAccountByCheckoutId(
        completed.checkout.id,
        other.organization.id,
      ),
    ).resolves.toBeNull();
  });

  it("persists stale cash refund references as null in lines and receipts", async () => {
    const base = await seedCheckout("REFUND-CASH-REFERENCE", 5, 2);
    const completed = await completeCheckout(
      base,
      "checkout-refund-cash-reference-001",
    );
    const destination = await seedReturnHold(base);
    const orderLine = await prisma.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: completed.checkout.salesOrderId },
    });
    await recordReturn(
      base,
      completed.checkout.id,
      destination.id,
      orderLine.id,
      1,
      "refund-cash-reference-return-001",
    );

    const result = await recordRefund(
      base,
      completed.checkout.id,
      "refund-cash-reference-001",
      [
        {
          amountMinor: 1_000,
          method: "CASH",
          reference: "stale-browser-value",
        },
      ],
    );

    const persistedLine = await prisma.paymentRefundLine.findFirstOrThrow({
      where: { method: "CASH", refundId: result.refund.id },
    });
    expect(persistedLine.reference).toBeNull();
    const receipt = await new PrismaReceiptRepository(prisma).findByRefundId(
      result.refund.id,
      base.organization.id,
    );
    expect(receipt?.lines).toEqual([
      expect.objectContaining({ method: "CASH", reference: null }),
    ]);
  });

  it("rolls back refund, receipt, lines, and audit together", async () => {
    const base = await seedCheckout("REFUND-ROLLBACK", 5, 1);
    const completed = await completeCheckout(
      base,
      "checkout-refund-rollback-001",
    );
    const destination = await seedReturnHold(base);
    const orderLine = await prisma.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: completed.checkout.salesOrderId },
    });
    await recordReturn(
      base,
      completed.checkout.id,
      destination.id,
      orderLine.id,
      1,
      "refund-rollback-return-001",
    );
    await expect(
      recordRefund(
        base,
        completed.checkout.id,
        "refund-rollback-001",
        [{ amountMinor: 500, method: "CASH" }],
        true,
      ),
    ).rejects.toThrow("Simulated refund audit failure");
    await expect(prisma.paymentRefund.count()).resolves.toBe(0);
    await expect(prisma.paymentRefundLine.count()).resolves.toBe(0);
    await expect(prisma.paymentRefundReceipt.count()).resolves.toBe(0);
    await expect(
      prisma.auditEntry.count({ where: { action: "POS_REFUND_ISSUED" } }),
    ).resolves.toBe(0);
  });

  it("serializes competing refunds on the checkout settlement lock", async () => {
    const base = await seedCheckout("REFUND-RACE", 5, 1);
    const completed = await completeCheckout(base, "checkout-refund-race-001");
    const destination = await seedReturnHold(base);
    const orderLine = await prisma.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: completed.checkout.salesOrderId },
    });
    await recordReturn(
      base,
      completed.checkout.id,
      destination.id,
      orderLine.id,
      1,
      "refund-race-return-001",
    );
    const race = await Promise.allSettled([
      recordRefund(base, completed.checkout.id, "refund-race-a-001", [
        { amountMinor: 1_500, method: "CASH" },
      ]),
      recordRefund(base, completed.checkout.id, "refund-race-b-001", [
        { amountMinor: 1_500, method: "CASH" },
      ]),
    ]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(race.filter((result) => result.status === "rejected")).toHaveLength(
      1,
    );
    await expect(prisma.paymentRefund.count()).resolves.toBe(1);
    const account = await new PrismaPaymentRefundRepository(
      prisma,
    ).findAccountByCheckoutId(completed.checkout.id, base.organization.id);
    expect(account).toMatchObject({
      cumulativeRefundedMinor: 1_500,
      refundableMinor: 1_000,
    });
  });

  it("serializes a return against a refund with a consistent final settlement", async () => {
    const base = await seedCheckout("RETURN-REFUND-RACE", 5, 2);
    const completed = await completeCheckout(
      base,
      "checkout-return-refund-race-001",
    );
    const destination = await seedReturnHold(base);
    const orderLine = await prisma.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: completed.checkout.salesOrderId },
    });
    await recordReturn(
      base,
      completed.checkout.id,
      destination.id,
      orderLine.id,
      1,
      "return-before-refund-race-001",
    );
    const race = await Promise.allSettled([
      recordRefund(base, completed.checkout.id, "refund-with-return-race-001", [
        { amountMinor: 1_000, method: "CASH" },
      ]),
      recordReturn(
        base,
        completed.checkout.id,
        destination.id,
        orderLine.id,
        1,
        "return-with-refund-race-001",
      ),
    ]);
    expect(race.every((result) => result.status === "fulfilled")).toBe(true);
    const account = await new PrismaPaymentRefundRepository(
      prisma,
    ).findAccountByCheckoutId(completed.checkout.id, base.organization.id);
    expect(account).toMatchObject({
      adjustedPayableMinor: 0,
      cumulativeRefundedMinor: 1_000,
      grossReceivedMinor: 5_000,
      netReceivedMinor: 4_000,
      refundableMinor: 4_000,
      returnCreditMinor: 5_000,
    });
  });

  it("serializes payment collection against refund decisions", async () => {
    const base = await seedCheckout("COLLECTION-REFUND-RACE", 5, 2);
    const completed = await completeCheckout(
      base,
      "checkout-collection-refund-race-001",
      {
        allowOutstanding: true,
        payments: [{ amountMinor: 3_000, method: "CASH" }],
      },
    );
    const destination = await seedReturnHold(base);
    const orderLine = await prisma.salesOrderLine.findFirstOrThrow({
      where: { salesOrderId: completed.checkout.salesOrderId },
    });
    await recordReturn(
      base,
      completed.checkout.id,
      destination.id,
      orderLine.id,
      1,
      "return-before-collection-refund-race-001",
    );
    const race = await Promise.allSettled([
      recordRefund(base, completed.checkout.id, "refund-collection-race-001", [
        { amountMinor: 500, method: "CASH" },
      ]),
      collectPayment(
        base,
        completed.checkout.id,
        500,
        "collection-refund-race-001",
      ),
    ]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(race.filter((result) => result.status === "rejected")).toHaveLength(
      1,
    );
    const account = await new PrismaPaymentRefundRepository(
      prisma,
    ).findAccountByCheckoutId(completed.checkout.id, base.organization.id);
    expect(account).toMatchObject({
      adjustedPayableMinor: 2_500,
      netReceivedMinor: 2_500,
      outstandingMinor: 0,
      refundableMinor: 0,
    });
    expect(
      (account?.cumulativeRefundedMinor ?? 0) +
        (
          await prisma.paymentCollection.aggregate({
            _sum: { amountMinor: true },
            where: { checkoutId: completed.checkout.id },
          })
        )._sum.amountMinor!,
    ).toBe(500);
  });

  it("persists deterministic split tender lines and an approved partial balance", async () => {
    const split = await seedCheckout("SPLIT", 5, 2);
    const splitResult = await completeCheckout(split, "checkout-split-001", {
      payments: [
        { amountMinor: 2000, method: "CASH" },
        { amountMinor: 3000, method: "CARD", reference: " CARD-001 " },
      ],
    });
    await expect(
      prisma.paymentLine.findMany({
        orderBy: { lineNumber: "asc" },
        where: { paymentBatch: { checkoutId: splitResult.checkout.id } },
      }),
    ).resolves.toMatchObject([
      { amountMinor: 2000, lineNumber: 1, method: "CASH", reference: null },
      {
        amountMinor: 3000,
        lineNumber: 2,
        method: "CARD",
        reference: "CARD-001",
      },
    ]);

    await cleanDatabase();
    const partial = await seedCheckout("PARTIAL", 5, 2);
    const partialResult = await completeCheckout(
      partial,
      "checkout-partial-001",
      {
        allowOutstanding: true,
        payments: [{ amountMinor: 1500, method: "CASH" }],
      },
    );
    expect(partialResult.checkout).toMatchObject({
      outstandingMinor: 3500,
      paidMinor: 1500,
      paymentStatus: "PARTIALLY_PAID",
    });

    await cleanDatabase();
    const due = await seedCheckout("DUE", 5, 2);
    const dueResult = await completeCheckout(due, "checkout-due-001", {
      allowOutstanding: true,
      payments: [],
    });
    expect(dueResult.checkout).toMatchObject({
      outstandingMinor: 5000,
      paidMinor: 0,
      paymentStatus: "UNPAID",
    });
    await expect(prisma.paymentLine.count()).resolves.toBe(0);
    await expect(prisma.salesReceipt.count()).resolves.toBe(1);
  });

  it("reports persisted sales, payments, products, stock, and staff with organization isolation", async () => {
    const base = await seedCheckout("REPORT", 5, 2);
    await completeCheckout(base, "checkout-report-001", {
      payments: [
        { amountMinor: 2_000, method: "CASH" },
        { amountMinor: 3_000, method: "CARD", reference: "REPORT-CARD" },
      ],
    });
    const reports = new PrismaOperationalReportRepository(prisma);

    const report = await reports.get({
      from: "2026-08-03",
      organizationId: base.organization.id,
      to: "2026-08-03",
    });

    expect(report.sales).toEqual({
      collectedMinor: 5_000,
      grossMinor: 5_000,
      orderCount: 1,
      outstandingMinor: 0,
      refundMinor: 0,
      returnCreditMinor: 0,
    });
    expect(report.payments).toEqual([
      { amountMinor: 3_000, method: "CARD" },
      { amountMinor: 2_000, method: "CASH" },
    ]);
    expect(report.products).toEqual([
      {
        productName: "Oxford Shirt",
        quantity: 2,
        salesMinor: 5_000,
        sku: base.variant.sku,
      },
    ]);
    expect(report.inventory).toEqual({
      availableToSell: 3,
      onHand: 3,
      outOfStockPositions: 0,
      reserved: 0,
    });
    expect(report.staff).toEqual([
      {
        collectedMinor: 5_000,
        name: "Staff REPORT",
        orderCount: 1,
        salesMinor: 5_000,
      },
    ]);

    const other = await seedOrganization("REPORT-OTHER");
    const isolated = await reports.get({
      from: "2026-08-03",
      organizationId: other.organization.id,
      to: "2026-08-03",
    });
    expect(isolated.sales.orderCount).toBe(0);
    expect(isolated.products).toEqual([]);
    expect(isolated.inventory.onHand).toBe(0);
  });

  it("rolls back every checkout record when payment is greater than the server total", async () => {
    const base = await seedCheckout("OVERPAY", 5, 2);
    await expect(
      completeCheckout(base, "checkout-overpay-001", {
        payments: [{ amountMinor: 5001, method: "CASH" }],
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(prisma.salesOrder.count()).resolves.toBe(0);
    await expect(prisma.posCheckoutRecord.count()).resolves.toBe(0);
    await expect(prisma.paymentBatch.count()).resolves.toBe(0);
    await expect(prisma.salesReceipt.count()).resolves.toBe(0);
    await expect(prisma.auditEntry.count()).resolves.toBe(0);
  });

  it("collects outstanding balances idempotently with organization-scoped immutable receipts", async () => {
    const base = await seedCheckout("COLLECT", 10, 4);
    const completed = await completeCheckout(base, "checkout-collect-001", {
      allowOutstanding: true,
      payments: [{ amountMinor: 3_000, method: "CASH" }],
    });
    const manager = new PrismaTransactionManager<CheckoutTestContext>(prisma);
    const collect = (
      idempotencyKey = "collection-retry-001",
      amountMinor = 2_000,
    ) =>
      manager.execute(
        {
          organizationId: base.organization.id,
          requestId: "request-collection",
          userId: base.user.id,
        },
        async (transaction) => {
          if (!transaction.paymentRepository || !transaction.receiptRepository)
            throw new Error(
              "Payment collection transaction capability is missing.",
            );
          return collectOutstandingPayment(
            {
              payments: transaction.paymentRepository,
              receipts: transaction.receiptRepository,
            },
            {
              acceptedByUserId: base.user.id,
              checkoutId: completed.checkout.id,
              collectedAt: new Date("2026-08-09T10:00:00.000Z"),
              collectionId: crypto.randomUUID(),
              idempotencyKey,
              organizationId: base.organization.id,
              payments: [
                {
                  amountMinor,
                  method: "CARD",
                  reference: "CARD-COLLECT-1",
                },
              ],
              receiptId: crypto.randomUUID(),
            },
          );
        },
      );
    const identical = await Promise.all([collect(), collect()]);
    const first = identical.find((result) => !result.replayed)!;
    const replay = identical.find((result) => result.replayed)!;
    expect(first).toMatchObject({
      replayed: false,
      account: { cumulativePaidMinor: 5_000, outstandingMinor: 5_000 },
    });
    expect(replay).toMatchObject({
      replayed: true,
      collection: { id: first.collection.id },
    });
    await expect(prisma.paymentCollection.count()).resolves.toBe(1);
    await expect(prisma.paymentCollectionReceipt.count()).resolves.toBe(1);
    const competing = await Promise.allSettled([
      collect("collection-competing-001", 3_000),
      collect("collection-competing-002", 3_000),
    ]);
    expect(
      competing.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      competing.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expect(prisma.paymentCollection.count()).resolves.toBe(2);
    const account = await new (
      await import("../payment/repository.js")
    ).PrismaPaymentRepository(prisma).findAccountByCheckoutId(
      completed.checkout.id,
      base.organization.id,
    );
    expect(account).toMatchObject({
      cumulativePaidMinor: 8_000,
      outstandingMinor: 2_000,
    });
    const other = await seedOrganization("COLLECT-OTHER");
    const payments = new (
      await import("../payment/repository.js")
    ).PrismaPaymentRepository(prisma);
    await expect(
      payments.findAccountByCheckoutId(
        completed.checkout.id,
        other.organization.id,
      ),
    ).resolves.toBeNull();
    const originalReceipt = await prisma.salesReceipt.findUniqueOrThrow({
      where: { id: completed.checkout.receiptId! },
    });
    expect(originalReceipt).toMatchObject({
      paidMinor: 3_000,
      outstandingMinor: 7_000,
    });
  });

  it("rolls back the order, reservation, movement, checkout, and audit when stock is insufficient", async () => {
    const base = await seedCheckout("ROLLBACK", 1, 2);
    await expect(
      completeCheckout(base, "checkout-rollback-001"),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      prisma.salesOrder.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.posCheckoutRecord.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.inventoryReservation.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.inventoryMovement.count({
        where: { organizationId: base.organization.id, type: "ISSUE" },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditEntry.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(0);
  });

  it("returns one completed sale for an idempotent retry and preserves organization isolation", async () => {
    const base = await seedCheckout("RETRY", 5, 2);
    const first = await completeCheckout(base, "checkout-retry-001");
    const second = await completeCheckout(base, "checkout-retry-001");
    const other = await seedOrganization("RETRY-OTHER");
    expect(second).toMatchObject({
      checkout: { id: first.checkout.id },
      replayed: true,
    });
    await expect(
      prisma.posCheckoutRecord.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.salesOrder.count({
        where: { organizationId: base.organization.id },
      }),
    ).resolves.toBe(1);
    await expect(prisma.paymentBatch.count()).resolves.toBe(1);
    await expect(prisma.paymentLine.count()).resolves.toBe(1);
    await expect(prisma.salesReceipt.count()).resolves.toBe(1);
    await expect(prisma.auditEntry.count()).resolves.toBe(3);
    const checkouts = new PrismaPosCheckoutRepository(prisma);
    await expect(
      checkouts.findById(first.checkout.id, other.organization.id),
    ).resolves.toBeNull();
    const receipts = new PrismaReceiptRepository(prisma);
    await expect(
      receipts.findByCheckoutId(first.checkout.id, other.organization.id),
    ).resolves.toBeNull();
  });

  it("serializes concurrent identical retries into one payment and receipt", async () => {
    const base = await seedCheckout("CONCURRENT", 5, 2);
    const [first, second] = await Promise.all([
      completeCheckout(base, "checkout-concurrent-001"),
      completeCheckout(base, "checkout-concurrent-001"),
    ]);
    expect(first.checkout.id).toBe(second.checkout.id);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    await expect(prisma.posCheckoutRecord.count()).resolves.toBe(1);
    await expect(prisma.paymentBatch.count()).resolves.toBe(1);
    await expect(prisma.salesReceipt.count()).resolves.toBe(1);
    await expect(prisma.auditEntry.count()).resolves.toBe(3);
  });

  it("reads a pre-payment checkout honestly as unrecorded", async () => {
    const base = await seedCheckout("LEGACY", 5, 2);
    const result = await completeCheckout(base, "checkout-legacy-001");
    await prisma.salesReceiptPayment.deleteMany();
    await prisma.salesReceiptLine.deleteMany();
    await prisma.salesReceipt.deleteMany();
    await prisma.paymentLine.deleteMany();
    await prisma.paymentBatch.deleteMany();
    const checkouts = new PrismaPosCheckoutRepository(prisma);
    await expect(
      checkouts.findById(result.checkout.id, base.organization.id),
    ).resolves.toMatchObject({
      outstandingMinor: null,
      paidMinor: null,
      paymentStatus: "UNRECORDED",
      receiptId: null,
      receiptNumber: null,
    });
  });

  it("rejects cross-organization payment references at the database boundary", async () => {
    const first = await seedCheckout("PAYMENT-FK-A", 5, 2);
    const completed = await completeCheckout(first, "checkout-payment-fk-001");
    const second = await seedOrganization("PAYMENT-FK-B");
    const secondSession = await repository.openSession({
      counterId: second.counter.id,
      openedAt: new Date("2026-08-03T09:00:00.000Z"),
      openedByUserId: second.user.id,
      organizationId: second.organization.id,
    });
    await expect(
      prisma.paymentBatch.create({
        data: {
          checkoutId: completed.checkout.id,
          counterId: second.counter.id,
          currencyCode: "BDT",
          idempotencyKey: "cross-org-payment-001",
          organizationId: second.organization.id,
          outstandingMinor: 0,
          paidMinor: 5000,
          payableMinor: 5000,
          requestSignature: "cross-org-signature",
          salesOrderId: completed.checkout.salesOrderId,
          salesSessionId: secondSession.id,
          staffId: second.user.id,
          status: "PAID",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});

async function seedCheckout(label: string, stock: number, quantity: number) {
  const base = await seedOrganization(label);
  const variant = await seedVariant(base.organization.id);
  await prisma.variantBarcode.create({
    data: {
      value: `${label}-BARCODE`,
      organizationId: base.organization.id,
      productVariantId: variant.id,
      type: "CODE128",
    },
  });
  const location = await prisma.stockLocation.create({
    data: {
      branchId: base.branch.id,
      code: "SELLABLE",
      isSellable: true,
      name: "Sales floor",
      organizationId: base.organization.id,
      type: "SHOWROOM",
    },
  });
  const policy = await prisma.inventoryAllocationPolicy.create({
    data: {
      code: "POS",
      name: "POS allocation",
      organizationId: base.organization.id,
    },
  });
  await prisma.inventoryAllocationPolicyLocation.create({
    data: {
      organizationId: base.organization.id,
      policyId: policy.id,
      priority: 1,
      stockLocationId: location.id,
    },
  });
  await prisma.inventoryMovement.create({
    data: {
      destinationLocationId: location.id,
      idempotencyKey: `${label}-opening`,
      lines: {
        create: {
          lineNumber: 1,
          productVariantId: variant.id,
          quantity: stock,
        },
      },
      movementNumber: `${label}-OPENING`,
      occurredAt: new Date("2026-08-03T08:00:00.000Z"),
      organizationId: base.organization.id,
      payloadSignature: `${label}-opening-signature`,
      postedAt: new Date("2026-08-03T08:00:00.000Z"),
      status: "POSTED",
      type: "OPENING",
    },
  });
  const session = await repository.openSession({
    counterId: base.counter.id,
    openedAt: new Date("2026-08-03T09:00:00.000Z"),
    openedByUserId: base.user.id,
    organizationId: base.organization.id,
  });
  await repository.addCartLine({
    cartId: session.cartId,
    lineSubtotalMinor: 2500 * quantity,
    organizationId: base.organization.id,
    productVariantId: variant.id,
    quantity,
    unitPriceMinor: 2500,
  });
  return {
    ...base,
    location,
    policy,
    session,
    totalMinor: 2500 * quantity,
    variant,
  };
}

async function completeCheckout(
  base: Awaited<ReturnType<typeof seedCheckout>>,
  idempotencyKey: string,
  options: {
    allowOutstanding?: boolean;
    payments?: readonly {
      amountMinor: number;
      method: "BANK_TRANSFER" | "CARD" | "CASH" | "MOBILE_BANKING";
      reference?: string;
    }[];
  } = {},
) {
  const manager = new PrismaTransactionManager<CheckoutTestContext>(prisma);
  return manager.execute(
    {
      organizationId: base.organization.id,
      requestId: `request-${idempotencyKey}`,
      userId: base.user.id,
    },
    async (transaction) => {
      if (
        !transaction.paymentRepository ||
        !transaction.posCheckoutRepository ||
        !transaction.posCheckoutSalesOrderRepository ||
        !transaction.receiptRepository
      ) {
        throw new Error("Checkout transaction capability is missing.");
      }
      const result = await checkoutCart(
        {
          checkouts: transaction.posCheckoutRepository,
          payments: transaction.paymentRepository,
          receipts: transaction.receiptRepository,
          salesOrders: transaction.posCheckoutSalesOrderRepository,
        },
        {
          allowOutstanding: options.allowOutstanding ?? false,
          approveOutstanding: () => Promise.resolve(),
          cartId: base.session.cartId,
          checkoutId: crypto.randomUUID(),
          completedAt: new Date("2026-08-03T10:00:00.000Z"),
          idempotencyKey,
          organizationId: base.organization.id,
          paymentBatchId: crypto.randomUUID(),
          payments: options.payments ?? [
            { amountMinor: base.totalMinor, method: "CASH" },
          ],
          receiptId: crypto.randomUUID(),
          staffId: base.user.id,
        },
      );
      if (!result.replayed) {
        await transaction.auditWriter.recordWithinTransaction({
          action: "POS_CHECKOUT_COMPLETED",
          actor: { userId: base.user.id },
          organizationId: base.organization.id,
          resource: "POS_CHECKOUT",
          resourceId: result.checkout.id,
        });
        await transaction.auditWriter.recordWithinTransaction({
          action: "POS_PAYMENT_RECORDED",
          actor: { userId: base.user.id },
          organizationId: base.organization.id,
          resource: "PAYMENT",
          resourceId: result.checkout.paymentBatchId!,
        });
        await transaction.auditWriter.recordWithinTransaction({
          action: "SALES_RECEIPT_ISSUED",
          actor: { userId: base.user.id },
          organizationId: base.organization.id,
          resource: "SALES_RECEIPT",
          resourceId: result.checkout.receiptId!,
        });
      }
      return result;
    },
  );
}

async function recordReturn(
  base: Awaited<ReturnType<typeof seedCheckout>>,
  checkoutId: string,
  destinationLocationId: string,
  salesOrderLineId: string,
  quantity: number,
  idempotencyKey: string,
  failAfterWrite = false,
) {
  const manager = new PrismaTransactionManager<CheckoutTestContext>(prisma);
  return manager.execute(
    {
      organizationId: base.organization.id,
      requestId: `request-${idempotencyKey}`,
      userId: base.user.id,
    },
    async (transaction) => {
      if (
        !transaction.posReturnRepository ||
        !transaction.posReturnReceiptRepository
      )
        throw new Error("Return transaction capability is missing.");
      const result = await recordPosSaleReturn(
        {
          inventory: transaction.inventoryMovementRepository,
          receipts: transaction.posReturnReceiptRepository,
          returns: transaction.posReturnRepository,
        },
        {
          acceptedByUserId: base.user.id,
          checkoutId,
          destinationLocationId,
          idempotencyKey,
          lines: [{ quantity, salesOrderLineId }],
          organizationId: base.organization.id,
          reasonCode: "SIZE_OR_FIT",
          receiptId: crypto.randomUUID(),
          returnId: crypto.randomUUID(),
          returnedAt: new Date("2026-08-10T10:00:00.000Z"),
        },
      );
      if (!result.replayed)
        await transaction.auditWriter.recordWithinTransaction({
          action: "POS_SALE_RETURN_RECORDED",
          actor: { userId: base.user.id },
          organizationId: base.organization.id,
          resource: "POS_RETURN",
          resourceId: result.saleReturn.id,
        });
      if (failAfterWrite) throw new Error("Simulated return audit failure");
      return result;
    },
  );
}

async function collectPayment(
  base: Awaited<ReturnType<typeof seedCheckout>>,
  checkoutId: string,
  amountMinor: number,
  idempotencyKey: string,
) {
  const manager = new PrismaTransactionManager<CheckoutTestContext>(prisma);
  return manager.execute(
    {
      organizationId: base.organization.id,
      requestId: `request-${idempotencyKey}`,
      userId: base.user.id,
    },
    async (transaction) => {
      if (!transaction.paymentRepository || !transaction.receiptRepository)
        throw new Error(
          "Payment collection transaction capability is missing.",
        );
      return collectOutstandingPayment(
        {
          payments: transaction.paymentRepository,
          receipts: transaction.receiptRepository,
        },
        {
          acceptedByUserId: base.user.id,
          checkoutId,
          collectedAt: new Date("2026-08-10T10:00:00.000Z"),
          collectionId: crypto.randomUUID(),
          idempotencyKey,
          organizationId: base.organization.id,
          payments: [
            { amountMinor, method: "CARD", reference: "RETURN-RACE-CARD" },
          ],
          receiptId: crypto.randomUUID(),
        },
      );
    },
  );
}

async function recordRefund(
  base: Awaited<ReturnType<typeof seedCheckout>>,
  checkoutId: string,
  idempotencyKey: string,
  refunds: readonly {
    amountMinor: number;
    method: "BANK_TRANSFER" | "CARD" | "CASH" | "MOBILE_BANKING";
    reference?: string;
  }[],
  failAfterWrite = false,
) {
  const manager = new PrismaTransactionManager<CheckoutTestContext>(prisma);
  return manager.execute(
    {
      organizationId: base.organization.id,
      requestId: `request-${idempotencyKey}`,
      userId: base.user.id,
    },
    async (transaction) => {
      if (
        !transaction.paymentRefundRepository ||
        !transaction.paymentRefundReceiptRepository
      )
        throw new Error("Payment refund transaction capability is missing.");
      const result = await recordCheckoutRefund(
        {
          receipts: transaction.paymentRefundReceiptRepository,
          refunds: transaction.paymentRefundRepository,
        },
        {
          acceptedByUserId: base.user.id,
          checkoutId,
          idempotencyKey,
          issuedAt: new Date("2026-08-10T11:00:00.000Z"),
          organizationId: base.organization.id,
          receiptId: crypto.randomUUID(),
          refundId: crypto.randomUUID(),
          refunds,
        },
      );
      if (!result.replayed)
        await transaction.auditWriter.recordWithinTransaction({
          action: "POS_REFUND_ISSUED",
          actor: { userId: base.user.id },
          organizationId: base.organization.id,
          resource: "PAYMENT_REFUND",
          resourceId: result.refund.id,
        });
      if (failAfterWrite) throw new Error("Simulated refund audit failure");
      return result;
    },
  );
}

function seedReturnHold(base: Awaited<ReturnType<typeof seedCheckout>>) {
  return prisma.stockLocation.create({
    data: {
      branchId: base.branch.id,
      code: "RETURN-HOLD",
      isSellable: false,
      name: "Return hold",
      organizationId: base.organization.id,
      status: "ACTIVE",
      type: "RETURN_HOLD",
    },
  });
}

async function seedOrganization(label: string) {
  const organization = await prisma.organization.create({
    data: { code: label, name: `Organization ${label}` },
  });
  const user = await prisma.user.create({
    data: { email: `${label.toLowerCase()}@test.dev`, name: `Staff ${label}` },
  });
  await prisma.organizationMembership.create({
    data: { organizationId: organization.id, role: "STAFF", userId: user.id },
  });
  const branch = await prisma.branch.create({
    data: { code: "MAIN", name: "Main Store", organizationId: organization.id },
  });
  const counter = await repository.createCounter({
    boothId: null,
    branchId: branch.id,
    code: "COUNTER-01",
    name: "Counter 1",
    organizationId: organization.id,
    status: "ACTIVE",
    type: "STORE",
  });
  return { branch, counter, organization, user };
}

async function seedVariant(organizationId: string) {
  const category = await prisma.category.create({
    data: { name: "Shirts", organizationId, slug: "shirts" },
  });
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: "Oxford Shirt",
      organizationId,
      productCode: "OXFORD",
      slug: "oxford",
      status: "ACTIVE",
    },
  });
  const color = await prisma.color.create({
    data: {
      code: "BLACK",
      name: "Black",
      normalizedName: "black",
      organizationId,
    },
  });
  const size = await prisma.size.create({
    data: { code: "L", name: "Large", organizationId },
  });
  return prisma.productVariant.create({
    data: {
      colorId: color.id,
      organizationId,
      productId: product.id,
      sellingPriceMinor: 2500,
      sizeId: size.id,
      sku: "OX-BLK-L",
    },
  });
}

async function seedOrganizationMember(organizationId: string, label: string) {
  const user = await prisma.user.create({
    data: { email: `${label.toLowerCase()}@test.dev`, name: `Staff ${label}` },
  });
  await prisma.organizationMembership.create({
    data: { organizationId, role: "STAFF", userId: user.id },
  });
  return user;
}

async function cleanDatabase() {
  await prisma.paymentRefundReceipt.deleteMany();
  await prisma.paymentRefundLine.deleteMany();
  await prisma.paymentRefund.deleteMany();
  await prisma.posReturnReceipt.deleteMany();
  await prisma.posSaleReturnLine.deleteMany();
  await prisma.posSaleReturn.deleteMany();
  await prisma.paymentCollectionReceipt.deleteMany();
  await prisma.paymentCollectionLine.deleteMany();
  await prisma.paymentCollection.deleteMany();
  await prisma.salesReceiptPayment.deleteMany();
  await prisma.salesReceiptLine.deleteMany();
  await prisma.salesReceipt.deleteMany();
  await prisma.paymentLine.deleteMany();
  await prisma.paymentBatch.deleteMany();
  await prisma.posCheckoutRecord.deleteMany();
  await prisma.posCartLine.deleteMany();
  await prisma.posCart.deleteMany();
  await prisma.salesSession.deleteMany();
  await prisma.salesCounter.deleteMany();
  await prisma.salesOrderLine.deleteMany();
  await prisma.salesOrderCommerceProfile.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.salesBooth.deleteMany();
  await prisma.variantBarcode.deleteMany();
  await prisma.inventoryReservationLine.deleteMany();
  await prisma.inventoryReservation.deleteMany();
  await prisma.inventoryMovementLine.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.inventoryAllocationPolicyLocation.deleteMany();
  await prisma.inventoryAllocationPolicy.deleteMany();
  await prisma.catalogMediaLink.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.productCollection.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.category.deleteMany();
  await prisma.color.deleteMany();
  await prisma.size.deleteMany();
  await prisma.stockLocation.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.auditEntry.deleteMany();
  await prisma.userCredential.deleteMany();
  await prisma.organizationMembership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.organization.deleteMany();
}
