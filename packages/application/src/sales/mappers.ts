import type {
  SalesOrder,
  SalesOrderLine,
  SalesCursorPageResult,
} from "@senvo/domain";
import type {
  SalesOrderServiceContract,
  SalesOrderServicePageContract,
} from "@senvo/contracts";

export function mapSalesOrder(order: SalesOrder): SalesOrderServiceContract {
  return {
    allocationPolicyId: order.allocationPolicyId,
    boothId: order.boothId,
    cancelledAt: serializeNullableDate(order.cancelledAt),
    channel: order.channel,
    confirmedAt: serializeNullableDate(order.confirmedAt),
    createdAt: order.createdAt.toISOString(),
    currencyCode: "BDT",
    customerId: order.customerId ?? null,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddressLine1: order.deliveryAddressLine1,
    deliveryAddressLine2: order.deliveryAddressLine2,
    deliveryCity: order.deliveryCity,
    deliveryDistrict: order.deliveryDistrict,
    deliveryMinor: order.deliveryMinor,
    deliveryPostalCode: order.deliveryPostalCode,
    discountMinor: order.discountMinor,
    fulfilledAt: serializeNullableDate(order.fulfilledAt),
    fulfillmentMovementId: order.fulfillmentMovementId,
    id: order.id,
    inventoryReservationId: order.inventoryReservationId,
    lines: order.lines.map(mapSalesOrderLine),
    note: order.note,
    orderNumber: order.orderNumber,
    organizationId: order.organizationId,
    reservedAt: serializeNullableDate(order.reservedAt),
    status: order.status,
    subtotalMinor: order.subtotalMinor,
    totalMinor: order.totalMinor,
    updatedAt: order.updatedAt.toISOString(),
    version: order.version,
  };
}

export function mapSalesOrderPage(
  page: SalesCursorPageResult<SalesOrder>,
): SalesOrderServicePageContract {
  return {
    hasMore: page.hasMore,
    items: page.items.map(mapSalesOrder),
    nextCursor: page.nextCursor,
  };
}

function mapSalesOrderLine(
  line: SalesOrderLine,
): SalesOrderServiceContract["lines"][number] {
  return {
    colorSnapshot: line.colorSnapshot,
    createdAt: line.createdAt.toISOString(),
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
  };
}

function serializeNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
