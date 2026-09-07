import { describe, expect, it, vi } from "vitest";
import type {
  RecordAuditEntryInput,
  SalesOrderRepository,
  TransactionContext,
  TransactionManager,
} from "@senvo/domain";
import type { ValidatedApplicationExecutionContext } from "../context/execution-context.js";
import type { Clock } from "../context/clock.js";
import { StorefrontReservationMaintenanceService } from "./storefront-reservation-maintenance-service.js";

describe("StorefrontReservationMaintenanceService", () => {
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const now = new Date("2026-09-07T14:00:00.000Z");
  const clock: Clock = { now: () => now };

  it("reclaims due storefront reservations and records an audit entry with SALES_ORDER resource", async () => {
    const recordedAudits: RecordAuditEntryInput[] = [];
    const auditWriter = {
      recordWithinTransaction: (input: RecordAuditEntryInput) => {
        recordedAudits.push(input);
        return Promise.resolve({
          action: input.action,
          createdAt: now,
          id: "audit-1",
          metadata: input.metadata ?? {},
          organizationId: input.organizationId,
          resource: input.resource,
          resourceId: input.resourceId,
          userId: input.actor.userId,
        });
      },
    };

    const reclaimedOrders: string[] = [];
    const fakeSales: Partial<SalesOrderRepository> = {
      findDueStorefrontReservationOrderIds: () => Promise.resolve(["order-1"]),
      reclaimExpiredStorefrontReservation: (record) => {
        reclaimedOrders.push(record.salesOrderId);
        return Promise.resolve({
          expiresAt: new Date("2026-09-07T13:30:00.000Z"),
          orderId: record.salesOrderId,
          orderNumber: "WEB-12345",
          reclaimed: true,
          reservationId: "rsv-1",
          reservationNumber: "WEB-RSV-12345",
        });
      },
    };

    const transactionManager: TransactionManager<ValidatedApplicationExecutionContext> =
      {
        execute: <T>(
          ctx: ValidatedApplicationExecutionContext,
          op: (
            tx: TransactionContext<ValidatedApplicationExecutionContext>,
          ) => Promise<T>,
        ) =>
          op({
            applicationContext: ctx,
            auditWriter,
            inventoryMovementRepository: {} as never,
            salesOrderLifecycleRepository: fakeSales as SalesOrderRepository,
            salesOrderRepository: {} as never,
          }),
      };

    const service = new StorefrontReservationMaintenanceService({
      clock,
      salesOrders: fakeSales as SalesOrderRepository,
      transactionManager,
    });

    const result = await service.reclaimDueReservations({
      cutoff: now,
      organizationId,
    });

    expect(result.reclaimedCount).toBe(1);
    expect(result.reclaimedOrderIds).toEqual(["order-1"]);
    expect(reclaimedOrders).toEqual(["order-1"]);
    expect(recordedAudits).toHaveLength(1);
    expect(recordedAudits[0]).toMatchObject({
      action: "STOREFRONT_RESERVATION_EXPIRED",
      actor: { userId: null },
      organizationId,
      resource: "SALES_ORDER",
      resourceId: "order-1",
      metadata: {
        orderNumber: "WEB-12345",
        reservationId: "rsv-1",
        reservationNumber: "WEB-RSV-12345",
      },
    });
  });

  it("rolls back candidate reclaim when audit write fails", async () => {
    let transactionAborted = false;
    const failingAuditWriter = {
      recordWithinTransaction: () => {
        throw new Error("Audit service failure");
      },
    };

    const fakeSales: Partial<SalesOrderRepository> = {
      findDueStorefrontReservationOrderIds: () =>
        Promise.resolve(["order-failing-audit"]),
      reclaimExpiredStorefrontReservation: (record) =>
        Promise.resolve({
          expiresAt: new Date("2026-09-07T13:30:00.000Z"),
          orderId: record.salesOrderId,
          orderNumber: "WEB-99999",
          reclaimed: true,
          reservationId: "rsv-fail",
          reservationNumber: "WEB-RSV-99999",
        }),
    };

    const transactionManager: TransactionManager<ValidatedApplicationExecutionContext> =
      {
        execute: async <T>(
          ctx: ValidatedApplicationExecutionContext,
          op: (
            tx: TransactionContext<ValidatedApplicationExecutionContext>,
          ) => Promise<T>,
        ) => {
          try {
            return await op({
              applicationContext: ctx,
              auditWriter: failingAuditWriter,
              inventoryMovementRepository: {} as never,
              salesOrderLifecycleRepository: fakeSales as SalesOrderRepository,
              salesOrderRepository: {} as never,
            });
          } catch (error) {
            transactionAborted = true;
            throw error;
          }
        },
      };

    const service = new StorefrontReservationMaintenanceService({
      clock,
      salesOrders: fakeSales as SalesOrderRepository,
      transactionManager,
    });

    await expect(
      service.reclaimDueReservations({ organizationId }),
    ).rejects.toThrow("Audit service failure");

    expect(transactionAborted).toBe(true);
  });

  it("does not write audit entries when candidate was already confirmed or skipped", async () => {
    const recordedAudits: RecordAuditEntryInput[] = [];
    const auditWriter = {
      recordWithinTransaction: (input: RecordAuditEntryInput) => {
        recordedAudits.push(input);
        return Promise.resolve({} as AuditEntry);
      },
    };

    const fakeSales: Partial<SalesOrderRepository> = {
      findDueStorefrontReservationOrderIds: () =>
        Promise.resolve(["order-already-confirmed"]),
      reclaimExpiredStorefrontReservation: (record) =>
        Promise.resolve({
          expiresAt: null,
          orderId: record.salesOrderId,
          reclaimed: false, // Already confirmed or changed
        }),
    };

    const transactionManager: TransactionManager<ValidatedApplicationExecutionContext> =
      {
        execute: <T>(
          ctx: ValidatedApplicationExecutionContext,
          op: (
            tx: TransactionContext<ValidatedApplicationExecutionContext>,
          ) => Promise<T>,
        ) =>
          op({
            applicationContext: ctx,
            auditWriter,
            inventoryMovementRepository: {} as never,
            salesOrderLifecycleRepository: fakeSales as SalesOrderRepository,
            salesOrderRepository: {} as never,
          }),
      };

    const service = new StorefrontReservationMaintenanceService({
      clock,
      salesOrders: fakeSales as SalesOrderRepository,
      transactionManager,
    });

    const result = await service.reclaimDueReservations({ organizationId });

    expect(result.reclaimedCount).toBe(0);
    expect(result.reclaimedOrderIds).toEqual([]);
    expect(recordedAudits).toHaveLength(0);
  });

  it("respects batch limit and detects remaining backlog", async () => {
    const fakeSales: Partial<SalesOrderRepository> = {
      findDueStorefrontReservationOrderIds: ({ limit }) => {
        const total = ["o1", "o2", "o3", "o4", "o5"];
        return Promise.resolve(total.slice(0, limit));
      },
      reclaimExpiredStorefrontReservation: (record) =>
        Promise.resolve({
          expiresAt: now,
          orderId: record.salesOrderId,
          reclaimed: true,
        }),
    };

    const transactionManager: TransactionManager<ValidatedApplicationExecutionContext> =
      {
        execute: <T>(
          ctx: ValidatedApplicationExecutionContext,
          op: (
            tx: TransactionContext<ValidatedApplicationExecutionContext>,
          ) => Promise<T>,
        ) =>
          op({
            applicationContext: ctx,
            auditWriter: { recordWithinTransaction: vi.fn() },
            inventoryMovementRepository: {} as never,
            salesOrderLifecycleRepository: fakeSales as SalesOrderRepository,
            salesOrderRepository: {} as never,
          }),
      };

    const service = new StorefrontReservationMaintenanceService({
      clock,
      salesOrders: fakeSales as SalesOrderRepository,
      transactionManager,
    });

    const result = await service.reclaimDueReservations({
      limit: 2,
      organizationId,
    });

    expect(result.candidatesFound).toBe(2);
    expect(result.reclaimedCount).toBe(2);
    expect(result.hasMore).toBe(true);
  });
});
