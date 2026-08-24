import {
  ConflictError,
  NotFoundError,
  type CommerceRepository,
  type CustomerProfile,
  type CustomerSummary,
  type PurchaseOrderSummary,
  type VendorPaymentRecord,
  type VendorSummary,
} from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

type Client = Pick<
  PrismaClient,
  | "$executeRaw"
  | "customer"
  | "inventoryMovement"
  | "productVariant"
  | "purchaseOrder"
  | "stockLocation"
  | "vendor"
  | "vendorPayment"
>;
type Failure = { code?: string };
const purchaseInclude = {
  destinationLocation: { select: { name: true } },
  lines: {
    include: { productVariant: { include: { product: true } } },
    orderBy: { lineNumber: "asc" as const },
  },
  vendor: true,
} as const;

export class PrismaCommerceRepository implements CommerceRepository {
  constructor(private readonly prisma: Client) {}

  async createCustomer(
    input: Parameters<CommerceRepository["createCustomer"]>[0],
  ) {
    try {
      return customer(await this.prisma.customer.create({ data: input }), []);
    } catch (error) {
      throw conflict(error, "A customer with this phone already exists.");
    }
  }

  async createVendor(input: Parameters<CommerceRepository["createVendor"]>[0]) {
    try {
      return vendor(await this.prisma.vendor.create({ data: input }), [], []);
    } catch (error) {
      throw conflict(error, "A vendor with this name already exists.");
    }
  }

  async findCustomer(organizationId: string, customerId: string) {
    const record = await this.prisma.customer.findFirst({
      include: {
        salesOrders: {
          include: {
            paymentBatch: true,
            paymentCollections: true,
            paymentRefunds: true,
            posSaleReturns: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 100,
        },
      },
      where: { id: customerId, organizationId },
    });
    if (!record) return null;
    return {
      ...customer(record, record.salesOrders),
      orders: record.salesOrders.map((order) => {
        const value = settlement(order);
        return {
          createdAt: order.createdAt,
          id: order.id,
          orderNumber: order.orderNumber,
          paidMinor: value.paidMinor,
          status: order.status,
          totalMinor: value.payableMinor,
        };
      }),
    } satisfies CustomerProfile;
  }

  async listCustomers(organizationId: string) {
    const records = await this.prisma.customer.findMany({
      include: {
        salesOrders: {
          include: {
            paymentBatch: true,
            paymentCollections: true,
            paymentRefunds: true,
            posSaleReturns: true,
          },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 500,
      where: { organizationId },
    });
    return records.map((record) => customer(record, record.salesOrders));
  }

  async listPurchases(organizationId: string) {
    return (
      await this.prisma.purchaseOrder.findMany({
        include: purchaseInclude,
        orderBy: [{ orderedAt: "desc" }, { id: "desc" }],
        take: 500,
        where: { organizationId },
      })
    ).map(purchase);
  }

  async listVendors(organizationId: string) {
    return (
      await this.prisma.vendor.findMany({
        include: { payments: true, purchaseOrders: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: 500,
        where: { organizationId },
      })
    ).map((record) => vendor(record, record.purchaseOrders, record.payments));
  }

  async receivePurchase(
    input: Parameters<CommerceRepository["receivePurchase"]>[0],
  ) {
    const payloadSignature = JSON.stringify({
      destinationLocationId: input.destinationLocationId,
      lines: input.lines,
      note: input.note,
      paidMinor: input.paidMinor,
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
      vendorId: input.vendorId,
    });
    await this.prisma
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:${input.idempotencyKey}:purchase`}, 0))`;
    const existing = await this.prisma.purchaseOrder.findUnique({
      include: purchaseInclude,
      where: {
        organizationId_idempotencyKey: {
          idempotencyKey: input.idempotencyKey,
          organizationId: input.organizationId,
        },
      },
    });
    if (existing) {
      if (existing.payloadSignature !== payloadSignature)
        throw new ConflictError(
          "This request was already used with different purchase details.",
        );
      return { purchase: purchase(existing), replayed: true };
    }
    const [vendorRecord, location, variantCount] = await Promise.all([
      this.prisma.vendor.findFirst({
        where: {
          id: input.vendorId,
          organizationId: input.organizationId,
          status: "ACTIVE",
        },
      }),
      this.prisma.stockLocation.findFirst({
        where: {
          id: input.destinationLocationId,
          organizationId: input.organizationId,
          status: "ACTIVE",
        },
      }),
      this.prisma.productVariant.count({
        where: {
          id: { in: input.lines.map((line) => line.productVariantId) },
          organizationId: input.organizationId,
        },
      }),
    ]);
    if (!vendorRecord) throw new NotFoundError("Active vendor was not found.");
    if (!location)
      throw new NotFoundError("Active stock location was not found.");
    if (variantCount !== input.lines.length)
      throw new NotFoundError("One or more product variants were not found.");
    await this.prisma.inventoryMovement.create({
      data: {
        destinationLocationId: input.destinationLocationId,
        id: input.movementId,
        idempotencyKey: `purchase:${input.idempotencyKey}`,
        lines: {
          create: input.lines.map((line, index) => ({
            lineNumber: index + 1,
            organizationId: input.organizationId,
            productVariantId: line.productVariantId,
            quantity: line.quantity,
          })),
        },
        movementNumber: input.movementNumber,
        note: input.note,
        occurredAt: input.receivedAt,
        organizationId: input.organizationId,
        payloadSignature,
        postedAt: input.receivedAt,
        referenceId: input.id,
        referenceType: "PURCHASE_ORDER",
        status: "POSTED",
        type: "RECEIPT",
      },
    });
    await Promise.all(
      input.lines.map((line) =>
        this.prisma.productVariant.updateMany({
          data: { costPriceMinor: line.unitCostMinor },
          where: {
            id: line.productVariantId,
            organizationId: input.organizationId,
          },
        }),
      ),
    );
    const totalMinor = input.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitCostMinor,
      0,
    );
    const record = await this.prisma.purchaseOrder.create({
      data: {
        destinationLocationId: input.destinationLocationId,
        id: input.id,
        idempotencyKey: input.idempotencyKey,
        inventoryMovementId: input.movementId,
        lines: {
          create: input.lines.map((line, index) => ({
            id: crypto.randomUUID(),
            lineNumber: index + 1,
            lineTotalMinor: line.quantity * line.unitCostMinor,
            organizationId: input.organizationId,
            productVariantId: line.productVariantId,
            quantity: line.quantity,
            unitCostMinor: line.unitCostMinor,
          })),
        },
        note: input.note,
        orderedAt: input.orderedAt,
        organizationId: input.organizationId,
        paidMinor: input.paidMinor,
        payloadSignature,
        purchaseNumber: input.purchaseNumber,
        receivedAt: input.receivedAt,
        status: "RECEIVED",
        totalMinor,
        vendorId: input.vendorId,
      },
      include: purchaseInclude,
    });
    if (input.paidMinor && input.paymentId && input.paymentMethod)
      await this.prisma.vendorPayment.create({
        data: {
          amountMinor: input.paidMinor,
          id: input.paymentId,
          idempotencyKey: `${input.idempotencyKey}:payment`,
          method: input.paymentMethod,
          organizationId: input.organizationId,
          paidAt: input.receivedAt,
          purchaseOrderId: input.id,
          reference: input.paymentReference,
          vendorId: input.vendorId,
        },
      });
    return { purchase: purchase(record), replayed: false };
  }

  async recordVendorPayment(
    input: Parameters<CommerceRepository["recordVendorPayment"]>[0],
  ) {
    const existing = await this.prisma.vendorPayment.findUnique({
      where: {
        organizationId_idempotencyKey: {
          idempotencyKey: input.idempotencyKey,
          organizationId: input.organizationId,
        },
      },
    });
    if (existing) return { payment: payment(existing), replayed: true };
    const vendorRecord = await this.prisma.vendor.findFirst({
      where: {
        id: input.vendorId,
        organizationId: input.organizationId,
        status: "ACTIVE",
      },
    });
    if (!vendorRecord) throw new NotFoundError("Active vendor was not found.");
    return {
      payment: payment(await this.prisma.vendorPayment.create({ data: input })),
      replayed: false,
    };
  }

  async updateCustomer(
    input: Parameters<CommerceRepository["updateCustomer"]>[0],
  ) {
    const { expectedVersion, id, organizationId, ...data } = input;
    try {
      const result = await this.prisma.customer.updateMany({
        data: { ...data, version: { increment: 1 } },
        where: { id, organizationId, version: expectedVersion },
      });
      if (!result.count) return null;
      const record = await this.prisma.customer.findFirst({
        where: { id, organizationId },
      });
      return record ? customer(record, []) : null;
    } catch (error) {
      throw conflict(error, "A customer with this phone already exists.");
    }
  }

  async updateVendor(input: Parameters<CommerceRepository["updateVendor"]>[0]) {
    const { expectedVersion, id, organizationId, ...data } = input;
    try {
      const result = await this.prisma.vendor.updateMany({
        data: { ...data, version: { increment: 1 } },
        where: { id, organizationId, version: expectedVersion },
      });
      if (!result.count) return null;
      const record = await this.prisma.vendor.findFirst({
        where: { id, organizationId },
      });
      return record ? vendor(record, [], []) : null;
    } catch (error) {
      throw conflict(error, "A vendor with this name already exists.");
    }
  }
}

function settlement(order: {
  paymentBatch: { paidMinor: number } | null;
  paymentCollections: readonly { amountMinor: number }[];
  paymentRefunds: readonly { amountMinor: number }[];
  posSaleReturns: readonly { totalCreditMinor: number }[];
  totalMinor: number;
}) {
  const payableMinor =
    order.totalMinor -
    order.posSaleReturns.reduce((sum, item) => sum + item.totalCreditMinor, 0);
  const paidMinor = Math.max(
    0,
    (order.paymentBatch?.paidMinor ?? 0) +
      order.paymentCollections.reduce(
        (sum, item) => sum + item.amountMinor,
        0,
      ) -
      order.paymentRefunds.reduce((sum, item) => sum + item.amountMinor, 0),
  );
  return {
    dueMinor: Math.max(0, payableMinor - paidMinor),
    paidMinor,
    payableMinor,
  };
}

function customer(
  record: {
    address: string | null;
    email: string | null;
    id: string;
    name: string;
    phone: string;
    status: "ACTIVE" | "INACTIVE";
    updatedAt: Date;
    version: number;
  },
  orders: readonly Parameters<typeof settlement>[0][],
): CustomerSummary {
  const totals = orders.reduce(
    (sum, order) => {
      const value = settlement(order);
      return {
        dueMinor: sum.dueMinor + value.dueMinor,
        totalPurchaseMinor: sum.totalPurchaseMinor + value.payableMinor,
      };
    },
    { dueMinor: 0, totalPurchaseMinor: 0 },
  );
  return { ...record, ...totals };
}

function vendor(
  record: {
    address: string | null;
    id: string;
    location: string | null;
    name: string;
    phone: string | null;
    status: "ACTIVE" | "INACTIVE";
    updatedAt: Date;
    version: number;
  },
  purchases: readonly { status: string; totalMinor: number }[],
  payments: readonly { amountMinor: number }[],
): VendorSummary {
  const purchaseMinor = purchases
    .filter((item) => item.status === "RECEIVED")
    .reduce((sum, item) => sum + item.totalMinor, 0);
  const paidMinor = payments.reduce((sum, item) => sum + item.amountMinor, 0);
  return {
    ...record,
    dueMinor: Math.max(0, purchaseMinor - paidMinor),
    paidMinor,
    purchaseMinor,
  };
}

function purchase(record: {
  destinationLocation: { name: string };
  destinationLocationId: string;
  id: string;
  inventoryMovementId: string | null;
  lines: readonly {
    lineTotalMinor: number;
    productVariant: { product: { name: string }; sku: string };
    productVariantId: string;
    quantity: number;
    unitCostMinor: number;
  }[];
  orderedAt: Date;
  paidMinor: number;
  purchaseNumber: string;
  receivedAt: Date | null;
  status: "DRAFT" | "RECEIVED" | "CANCELLED";
  totalMinor: number;
  vendor: { name: string };
  vendorId: string;
  version: number;
}): PurchaseOrderSummary {
  return {
    destinationLocationId: record.destinationLocationId,
    destinationLocationName: record.destinationLocation.name,
    dueMinor: Math.max(0, record.totalMinor - record.paidMinor),
    id: record.id,
    inventoryMovementId: record.inventoryMovementId,
    lines: record.lines.map((line) => ({
      lineTotalMinor: line.lineTotalMinor,
      productName: line.productVariant.product.name,
      productVariantId: line.productVariantId,
      quantity: line.quantity,
      sku: line.productVariant.sku,
      unitCostMinor: line.unitCostMinor,
    })),
    orderedAt: record.orderedAt,
    paidMinor: record.paidMinor,
    purchaseNumber: record.purchaseNumber,
    receivedAt: record.receivedAt,
    status: record.status,
    totalMinor: record.totalMinor,
    vendorId: record.vendorId,
    vendorName: record.vendor.name,
    version: record.version,
  };
}

function payment(
  record: Omit<VendorPaymentRecord, "method"> & {
    method: VendorPaymentRecord["method"] | "ONLINE_GATEWAY";
  },
): VendorPaymentRecord {
  if (record.method === "ONLINE_GATEWAY")
    throw new Error("Online gateway is not a supported vendor payment method.");
  return { ...record, method: record.method };
}

function conflict(error: unknown, message: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as Failure).code === "P2002"
  )
    return new ConflictError(message, error);
  return error instanceof Error ? error : new Error("Commerce write failed.");
}
