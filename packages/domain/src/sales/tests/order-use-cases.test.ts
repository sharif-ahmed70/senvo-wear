import { describe, expect, it } from "vitest";
import {
  BusinessRuleError,
  ConcurrencyError,
  ConflictError,
} from "../../errors.js";
import {
  amendDraftSalesOrder,
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  fulfillSalesOrder,
  replaceDraftSalesOrderLines,
  reserveSalesOrder,
  updateDraftSalesOrderMetadata,
} from "../application/order-use-cases.js";
import type { SalesOrder } from "../domain/models.js";
import type {
  CreateDraftSalesOrderRecord,
  CursorPageResult,
  FulfillSalesOrderRecord,
  AmendDraftSalesOrderRecord,
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

  it("amends draft metadata, clears nullable fields, and recalculates totals", async () => {
    const repository = new FakeSalesOrderRepository();
    await createSalesOrder(repository, {
      channel: "ONLINE",
      currencyCode: "BDT",
      customerName: "Original",
      deliveryMinor: 50,
      idempotencyKey: "order-amend-meta",
      lines: [
        { productVariantId: variantId, quantity: 2, unitPriceMinor: 1000 },
      ],
      orderDiscountMinor: 100,
      orderNumber: "SO-AMEND-META",
      organizationId,
    });

    const amended = await updateDraftSalesOrderMetadata(repository, {
      allocationPolicyId: null,
      customerName: null,
      deliveryMinor: 75,
      expectedVersion: 1,
      note: "Updated",
      orderDiscountMinor: 125,
      organizationId,
      salesOrderId,
    });

    expect(amended).toMatchObject({
      allocationPolicyId: null,
      customerName: null,
      deliveryMinor: 75,
      discountMinor: 125,
      note: "Updated",
      subtotalMinor: 2000,
      totalMinor: 1950,
      version: 2,
    });
  });

  it("replaces draft lines atomically and refreshes server-side totals", async () => {
    const repository = new FakeSalesOrderRepository();
    await createSalesOrder(repository, {
      channel: "ONLINE",
      currencyCode: "BDT",
      idempotencyKey: "order-amend-lines",
      lines: [
        { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
      ],
      orderNumber: "SO-AMEND-LINES",
      organizationId,
    });

    const amended = await replaceDraftSalesOrderLines(repository, {
      expectedVersion: 1,
      lines: [
        {
          discountMinor: 50,
          productVariantId: variantId,
          quantity: 3,
          unitPriceMinor: 700,
        },
      ],
      organizationId,
      salesOrderId,
    });

    expect(amended).toMatchObject({
      subtotalMinor: 2050,
      totalMinor: 2050,
      version: 2,
    });
    expect(amended.lines).toMatchObject([
      { lineTotalMinor: 2050, quantity: 3, unitPriceMinor: 700 },
    ]);
  });

  it("combines metadata and line replacement with one version increment", async () => {
    const repository = new FakeSalesOrderRepository();
    await createSalesOrder(repository, {
      channel: "ONLINE",
      currencyCode: "BDT",
      idempotencyKey: "order-amend-combined",
      lines: [
        { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
      ],
      orderNumber: "SO-AMEND-COMBINED",
      organizationId,
    });

    const amended = await amendDraftSalesOrder(repository, {
      expectedVersion: 1,
      lines: [
        { productVariantId: variantId, quantity: 2, unitPriceMinor: 800 },
      ],
      metadata: {
        deliveryMinor: 100,
        orderDiscountMinor: 50,
      },
      organizationId,
      salesOrderId,
    });

    expect(amended).toMatchObject({
      deliveryMinor: 100,
      discountMinor: 50,
      subtotalMinor: 1600,
      totalMinor: 1650,
      version: 2,
    });
  });

  it("rejects invalid amendment input before persistence", async () => {
    const repository = new FakeSalesOrderRepository();
    await expect(
      amendDraftSalesOrder(repository, {
        expectedVersion: 1,
        organizationId,
        salesOrderId,
      }),
    ).rejects.toThrow("at least one change");
    await expect(
      replaceDraftSalesOrderLines(repository, {
        expectedVersion: 1,
        lines: [
          { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
          { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
        ],
        organizationId,
        salesOrderId,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      replaceDraftSalesOrderLines(repository, {
        expectedVersion: 1,
        lines: [
          { productVariantId: variantId, quantity: 0, unitPriceMinor: 1000 },
        ],
        organizationId,
        salesOrderId,
      }),
    ).rejects.toThrow("quantity");
    await expect(
      replaceDraftSalesOrderLines(repository, {
        expectedVersion: 1,
        lines: [
          {
            discountMinor: 1001,
            productVariantId: variantId,
            quantity: 1,
            unitPriceMinor: 1000,
          },
        ],
        organizationId,
        salesOrderId,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await createSalesOrder(repository, {
      channel: "ONLINE",
      currencyCode: "BDT",
      idempotencyKey: "order-amend-invalid-total",
      lines: [
        { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
      ],
      orderNumber: "SO-AMEND-INVALID-TOTAL",
      organizationId,
    });
    await expect(
      updateDraftSalesOrderMetadata(repository, {
        expectedVersion: 1,
        orderDiscountMinor: 1001,
        organizationId,
        salesOrderId,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("rejects non-draft and stale amendment attempts", async () => {
    const repository = new FakeSalesOrderRepository();
    await createSalesOrder(repository, {
      channel: "ONLINE",
      currencyCode: "BDT",
      idempotencyKey: "order-amend-rules",
      lines: [
        { productVariantId: variantId, quantity: 1, unitPriceMinor: 1000 },
      ],
      orderNumber: "SO-AMEND-RULES",
      organizationId,
    });
    await expect(
      updateDraftSalesOrderMetadata(repository, {
        expectedVersion: 99,
        note: "Stale",
        organizationId,
        salesOrderId,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await reserveSalesOrder(repository, {
      expectedVersion: 1,
      organizationId,
      reservationIdempotencyKey: "reserve-amend-rules",
      reservationNumber: "RSV-AMEND-RULES",
      salesOrderId,
    });
    await expect(
      updateDraftSalesOrderMetadata(repository, {
        expectedVersion: 2,
        note: "Reserved",
        organizationId,
        salesOrderId,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

class FakeSalesOrderRepository implements SalesOrderRepository {
  private orders = new Map<string, SalesOrder>();
  private idempotency = new Map<string, SalesOrder>();

  amendDraft(record: AmendDraftSalesOrderRecord): Promise<SalesOrder> {
    const current = this.orders.get(record.salesOrderId);
    if (!current || current.organizationId !== record.organizationId) {
      throw new Error("missing fake order");
    }
    if (current.status !== "DRAFT") {
      throw new BusinessRuleError("Only draft sales orders can be amended.");
    }
    if (current.version !== record.expectedVersion) {
      throw new ConcurrencyError();
    }
    const lines = record.lines
      ? record.lines.map((line, index) => ({
          colorSnapshot: `Color ${index + 1}`,
          createdAt: current.createdAt,
          discountMinor: line.discountMinor,
          id: `77777777-7777-4777-8777-77777777777${index}`,
          lineNumber: index + 1,
          lineTotalMinor: line.lineTotalMinor,
          organizationId: record.organizationId,
          productNameSnapshot: `Product ${index + 1}`,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          salesOrderId: current.id,
          sizeSnapshot: `Size ${index + 1}`,
          skuSnapshot: `SKU-${index + 1}`,
          unitPriceMinor: line.unitPriceMinor,
        }))
      : current.lines;
    const discountMinor =
      record.metadata && "discountMinor" in record.metadata
        ? (record.metadata.discountMinor ?? 0)
        : current.discountMinor;
    const deliveryMinor =
      record.metadata && "deliveryMinor" in record.metadata
        ? (record.metadata.deliveryMinor ?? 0)
        : current.deliveryMinor;
    const subtotalMinor = lines.reduce(
      (sum, line) => sum + line.lineTotalMinor,
      0,
    );
    const totalMinor = subtotalMinor - discountMinor + deliveryMinor;
    if (totalMinor < 0) {
      throw new BusinessRuleError("Sales order total must not be negative.");
    }
    const updated: SalesOrder = {
      ...current,
      ...record.metadata,
      allocationPolicyId:
        record.metadata && "allocationPolicyId" in record.metadata
          ? (record.metadata.allocationPolicyId ?? null)
          : current.allocationPolicyId,
      deliveryMinor,
      discountMinor,
      lines,
      subtotalMinor,
      totalMinor,
      version: current.version + 1,
    };
    this.orders.set(current.id, updated);
    return Promise.resolve(updated);
  }

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
