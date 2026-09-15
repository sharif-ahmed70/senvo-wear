import {
  ValidationApplicationError,
  type SalesOrderDateOrder,
  type SalesOrderDetailsReadItem,
  type SalesOrderListReadItem,
  type SalesOrderReadPage,
  type SalesOrderReadRepository,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type SalesReadPrismaClient = Pick<PrismaClient, "salesOrder">;
type DetailsRecord = Prisma.SalesOrderGetPayload<{
  include: {
    fulfillmentMovement: true;
    commerceProfile: true;
    inventoryReservation: { include: { stockLocation: true } };
    lines: true;
  };
}>;
type SalesCursor = {
  createdAt: string;
  id: string;
  order: SalesOrderDateOrder;
};
type ListRecord = {
  channel: SalesOrderListReadItem["channel"];
  commerceProfile: {
    paymentPreference: "CASH_ON_DELIVERY" | "ONLINE_PAYMENT";
    source: "STOREFRONT";
  } | null;
  createdAt: Date;
  currencyCode: string;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryCity: string | null;
  deliveryDistrict: string | null;
  id: string;
  orderNumber: string;
  status: SalesOrderListReadItem["status"];
  totalMinor: number;
};

export class PrismaSalesOrderReadRepository implements SalesOrderReadRepository {
  constructor(private readonly prisma: SalesReadPrismaClient) {}

  async list(
    input: Parameters<SalesOrderReadRepository["list"]>[0],
  ): Promise<SalesOrderReadPage> {
    const cursor = input.cursor ? parseCursor(input.cursor, input.order) : null;
    const direction = input.order === "NEWEST" ? "desc" : "asc";
    const comparison = input.order === "NEWEST" ? "lt" : "gt";
    const records = await this.prisma.salesOrder.findMany({
      orderBy: [{ createdAt: direction }, { id: direction }],
      select: {
        channel: true,
        commerceProfile: { select: { paymentPreference: true, source: true } },
        createdAt: true,
        currencyCode: true,
        customerEmail: true,
        customerName: true,
        customerPhone: true,
        deliveryCity: true,
        deliveryDistrict: true,
        id: true,
        orderNumber: true,
        status: true,
        totalMinor: true,
      },
      take: input.pageSize + 1,
      where: {
        organizationId: input.organizationId,
        ...(input.channel ? { channel: input.channel } : {}),
        ...(input.search
          ? {
              orderNumber: {
                contains: input.search,
                mode: "insensitive" as const,
              },
            }
          : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { [comparison]: cursor.createdAt } },
                {
                  createdAt: cursor.createdAt,
                  id: { [comparison]: cursor.id },
                },
              ],
            }
          : {}),
      },
    });
    const pageRecords = records.slice(0, input.pageSize);
    const hasMore = records.length > input.pageSize;
    const last = pageRecords.at(-1);
    return {
      hasMore,
      items: pageRecords.map(mapListItem),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
              order: input.order,
            })
          : null,
    };
  }

  async getDetails(input: {
    organizationId: string;
    salesOrderId: string;
  }): Promise<SalesOrderDetailsReadItem | null> {
    const record = await this.prisma.salesOrder.findFirst({
      include: {
        commerceProfile: true,
        fulfillmentMovement: true,
        inventoryReservation: { include: { stockLocation: true } },
        lines: { orderBy: { lineNumber: "asc" } },
      },
      where: { id: input.salesOrderId, organizationId: input.organizationId },
    });
    return record ? mapDetails(record) : null;
  }
}

function mapListItem(record: ListRecord): SalesOrderListReadItem {
  return {
    channel: record.channel,
    commerce: record.commerceProfile,
    createdAt: record.createdAt,
    currencyCode: record.currencyCode,
    customer: {
      email: record.customerEmail,
      name: record.customerName,
      phone: record.customerPhone,
    },
    delivery: {
      city: record.deliveryCity,
      district: record.deliveryDistrict,
    },
    id: record.id,
    orderNumber: record.orderNumber,
    status: record.status,
    totalMinor: record.totalMinor,
  };
}

function mapDetails(record: DetailsRecord): SalesOrderDetailsReadItem {
  const reservation = record.inventoryReservation;
  const movement = record.fulfillmentMovement;
  return {
    boothId: record.boothId,
    channel: record.channel,
    commerce: record.commerceProfile
      ? {
          paymentPreference: record.commerceProfile.paymentPreference,
          source: record.commerceProfile.source,
        }
      : null,
    currencyCode: record.currencyCode,
    customer: {
      email: record.customerEmail,
      name: record.customerName,
      phone: record.customerPhone,
    },
    delivery: {
      addressLine1: record.deliveryAddressLine1,
      addressLine2: record.deliveryAddressLine2,
      city: record.deliveryCity,
      district: record.deliveryDistrict,
      postalCode: record.deliveryPostalCode,
    },
    id: record.id,
    inventory: {
      fulfillment: {
        movement: movement
          ? {
              id: movement.id,
              movementNumber: movement.movementNumber,
              occurredAt: movement.occurredAt,
              postedAt: movement.postedAt,
              status: movement.status,
              type: movement.type,
            }
          : null,
        status: movement ? "FULFILLED" : "PENDING",
      },
      reservation: reservation
        ? {
            id: reservation.id,
            reservationNumber: reservation.reservationNumber,
            status: reservation.status,
            stockLocation: {
              id: reservation.stockLocation.id,
              name: reservation.stockLocation.name,
            },
          }
        : null,
    },
    lines: record.lines.map((line) => ({
      color: line.colorSnapshot,
      id: line.id,
      lineNumber: line.lineNumber,
      lineTotalMinor: line.lineTotalMinor,
      productName: line.productNameSnapshot,
      quantity: line.quantity,
      size: line.sizeSnapshot,
      sku: line.skuSnapshot,
      unitPriceMinor: line.unitPriceMinor,
    })),
    orderNumber: record.orderNumber,
    status: record.status,
    timestamps: {
      cancelledAt: record.cancelledAt,
      confirmedAt: record.confirmedAt,
      createdAt: record.createdAt,
      fulfilledAt: record.fulfilledAt,
      reservedAt: record.reservedAt,
      updatedAt: record.updatedAt,
    },
    totals: {
      deliveryMinor: record.deliveryMinor,
      discountMinor: record.discountMinor,
      subtotalMinor: record.subtotalMinor,
      totalMinor: record.totalMinor,
    },
    version: record.version,
  };
}

function encodeCursor(cursor: SalesCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function parseCursor(value: string, order: SalesOrderDateOrder) {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as SalesCursor;
    const createdAt = new Date(parsed.createdAt);
    if (
      parsed.order !== order ||
      !parsed.id ||
      Number.isNaN(createdAt.getTime())
    ) {
      throw new Error("Invalid cursor");
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new ValidationApplicationError("cursor is invalid.");
  }
}
