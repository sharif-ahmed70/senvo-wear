import {
  BusinessRuleError,
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  calculateSalesOrderTotals,
  encodeSalesOrderCursor,
  parseSalesOrderCursor,
  type AmendDraftSalesOrderRecord,
  type CreateDraftSalesOrderRecord,
  type FindDueStorefrontReservationOrderIdsFilter,
  type FulfillSalesOrderRecord,
  type ReclaimExpiredStorefrontReservationRecord,
  type ReclaimExpiredStorefrontReservationResult,
  type ReserveSalesOrderRecord,
  type SalesOrder,
  type SalesOrderListFilter,
  type SalesOrderCreationRepository,
  type SalesOrderRepository,
  type CursorPageResult,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type SalesPrismaClient = Pick<
  PrismaClient,
  | "$executeRaw"
  | "$queryRaw"
  | "$transaction"
  | "inventoryMovement"
  | "inventoryMovementLine"
  | "inventoryAllocationPolicy"
  | "inventoryAllocationPolicyLocation"
  | "inventoryReservation"
  | "inventoryReservationLine"
  | "productVariant"
  | "salesOrder"
  | "salesOrderCommerceProfile"
  | "salesOrderLine"
>;

export type SalesTransactionClient = Omit<SalesPrismaClient, "$transaction">;
type SalesTransaction = SalesTransactionClient;

type OrderWithLines = Prisma.SalesOrderGetPayload<{
  include: { lines: { orderBy: { lineNumber: "asc" } } };
}>;

type VariantSnapshot = Prisma.ProductVariantGetPayload<{
  include: { color: true; product: true; size: true };
}>;

type AllocationCandidate = Prisma.InventoryAllocationPolicyLocationGetPayload<{
  include: { stockLocation: { include: { branch: true } } };
}>;

type PayloadSignatureRow = {
  payload_signature: string;
};

type QuantityRow = {
  quantity: bigint | number | null;
};

type KnownPrismaError = {
  code?: string;
};

type SalesOrderMetadataTextField =
  | "customerEmail"
  | "customerName"
  | "customerPhone"
  | "deliveryAddressLine1"
  | "deliveryAddressLine2"
  | "deliveryCity"
  | "deliveryDistrict"
  | "deliveryPostalCode"
  | "note";

const orderInclude = {
  lines: { orderBy: { lineNumber: "asc" as const } },
};

export class PrismaSalesOrderRepository implements SalesOrderRepository {
  constructor(private readonly prisma: SalesPrismaClient) {}

  async amendDraft(record: AmendDraftSalesOrderRecord): Promise<SalesOrder> {
    try {
      return mapOrder(
        await this.prisma.$transaction(async (transaction) => {
          await lockOrderRow(
            transaction,
            record.organizationId,
            record.salesOrderId,
          );
          const order = await getOrderForUpdate(transaction, record);
          if (order.status !== "DRAFT") {
            throw new BusinessRuleError(
              "Only draft sales orders can be amended.",
            );
          }
          assertOrderVersion(order, record.expectedVersion);

          const allocationPolicyId =
            record.metadata && "allocationPolicyId" in record.metadata
              ? record.metadata.allocationPolicyId
              : order.allocationPolicyId;
          if (allocationPolicyId) {
            await assertActiveAllocationPolicy(
              transaction,
              record.organizationId,
              allocationPolicyId,
            );
          }

          const finalLines = record.lines ?? order.lines;
          const discountMinor =
            record.metadata && "discountMinor" in record.metadata
              ? record.metadata.discountMinor
              : order.discountMinor;
          const deliveryMinor =
            record.metadata && "deliveryMinor" in record.metadata
              ? record.metadata.deliveryMinor
              : order.deliveryMinor;
          const totals = calculateSalesOrderTotals({
            deliveryMinor: deliveryMinor ?? 0,
            discountMinor: discountMinor ?? 0,
            lines: finalLines,
          });

          if (record.lines) {
            const snapshots = await loadVariantSnapshots(transaction, {
              lines: record.lines,
              organizationId: record.organizationId,
            });
            await transaction.salesOrderLine.deleteMany({
              where: {
                organizationId: record.organizationId,
                salesOrderId: order.id,
              },
            });
            await transaction.salesOrderLine.createMany({
              data: record.lines.map((line, index) => {
                const snapshot = snapshots.get(line.productVariantId);
                if (!snapshot) {
                  throw new NotFoundError("Product variant was not found.");
                }
                return {
                  colorSnapshot: snapshot.color.name,
                  discountMinor: line.discountMinor,
                  lineNumber: index + 1,
                  lineTotalMinor: line.lineTotalMinor,
                  organizationId: record.organizationId,
                  productNameSnapshot: snapshot.product.name,
                  productVariantId: line.productVariantId,
                  quantity: line.quantity,
                  salesOrderId: order.id,
                  sizeSnapshot: snapshot.size.name,
                  skuSnapshot: snapshot.sku,
                  unitPriceMinor: line.unitPriceMinor,
                };
              }),
            });
          }

          const updateData: Prisma.SalesOrderUncheckedUpdateInput = {
            ...toMetadataUpdateData(record.metadata),
            deliveryMinor: deliveryMinor ?? 0,
            discountMinor: discountMinor ?? 0,
            subtotalMinor: totals.subtotalMinor,
            totalMinor: totals.totalMinor,
            version: { increment: 1 },
          };
          if (record.metadata && "allocationPolicyId" in record.metadata) {
            updateData.allocationPolicyId = allocationPolicyId;
          }

          return transaction.salesOrder.update({
            data: updateData,
            include: orderInclude,
            where: { id: order.id },
          });
        }),
      );
    } catch (error) {
      mapSalesOrderIntegrityError(error);
    }
  }

  async createDraft(
    record: CreateDraftSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder> {
    try {
      return mapOrder(
        await this.prisma.$transaction((transaction) =>
          createDraftWithinTransaction(transaction, record, payloadSignature),
        ),
      );
    } catch (error) {
      mapSalesOrderIntegrityError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<SalesOrder | null> {
    const order = await this.prisma.salesOrder.findFirst({
      include: orderInclude,
      where: { id, organizationId },
    });
    return order ? mapOrder(order) : null;
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<SalesOrder | null> {
    const order = await this.prisma.salesOrder.findUnique({
      include: orderInclude,
      where: {
        organizationId_idempotencyKey: { idempotencyKey, organizationId },
      },
    });
    return order ? mapOrder(order) : null;
  }

  async findByOrderNumber(
    organizationId: string,
    orderNumber: string,
  ): Promise<SalesOrder | null> {
    const order = await this.prisma.salesOrder.findUnique({
      include: orderInclude,
      where: { organizationId_orderNumber: { orderNumber, organizationId } },
    });
    return order ? mapOrder(order) : null;
  }

  async list(
    filter: SalesOrderListFilter,
  ): Promise<CursorPageResult<SalesOrder>> {
    const cursor = filter.cursor ? parseSalesOrderCursor(filter.cursor) : null;
    const records = await this.prisma.salesOrder.findMany({
      include: orderInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filter.pageSize + 1,
      where: {
        organizationId: filter.organizationId,
        ...(filter.channel ? { channel: filter.channel } : {}),
        ...(filter.customerPhone
          ? { customerPhone: filter.customerPhone }
          : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.createdFrom || filter.createdTo
          ? {
              createdAt: {
                ...(filter.createdFrom ? { gte: filter.createdFrom } : {}),
                ...(filter.createdTo ? { lte: filter.createdTo } : {}),
              },
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
    });
    return toOrderCursorPage(records.map(mapOrder), filter.pageSize);
  }

  async reserve(
    record: ReserveSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder> {
    try {
      return mapOrder(
        await this.prisma.$transaction(async (transaction) => {
          await lockOrderRow(
            transaction,
            record.organizationId,
            record.salesOrderId,
          );
          const order = await getOrderForUpdate(transaction, record);

          if (order.status === "RESERVED" && order.inventoryReservationId) {
            const signature = await getReservationPayloadSignature(
              transaction,
              record.organizationId,
              order.inventoryReservationId,
            );
            if (signature === payloadSignature) {
              return order;
            }
          }
          assertOrderVersion(order, record.expectedVersion);
          if (order.status !== "DRAFT") {
            throw new BusinessRuleError(
              "Only draft sales orders can be reserved.",
            );
          }
          if (!order.allocationPolicyId) {
            throw new BusinessRuleError(
              "Sales order requires an allocation policy before reservation.",
            );
          }

          await assertReservationIdempotencyAvailable(
            transaction,
            record,
            payloadSignature,
          );
          const candidate = await selectReservationCandidate(
            transaction,
            order,
            record,
          );
          const reservation = await transaction.inventoryReservation.create({
            data: {
              expiresAt: record.expiresAt,
              idempotencyKey: record.reservationIdempotencyKey,
              note: `Sales order ${order.orderNumber}`,
              organizationId: record.organizationId,
              payloadSignature,
              referenceId: order.id,
              referenceType: "SALES_ORDER",
              reservationNumber: record.reservationNumber,
              stockLocationId: candidate.stockLocationId,
            },
          });
          await transaction.inventoryReservationLine.createMany({
            data: order.lines.map((line) => ({
              lineNumber: line.lineNumber,
              organizationId: order.organizationId,
              productVariantId: line.productVariantId,
              quantity: line.quantity,
              reservationId: reservation.id,
            })),
          });
          return transaction.salesOrder.update({
            data: {
              inventoryReservationId: reservation.id,
              reservedAt: new Date(),
              status: "RESERVED",
              version: { increment: 1 },
            },
            include: orderInclude,
            where: { id: order.id },
          });
        }),
      );
    } catch (error) {
      mapSalesOrderIntegrityError(error);
    }
  }

  async confirm(record: {
    expectedVersion: number;
    organizationId: string;
    salesOrderId: string;
  }): Promise<SalesOrder> {
    return this.transitionWithReservationCheck(record, "CONFIRMED");
  }

  async cancel(record: {
    expectedVersion: number;
    organizationId: string;
    salesOrderId: string;
  }): Promise<SalesOrder> {
    try {
      return mapOrder(
        await this.prisma.$transaction(async (transaction) => {
          await lockOrderRow(
            transaction,
            record.organizationId,
            record.salesOrderId,
          );
          const order = await getOrderForUpdate(transaction, record);
          assertOrderVersion(order, record.expectedVersion);

          if (order.status === "DRAFT") {
            return transaction.salesOrder.update({
              data: {
                cancelledAt: new Date(),
                status: "CANCELLED",
                version: { increment: 1 },
              },
              include: orderInclude,
              where: { id: order.id },
            });
          }
          if (order.status !== "RESERVED" && order.status !== "CONFIRMED") {
            throw new BusinessRuleError("Sales order cannot be cancelled.");
          }
          if (!order.inventoryReservationId) {
            throw new BusinessRuleError(
              "Sales order has no linked reservation.",
            );
          }
          await lockReservationRow(
            transaction,
            order.organizationId,
            order.inventoryReservationId,
          );
          const reservation = await transaction.inventoryReservation.findFirst({
            where: {
              id: order.inventoryReservationId,
              organizationId: order.organizationId,
            },
          });
          if (!reservation) {
            throw new NotFoundError("Inventory reservation was not found.");
          }
          if (reservation.status !== "ACTIVE") {
            throw new BusinessRuleError(
              "Only active inventory reservations can be released on cancellation.",
            );
          }
          const now = new Date();
          await transaction.inventoryReservation.update({
            data: {
              expiredAt: null,
              confirmedAt: null,
              releasedAt: now,
              status: "RELEASED",
              version: { increment: 1 },
            },
            where: { id: reservation.id },
          });
          return transaction.salesOrder.update({
            data: {
              cancelledAt: now,
              status: "CANCELLED",
              version: { increment: 1 },
            },
            include: orderInclude,
            where: { id: order.id },
          });
        }),
      );
    } catch (error) {
      mapSalesOrderIntegrityError(error);
    }
  }

  async fulfill(
    record: FulfillSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder> {
    try {
      return mapOrder(
        await this.prisma.$transaction(async (transaction) => {
          await lockOrderRow(
            transaction,
            record.organizationId,
            record.salesOrderId,
          );
          const order = await getOrderForUpdate(transaction, record);

          if (order.status === "FULFILLED" && order.fulfillmentMovementId) {
            const signature = await getMovementPayloadSignature(
              transaction,
              record.organizationId,
              order.fulfillmentMovementId,
            );
            if (signature === payloadSignature) {
              return order;
            }
          }
          assertOrderVersion(order, record.expectedVersion);
          if (order.status !== "CONFIRMED") {
            throw new BusinessRuleError(
              "Only confirmed sales orders can be fulfilled.",
            );
          }
          if (!order.inventoryReservationId) {
            throw new BusinessRuleError(
              "Sales order has no linked reservation.",
            );
          }
          await lockReservationRow(
            transaction,
            order.organizationId,
            order.inventoryReservationId,
          );
          await assertMovementIdempotencyAvailable(
            transaction,
            record,
            payloadSignature,
          );
          const reservation = await transaction.inventoryReservation.findFirst({
            include: { lines: { orderBy: { lineNumber: "asc" } } },
            where: {
              id: order.inventoryReservationId,
              organizationId: order.organizationId,
            },
          });
          if (!reservation) {
            throw new NotFoundError("Inventory reservation was not found.");
          }
          if (reservation.status !== "ACTIVE") {
            throw new BusinessRuleError(
              "Only active inventory reservations can be fulfilled.",
            );
          }
          await lockStockKeys(transaction, {
            lines: reservation.lines,
            organizationId: reservation.organizationId,
            stockLocationId: reservation.stockLocationId,
          });
          await assertSufficientOnHandForReservation(transaction, reservation);

          const now = new Date();
          const movement = await transaction.inventoryMovement.create({
            data: {
              destinationLocationId: null,
              idempotencyKey: record.consumptionIdempotencyKey,
              movementNumber: record.movementNumber,
              note: record.note,
              occurredAt: record.occurredAt,
              organizationId: record.organizationId,
              payloadSignature,
              postedAt: now,
              referenceId: order.id,
              referenceType: "SALES_ORDER",
              sourceLocationId: reservation.stockLocationId,
              status: "POSTED",
              type: "ISSUE",
              version: 2,
            },
          });
          await transaction.inventoryMovementLine.createMany({
            data: reservation.lines.map((line) => ({
              lineNumber: line.lineNumber,
              movementId: movement.id,
              note: null,
              organizationId: reservation.organizationId,
              productVariantId: line.productVariantId,
              quantity: line.quantity,
            })),
          });
          await transaction.inventoryReservation.update({
            data: {
              confirmedAt: now,
              consumedByMovementId: movement.id,
              expiredAt: null,
              releasedAt: null,
              status: "CONFIRMED",
              version: { increment: 1 },
            },
            where: { id: reservation.id },
          });
          return transaction.salesOrder.update({
            data: {
              fulfilledAt: now,
              fulfillmentMovementId: movement.id,
              status: "FULFILLED",
              version: { increment: 1 },
            },
            include: orderInclude,
            where: { id: order.id },
          });
        }),
      );
    } catch (error) {
      mapSalesOrderIntegrityError(error);
    }
  }

  async findDueStorefrontReservationOrderIds(
    filter: FindDueStorefrontReservationOrderIdsFilter,
  ): Promise<string[]> {
    const orders = await this.prisma.salesOrder.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take: filter.limit,
      where: {
        commerceProfile: {
          source: "STOREFRONT",
        },
        inventoryReservation: {
          consumedByMovementId: null,
          expiresAt: {
            lte: filter.cutoff,
            not: null,
          },
          status: "ACTIVE",
        },
        organizationId: filter.organizationId,
        status: "RESERVED",
      },
    });
    return orders.map((order) => order.id);
  }

  async reclaimExpiredStorefrontReservation(
    record: ReclaimExpiredStorefrontReservationRecord,
  ): Promise<ReclaimExpiredStorefrontReservationResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockOrderRow(
          transaction,
          record.organizationId,
          record.salesOrderId,
        );
        const order = await transaction.salesOrder.findFirst({
          include: {
            commerceProfile: true,
            lines: { orderBy: { lineNumber: "asc" } },
          },
          where: {
            id: record.salesOrderId,
            organizationId: record.organizationId,
          },
        });

        if (
          !order ||
          order.status !== "RESERVED" ||
          !order.inventoryReservationId ||
          order.commerceProfile?.source !== "STOREFRONT"
        ) {
          return {
            expiresAt: null,
            orderId: record.salesOrderId,
            reclaimed: false,
          };
        }

        await lockReservationRow(
          transaction,
          order.organizationId,
          order.inventoryReservationId,
        );
        const reservation = await transaction.inventoryReservation.findFirst({
          include: { lines: { orderBy: { lineNumber: "asc" } } },
          where: {
            id: order.inventoryReservationId,
            organizationId: order.organizationId,
          },
        });

        if (
          !reservation ||
          reservation.status !== "ACTIVE" ||
          reservation.consumedByMovementId !== null ||
          !reservation.expiresAt ||
          reservation.expiresAt.getTime() > record.cutoff.getTime()
        ) {
          return {
            expiresAt: reservation?.expiresAt ?? null,
            orderId: order.id,
            reclaimed: false,
          };
        }

        await lockStockKeys(transaction, {
          lines: reservation.lines,
          organizationId: reservation.organizationId,
          stockLocationId: reservation.stockLocationId,
        });

        const now = record.applicationTime ?? new Date();
        await transaction.inventoryReservation.update({
          data: {
            expiredAt: now,
            status: "EXPIRED",
            version: { increment: 1 },
          },
          where: { id: reservation.id },
        });

        await transaction.salesOrder.update({
          data: {
            cancelledAt: now,
            status: "CANCELLED",
            version: { increment: 1 },
          },
          where: { id: order.id },
        });

        return {
          expiresAt: reservation.expiresAt,
          orderId: order.id,
          orderNumber: order.orderNumber,
          reclaimed: true,
          reservationId: reservation.id,
          reservationNumber: reservation.reservationNumber,
        };
      });
    } catch (error) {
      mapSalesOrderIntegrityError(error);
    }
  }

  private async transitionWithReservationCheck(
    record: {
      expectedVersion: number;
      organizationId: string;
      salesOrderId: string;
    },
    status: "CONFIRMED",
  ): Promise<SalesOrder> {
    try {
      return mapOrder(
        await this.prisma.$transaction(async (transaction) => {
          await lockOrderRow(
            transaction,
            record.organizationId,
            record.salesOrderId,
          );
          const order = await getOrderForUpdate(transaction, record);
          assertOrderVersion(order, record.expectedVersion);
          if (order.status !== "RESERVED") {
            throw new BusinessRuleError(
              "Only reserved sales orders can be confirmed.",
            );
          }
          if (!order.inventoryReservationId) {
            throw new BusinessRuleError(
              "Sales order has no linked reservation.",
            );
          }
          await lockReservationRow(
            transaction,
            order.organizationId,
            order.inventoryReservationId,
          );
          const reservation = await transaction.inventoryReservation.findFirst({
            where: {
              id: order.inventoryReservationId,
              organizationId: order.organizationId,
            },
          });
          if (!reservation) {
            throw new NotFoundError("Inventory reservation was not found.");
          }
          if (reservation.status !== "ACTIVE") {
            throw new BusinessRuleError(
              "Sales order reservation must remain active before confirmation.",
            );
          }
          if (
            reservation.expiresAt &&
            reservation.expiresAt.getTime() <= Date.now()
          ) {
            throw new BusinessRuleError("Sales order reservation has expired.");
          }
          return transaction.salesOrder.update({
            data: {
              confirmedAt: new Date(),
              status,
              version: { increment: 1 },
            },
            include: orderInclude,
            where: { id: order.id },
          });
        }),
      );
    } catch (error) {
      mapSalesOrderIntegrityError(error);
    }
  }
}

export class PrismaTransactionalSalesOrderCreationRepository implements SalesOrderCreationRepository {
  constructor(private readonly transaction: SalesTransactionClient) {}

  async createDraft(
    record: CreateDraftSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder> {
    try {
      return mapOrder(
        await createDraftWithinTransaction(
          this.transaction,
          record,
          payloadSignature,
        ),
      );
    } catch (error) {
      mapSalesOrderIntegrityError(error);
    }
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<SalesOrder | null> {
    const order = await this.transaction.salesOrder.findUnique({
      include: orderInclude,
      where: {
        organizationId_idempotencyKey: { idempotencyKey, organizationId },
      },
    });
    return order ? mapOrder(order) : null;
  }
}

export function createTransactionScopedSalesOrderRepository(
  transaction: SalesTransactionClient,
): SalesOrderRepository {
  const reuseTransaction = (<TResult>(
    operation: (sameTransaction: SalesTransactionClient) => Promise<TResult>,
  ) => operation(transaction)) as unknown as SalesPrismaClient["$transaction"];
  const client: SalesPrismaClient = {
    $executeRaw: transaction.$executeRaw.bind(transaction),
    $queryRaw: transaction.$queryRaw.bind(transaction),
    $transaction: reuseTransaction,
    inventoryAllocationPolicy: transaction.inventoryAllocationPolicy,
    inventoryAllocationPolicyLocation:
      transaction.inventoryAllocationPolicyLocation,
    inventoryMovement: transaction.inventoryMovement,
    inventoryMovementLine: transaction.inventoryMovementLine,
    inventoryReservation: transaction.inventoryReservation,
    inventoryReservationLine: transaction.inventoryReservationLine,
    productVariant: transaction.productVariant,
    salesOrder: transaction.salesOrder,
    salesOrderCommerceProfile: transaction.salesOrderCommerceProfile,
    salesOrderLine: transaction.salesOrderLine,
  };
  return new PrismaSalesOrderRepository(client);
}

async function createDraftWithinTransaction(
  transaction: SalesTransaction,
  record: CreateDraftSalesOrderRecord,
  payloadSignature: string,
): Promise<OrderWithLines> {
  const existing = await transaction.salesOrder.findUnique({
    include: orderInclude,
    where: {
      organizationId_idempotencyKey: {
        idempotencyKey: record.idempotencyKey,
        organizationId: record.organizationId,
      },
    },
  });
  if (existing) {
    if (existing.payloadSignature === payloadSignature) {
      return existing;
    }
    throw new ConflictError("Idempotency key was already used.");
  }

  const snapshots = await loadVariantSnapshots(transaction, record);
  const order = await transaction.salesOrder.create({
    data: {
      allocationPolicyId: record.allocationPolicyId,
      boothId: record.boothId,
      channel: record.channel,
      currencyCode: record.currencyCode,
      customerEmail: record.customerEmail,
      customerName: record.customerName,
      customerPhone: record.customerPhone,
      deliveryAddressLine1: record.deliveryAddressLine1,
      deliveryAddressLine2: record.deliveryAddressLine2,
      deliveryCity: record.deliveryCity,
      deliveryDistrict: record.deliveryDistrict,
      deliveryMinor: record.deliveryMinor,
      deliveryPostalCode: record.deliveryPostalCode,
      discountMinor: record.discountMinor,
      idempotencyKey: record.idempotencyKey,
      note: record.note,
      orderNumber: record.orderNumber,
      organizationId: record.organizationId,
      payloadSignature,
      status: "DRAFT",
      subtotalMinor: record.subtotalMinor,
      totalMinor: record.totalMinor,
    },
  });
  await transaction.salesOrderLine.createMany({
    data: record.lines.map((line, index) => {
      const snapshot = snapshots.get(line.productVariantId);
      if (!snapshot) {
        throw new NotFoundError("Product variant was not found.");
      }
      return {
        colorSnapshot: snapshot.color.name,
        discountMinor: line.discountMinor,
        lineNumber: index + 1,
        lineTotalMinor: line.lineTotalMinor,
        organizationId: record.organizationId,
        productNameSnapshot: snapshot.product.name,
        productVariantId: line.productVariantId,
        quantity: line.quantity,
        salesOrderId: order.id,
        sizeSnapshot: snapshot.size.name,
        skuSnapshot: snapshot.sku,
        unitPriceMinor: line.unitPriceMinor,
      };
    }),
  });
  return transaction.salesOrder.findUniqueOrThrow({
    include: orderInclude,
    where: { id: order.id },
  });
}

async function loadVariantSnapshots(
  transaction: SalesTransaction,
  record: {
    lines: readonly { productVariantId: string }[];
    organizationId: string;
  },
): Promise<Map<string, VariantSnapshot>> {
  const variants = await transaction.productVariant.findMany({
    include: { color: true, product: true, size: true },
    where: {
      id: { in: record.lines.map((line) => line.productVariantId) },
      organizationId: record.organizationId,
    },
  });
  if (variants.length !== record.lines.length) {
    throw new NotFoundError("Product variant was not found.");
  }
  const snapshots = new Map<string, VariantSnapshot>();
  for (const variant of variants) {
    if (variant.status === "ARCHIVED") {
      throw new BusinessRuleError(
        "Archived product variants cannot be ordered.",
      );
    }
    snapshots.set(variant.id, variant);
  }
  return snapshots;
}

async function assertActiveAllocationPolicy(
  transaction: SalesTransaction,
  organizationId: string,
  allocationPolicyId: string,
): Promise<void> {
  const policy = await transaction.inventoryAllocationPolicy.findFirst({
    where: { id: allocationPolicyId, organizationId },
  });
  if (!policy) {
    throw new NotFoundError("Inventory allocation policy was not found.");
  }
  if (policy.status !== "ACTIVE") {
    throw new BusinessRuleError(
      "Only active allocation policies can be assigned to draft sales orders.",
    );
  }
}

function toMetadataUpdateData(
  metadata: AmendDraftSalesOrderRecord["metadata"],
): Prisma.SalesOrderUncheckedUpdateInput {
  if (!metadata) {
    return {};
  }
  const data: Prisma.SalesOrderUncheckedUpdateInput = {};
  copyMetadataField(data, metadata, "customerEmail");
  copyMetadataField(data, metadata, "customerName");
  copyMetadataField(data, metadata, "customerPhone");
  copyMetadataField(data, metadata, "deliveryAddressLine1");
  copyMetadataField(data, metadata, "deliveryAddressLine2");
  copyMetadataField(data, metadata, "deliveryCity");
  copyMetadataField(data, metadata, "deliveryDistrict");
  copyMetadataField(data, metadata, "deliveryPostalCode");
  copyMetadataField(data, metadata, "note");
  return data;
}

function copyMetadataField(
  data: Prisma.SalesOrderUncheckedUpdateInput,
  metadata: AmendDraftSalesOrderRecord["metadata"],
  field: SalesOrderMetadataTextField,
): void {
  if (metadata && field in metadata) {
    data[field] = metadata[field] ?? null;
  }
}

async function getOrderForUpdate(
  transaction: SalesTransaction,
  record: { organizationId: string; salesOrderId: string },
): Promise<OrderWithLines> {
  const order = await transaction.salesOrder.findFirst({
    include: orderInclude,
    where: { id: record.salesOrderId, organizationId: record.organizationId },
  });
  if (!order) {
    throw new NotFoundError("Sales order was not found.");
  }
  return order;
}

async function lockOrderRow(
  transaction: SalesTransaction,
  organizationId: string,
  salesOrderId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT id
    FROM sales_orders
    WHERE id = ${salesOrderId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
}

async function lockReservationRow(
  transaction: SalesTransaction,
  organizationId: string,
  reservationId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT id
    FROM inventory_reservations
    WHERE id = ${reservationId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
}

function assertOrderVersion(
  order: OrderWithLines,
  expectedVersion: number,
): void {
  if (order.version !== expectedVersion) {
    throw new ConcurrencyError();
  }
}

async function assertReservationIdempotencyAvailable(
  transaction: SalesTransaction,
  record: ReserveSalesOrderRecord,
  payloadSignature: string,
): Promise<void> {
  const existing = await transaction.inventoryReservation.findUnique({
    where: {
      organizationId_idempotencyKey: {
        idempotencyKey: record.reservationIdempotencyKey,
        organizationId: record.organizationId,
      },
    },
  });
  if (!existing) {
    return;
  }
  if (existing.payloadSignature === payloadSignature) {
    throw new ConflictError(
      "Reservation idempotency key already belongs to another order state.",
    );
  }
  throw new ConflictError("Reservation idempotency key was already used.");
}

async function assertMovementIdempotencyAvailable(
  transaction: SalesTransaction,
  record: FulfillSalesOrderRecord,
  payloadSignature: string,
): Promise<void> {
  const existing = await transaction.inventoryMovement.findUnique({
    where: {
      organizationId_idempotencyKey: {
        idempotencyKey: record.consumptionIdempotencyKey,
        organizationId: record.organizationId,
      },
    },
  });
  if (!existing) {
    return;
  }
  if (existing.payloadSignature === payloadSignature) {
    throw new ConflictError(
      "Consumption idempotency key already belongs to another order state.",
    );
  }
  throw new ConflictError("Consumption idempotency key was already used.");
}

async function selectReservationCandidate(
  transaction: SalesTransaction,
  order: OrderWithLines,
  record: ReserveSalesOrderRecord,
): Promise<AllocationCandidate> {
  if (!order.allocationPolicyId) {
    throw new BusinessRuleError("Sales order requires an allocation policy.");
  }
  const policy = await transaction.inventoryAllocationPolicy.findFirst({
    include: {
      locations: {
        include: { stockLocation: { include: { branch: true } } },
        orderBy: [{ priority: "asc" }, { stockLocationId: "asc" }],
      },
    },
    where: {
      id: order.allocationPolicyId,
      organizationId: order.organizationId,
    },
  });
  if (!policy) {
    throw new NotFoundError("Inventory allocation policy was not found.");
  }
  if (policy.status !== "ACTIVE") {
    throw new BusinessRuleError(
      "Only active allocation policies can allocate.",
    );
  }

  const candidates = policy.locations.filter((location) => {
    const stockLocation = location.stockLocation;
    return (
      location.isEnabled &&
      stockLocation.status === "ACTIVE" &&
      stockLocation.branch.status === "ACTIVE" &&
      !["QC_HOLD", "DAMAGE_HOLD", "RETURN_HOLD", "TRANSIT"].includes(
        stockLocation.type,
      ) &&
      (!policy.requireSellableLocation || stockLocation.isSellable) &&
      (!record.preferredBranchId ||
        stockLocation.branchId === record.preferredBranchId) &&
      (!record.preferredLocationId ||
        stockLocation.id === record.preferredLocationId)
    );
  });

  for (const candidate of candidates) {
    await lockStockKeys(transaction, {
      lines: order.lines,
      organizationId: order.organizationId,
      stockLocationId: candidate.stockLocationId,
    });
    const canFulfill = await canFulfillAllLines(transaction, {
      lines: order.lines,
      organizationId: order.organizationId,
      stockLocationId: candidate.stockLocationId,
    });
    if (canFulfill) {
      return candidate;
    }
  }
  throw new BusinessRuleError(
    "No eligible location can fulfill all sales order lines.",
  );
}

async function canFulfillAllLines(
  transaction: SalesTransaction,
  input: {
    lines: readonly { productVariantId: string; quantity: number }[];
    organizationId: string;
    stockLocationId: string;
  },
): Promise<boolean> {
  for (const line of input.lines) {
    const available =
      (await getOnHand(transaction, input, line.productVariantId)) -
      (await getActiveReserved(transaction, input, line.productVariantId));
    if (available < line.quantity) {
      return false;
    }
  }
  return true;
}

async function assertSufficientOnHandForReservation(
  transaction: SalesTransaction,
  reservation: {
    lines: readonly { productVariantId: string; quantity: number }[];
    organizationId: string;
    stockLocationId: string;
  },
): Promise<void> {
  for (const line of reservation.lines) {
    const onHand = await getOnHand(
      transaction,
      reservation,
      line.productVariantId,
    );
    if (onHand < line.quantity) {
      throw new BusinessRuleError("Inventory reservation cannot be fulfilled.");
    }
  }
}

async function getOnHand(
  transaction: SalesTransaction,
  input: { organizationId: string; stockLocationId: string },
  productVariantId: string,
): Promise<number> {
  const rows = await transaction.$queryRaw<QuantityRow[]>`
    SELECT COALESCE(SUM(
      CASE
        WHEN movement.destination_location_id = ${input.stockLocationId}::uuid THEN line.quantity
        WHEN movement.source_location_id = ${input.stockLocationId}::uuid THEN -line.quantity
        ELSE 0
      END
    ), 0) AS quantity
    FROM inventory_movement_lines line
    INNER JOIN inventory_movements movement
      ON movement.id = line.movement_id
      AND movement.organization_id = line.organization_id
    WHERE line.organization_id = ${input.organizationId}::uuid
      AND line.product_variant_id = ${productVariantId}::uuid
      AND movement.status = 'POSTED'
      AND (
        movement.destination_location_id = ${input.stockLocationId}::uuid
        OR movement.source_location_id = ${input.stockLocationId}::uuid
      )
  `;
  return toNumber(rows.at(0)?.quantity ?? 0);
}

async function getActiveReserved(
  transaction: SalesTransaction,
  input: { organizationId: string; stockLocationId: string },
  productVariantId: string,
): Promise<number> {
  const rows = await transaction.$queryRaw<QuantityRow[]>`
    SELECT COALESCE(SUM(line.quantity), 0) AS quantity
    FROM inventory_reservation_lines line
    INNER JOIN inventory_reservations reservation
      ON reservation.id = line.reservation_id
      AND reservation.organization_id = line.organization_id
    WHERE line.organization_id = ${input.organizationId}::uuid
      AND line.product_variant_id = ${productVariantId}::uuid
      AND reservation.stock_location_id = ${input.stockLocationId}::uuid
      AND reservation.status = 'ACTIVE'
  `;
  return toNumber(rows.at(0)?.quantity ?? 0);
}

async function lockStockKeys(
  transaction: SalesTransaction,
  input: {
    lines: readonly { productVariantId: string }[];
    organizationId: string;
    stockLocationId: string;
  },
): Promise<void> {
  const keys = [...new Set(input.lines.map((line) => line.productVariantId))]
    .map(
      (productVariantId) =>
        `${input.organizationId}:${input.stockLocationId}:${productVariantId}`,
    )
    .sort();
  for (const key of keys) {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
    `;
  }
}

async function getReservationPayloadSignature(
  transaction: SalesTransaction,
  organizationId: string,
  reservationId: string,
): Promise<string | null> {
  const rows = await transaction.$queryRaw<PayloadSignatureRow[]>`
    SELECT payload_signature
    FROM inventory_reservations
    WHERE id = ${reservationId}::uuid
      AND organization_id = ${organizationId}::uuid
    LIMIT 1
  `;
  return rows.at(0)?.payload_signature ?? null;
}

async function getMovementPayloadSignature(
  transaction: SalesTransaction,
  organizationId: string,
  movementId: string,
): Promise<string | null> {
  const rows = await transaction.$queryRaw<PayloadSignatureRow[]>`
    SELECT payload_signature
    FROM inventory_movements
    WHERE id = ${movementId}::uuid
      AND organization_id = ${organizationId}::uuid
    LIMIT 1
  `;
  return rows.at(0)?.payload_signature ?? null;
}

function toOrderCursorPage(
  records: SalesOrder[],
  pageSize: number,
): CursorPageResult<SalesOrder> {
  const items = records.slice(0, pageSize);
  const hasMore = records.length > pageSize;
  const lastItem = items.at(-1);
  return {
    hasMore,
    items,
    nextCursor:
      hasMore && lastItem
        ? encodeSalesOrderCursor(lastItem.createdAt, lastItem.id)
        : null,
  };
}

function mapOrder(record: OrderWithLines): SalesOrder {
  return {
    allocationPolicyId: record.allocationPolicyId,
    boothId: record.boothId,
    cancelledAt: record.cancelledAt,
    channel: record.channel,
    confirmedAt: record.confirmedAt,
    createdAt: record.createdAt,
    currencyCode: record.currencyCode,
    customerEmail: record.customerEmail,
    customerName: record.customerName,
    customerPhone: record.customerPhone,
    deliveryAddressLine1: record.deliveryAddressLine1,
    deliveryAddressLine2: record.deliveryAddressLine2,
    deliveryCity: record.deliveryCity,
    deliveryDistrict: record.deliveryDistrict,
    deliveryMinor: record.deliveryMinor,
    deliveryPostalCode: record.deliveryPostalCode,
    discountMinor: record.discountMinor,
    fulfilledAt: record.fulfilledAt,
    fulfillmentMovementId: record.fulfillmentMovementId,
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    inventoryReservationId: record.inventoryReservationId,
    lines: record.lines.map((line) => ({
      colorSnapshot: line.colorSnapshot,
      createdAt: line.createdAt,
      discountMinor: line.discountMinor,
      id: line.id,
      lineNumber: line.lineNumber,
      lineTotalMinor: line.lineTotalMinor,
      organizationId: line.organizationId,
      productNameSnapshot: line.productNameSnapshot,
      productVariantId: line.productVariantId,
      quantity: line.quantity,
      salesOrderId: line.salesOrderId,
      sizeSnapshot: line.sizeSnapshot,
      skuSnapshot: line.skuSnapshot,
      unitPriceMinor: line.unitPriceMinor,
    })),
    note: record.note,
    orderNumber: record.orderNumber,
    organizationId: record.organizationId,
    payloadSignature: record.payloadSignature,
    reservedAt: record.reservedAt,
    status: record.status,
    subtotalMinor: record.subtotalMinor,
    totalMinor: record.totalMinor,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

function toNumber(value: bigint | number): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function mapSalesOrderIntegrityError(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new ConflictError("Sales order uniqueness was violated.", error);
  }
  if (isForeignKeyConstraintError(error)) {
    throw new BusinessRuleError(
      "Sales order reference integrity was violated.",
      error,
    );
  }
  if (isCheckConstraintError(error)) {
    throw new BusinessRuleError(
      "Sales order database rule was violated.",
      error,
    );
  }
  throw error;
}

function isUniqueConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2002");
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2003");
}

function isCheckConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2004");
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as KnownPrismaError).code === code
  );
}
