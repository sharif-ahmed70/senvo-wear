import { describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "../../errors.js";
import type { SalesOrder } from "../../sales/domain/models.js";
import type { CourierConsignment, ShipmentReturnEvent } from "../domain/models.js";
import type {
  CourierConsignmentRepository,
  CreateCourierConsignmentRecord,
  UpdateCourierConsignmentRecord,
} from "../repositories/courier-consignment-repository.js";
import {
  dispatchSalesOrder,
  getConsignmentById,
  getShipmentsByOrderId,
  updateShipmentStatus,
} from "./shipping-use-cases.js";

function createMockConsignmentRepository(
  initialConsignments: CourierConsignment[] = [],
): CourierConsignmentRepository {
  const store = new Map<string, CourierConsignment>();
  for (const c of initialConsignments) {
    store.set(c.id, c);
  }

  return {
    async create(record: CreateCourierConsignmentRecord): Promise<CourierConsignment> {
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
        id: record.id || `cns-${store.size + 1}`,
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

    async update(record: UpdateCourierConsignmentRecord): Promise<CourierConsignment> {
      const existing = store.get(record.consignmentId);
      if (!existing || existing.organizationId !== record.organizationId) {
        throw new NotFoundError("Consignment not found");
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

describe("shipping use cases", () => {
  const orgId = "org-100";
  const orderId = "ord-200";

  const sampleOrder: SalesOrder = {
    allocationPolicyId: null,
    boothId: null,
    cancelledAt: null,
    channel: "ONLINE",
    confirmedAt: new Date(),
    createdAt: new Date(),
    currencyCode: "BDT",
    customerEmail: "ahmed@example.com",
    customerName: "Ahmed Sharif",
    customerPhone: "+8801711223344",
    deliveryAddressLine1: "House 15, Road 7, Banani",
    deliveryAddressLine2: "Apt 3A",
    deliveryCity: "Dhaka",
    deliveryDistrict: "Dhaka",
    deliveryMinor: 6000,
    deliveryPostalCode: "1213",
    discountMinor: 0,
    fulfilledAt: null,
    fulfillmentMovementId: null,
    id: orderId,
    idempotencyKey: "order-idemp-1",
    inventoryReservationId: null,
    lines: [],
    note: "Handle carefully",
    orderNumber: "ORD-2026-0099",
    organizationId: orgId,
    payloadSignature: "sig-1",
    reservedAt: null,
    status: "CONFIRMED",
    subtotalMinor: 250000,
    totalMinor: 256000,
    updatedAt: new Date(),
    version: 1,
  };

  describe("dispatchSalesOrder", () => {
    it("successfully creates a courier consignment snapshotting order delivery details", async () => {
      const consignmentRepo = createMockConsignmentRepository();
      const salesOrderRepo = {
        async findById(id: string, organizationId: string) {
          return id === orderId && organizationId === orgId ? sampleOrder : null;
        },
      };

      const result = await dispatchSalesOrder(
        { consignmentRepository: consignmentRepo, salesOrderRepository: salesOrderRepo },
        {
          courierProvider: "STEADFAST",
          organizationId: orgId,
          salesOrderId: orderId,
          trackingCode: "ST-554433",
        },
      );

      expect(result.consignment).toBeDefined();
      expect(result.consignment.courierProvider).toBe("STEADFAST");
      expect(result.consignment.trackingCode).toBe("ST-554433");
      expect(result.consignment.status).toBe("BOOKED");
      expect(result.consignment.recipientName).toBe("Ahmed Sharif");
      expect(result.consignment.recipientPhone).toBe("+8801711223344");
      expect(result.consignment.deliveryAddressLine1).toBe("House 15, Road 7, Banani");
      expect(result.consignment.deliveryAddressLine2).toBe("Apt 3A");
      expect(result.consignment.codAmountMinor).toBe(256000n);
      expect(result.consignment.deliveryFeeMinor).toBe(6000n);
      expect(result.consignment.consignmentNumber).toBe("CNS-ORD-2026-0099-01");
    });

    it("prevents duplicate active dispatch for an order", async () => {
      const consignmentRepo = createMockConsignmentRepository();
      const salesOrderRepo = {
        async findById() {
          return sampleOrder;
        },
      };

      await dispatchSalesOrder(
        { consignmentRepository: consignmentRepo, salesOrderRepository: salesOrderRepo },
        {
          courierProvider: "PATHAO",
          organizationId: orgId,
          salesOrderId: orderId,
          trackingCode: "PT-111",
        },
      );

      await expect(
        dispatchSalesOrder(
          { consignmentRepository: consignmentRepo, salesOrderRepository: salesOrderRepo },
          {
            courierProvider: "REDX",
            organizationId: orgId,
            salesOrderId: orderId,
            trackingCode: "RX-222",
          },
        ),
      ).rejects.toThrow(ConflictError);
    });

    it("allows explicit recipient and COD overrides during dispatch", async () => {
      const consignmentRepo = createMockConsignmentRepository();
      const salesOrderRepo = {
        async findById() {
          return sampleOrder;
        },
      };

      const result = await dispatchSalesOrder(
        { consignmentRepository: consignmentRepo, salesOrderRepository: salesOrderRepo },
        {
          codAmountMinor: 100000,
          courierProvider: "IN_HOUSE",
          deliveryAddressLine1: "Alternative Office Address",
          deliveryFeeMinor: 0,
          organizationId: orgId,
          recipientName: "Brother of Customer",
          recipientPhone: "+8801999999999",
          salesOrderId: orderId,
        },
      );

      expect(result.consignment.recipientName).toBe("Brother of Customer");
      expect(result.consignment.recipientPhone).toBe("+8801999999999");
      expect(result.consignment.deliveryAddressLine1).toBe("Alternative Office Address");
      expect(result.consignment.codAmountMinor).toBe(100000n);
      expect(result.consignment.deliveryFeeMinor).toBe(0n);
      expect(result.consignment.status).toBe("DRAFT");
    });

    it("throws NotFoundError when order does not exist", async () => {
      const consignmentRepo = createMockConsignmentRepository();
      const salesOrderRepo = {
        async findById() {
          return null;
        },
      };

      await expect(
        dispatchSalesOrder(
          { consignmentRepository: consignmentRepo, salesOrderRepository: salesOrderRepo },
          {
            courierProvider: "STEADFAST",
            organizationId: orgId,
            salesOrderId: "missing-id",
          },
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateShipmentStatus", () => {
    it("transitions consignment through lifecycle and records timestamps", async () => {
      const consignmentRepo = createMockConsignmentRepository();
      const initial = await consignmentRepo.create({
        codAmountMinor: 256000n,
        consignmentNumber: "CNS-001",
        courierProvider: "STEADFAST",
        deliveryAddressLine1: "Banani",
        organizationId: orgId,
        recipientName: "Ahmed",
        recipientPhone: "+8801700000000",
        salesOrderId: orderId,
        status: "BOOKED",
      });

      // 1. Move to PICKED_UP
      const pickedUpRes = await updateShipmentStatus(
        { consignmentRepository: consignmentRepo },
        {
          consignmentId: initial.id,
          organizationId: orgId,
          status: "PICKED_UP",
        },
      );
      expect(pickedUpRes.consignment.status).toBe("PICKED_UP");
      expect(pickedUpRes.consignment.dispatchedAt).toBeDefined();

      // 2. Move to IN_TRANSIT
      const transitRes = await updateShipmentStatus(
        { consignmentRepository: consignmentRepo },
        {
          consignmentId: initial.id,
          organizationId: orgId,
          status: "IN_TRANSIT",
          trackingCode: "ST-9988",
        },
      );
      expect(transitRes.consignment.status).toBe("IN_TRANSIT");
      expect(transitRes.consignment.trackingCode).toBe("ST-9988");

      // 3. Move to DELIVERED
      const deliveredRes = await updateShipmentStatus(
        { consignmentRepository: consignmentRepo },
        {
          consignmentId: initial.id,
          organizationId: orgId,
          status: "DELIVERED",
        },
      );
      expect(deliveredRes.consignment.status).toBe("DELIVERED");
      expect(deliveredRes.consignment.deliveredAt).toBeDefined();

      // 4. Delivered cannot be transitioned back
      await expect(
        updateShipmentStatus(
          { consignmentRepository: consignmentRepo },
          {
            consignmentId: initial.id,
            organizationId: orgId,
            status: "IN_TRANSIT",
          },
        ),
      ).rejects.toThrow(ConflictError);
    });

    it("treats same-status update as idempotent no-op", async () => {
      const consignmentRepo = createMockConsignmentRepository();
      const initial = await consignmentRepo.create({
        codAmountMinor: 256000n,
        consignmentNumber: "CNS-001",
        courierProvider: "PATHAO",
        deliveryAddressLine1: "Banani",
        organizationId: orgId,
        recipientName: "Ahmed",
        recipientPhone: "+8801700000000",
        salesOrderId: orderId,
        status: "BOOKED",
      });

      const res = await updateShipmentStatus(
        { consignmentRepository: consignmentRepo },
        {
          consignmentId: initial.id,
          organizationId: orgId,
          status: "BOOKED",
        },
      );
      expect(res.consignment.status).toBe("BOOKED");
      expect(res.consignment.version).toBe(1);
      expect(res.returnEvent).toBeNull();
    });

    it("handles RTO scenario and triggers return event hook", async () => {
      const consignmentRepo = createMockConsignmentRepository();
      const initial = await consignmentRepo.create({
        codAmountMinor: 256000n,
        consignmentNumber: "CNS-001",
        courierProvider: "STEADFAST",
        deliveryAddressLine1: "Banani",
        organizationId: orgId,
        recipientName: "Ahmed",
        recipientPhone: "+8801700000000",
        salesOrderId: orderId,
        status: "IN_TRANSIT",
      });

      const onReturnToOrigin = vi.fn((_event: ShipmentReturnEvent) => {});

      const result = await updateShipmentStatus(
        { consignmentRepository: consignmentRepo },
        {
          consignmentId: initial.id,
          note: "Customer refused delivery - wrong size",
          onReturnToOrigin,
          organizationId: orgId,
          status: "RETURNED_TO_ORIGIN",
        },
      );

      expect(result.consignment.status).toBe("RETURNED_TO_ORIGIN");
      expect(result.consignment.returnedAt).toBeDefined();
      expect(result.returnEvent).toBeDefined();
      expect(result.returnEvent?.requiresRestocking).toBe(true);
      expect(result.returnEvent?.reason).toBe("Customer refused delivery - wrong size");
      expect(onReturnToOrigin).toHaveBeenCalledTimes(1);

      // Repeat RTO is idempotent and does not re-invoke return hook
      onReturnToOrigin.mockClear();
      const idempotentResult = await updateShipmentStatus(
        { consignmentRepository: consignmentRepo },
        {
          consignmentId: initial.id,
          onReturnToOrigin,
          organizationId: orgId,
          status: "RETURNED_TO_ORIGIN",
        },
      );
      expect(idempotentResult.consignment.status).toBe("RETURNED_TO_ORIGIN");
      expect(onReturnToOrigin).not.toHaveBeenCalled();
    });
  });

  describe("getShipmentsByOrderId & getConsignmentById", () => {
    it("retrieves shipments associated with order", async () => {
      const consignmentRepo = createMockConsignmentRepository();
      await consignmentRepo.create({
        codAmountMinor: 100000n,
        consignmentNumber: "CNS-1",
        courierProvider: "STEADFAST",
        deliveryAddressLine1: "Dhanmondi",
        organizationId: orgId,
        recipientName: "Test",
        recipientPhone: "+8801700000000",
        salesOrderId: orderId,
        status: "CANCELLED",
      });
      const active = await consignmentRepo.create({
        codAmountMinor: 100000n,
        consignmentNumber: "CNS-2",
        courierProvider: "PATHAO",
        deliveryAddressLine1: "Dhanmondi",
        organizationId: orgId,
        recipientName: "Test",
        recipientPhone: "+8801700000000",
        salesOrderId: orderId,
        status: "BOOKED",
      });

      const list = await getShipmentsByOrderId(
        { consignmentRepository: consignmentRepo },
        { organizationId: orgId, salesOrderId: orderId },
      );
      expect(list).toHaveLength(2);

      const byId = await getConsignmentById(
        { consignmentRepository: consignmentRepo },
        { consignmentId: active.id, organizationId: orgId },
      );
      expect(byId.id).toBe(active.id);
    });
  });
});
