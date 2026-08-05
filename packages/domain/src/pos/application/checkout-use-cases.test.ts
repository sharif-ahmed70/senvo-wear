import {
  BusinessRuleError,
  ConflictError,
  checkoutCart,
  type PosCheckout,
  type PosCheckoutPreparation,
  type PosCheckoutRepository,
  type PaymentBatch,
  type PaymentRepository,
  type ReceiptRepository,
  type SalesReceipt,
  type SalesOrder,
} from "../../index.js";
import { describe, expect, it } from "vitest";

const ids = {
  allocation: "10000000-0000-4000-8000-000000000001",
  cart: "10000000-0000-4000-8000-000000000002",
  checkout: "10000000-0000-4000-8000-000000000003",
  counter: "10000000-0000-4000-8000-000000000004",
  organization: "10000000-0000-4000-8000-000000000005",
  order: "10000000-0000-4000-8000-000000000006",
  session: "10000000-0000-4000-8000-000000000007",
  staff: "10000000-0000-4000-8000-000000000008",
  variant: "10000000-0000-4000-8000-000000000009",
  payment: "10000000-0000-4000-8000-000000000012",
  receipt: "10000000-0000-4000-8000-000000000013",
};

function repositories(checkouts: FakeCheckoutRepository) {
  return {
    checkouts,
    payments: new FakePaymentRepository(),
    receipts: new FakeReceiptRepository(),
    salesOrders: new FakeSalesRepository(),
  };
}

describe("POS checkout", () => {
  it("derives the offline channel and current server price through the full lifecycle", async () => {
    const checkouts = new FakeCheckoutRepository(preparation());
    const dependencies = repositories(checkouts);
    const result = await checkoutCart(dependencies, input());
    expect(result.replayed).toBe(false);
    expect(result.checkout).toMatchObject({
      status: "COMPLETED",
      subtotalMinor: 5000,
      totalMinor: 5000,
    });
    expect(dependencies.salesOrders.created).toMatchObject({
      boothId: null,
      channel: "OFFLINE_STORE",
      lines: [{ quantity: 2, unitPriceMinor: 2500 }],
      organizationId: ids.organization,
    });
    expect(dependencies.salesOrders.transitions).toEqual([
      "reserve",
      "confirm",
      "fulfill",
    ]);
    expect(dependencies.payments.created).toMatchObject({
      paidMinor: 5000,
      outstandingMinor: 0,
      status: "PAID",
    });
    expect(dependencies.receipts.created).toMatchObject({
      paidMinor: 5000,
      paymentStatus: "PAID",
      totalMinor: 5000,
    });
  });

  it("derives event booth source from the counter", async () => {
    const boothId = "10000000-0000-4000-8000-000000000011";
    const checkouts = new FakeCheckoutRepository({
      ...preparation(),
      boothId,
      branchId: null,
      counterType: "EVENT_BOOTH",
    });
    const dependencies = repositories(checkouts);
    await checkoutCart(dependencies, input());
    expect(dependencies.salesOrders.created).toMatchObject({
      boothId,
      channel: "EVENT_BOOTH",
    });
  });

  it.each([
    ["empty cart", { lines: [] }],
    ["closed session", { sessionStatus: "CLOSED" }],
    ["inactive counter", { counterStatus: "INACTIVE" }],
    [
      "inactive barcode",
      { lines: [{ ...preparation().lines[0]!, hasActiveBarcode: false }] },
    ],
  ])("rejects %s before sales creation", async (_name, change) => {
    const checkouts = new FakeCheckoutRepository({
      ...preparation(),
      ...change,
    } as PosCheckoutPreparation);
    const dependencies = repositories(checkouts);
    await expect(checkoutCart(dependencies, input())).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    expect(dependencies.salesOrders.created).toBeUndefined();
  });

  it("returns the completed checkout for an idempotent retry", async () => {
    const existing = completedCheckout();
    const checkouts = new FakeCheckoutRepository({
      ...preparation(),
      checkout: existing,
    });
    const result = await checkoutCart(repositories(checkouts), input());
    expect(result).toEqual({ checkout: existing, replayed: true });
  });

  it("rejects reuse of a completed cart with a different key", async () => {
    const checkouts = new FakeCheckoutRepository({
      ...preparation(),
      checkout: completedCheckout(),
    });
    await expect(
      checkoutCart(repositories(checkouts), {
        ...input(),
        idempotencyKey: "checkout-attempt-002",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects same-key replay with a different normalized payment payload", async () => {
    const checkouts = new FakeCheckoutRepository({
      ...preparation(),
      checkout: completedCheckout(),
    });
    await expect(
      checkoutCart(repositories(checkouts), {
        ...input(),
        allowOutstanding: true,
        payments: [{ amountMinor: 4000, method: "CASH" }],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not mutate or replay a legacy checkout without a payment signature", async () => {
    const checkouts = new FakeCheckoutRepository({
      ...preparation(),
      checkout: {
        ...completedCheckout(),
        outstandingMinor: null,
        paidMinor: null,
        paymentBatchId: null,
        paymentRequestSignature: null,
        paymentStatus: "UNRECORDED",
        receiptId: null,
        receiptNumber: null,
      },
    });
    await expect(
      checkoutCart(repositories(checkouts), input()),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

function input() {
  return {
    cartId: ids.cart,
    allowOutstanding: false,
    approveOutstanding: () => Promise.resolve(),
    checkoutId: ids.checkout,
    completedAt: new Date("2026-08-03T10:00:00.000Z"),
    idempotencyKey: "checkout-attempt-001",
    organizationId: ids.organization,
    paymentBatchId: ids.payment,
    payments: [{ amountMinor: 5000, method: "CASH" as const }],
    receiptId: ids.receipt,
    staffId: ids.staff,
  };
}

function preparation(): PosCheckoutPreparation {
  return {
    allocationPolicyId: ids.allocation,
    boothId: null,
    branchId: "10000000-0000-4000-8000-000000000010",
    cartId: ids.cart,
    checkout: null,
    counterId: ids.counter,
    counterCode: "MAIN",
    counterName: "Main counter",
    counterStatus: "ACTIVE",
    counterType: "STORE",
    lines: [
      {
        hasActiveBarcode: true,
        productVariantId: ids.variant,
        quantity: 2,
        sellingPriceMinor: 2500,
        variantStatus: "ACTIVE",
      },
    ],
    membershipStatus: "ACTIVE",
    organizationId: ids.organization,
    organizationAddressLine1: "1 Main Road",
    organizationAddressLine2: null,
    organizationCity: "Dhaka",
    organizationDistrict: "Dhaka",
    organizationEmail: "sales@senvo.example",
    organizationName: "SENVO Wear",
    organizationPhone: "+8801000000000",
    organizationPostalCode: "1205",
    salesSessionId: ids.session,
    sessionStatus: "OPEN",
    staffId: ids.staff,
    staffName: "Sales staff",
    staffStatus: "ACTIVE",
    sourceName: "Main store",
  };
}

function completedCheckout(): PosCheckout {
  const now = new Date("2026-08-03T10:00:00.000Z");
  return {
    cartId: ids.cart,
    completedAt: now,
    counterId: ids.counter,
    counterName: "Main counter",
    createdAt: now,
    id: ids.checkout,
    idempotencyKey: "checkout-attempt-001",
    orderNumber: "POS-10000000000040008000",
    organizationId: ids.organization,
    outstandingMinor: 0,
    paidMinor: 5000,
    paymentBatchId: ids.payment,
    paymentRequestSignature:
      '{"allowOutstanding":false,"payments":[{"amountMinor":5000,"method":"CASH","reference":null}]}',
    paymentStatus: "PAID",
    receiptId: ids.receipt,
    receiptNumber: "RCP-10000000000040008000",
    salesOrderId: ids.order,
    salesSessionId: ids.session,
    staffName: "Sales staff",
    status: "COMPLETED",
    subtotalMinor: 5000,
    totalMinor: 5000,
    updatedAt: now,
  };
}

class FakePaymentRepository implements PaymentRepository {
  created?: Parameters<PaymentRepository["create"]>[0];
  create(record: Parameters<PaymentRepository["create"]>[0]) {
    this.created = record;
    const now = record.createdAt;
    return Promise.resolve({
      ...record,
      lines: record.lines.map((line, index) => ({
        ...line,
        createdAt: now,
        id: `10000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
        lineNumber: index + 1,
        organizationId: record.organizationId,
        paymentBatchId: record.id,
      })),
    } satisfies PaymentBatch);
  }
}

class FakeReceiptRepository implements ReceiptRepository {
  created?: Parameters<ReceiptRepository["create"]>[0];
  create(record: Parameters<ReceiptRepository["create"]>[0]) {
    this.created = record;
    return Promise.resolve(record as SalesReceipt);
  }
  findByCheckoutId() {
    return Promise.resolve(null);
  }
}

class FakeCheckoutRepository implements PosCheckoutRepository {
  constructor(private readonly value: PosCheckoutPreparation) {}
  createCompleted(
    record: Parameters<PosCheckoutRepository["createCompleted"]>[0],
  ) {
    return Promise.resolve({
      ...completedCheckout(),
      ...record,
      counterName: this.value.counterName,
      orderNumber: "POS-10000000000040008000",
      staffName: this.value.staffName,
      status: "COMPLETED" as const,
    });
  }
  findById() {
    return Promise.resolve(null);
  }
  list() {
    return Promise.resolve([]);
  }
  prepare() {
    return Promise.resolve(this.value);
  }
}

class FakeSalesRepository {
  created?: Record<string, unknown>;
  transitions: string[] = [];
  private order = salesOrder();
  createDraft(record: Record<string, unknown>) {
    this.created = record;
    this.order = {
      ...this.order,
      ...record,
      status: "DRAFT",
      version: 1,
    };
    return Promise.resolve(this.order);
  }
  findByIdempotencyKey() {
    return Promise.resolve(null);
  }
  reserve() {
    this.transitions.push("reserve");
    return Promise.resolve(
      (this.order = { ...this.order, status: "RESERVED", version: 2 }),
    );
  }
  confirm() {
    this.transitions.push("confirm");
    return Promise.resolve(
      (this.order = { ...this.order, status: "CONFIRMED", version: 3 }),
    );
  }
  fulfill() {
    this.transitions.push("fulfill");
    return Promise.resolve(
      (this.order = { ...this.order, status: "FULFILLED", version: 4 }),
    );
  }
}

function salesOrder(): SalesOrder {
  const now = new Date();
  return {
    allocationPolicyId: ids.allocation,
    boothId: null,
    cancelledAt: null,
    channel: "OFFLINE_STORE",
    confirmedAt: null,
    createdAt: now,
    currencyCode: "BDT",
    customerEmail: null,
    customerName: null,
    customerPhone: null,
    deliveryAddressLine1: null,
    deliveryAddressLine2: null,
    deliveryCity: null,
    deliveryDistrict: null,
    deliveryMinor: 0,
    deliveryPostalCode: null,
    discountMinor: 0,
    fulfilledAt: null,
    fulfillmentMovementId: null,
    id: ids.order,
    idempotencyKey: "order-key",
    inventoryReservationId: null,
    lines: [],
    note: null,
    orderNumber: "POS-10000000000040008000",
    organizationId: ids.organization,
    payloadSignature: "signature",
    reservedAt: null,
    status: "DRAFT",
    subtotalMinor: 5000,
    totalMinor: 5000,
    updatedAt: now,
    version: 1,
  };
}
