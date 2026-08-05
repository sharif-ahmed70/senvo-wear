import {
  ConflictError,
  type PosCheckout,
  type PosCheckoutPreparation,
  type PosCheckoutRepository,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type CheckoutPrismaClient = Pick<
  PrismaClient,
  "$queryRaw" | "inventoryAllocationPolicy" | "posCart" | "posCheckoutRecord"
>;

const checkoutInclude = {
  counter: { select: { name: true } },
  paymentBatch: {
    select: {
      id: true,
      outstandingMinor: true,
      paidMinor: true,
      requestSignature: true,
      status: true,
    },
  },
  receipt: { select: { id: true, receiptNumber: true } },
  salesOrder: { select: { orderNumber: true } },
  staff: { select: { name: true } },
} as const;

type CheckoutRecord = Prisma.PosCheckoutRecordGetPayload<{
  include: typeof checkoutInclude;
}>;

export class PrismaPosCheckoutRepository implements PosCheckoutRepository {
  constructor(private readonly prisma: CheckoutPrismaClient) {}

  async prepare(
    cartId: string,
    organizationId: string,
  ): Promise<PosCheckoutPreparation | null> {
    await this.prisma.$queryRaw`
      SELECT "id"
      FROM "pos_carts"
      WHERE "id" = ${cartId}::uuid
        AND "organization_id" = ${organizationId}::uuid
      FOR UPDATE
    `;
    const cart = await this.prisma.posCart.findFirst({
      include: {
        checkout: { include: checkoutInclude },
        lines: {
          include: {
            productVariant: {
              include: {
                barcodes: {
                  select: { id: true },
                  where: { status: "ACTIVE" },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        salesSession: {
          include: {
            counter: { include: { booth: true, branch: true } },
            openedBy: true,
            openedMembership: true,
          },
        },
        organization: true,
      },
      where: { id: cartId, organizationId },
    });
    if (!cart) return null;
    const counter = cart.salesSession.counter;
    const allocationPolicy =
      await this.prisma.inventoryAllocationPolicy.findFirst({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
        where: {
          organizationId,
          status: "ACTIVE",
          locations: {
            some: {
              isEnabled: true,
              stockLocation: {
                branchId: counter.branchId ?? undefined,
                status: "ACTIVE",
              },
            },
          },
        },
      });
    return {
      allocationPolicyId: allocationPolicy?.id ?? null,
      boothId: counter.boothId,
      branchId: counter.branchId,
      cartId: cart.id,
      checkout: cart.checkout ? mapCheckout(cart.checkout) : null,
      counterId: counter.id,
      counterCode: counter.code,
      counterName: counter.name,
      counterStatus: counter.status,
      counterType: counter.type,
      lines: cart.lines.map((line) => ({
        hasActiveBarcode: line.productVariant.barcodes.length > 0,
        productVariantId: line.productVariantId,
        quantity: line.quantity,
        sellingPriceMinor: line.productVariant.sellingPriceMinor,
        variantStatus: line.productVariant.status,
      })),
      membershipStatus: cart.salesSession.openedMembership.status,
      organizationId: cart.organizationId,
      organizationAddressLine1: cart.organization.addressLine1,
      organizationAddressLine2: cart.organization.addressLine2,
      organizationCity: cart.organization.city,
      organizationDistrict: cart.organization.district,
      organizationEmail: cart.organization.email,
      organizationName: cart.organization.name,
      organizationPhone: cart.organization.phone,
      organizationPostalCode: cart.organization.postalCode,
      salesSessionId: cart.salesSessionId,
      sessionStatus: cart.salesSession.status,
      staffId: cart.salesSession.openedByUserId,
      staffName:
        cart.salesSession.openedBy.name ?? cart.salesSession.openedBy.email,
      staffStatus: cart.salesSession.openedBy.status,
      sourceName:
        counter.type === "EVENT_BOOTH"
          ? (counter.booth?.name ?? counter.name)
          : (counter.branch?.name ?? counter.name),
    };
  }

  async createCompleted(
    record: Parameters<PosCheckoutRepository["createCompleted"]>[0],
  ): Promise<PosCheckout> {
    try {
      return mapCheckout(
        await this.prisma.posCheckoutRecord.create({
          data: { ...record, status: "COMPLETED" },
          include: checkoutInclude,
        }),
      );
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ConflictError("Checkout idempotency key was already used.");
      }
      throw error;
    }
  }

  async findById(id: string, organizationId: string) {
    const record = await this.prisma.posCheckoutRecord.findFirst({
      include: checkoutInclude,
      where: { id, organizationId },
    });
    return record ? mapCheckout(record) : null;
  }

  async list(organizationId: string) {
    return (
      await this.prisma.posCheckoutRecord.findMany({
        include: checkoutInclude,
        orderBy: [{ completedAt: "desc" }, { id: "desc" }],
        where: { organizationId },
      })
    ).map(mapCheckout);
  }
}

function mapCheckout(record: CheckoutRecord): PosCheckout {
  return {
    cartId: record.cartId,
    completedAt: record.completedAt,
    counterId: record.counterId,
    counterName: record.counter.name,
    createdAt: record.createdAt,
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    orderNumber: record.salesOrder.orderNumber,
    organizationId: record.organizationId,
    outstandingMinor: record.paymentBatch?.outstandingMinor ?? null,
    paidMinor: record.paymentBatch?.paidMinor ?? null,
    paymentBatchId: record.paymentBatch?.id ?? null,
    paymentRequestSignature: record.paymentBatch?.requestSignature ?? null,
    paymentStatus: record.paymentBatch?.status ?? "UNRECORDED",
    receiptId: record.receipt?.id ?? null,
    receiptNumber: record.receipt?.receiptNumber ?? null,
    salesOrderId: record.salesOrderId,
    salesSessionId: record.salesSessionId,
    staffName: record.staff.name ?? "Team member",
    status: record.status,
    subtotalMinor: record.subtotalMinor,
    totalMinor: record.totalMinor,
    updatedAt: record.updatedAt,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}
