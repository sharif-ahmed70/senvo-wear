import { randomUUID } from "node:crypto";
import type { SalesOrderRepository } from "@senvo/domain";
import type { Clock } from "../context/clock.js";
import { systemClock } from "../context/clock.js";
import type { ValidatedApplicationExecutionContext } from "../context/execution-context.js";
import { validateExecutionContext } from "../context/execution-context.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";

export const STOREFRONT_ONLINE_PAYMENT_RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const STOREFRONT_COD_RESERVATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_STOREFRONT_RESERVATION_MAINTENANCE_BATCH_SIZE = 25;

export type StorefrontReservationMaintenanceDependencies = {
  clock?: Clock;
  requestIdGenerator?: () => string;
  salesOrders?: SalesOrderRepository;
  salesOrderRepository?: SalesOrderRepository;
  transactionManager: ApplicationTransactionManager;
};

export type ReclaimDueReservationsInput = {
  cutoff?: Date;
  limit?: number;
  organizationId: string;
};

export type ReclaimDueReservationsResult = {
  candidatesFound: number;
  cutoff: Date;
  hasMore: boolean;
  reclaimedCount: number;
  reclaimedOrderIds: string[];
};

export class StorefrontReservationMaintenanceService {
  private readonly clock: Clock;
  private readonly requestIdGenerator: () => string;
  private readonly salesOrders?: SalesOrderRepository;
  private readonly transactionManager: ApplicationTransactionManager;

  constructor(dependencies: StorefrontReservationMaintenanceDependencies) {
    this.clock = dependencies.clock ?? systemClock;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => `req_maint_${randomUUID()}`);
    this.salesOrders =
      dependencies.salesOrders ?? dependencies.salesOrderRepository;
    this.transactionManager = dependencies.transactionManager;
  }

  async reclaimDueReservations(
    input: ReclaimDueReservationsInput,
  ): Promise<ReclaimDueReservationsResult> {
    const limit =
      input.limit ?? DEFAULT_STOREFRONT_RESERVATION_MAINTENANCE_BATCH_SIZE;
    const cutoff = input.cutoff ?? this.clock.now();

    // Query due candidates using salesOrders repository if provided,
    // or run a quick scan transaction.
    let candidateIds: string[] = [];
    if (this.salesOrders) {
      candidateIds =
        await this.salesOrders.findDueStorefrontReservationOrderIds({
          cutoff,
          limit: limit + 1,
          organizationId: input.organizationId,
        });
    } else {
      const scanContext = this.createExecutionContext(input.organizationId);
      candidateIds = await this.transactionManager.execute(
        scanContext,
        async (transactionContext) => {
          const sales = transactionContext.salesOrderLifecycleRepository;
          if (!sales) {
            return [];
          }
          return sales.findDueStorefrontReservationOrderIds({
            cutoff,
            limit: limit + 1,
            organizationId: input.organizationId,
          });
        },
      );
    }

    const hasMore = candidateIds.length > limit;
    const processingIds = candidateIds.slice(0, limit);
    const reclaimedOrderIds: string[] = [];

    for (const orderId of processingIds) {
      const execContext = this.createExecutionContext(input.organizationId);
      const outcome = await this.transactionManager.execute(
        execContext,
        async (transactionContext) => {
          const sales = transactionContext.salesOrderLifecycleRepository;
          if (!sales) {
            throw new Error(
              "Sales order lifecycle repository is unavailable in transaction context.",
            );
          }
          const result = await sales.reclaimExpiredStorefrontReservation({
            applicationTime: cutoff,
            cutoff,
            organizationId: input.organizationId,
            salesOrderId: orderId,
          });

          if (result.reclaimed) {
            await transactionContext.auditWriter.recordWithinTransaction({
              action: "STOREFRONT_RESERVATION_EXPIRED",
              actor: { userId: null },
              metadata: {
                expiresAt: result.expiresAt
                  ? result.expiresAt.toISOString()
                  : null,
                expiryCutoff: cutoff.toISOString(),
                orderNumber: result.orderNumber ?? null,
                reservationId: result.reservationId ?? null,
                reservationNumber: result.reservationNumber ?? null,
              },
              organizationId: input.organizationId,
              resource: "SALES_ORDER",
              resourceId: result.orderId,
            });
          }

          return result;
        },
      );

      if (outcome.reclaimed) {
        reclaimedOrderIds.push(orderId);
      }
    }

    return {
      candidatesFound: processingIds.length,
      cutoff,
      hasMore,
      reclaimedCount: reclaimedOrderIds.length,
      reclaimedOrderIds,
    };
  }

  private createExecutionContext(
    organizationId: string,
  ): ValidatedApplicationExecutionContext {
    return validateExecutionContext({
      actorType: "SYSTEM",
      authenticationState: "ANONYMOUS",
      organizationId,
      permissions: null,
      requestId: this.requestIdGenerator(),
      source: "STOREFRONT",
      userId: null,
    });
  }
}
