import {
  ConflictError,
  type PosCart,
  type PosCartLine,
  type PosRepository,
  type SalesCounter,
  type SalesSession,
  type SellableVariant,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type SessionRecord = Prisma.SalesSessionGetPayload<{ include: { cart: true } }>;
type CartRecord = Prisma.PosCartGetPayload<{
  include: { lines: true; salesSession: { select: { status: true } } };
}>;

export class PrismaPosRepository implements PosRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createCounter(record: Parameters<PosRepository["createCounter"]>[0]) {
    try {
      return mapCounter(
        await this.prisma.salesCounter.create({ data: record }),
      );
    } catch (error) {
      throw mapConflict(error, "Sales counter already exists.");
    }
  }

  async findCounterByCode(organizationId: string, code: string) {
    const record = await this.prisma.salesCounter.findUnique({
      where: { organizationId_code: { code, organizationId } },
    });
    return record ? mapCounter(record) : null;
  }

  async findCounterById(id: string, organizationId: string) {
    const record = await this.prisma.salesCounter.findFirst({
      where: { id, organizationId },
    });
    return record ? mapCounter(record) : null;
  }

  async listCounters(organizationId: string) {
    return (
      await this.prisma.salesCounter.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        where: { organizationId },
      })
    ).map(mapCounter);
  }

  async changeCounterStatus(
    record: Parameters<PosRepository["changeCounterStatus"]>[0],
  ) {
    const result = await this.prisma.salesCounter.updateMany({
      data: { status: record.status, version: { increment: 1 } },
      where: {
        id: record.id,
        organizationId: record.organizationId,
        version: record.expectedVersion,
      },
    });
    return result.count === 0
      ? null
      : this.findCounterById(record.id, record.organizationId);
  }

  async findOpenSessionByCounter(counterId: string, organizationId: string) {
    const record = await this.prisma.salesSession.findFirst({
      include: { cart: true },
      where: { counterId, organizationId, status: "OPEN" },
    });
    return record ? mapSession(record) : null;
  }

  async openSession(record: Parameters<PosRepository["openSession"]>[0]) {
    try {
      const session = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.salesSession.create({ data: record });
        await transaction.posCart.create({
          data: {
            organizationId: record.organizationId,
            salesSessionId: created.id,
          },
        });
        return transaction.salesSession.findUniqueOrThrow({
          include: { cart: true },
          where: { id: created.id },
        });
      });
      return mapSession(session);
    } catch (error) {
      throw mapConflict(
        error,
        "This counter already has an open sales session.",
      );
    }
  }

  async listSessions(organizationId: string) {
    return (
      await this.prisma.salesSession.findMany({
        include: { cart: true },
        orderBy: [{ openedAt: "desc" }, { id: "desc" }],
        where: { organizationId },
      })
    ).map(mapSession);
  }

  async closeSession(record: Parameters<PosRepository["closeSession"]>[0]) {
    const result = await this.prisma.salesSession.updateMany({
      data: {
        closedAt: record.closedAt,
        status: "CLOSED",
        version: { increment: 1 },
      },
      where: {
        id: record.id,
        organizationId: record.organizationId,
        status: "OPEN",
        version: record.expectedVersion,
      },
    });
    if (result.count === 0) return null;
    const session = await this.prisma.salesSession.findFirst({
      include: { cart: true },
      where: { id: record.id, organizationId: record.organizationId },
    });
    return session ? mapSession(session) : null;
  }

  async findCartById(id: string, organizationId: string) {
    const record = await this.prisma.posCart.findFirst({
      include: { lines: true, salesSession: { select: { status: true } } },
      where: { id, organizationId },
    });
    return record ? mapCart(record) : null;
  }

  async findSellableVariant(
    id: string,
    organizationId: string,
  ): Promise<SellableVariant | null> {
    const record = await this.prisma.productVariant.findFirst({
      select: {
        id: true,
        organizationId: true,
        sellingPriceMinor: true,
        status: true,
      },
      where: { id, organizationId },
    });
    return record;
  }

  async addCartLine(record: Parameters<PosRepository["addCartLine"]>[0]) {
    try {
      return mapLine(await this.prisma.posCartLine.create({ data: record }));
    } catch (error) {
      throw mapConflict(error, "This item is already in the cart.");
    }
  }

  async findCartLineById(id: string, cartId: string, organizationId: string) {
    const record = await this.prisma.posCartLine.findFirst({
      where: { cartId, id, organizationId },
    });
    return record ? mapLine(record) : null;
  }

  async updateCartLine(record: Parameters<PosRepository["updateCartLine"]>[0]) {
    const result = await this.prisma.posCartLine.updateMany({
      data: {
        lineSubtotalMinor: record.lineSubtotalMinor,
        quantity: record.quantity,
      },
      where: {
        cartId: record.cartId,
        id: record.id,
        organizationId: record.organizationId,
      },
    });
    if (result.count === 0) return null;
    const line = await this.prisma.posCartLine.findFirst({
      where: {
        cartId: record.cartId,
        id: record.id,
        organizationId: record.organizationId,
      },
    });
    return line ? mapLine(line) : null;
  }

  async removeCartLine(id: string, cartId: string, organizationId: string) {
    return (
      (
        await this.prisma.posCartLine.deleteMany({
          where: { cartId, id, organizationId },
        })
      ).count > 0
    );
  }
}

function mapCounter(record: SalesCounter): SalesCounter {
  return record;
}
function mapLine(record: PosCartLine): PosCartLine {
  return record;
}
function mapSession(record: SessionRecord): SalesSession {
  if (!record.cart) throw new Error("Sales session cart is missing.");
  return {
    cartId: record.cart.id,
    closedAt: record.closedAt,
    counterId: record.counterId,
    createdAt: record.createdAt,
    id: record.id,
    openedAt: record.openedAt,
    openedByUserId: record.openedByUserId,
    organizationId: record.organizationId,
    status: record.status,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}
function mapCart(record: CartRecord): PosCart {
  return {
    createdAt: record.createdAt,
    id: record.id,
    lines: record.lines.map(mapLine),
    organizationId: record.organizationId,
    salesSessionId: record.salesSessionId,
    sessionStatus: record.salesSession.status,
    updatedAt: record.updatedAt,
  };
}
function mapConflict(error: unknown, message: string): unknown {
  return typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
    ? new ConflictError(message, error)
    : error;
}
