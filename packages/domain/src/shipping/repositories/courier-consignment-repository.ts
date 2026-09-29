import type { CourierConsignment } from "../domain/models.js";

export type CreateCourierConsignmentRecord = {
  cancelledAt?: Date | null;
  codAmountMinor: bigint;
  consignmentNumber: string;
  courierProvider: CourierConsignment["courierProvider"];
  deliveredAt?: Date | null;
  deliveryAddressLine1: string;
  deliveryAddressLine2?: string | null;
  deliveryCity?: string | null;
  deliveryDistrict?: string | null;
  deliveryFeeMinor?: bigint;
  deliveryPostalCode?: string | null;
  dispatchedAt?: Date | null;
  id?: string;
  itemWeightGram?: number | null;
  note?: string | null;
  organizationId: string;
  recipientEmail?: string | null;
  recipientName: string;
  recipientPhone: string;
  returnedAt?: Date | null;
  salesOrderId: string;
  status: CourierConsignment["status"];
  trackingCode?: string | null;
  trackingUrl?: string | null;
};

export type UpdateCourierConsignmentRecord = {
  cancelledAt?: Date | null;
  consignmentId: string;
  deliveredAt?: Date | null;
  dispatchedAt?: Date | null;
  expectedVersion?: number;
  note?: string | null;
  organizationId: string;
  returnedAt?: Date | null;
  status: CourierConsignment["status"];
  trackingCode?: string | null;
  trackingUrl?: string | null;
};

export type CourierConsignmentRepository = {
  create(record: CreateCourierConsignmentRecord): Promise<CourierConsignment>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<CourierConsignment | null>;
  findByConsignmentNumber(
    consignmentNumber: string,
    organizationId: string,
  ): Promise<CourierConsignment | null>;
  findActiveBySalesOrderId(
    salesOrderId: string,
    organizationId: string,
  ): Promise<CourierConsignment | null>;
  listBySalesOrderId(
    salesOrderId: string,
    organizationId: string,
  ): Promise<CourierConsignment[]>;
  update(record: UpdateCourierConsignmentRecord): Promise<CourierConsignment>;
};
