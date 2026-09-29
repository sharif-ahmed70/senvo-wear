import { describe, expect, it, vi } from "vitest";
import {
  AuthorizationError,
  type CourierConsignment,
  type CourierConsignmentRepository,
  type SalesOrder,
} from "@senvo/domain";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import { ShippingApplicationService } from "./shipping-application-service.js";

function createMockConsignmentRepository(
  initialConsignments: CourierConsignment[] = [],
): CourierConsignmentRepository {
  const store = new Map<string, CourierConsignment>();
  for (const c of initialConsignments) {
    store.set(c.id, c);
  }

  return {
    async create(record): Promise<CourierConsignment> {
      const now = new Date();
      const consignment: CourierConsignment = {
        cancelledAt: record.cancelledAt ?? null,
        codAmountMinor: record.codAmountMinor,
        consignmentNumber: record.consignmentNumber,
        courierProvider: record.courierProvider,
        createdAt: now,
        deliveredAt: record.deliveredAt ?? null,
        deliveryAddressLine1: record.deliveryAddressLine1,
        deliveryAddressLine2: record.deliveryAddressLine2 ?? null,
        deliveryCity: record.deliveryCity ?? null,
        deliveryDistrict: record.deliveryDistrict ?? null,
        deliveryFeeMinor: record.deliveryFeeMinor ?? 0n,
        deliveryPostalCode: record.deliveryPostalCode ?? null,
        dispatchedAt: record.dispatchedAt ?? null,
        id: record.id || crypto.randomUUID(),
        itemWeightGram: record.itemWeightGram ?? null,
        note: record.note ?? null,
        organizationId: record.organizationId,
        recipientEmail: record.recipientEmail ?? null,
        recipientName: record.recipientName,
        recipientPhone: record.recipientPhone,
        returnedAt: record.returnedAt ?? null,
        salesOrderId: record.salesOrderId,
        status: record.status,
        trackingCode: record.trackingCode ?? null,
        trackingUrl: record.trackingUrl ?? null,
        updatedAt: now,
        version: 1,
      };
      store.set(consignment.id, consignment);
      return consignment;
    },

    async findActiveBySalesOrderId(
      salesOrderId: string,
      organizationId: string,
    ): Promise<CourierConsignment | null> {
      for (const c of store.values()) {
        if (
          c.salesOrderId === salesOrderId &&
          c.organizationId === organizationId &&
          ["BOOKED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"].includes(c.status)
        ) {
          return c;
        }
      }
      return null;
    },

    async findByConsignmentNumber(
      consignmentNumber: string,
      organizationId: string,
    ): Promise<CourierConsignment | null> {
      for (const c of store.values()) {
        if (
          c.consignmentNumber === consignmentNumber &&
          c.organizationId === organizationId
        ) {
          return c;
        }
      }
      return null;
    },

    async findById(id: string, organizationId: string): Promise<CourierConsignment | null> {
      const c = store.get(id);
      if (c && c.organizationId === organizationId) {
        return c;
      }
      return null;
    },

    async listBySalesOrderId(
      salesOrderId: string,
      organizationId: string,
    ): Promise<CourierConsignment[]> {
      const results: CourierConsignment[] = [];
      for (const c of store.values()) {
        if (c.salesOrderId === salesOrderId && c.organizationId === organizationId) {
          results.push(c);
        }
      }
      return results;
    },

    async update(record): Promise<CourierConsignment> {
      const existing = store.get(record.consignmentId);
      if (!existing || existing.organizationId !== record.organizationId) {
        throw new Error("Consignment not found");
      }
      const updated: CourierConsignment = {
        ...existing,
        cancelledAt: record.cancelledAt !== undefined ? record.cancelledAt : existing.cancelledAt,
        deliveredAt: record.deliveredAt !== undefined ? record.deliveredAt : existing.deliveredAt,
        dispatchedAt: record.dispatchedAt !== undefined ? record.dispatchedAt : existing.dispatchedAt,
        note: record.note !== undefined ? record.note : existing.note,
        returnedAt: record.returnedAt !== undefined ? record.returnedAt : existing.returnedAt,
        status: record.status,
        trackingCode: record.trackingCode !== undefined ? record.trackingCode : existing.trackingCode,
        trackingUrl: record.trackingUrl !== undefined ? record.trackingUrl : existing.trackingUrl,
        updatedAt: new Date(),
        version: existing.version + 1,
      };
      store.set(updated.id, updated);
      return updated;
    },
  };
}

describe("ShippingApplicationService", () => {
  const orgA = "11111111-1111-4111-8111-111111111111";
  const orgB = "22222222-2222-4222-8222-222222222222";
  const userId = "33333333-3333-4333-8333-333333333333";
  const orderId = "44444444-4444-4444-8444-444444444444";

  const sampleOrder: SalesOrder = {
    allocationPolicyId: null,
    boothId: null,
    cancelledAt: null,
    channel: "ONLINE",
    confirmedAt: new Date(),
    createdAt: new Date(),
    currencyCode: "BDT",
    customerEmail: "customer@senvo.test",
    customerName: "Sharif Ahmed",
    customerPhone: "+8801712345678",
    deliveryAddressLine1: "House 10, Road 4, Sector 3",
    deliveryAddressLine2: "Apt 2B",
    deliveryCity: "Dhaka",
    deliveryDistrict: "Dhaka",
    deliveryMinor: 6000,
    deliveryPostalCode: "1230",
    discountMinor: 0,
    fulfilledAt: null,
    fulfillmentMovementId: null,
    id: orderId,
    idempotencyKey: "idemp-ord-1",
    inventoryReservationId: null,
    lines: [],
    note: null,
    orderNumber: "ORD-9988",
    organizationId: orgA,
    payloadSignature: "sig-1",
    reservedAt: null,
    status: "CONFIRMED",
    subtotalMinor: 250000,
    totalMinor: 256000,
    updatedAt: new Date(),
    version: 1,
  };

  const createAuth = (allowed = true): ApplicationAuthorizationService => ({
    async authorize() {
      if (!allowed) {
        throw new AuthorizationError("You are not allowed to perform this action.");
      }
    },
  });

  const createValidContext = (
    organizationId: string,
    permissions: Array<{ action: "READ" | "UPDATE"; resource: "SALES_ORDER" }> = [],
  ) => ({
    organizationId,
    permissions,
    requestId: "req-shipping-001",
    userId,
  });

  it("successfully dispatches order with SALES_ORDER:UPDATE and records ORDER_DISPATCHED audit", async () => {
    const consignmentRepo = createMockConsignmentRepository();
    const salesOrderRepo = {
      async findById(id: string, organizationId: string) {
        return id === orderId && organizationId === orgA ? sampleOrder : null;
      },
    };
    const audits: unknown[] = [];
    const auditWriter = {
      async recordWithinTransaction(entry: any) {
        audits.push(entry);
        return {} as any;
      },
    };

    const service = new ShippingApplicationService({
      auditWriter,
      authorizationService: createAuth(true),
      consignments: consignmentRepo,
      salesOrders: salesOrderRepo,
    });

    const context = createValidContext(orgA, [
      { action: "UPDATE", resource: "SALES_ORDER" },
    ]);

    const result = await service.dispatchSalesOrder(context, {
      courierProvider: "STEADFAST",
      salesOrderId: orderId,
      trackingCode: "ST-123456",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.status).toBe("BOOKED");
    expect(result.data.trackingCode).toBe("ST-123456");
    expect(result.data.recipientName).toBe("Sharif Ahmed");
    expect(result.data.codAmountMinor).toBe("256000");

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "ORDER_DISPATCHED",
      actor: { userId },
      organizationId: orgA,
      resource: "COURIER_CONSIGNMENT",
    });
  });

  it("rejects dispatch when permission SALES_ORDER:UPDATE is denied", async () => {
    const consignmentRepo = createMockConsignmentRepository();
    const salesOrderRepo = {
      async findById() {
        return sampleOrder;
      },
    };

    const service = new ShippingApplicationService({
      authorizationService: createAuth(false),
      consignments: consignmentRepo,
      salesOrders: salesOrderRepo,
    });

    const context = createValidContext(orgA, []);

    const result = await service.dispatchSalesOrder(context, {
      courierProvider: "STEADFAST",
      salesOrderId: orderId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
  });

  it("blocks duplicate active dispatch", async () => {
    const consignmentRepo = createMockConsignmentRepository();
    const salesOrderRepo = {
      async findById() {
        return sampleOrder;
      },
    };

    const service = new ShippingApplicationService({
      authorizationService: createAuth(true),
      consignments: consignmentRepo,
      salesOrders: salesOrderRepo,
    });

    const context = createValidContext(orgA, [
      { action: "UPDATE", resource: "SALES_ORDER" },
    ]);

    // First dispatch
    const first = await service.dispatchSalesOrder(context, {
      courierProvider: "PATHAO",
      salesOrderId: orderId,
      trackingCode: "PT-001",
    });
    expect(first.ok).toBe(true);

    // Second dispatch attempt
    const second = await service.dispatchSalesOrder(context, {
      courierProvider: "REDX",
      salesOrderId: orderId,
      trackingCode: "RX-002",
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("CONFLICT");
  });

  it("updates shipment status and records SHIPMENT_STATUS_UPDATED audit", async () => {
    const consignmentRepo = createMockConsignmentRepository();
    const created = await consignmentRepo.create({
      codAmountMinor: 100000n,
      consignmentNumber: "CNS-001",
      courierProvider: "STEADFAST",
      deliveryAddressLine1: "Banani",
      organizationId: orgA,
      recipientName: "Test",
      recipientPhone: "+8801700000000",
      salesOrderId: orderId,
      status: "BOOKED",
    });

    const audits: unknown[] = [];
    const auditWriter = {
      async recordWithinTransaction(entry: any) {
        audits.push(entry);
        return {} as any;
      },
    };

    const service = new ShippingApplicationService({
      auditWriter,
      authorizationService: createAuth(true),
      consignments: consignmentRepo,
      salesOrders: { async findById() { return sampleOrder; } },
    });

    const context = createValidContext(orgA, [
      { action: "UPDATE", resource: "SALES_ORDER" },
    ]);

    const result = await service.updateShipmentStatus(context, {
      consignmentId: created.id,
      status: "IN_TRANSIT",
      trackingCode: "ST-UPDATED",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("IN_TRANSIT");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "SHIPMENT_STATUS_UPDATED",
      actor: { userId },
      metadata: {
        newStatus: "IN_TRANSIT",
        previousStatus: "BOOKED",
      },
    });

    // Idempotent repeat: does not add a second audit record
    const repeatResult = await service.updateShipmentStatus(context, {
      consignmentId: created.id,
      status: "IN_TRANSIT",
    });
    expect(repeatResult.ok).toBe(true);
    expect(audits).toHaveLength(1);
  });

  it("rejects invalid status transitions", async () => {
    const consignmentRepo = createMockConsignmentRepository();
    const created = await consignmentRepo.create({
      codAmountMinor: 100000n,
      consignmentNumber: "CNS-001",
      courierProvider: "STEADFAST",
      deliveredAt: new Date(),
      deliveryAddressLine1: "Banani",
      organizationId: orgA,
      recipientName: "Test",
      recipientPhone: "+8801700000000",
      salesOrderId: orderId,
      status: "DELIVERED",
    });

    const service = new ShippingApplicationService({
      authorizationService: createAuth(true),
      consignments: consignmentRepo,
      salesOrders: { async findById() { return sampleOrder; } },
    });

    const context = createValidContext(orgA, [
      { action: "UPDATE", resource: "SALES_ORDER" },
    ]);

    const result = await service.updateShipmentStatus(context, {
      consignmentId: created.id,
      status: "IN_TRANSIT",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
  });

  it("blocks cross-organization consignment access", async () => {
    const consignmentRepo = createMockConsignmentRepository();
    const createdInOrgA = await consignmentRepo.create({
      codAmountMinor: 100000n,
      consignmentNumber: "CNS-001",
      courierProvider: "STEADFAST",
      deliveryAddressLine1: "Banani",
      organizationId: orgA,
      recipientName: "Test",
      recipientPhone: "+8801700000000",
      salesOrderId: orderId,
      status: "BOOKED",
    });

    const service = new ShippingApplicationService({
      authorizationService: createAuth(true),
      consignments: consignmentRepo,
      salesOrders: { async findById() { return sampleOrder; } },
    });

    // Caller from orgB attempts to read consignment in orgA
    const contextOrgB = createValidContext(orgB, [
      { action: "READ", resource: "SALES_ORDER" },
    ]);

    const result = await service.getConsignment(contextOrgB, {
      consignmentId: createdInOrgA.id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
