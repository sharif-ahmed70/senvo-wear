import { describe, expect, it } from "vitest";
import { BusinessRuleError, ConflictError } from "../../errors.js";
import {
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  fulfillSalesOrder,
  reserveSalesOrder,
} from "../application/order-use-cases.js";
import type { SalesOrder } from "../domain/models.js";
import type {
  CreateDraftSalesOrderRecord,
  CursorPageResult,
  FulfillSalesOrderRecord,
  ReserveSalesOrderRecord,
  SalesOrderRepository,
} from "../repositories/sales-order-repositories.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const salesOrderId = "22222222-2222-4222-8222-222222222222";
const variantId = "33333333-3333-4333-8333-333333333333";
const policyId = "44444444-4444-4444-8444-444444444444";

describe("sales order use cases", () => {
  it("computes totals and creates an idempotent draft order", async () => {
    const repository = new FakeSalesOrderRepository();

    const order = await createSalesOrder(repository, {
      allocationPolicyId: policyId,
      channel: "ONLINE",
      currencyCode: "BDT",
      deliveryMinor: 100,
      idempotencyKey: "order-123",
      lines: [
        {
          discountMinor: 100,
          productVariantId: variantId,
          quantity: 2,
          unitPriceMinor: 1000,
        },
      ],
      orderDiscountMinor: 50,
      orderNumber: "SO-1",
      organizationId,
    });

    expect(order).toMatchObject({
      status: "DRAFT",
      subtotalMinor: 1900,
      totalMinor: 1950,
    });
    await expect(
      createSalesOrder(repository, {
        allocationPolicyId: policyId,
        channel: "ONLINE",
        currencyCode: "BDT",
        deliveryMinor: 100,
        idempotencyKey: "order-123",
        lines: [
          {
            discountMinor: 100,
            productVariantId: variantId,
            quantity: 2,
            unitPriceMinor: 1000,
          },
        ],
        orderDiscountMinor: 50,
        orderNumber: "SO-1",
        organizationId,
      }),
    ).resolves.toEqual(order);
  });

  it("rejects duplicate variants, invalid quantities, and negative totals", async () => {
    const repository = new FakeSalesOrderRepository();

    await expect(
      createSalesOrder(repository, {
        channel: "ONLINE",
        currencyCode: "BDT",
        idempotencyKey: "order-dup",
        lines: [
          { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
          { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
        ],
        orderNumber: "SO-DUP",
        organizationId,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      createSalesOrder(repository, {
        channel: "ONLINE",
        currencyCode: "BDT",
        idempotencyKey: "order-bad-qty",
        lines: [
          { productVariantId: variantId, quantity: 0, unitPriceMinor: 1000 },
        ],
        orderNumber: "SO-BAD-QTY",
        organizationId,
      }),
    ).rejects.toThrow("quantity");
    await expect(
      createSalesOrder(repository, {
        channel: "ONLINE",
        currencyCode: "BDT",
        idempotencyKey: "order-negative",
        lines: [
          { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
        ],
        orderDiscountMinor: 1001,
        orderNumber: "SO-NEG",
        organizationId,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("rejects conflicting idempotency payloads", async () => {
    const repository = new FakeSalesOrderRepository();
    await createSalesOrder(repository, {
      channel: "ONLINE",
      currencyCode: "BDT",
      idempotencyKey: "order-conflict",
      lines: [
        { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
      ],
      orderNumber: "SO-CONFLICT",
      organizationId,
    });

    await expect(
      createSalesOrder(repository, {
        channel: "ONLINE",
        currencyCode: "BDT",
        idempotencyKey: "order-conflict",
        lines: [
          { productVariantId: variantId, quantity: 2, unitPriceMinor: 1000 },
        ],
        orderNumber: "SO-CONFLICT-2",
        organizationId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("normalizes reserve, confirm, cancel, and fulfill commands", async () => {
    const repository = new FakeSalesOrderRepository();
    await createSalesOrder(repository, {
      allocationPolicyId: policyId,
      channel: "MANUAL",
      currencyCode: "BDT",
      idempotencyKey: "order-flow",
      lines: [
        { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
      ],
      orderNumber: "so-flow",
      organizationId,
    });

    const reserved = await reserveSalesOrder(repository, {
      expectedVersion: 1,
      organizationId,
      reservationIdempotencyKey: "reserve-flow",
      reservationNumber: "rsv-flow",
      salesOrderId,
    });
    expect(reserved).toMatchObject({ status: "RESERVED", version: 2 });

    const confirmed = await confirmSalesOrder(repository, {
      expectedVersion: 2,
      organizationId,
      salesOrderId,
    });
    expect(confirmed).toMatchObject({ status: "CONFIRMED", version: 3 });

    const fulfilled = await fulfillSalesOrder(repository, {
      consumptionIdempotencyKey: "consume-flow",
      expectedVersion: 3,
      movementNumber: "move-flow",
      occurredAt: "2026-07-03T00:00:00.000Z",
      organizationId,
      salesOrderId,
    });
    expect(fulfilled).toMatchObject({ status: "FULFILLED", version: 4 });

    const draftToCancel = await createSalesOrder(repository, {
      channel: "MANUAL",
      currencyCode: "BDT",
      idempotencyKey: "order-cancel",
      lines: [
        { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
      ],
      orderNumber: "so-cancel",
      organizationId,
    });
    const cancelled = await cancelSalesOrder(repository, {
      expectedVersion: 1,
      organizationId,
      salesOrderId: draftToCancel.id,
    });
    expect(cancelled.status).toBe("CANCELLED");
  });
});

class FakeSalesOrderRepository implements SalesOrderRepository {
  private orders = new Map<string, SalesOrder>();
  private idempotency = new Map<string, SalesOrder>();

  createDraft(
    record: CreateDraftSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder> {
    const now = new Date("2026-07-03T00:00:00.000Z");
    const id =
      this.orders.size === 0
        ? salesOrderId
        : "55555555-5555-4555-8555-555555555555";
    const order: SalesOrder = {
      ...record,
      cancelledAt: null,
      confirmedAt: null,
      createdAt: now,
      fulfilledAt: null,
      fulfillmentMovementId: null,
      id,
      inventoryReservationId: null,
      lines: record.lines.map((line, index) => ({
        colorSnapshot: "Black",
        createdAt: now,
        discountMinor: line.discountMinor,
        id: `66666666-6666-4666-8666-66666666666${index}`,
        lineNumber: index + 1,
        lineTotalMinor: line.lineTotalMinor,
        organizationId: record.organizationId,
        productNameSnapshot: "Oxford Shirt",
        productVariantId: line.productVariantId,
        quantity: line.quantity,
        salesOrderId: id,
        sizeSnapshot: "L",
        skuSnapshot: "OX-BLK-L",
        unitPriceMinor: line.unitPriceMinor,
      })),
      payloadSignature,
      reservedAt: null,
      status: "DRAFT",
      updatedAt: now,
      version: 1,
    };
    this.orders.set(id, order);
    this.idempotency.set(
      `${record.organizationId}:${record.idempotencyKey}`,
      order,
    );
    return Promise.resolve(order);
  }

  findById(id: string, organizationId: string): Promise<SalesOrder | null> {
    const order = this.orders.get(id);
    return Promise.resolve(
      order?.organizationId === organizationId ? order : null,
    );
  }

  findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<SalesOrder | null> {
    return Promise.resolve(
      this.idempotency.get(`${organizationId}:${idempotencyKey}`) ?? null,
    );
  }

  findByOrderNumber(
    organizationId: string,
    orderNumber: string,
  ): Promise<SalesOrder | null> {
    void organizationId;
    void orderNumber;
    return Promise.resolve(null);
  }

  list(filter: unknown): Promise<CursorPageResult<SalesOrder>> {
    void filter;
    return Promise.resolve({
      hasMore: false,
      items: [...this.orders.values()],
      nextCursor: null,
    });
  }

  reserve(
    record: ReserveSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder> {
    void payloadSignature;
    return Promise.resolve(
      this.patch(record.salesOrderId, { status: "RESERVED", version: 2 }),
    );
  }

  confirm(record: { salesOrderId: string }): Promise<SalesOrder> {
    return Promise.resolve(
      this.patch(record.salesOrderId, { status: "CONFIRMED", version: 3 }),
    );
  }

  cancel(record: { salesOrderId: string }): Promise<SalesOrder> {
    return Promise.resolve(
      this.patch(record.salesOrderId, { status: "CANCELLED", version: 2 }),
    );
  }

  fulfill(
    record: FulfillSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder> {
    void payloadSignature;
    return Promise.resolve(
      this.patch(record.salesOrderId, { status: "FULFILLED", version: 4 }),
    );
  }

  private patch(
    id: string,
    patch: Pick<SalesOrder, "status" | "version">,
  ): SalesOrder {
    const current = this.orders.get(id);
    if (!current) {
      throw new Error("missing fake order");
    }
    const updated = { ...current, ...patch };
    this.orders.set(id, updated);
    return updated;
  }
}
