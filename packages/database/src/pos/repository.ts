import {
  ConflictError,
  BusinessRuleError,
  NotFoundError,
  type PosCart,
  type PosCartLine,
  type PosCartDetails,
  type PosRepository,
  type SalesCounter,
  type SalesSession,
  type SellableVariant,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

import { assertEmptyActiveCart, bumpCart, lockSession } from "./cart-lock.js";

const sessionInclude = {
  carts: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
  openedBy: { select: { name: true, email: true } },
} satisfies Prisma.SalesSessionInclude;

type SessionRecord = Prisma.SalesSessionGetPayload<{
  include: typeof sessionInclude;
}>;
type CartRecord = Prisma.PosCartGetPayload<{
  include: {
    checkout: { select: { id: true } };
    lines: true;
    salesSession: { select: { status: true } };
  };
}>;
type CartDetailsRecord = Prisma.PosCartGetPayload<{
  include: {
    checkout: { select: { id: true } };
    lines: {
      include: {
        productVariant: {
          include: { color: true; product: true; size: true };
        };
      };
    };
    salesSession: { select: { status: true } };
  };
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
      include: sessionInclude,
      where: { counterId, organizationId, status: "OPEN" },
    });
    return record ? mapSession(record) : null;
  }

  async listOpenSessionsByUser(organizationId: string, _userId: string) {
    void _userId;
    return (
      await this.prisma.salesSession.findMany({
        include: sessionInclude,
        orderBy: [{ openedAt: "desc" }, { id: "desc" }],
        where: { organizationId, status: "OPEN" },
      })
    ).map(mapSession);
  }

  async openSession(record: Parameters<PosRepository["openSession"]>[0]) {
    try {
      const session = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.salesSession.create({
          data: {
            ...record,
            openingFloatMinor: record.openingFloatMinor ?? 0,
          },
        });
        await transaction.posCart.create({
          data: {
            organizationId: record.organizationId,
            salesSessionId: created.id,
          },
        });
        return transaction.salesSession.findUniqueOrThrow({
          include: sessionInclude,
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
        include: sessionInclude,
        orderBy: [{ openedAt: "desc" }, { id: "desc" }],
        where: { organizationId },
      })
    ).map(mapSession);
  }

  async startNextCart(sessionId: string, organizationId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockSession(tx, sessionId, organizationId);
      const session = await tx.salesSession.findFirst({
        where: { id: sessionId, organizationId },
      });
      if (!session) throw new NotFoundError("Sales session was not found.");
      if (session.status !== "OPEN")
        throw new BusinessRuleError("The sales session is closed.");
      const active = await tx.posCart.findFirst({
        where: { salesSessionId: sessionId, organizationId, status: "ACTIVE" },
      });
      if (!active)
        await tx.posCart.create({
          data: { salesSessionId: sessionId, organizationId },
        });
      return mapSession(
        await tx.salesSession.findUniqueOrThrow({
          where: { id: sessionId },
          include: sessionInclude,
        }),
      );
    });
  }

  async closeSession(record: Parameters<PosRepository["closeSession"]>[0]) {
    return this.prisma.$transaction(async (tx) => {
      await lockSession(tx, record.id, record.organizationId);
      await assertEmptyActiveCart(tx, record.id, record.organizationId);
      const result = await tx.salesSession.updateMany({
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
      if (!result.count) return null;
      await tx.posCart.updateMany({
        where: {
          salesSessionId: record.id,
          organizationId: record.organizationId,
          status: "ACTIVE",
        },
        data: { status: "ABANDONED", version: { increment: 1 } },
      });
      return mapSession(
        await tx.salesSession.findUniqueOrThrow({
          where: { id: record.id },
          include: sessionInclude,
        }),
      );
    });
  }

  async findCartById(id: string, organizationId: string, _userId: string) {
    void _userId;
    const record = await this.prisma.posCart.findFirst({
      include: {
        checkout: { select: { id: true } },
        lines: true,
        salesSession: { select: { status: true } },
      },
      where: { id, organizationId },
    });
    return record ? mapCart(record) : null;
  }

  async findCartDetailsById(
    id: string,
    organizationId: string,
    _userId: string,
  ) {
    void _userId;
    const record = await this.prisma.posCart.findFirst({
      include: {
        checkout: { select: { id: true } },
        lines: {
          include: {
            productVariant: {
              include: { color: true, product: true, size: true },
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        salesSession: { select: { status: true } },
      },
      where: { id, organizationId },
    });
    return record ? mapCartDetails(record) : null;
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
      return await this.prisma.$transaction(async (tx) => {
        const { expectedVersion, ...data } = record;
        await bumpCart(
          tx,
          record.cartId,
          record.organizationId,
          expectedVersion,
        );
        return mapLine(await tx.posCartLine.create({ data }));
      });
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
    return this.prisma.$transaction(async (tx) => {
      await bumpCart(
        tx,
        record.cartId,
        record.organizationId,
        record.expectedVersion,
      );
      const where = {
        cartId: record.cartId,
        id: record.id,
        organizationId: record.organizationId,
      };
      const result = await tx.posCartLine.updateMany({
        where,
        data: {
          quantity: record.quantity,
          lineSubtotalMinor: record.lineSubtotalMinor,
        },
      });
      if (!result.count) throw new NotFoundError("Cart item was not found.");
      return tx.posCartLine.findFirst({ where });
    });
  }

  async removeCartLine(
    id: string,
    cartId: string,
    organizationId: string,
    expectedVersion: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await bumpCart(tx, cartId, organizationId, expectedVersion);
      const result = await tx.posCartLine.deleteMany({
        where: { id, cartId, organizationId },
      });
      if (!result.count) throw new NotFoundError("Cart item was not found.");
      return true;
    });
  }
}

function mapCounter(record: SalesCounter): SalesCounter {
  return record;
}
function mapLine(record: PosCartLine): PosCartLine {
  return record;
}
function mapSession(record: SessionRecord): SalesSession {
  const cart =
    record.carts.find((cart) => cart.status === "ACTIVE") ?? record.carts[0];
  if (!cart) throw new Error("Sales session cart is missing.");
  return {
    cartId: cart.id,
    closedAt: record.closedAt,
    counterId: record.counterId,
    createdAt: record.createdAt,
    id: record.id,
    openedAt: record.openedAt,
    openedByUserId: record.openedByUserId,
    openedByName: record.openedBy.name ?? record.openedBy.email,
    openingFloatMinor: record.openingFloatMinor ?? 0,
    organizationId: record.organizationId,
    status: record.status,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}
function mapCart(record: CartRecord): PosCart {
  return {
    status: record.status,
    version: record.version,
    checkoutId: record.checkout?.id ?? null,
    createdAt: record.createdAt,
    id: record.id,
    lines: record.lines.map(mapLine),
    organizationId: record.organizationId,
    salesSessionId: record.salesSessionId,
    sessionStatus: record.salesSession.status,
    updatedAt: record.updatedAt,
  };
}
function mapCartDetails(record: CartDetailsRecord): PosCartDetails {
  return {
    status: record.status,
    version: record.version,
    checkoutId: record.checkout?.id ?? null,
    createdAt: record.createdAt,
    id: record.id,
    lines: record.lines.map((line) => ({
      ...mapLine(line),
      color: line.productVariant.color.name,
      productName: line.productVariant.product.name,
      size: line.productVariant.size.name,
      sku: line.productVariant.sku,
    })),
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
