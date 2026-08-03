import type {
  SalesOrderDetailsReadItem,
  SalesOrderReadPage,
} from "@senvo/domain";
import type {
  SalesOrderDetailsReadContract,
  SalesOrderListReadPageContract,
} from "@senvo/contracts";

export function mapSalesOrderReadPage(
  page: SalesOrderReadPage,
): SalesOrderListReadPageContract {
  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      currencyCode: "BDT",
    })),
  };
}

export function mapSalesOrderDetailsRead(
  order: SalesOrderDetailsReadItem,
): SalesOrderDetailsReadContract {
  return {
    ...order,
    currencyCode: "BDT",
    inventory: {
      ...order.inventory,
      fulfillment: {
        ...order.inventory.fulfillment,
        movement: order.inventory.fulfillment.movement
          ? {
              ...order.inventory.fulfillment.movement,
              occurredAt:
                order.inventory.fulfillment.movement.occurredAt.toISOString(),
              postedAt:
                order.inventory.fulfillment.movement.postedAt?.toISOString() ??
                null,
            }
          : null,
      },
    },
    timestamps: {
      cancelledAt: order.timestamps.cancelledAt?.toISOString() ?? null,
      confirmedAt: order.timestamps.confirmedAt?.toISOString() ?? null,
      createdAt: order.timestamps.createdAt.toISOString(),
      fulfilledAt: order.timestamps.fulfilledAt?.toISOString() ?? null,
      reservedAt: order.timestamps.reservedAt?.toISOString() ?? null,
      updatedAt: order.timestamps.updatedAt.toISOString(),
    },
  };
}
