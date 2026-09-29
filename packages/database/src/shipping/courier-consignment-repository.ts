import {
  ConflictError,
  NotFoundError,
  type CourierConsignment,
  type CourierConsignmentRepository,
  type CreateCourierConsignmentRecord,
  type UpdateCourierConsignmentRecord,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type CourierConsignmentPrismaClient = Pick<
  PrismaClient,
  "courierConsignment"
>;

function toDomain(record: Prisma.CourierConsignmentGetPayload<{}>): CourierConsignment {
  return {
    cancelledAt: record.cancelledAt,
    codAmountMinor: BigInt(record.codAmountMinor),
    consignmentNumber: record.consignmentNumber,
    courierProvider: record.courierProvider as CourierConsignment["courierProvider"],
    createdAt: record.createdAt,
    deliveredAt: record.deliveredAt,
    deliveryAddressLine1: record.deliveryAddressLine1,
    deliveryAddressLine2: record.deliveryAddressLine2,
    deliveryCity: record.deliveryCity,
    deliveryDistrict: record.deliveryDistrict,
    deliveryFeeMinor: BigInt(record.deliveryFeeMinor),
    deliveryPostalCode: record.deliveryPostalCode,
    dispatchedAt: record.dispatchedAt,
    id: record.id,
    itemWeightGram: record.itemWeightGram,
    note: record.note,
    organizationId: record.organizationId,
    recipientEmail: record.recipientEmail,
    recipientName: record.recipientName,
    recipientPhone: record.recipientPhone,
    returnedAt: record.returnedAt,
    salesOrderId: record.salesOrderId,
    status: record.status as CourierConsignment["status"],
    trackingCode: record.trackingCode,
    trackingUrl: record.trackingUrl,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

export class PrismaCourierConsignmentRepository
  implements CourierConsignmentRepository
{
  constructor(private readonly prisma: CourierConsignmentPrismaClient) {}

  async create(
    record: CreateCourierConsignmentRecord,
  ): Promise<CourierConsignment> {
    const created = await this.prisma.courierConsignment.create({
      data: {
        cancelledAt: record.cancelledAt ?? null,
        codAmountMinor: Number(record.codAmountMinor),
        consignmentNumber: record.consignmentNumber,
        courierProvider: record.courierProvider,
        deliveredAt: record.deliveredAt ?? null,
        deliveryAddressLine1: record.deliveryAddressLine1,
        deliveryAddressLine2: record.deliveryAddressLine2 ?? null,
        deliveryCity: record.deliveryCity ?? null,
        deliveryDistrict: record.deliveryDistrict ?? null,
        deliveryFeeMinor: Number(record.deliveryFeeMinor ?? 0n),
        deliveryPostalCode: record.deliveryPostalCode ?? null,
        dispatchedAt: record.dispatchedAt ?? null,
        ...(record.id ? { id: record.id } : {}),
        itemWeightGram: record.itemWeightGram ?? null,
        note: record.note ?? null,
        organizationId: record.organizationId,
        recipientEmail: record.recipientEmail ?? null,
        recipientName: record.recipientName,
        recipientPhone: record.recipientPhone,
        returnedAt: record.returnedAt ?? null,
        salesOrderId: record.salesOrderId,
        status: record.status,
        trackingCode: record.trackingCode ?? null,
        trackingUrl: record.trackingUrl ?? null,
      },
    });

    return toDomain(created);
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<CourierConsignment | null> {
    const record = await this.prisma.courierConsignment.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    return record ? toDomain(record) : null;
  }

  async findByConsignmentNumber(
    consignmentNumber: string,
    organizationId: string,
  ): Promise<CourierConsignment | null> {
    const record = await this.prisma.courierConsignment.findFirst({
      where: {
        consignmentNumber,
        organizationId,
      },
    });

    return record ? toDomain(record) : null;
  }

  async findActiveBySalesOrderId(
    salesOrderId: string,
    organizationId: string,
  ): Promise<CourierConsignment | null> {
    const record = await this.prisma.courierConsignment.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      where: {
        organizationId,
        salesOrderId,
        status: {
          in: ["BOOKED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"],
        },
      },
    });

    return record ? toDomain(record) : null;
  }

  async listBySalesOrderId(
    salesOrderId: string,
    organizationId: string,
  ): Promise<CourierConsignment[]> {
    const records = await this.prisma.courierConsignment.findMany({
      orderBy: {
        createdAt: "desc",
      },
      where: {
        organizationId,
        salesOrderId,
      },
    });

    return records.map(toDomain);
  }

  async update(
    record: UpdateCourierConsignmentRecord,
  ): Promise<CourierConsignment> {
    const existing = await this.prisma.courierConsignment.findFirst({
      where: {
        id: record.consignmentId,
        organizationId: record.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Courier consignment was not found.");
    }

    if (
      record.expectedVersion !== undefined &&
      existing.version !== record.expectedVersion
    ) {
      throw new ConflictError(
        "The consignment has been modified by another process. Please reload and retry.",
      );
    }

    const updated = await this.prisma.courierConsignment.update({
      data: {
        cancelledAt:
          record.cancelledAt !== undefined
            ? record.cancelledAt
            : existing.cancelledAt,
        deliveredAt:
          record.deliveredAt !== undefined
            ? record.deliveredAt
            : existing.deliveredAt,
        dispatchedAt:
          record.dispatchedAt !== undefined
            ? record.dispatchedAt
            : existing.dispatchedAt,
        note: record.note !== undefined ? record.note : existing.note,
        returnedAt:
          record.returnedAt !== undefined
            ? record.returnedAt
            : existing.returnedAt,
        status: record.status,
        trackingCode:
          record.trackingCode !== undefined
            ? record.trackingCode
            : existing.trackingCode,
        trackingUrl:
          record.trackingUrl !== undefined
            ? record.trackingUrl
            : existing.trackingUrl,
        version: {
          increment: 1,
        },
      },
      where: {
        id: existing.id,
      },
    });

    return toDomain(updated);
  }
}
