import {
  BusinessRuleError,
  ConflictError,
  checkoutCart,
  type PosCheckout,
  type PosCheckoutPreparation,
  type PosCheckoutRepository,
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
};

describe("POS checkout", () => {
  it("derives the offline channel and current server price through the full lifecycle", async () => {
    const checkouts = new FakeCheckoutRepository(preparation());
    const sales = new FakeSalesRepository();
    const result = await checkoutCart(
      { checkouts, salesOrders: sales },
      input(),
    );
    expect(result.replayed).toBe(false);
    expect(result.checkout).toMatchObject({
      status: "COMPLETED",
      subtotalMinor: 5000,
      totalMinor: 5000,
    });
    expect(sales.created).toMatchObject({
      boothId: null,
      channel: "OFFLINE_STORE",
      lines: [{ quantity: 2, unitPriceMinor: 2500 }],
      organizationId: ids.organization,
    });
    expect(sales.transitions).toEqual(["reserve", "confirm", "fulfill"]);
  });

  it("derives event booth source from the counter", async () => {
    const boothId = "10000000-0000-4000-8000-000000000011";
    const checkouts = new FakeCheckoutRepository({
      ...preparation(),
      boothId,
      branchId: null,
      counterType: "EVENT_BOOTH",
    });
    const sales = new FakeSalesRepository();
    await checkoutCart({ checkouts, salesOrders: sales }, input());
    expect(sales.created).toMatchObject({
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
    const sales = new FakeSalesRepository();
    await expect(
      checkoutCart({ checkouts, salesOrders: sales }, input()),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(sales.created).toBeUndefined();
  });

  it("returns the completed checkout for an idempotent retry", async () => {
    const existing = completedCheckout();
    const checkouts = new FakeCheckoutRepository({
      ...preparation(),
      checkout: existing,
    });
    const result = await checkoutCart(
      { checkouts, salesOrders: new FakeSalesRepository() },
      input(),
    );
    expect(result).toEqual({ checkout: existing, replayed: true });
  });

  it("rejects reuse of a completed cart with a different key", async () => {
    const checkouts = new FakeCheckoutRepository({
      ...preparation(),
      checkout: completedCheckout(),
    });
    await expect(
      checkoutCart(
        { checkouts, salesOrders: new FakeSalesRepository() },
        { ...input(), idempotencyKey: "checkout-attempt-002" },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

function input() {
  return {
    cartId: ids.cart,
    checkoutId: ids.checkout,
    completedAt: new Date("2026-08-03T10:00:00.000Z"),
    idempotencyKey: "checkout-attempt-001",
    organizationId: ids.organization,
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
    salesSessionId: ids.session,
    sessionStatus: "OPEN",
    staffId: ids.staff,
    staffName: "Sales staff",
    staffStatus: "ACTIVE",
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
    salesOrderId: ids.order,
    salesSessionId: ids.session,
    staffName: "Sales staff",
    status: "COMPLETED",
    subtotalMinor: 5000,
    totalMinor: 5000,
    updatedAt: now,
  };
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
