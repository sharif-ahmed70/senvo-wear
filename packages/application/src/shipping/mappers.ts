import type { CourierConsignmentContract } from "@senvo/contracts";
import { courierConsignmentContractSchema } from "@senvo/contracts";
import type { CourierConsignment } from "@senvo/domain";

export function mapCourierConsignment(
  record: CourierConsignment,
): CourierConsignmentContract {
  return courierConsignmentContractSchema.parse({
    cancelledAt: record.cancelledAt ? record.cancelledAt.toISOString() : null,
    codAmountMinor: record.codAmountMinor.toString(),
    consignmentNumber: record.consignmentNumber,
    courierProvider: record.courierProvider,
    createdAt: record.createdAt.toISOString(),
    deliveredAt: record.deliveredAt ? record.deliveredAt.toISOString() : null,
    deliveryAddressLine1: record.deliveryAddressLine1,
    deliveryAddressLine2: record.deliveryAddressLine2,
    deliveryCity: record.deliveryCity,
    deliveryDistrict: record.deliveryDistrict,
    deliveryFeeMinor: record.deliveryFeeMinor.toString(),
    deliveryPostalCode: record.deliveryPostalCode,
    dispatchedAt: record.dispatchedAt
      ? record.dispatchedAt.toISOString()
      : null,
    id: record.id,
    itemWeightGram: record.itemWeightGram,
    note: record.note,
    organizationId: record.organizationId,
    recipientEmail: record.recipientEmail,
    recipientName: record.recipientName,
    recipientPhone: record.recipientPhone,
    returnedAt: record.returnedAt ? record.returnedAt.toISOString() : null,
    salesOrderId: record.salesOrderId,
    status: record.status,
    trackingCode: record.trackingCode,
    trackingUrl: record.trackingUrl,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  });
}
