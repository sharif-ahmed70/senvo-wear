import { NotFoundError } from "../../errors.js";
import type { SalesOrder } from "../../sales/domain/models.js";
import type {
  CourierConsignment,
  CourierProvider,
  ShipmentReturnEvent,
  ShipmentStatus,
} from "../domain/models.js";
import {
  assertNoActiveShipment,
  assertOrderCanBeDispatched,
  assertValidShipmentTransition,
  normalizeCodAmount,
} from "../domain/shipping-rules.js";
import type {
  CourierConsignmentRepository,
  CreateCourierConsignmentRecord,
} from "../repositories/courier-consignment-repository.js";

export type DispatchSalesOrderDependencies = {
  consignmentRepository: CourierConsignmentRepository;
  salesOrderRepository: {
    findById(id: string, organizationId: string): Promise<SalesOrder | null>;
  };
};

export type DispatchSalesOrderInput = {
  codAmountMinor?: bigint | number | string | null;
  consignmentNumber?: string;
  courierProvider: CourierProvider;
  deliveryAddressLine1?: string | null;
  deliveryAddressLine2?: string | null;
  deliveryCity?: string | null;
  deliveryDistrict?: string | null;
  deliveryFeeMinor?: bigint | number | string | null;
  deliveryPostalCode?: string | null;
  itemWeightGram?: number | null;
  note?: string | null;
  organizationId: string;
  recipientEmail?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  salesOrderId: string;
  trackingCode?: string | null;
  trackingUrl?: string | null;
};

export type DispatchSalesOrderResult = {
  consignment: CourierConsignment;
};

export async function dispatchSalesOrder(
  dependencies: DispatchSalesOrderDependencies,
  input: DispatchSalesOrderInput,
): Promise<DispatchSalesOrderResult> {
  const order = await dependencies.salesOrderRepository.findById(
    input.salesOrderId,
    input.organizationId,
  );

  if (!order) {
    throw new NotFoundError(
      `Sales order ${input.salesOrderId} was not found for organization ${input.organizationId}.`,
    );
  }

  // 1. Validate order state allows dispatch
  assertOrderCanBeDispatched({
    cancelledAt: order.cancelledAt,
    customerPhone: order.customerPhone,
    deliveryAddressLine1: order.deliveryAddressLine1,
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
  });

  // 2. Prevent duplicate active dispatches
  const existingConsignments =
    await dependencies.consignmentRepository.listBySalesOrderId(
      input.salesOrderId,
      input.organizationId,
    );
  assertNoActiveShipment(existingConsignments, order.orderNumber);

  // 3. Generate unique consignment number if not provided
  const counter = (existingConsignments.length + 1).toString().padStart(2, "0");
  const consignmentNumber =
    input.consignmentNumber?.trim() || `CNS-${order.orderNumber}-${counter}`;

  // 4. Resolve delivery address and recipient snapshots
  const recipientName =
    input.recipientName?.trim() || order.customerName || "Customer";
  const recipientPhone =
    input.recipientPhone?.trim() || order.customerPhone || "";
  const recipientEmail = input.recipientEmail ?? order.customerEmail;
  const deliveryAddressLine1 =
    input.deliveryAddressLine1?.trim() || order.deliveryAddressLine1 || "";
  const deliveryAddressLine2 =
    input.deliveryAddressLine2 ?? order.deliveryAddressLine2;
  const deliveryCity = input.deliveryCity ?? order.deliveryCity;
  const deliveryDistrict = input.deliveryDistrict ?? order.deliveryDistrict;
  const deliveryPostalCode =
    input.deliveryPostalCode ?? order.deliveryPostalCode;

  // 5. Resolve COD and delivery fee
  const codAmountMinor =
    input.codAmountMinor !== undefined && input.codAmountMinor !== null
      ? normalizeCodAmount(input.codAmountMinor)
      : BigInt(order.totalMinor ?? 0);

  const deliveryFeeMinor =
    input.deliveryFeeMinor !== undefined && input.deliveryFeeMinor !== null
      ? normalizeCodAmount(input.deliveryFeeMinor)
      : BigInt(order.deliveryMinor ?? 0);

  // 6. Initial shipment status (BOOKED if tracking provided, otherwise DRAFT)
  const initialStatus: ShipmentStatus = input.trackingCode?.trim()
    ? "BOOKED"
    : "DRAFT";

  const record: CreateCourierConsignmentRecord = {
    codAmountMinor,
    consignmentNumber,
    courierProvider: input.courierProvider,
    deliveryAddressLine1,
    deliveryAddressLine2,
    deliveryCity,
    deliveryDistrict,
    deliveryFeeMinor,
    deliveryPostalCode,
    itemWeightGram: input.itemWeightGram ?? null,
    note: input.note ?? null,
    organizationId: input.organizationId,
    recipientEmail,
    recipientName,
    recipientPhone,
    salesOrderId: input.salesOrderId,
    status: initialStatus,
    trackingCode: input.trackingCode?.trim() || null,
    trackingUrl: input.trackingUrl?.trim() || null,
  };

  const consignment = await dependencies.consignmentRepository.create(record);

  return { consignment };
}

export type UpdateShipmentStatusDependencies = {
  consignmentRepository: CourierConsignmentRepository;
};

export type UpdateShipmentStatusInput = {
  consignmentId: string;
  expectedVersion?: number;
  note?: string | null;
  onReturnToOrigin?: (event: ShipmentReturnEvent) => Promise<void> | void;
  organizationId: string;
  status: ShipmentStatus;
  trackingCode?: string | null;
  trackingUrl?: string | null;
};

export type UpdateShipmentStatusResult = {
  consignment: CourierConsignment;
  returnEvent: ShipmentReturnEvent | null;
};

export async function updateShipmentStatus(
  dependencies: UpdateShipmentStatusDependencies,
  input: UpdateShipmentStatusInput,
): Promise<UpdateShipmentStatusResult> {
  const current = await dependencies.consignmentRepository.findById(
    input.consignmentId,
    input.organizationId,
  );

  if (!current) {
    throw new NotFoundError(
      `Courier consignment ${input.consignmentId} was not found for organization ${input.organizationId}.`,
    );
  }

  // Idempotent: if already in the target status, return current record
  if (current.status === input.status) {
    return { consignment: current, returnEvent: null };
  }

  // Validate state machine lifecycle transition
  assertValidShipmentTransition(current.status, input.status);

  // Set audit timestamps based on target state
  const dispatchedAt =
    input.status === "PICKED_UP" || input.status === "IN_TRANSIT"
      ? (current.dispatchedAt ?? new Date())
      : current.dispatchedAt;

  const deliveredAt =
    input.status === "DELIVERED"
      ? (current.deliveredAt ?? new Date())
      : current.deliveredAt;

  const returnedAt =
    input.status === "RETURNED_TO_ORIGIN"
      ? (current.returnedAt ?? new Date())
      : current.returnedAt;

  const cancelledAt =
    input.status === "CANCELLED"
      ? (current.cancelledAt ?? new Date())
      : current.cancelledAt;

  const updated = await dependencies.consignmentRepository.update({
    cancelledAt,
    consignmentId: input.consignmentId,
    deliveredAt,
    dispatchedAt,
    expectedVersion: input.expectedVersion,
    note: input.note !== undefined ? input.note : current.note,
    organizationId: input.organizationId,
    returnedAt,
    status: input.status,
    trackingCode:
      input.trackingCode !== undefined
        ? input.trackingCode
        : current.trackingCode,
    trackingUrl:
      input.trackingUrl !== undefined ? input.trackingUrl : current.trackingUrl,
  });

  // Prepare RTO inventory return hook
  let returnEvent: ShipmentReturnEvent | null = null;
  if (input.status === "RETURNED_TO_ORIGIN") {
    returnEvent = {
      consignmentId: updated.id,
      consignmentNumber: updated.consignmentNumber,
      organizationId: updated.organizationId,
      reason: input.note ?? null,
      requiresRestocking: true,
      returnedAt: updated.returnedAt ?? new Date(),
      salesOrderId: updated.salesOrderId,
    };

    if (input.onReturnToOrigin) {
      await input.onReturnToOrigin(returnEvent);
    }
  }

  return { consignment: updated, returnEvent };
}

export type GetShipmentsByOrderIdDependencies = {
  consignmentRepository: CourierConsignmentRepository;
};

export async function getShipmentsByOrderId(
  dependencies: GetShipmentsByOrderIdDependencies,
  input: { organizationId: string; salesOrderId: string },
): Promise<CourierConsignment[]> {
  return dependencies.consignmentRepository.listBySalesOrderId(
    input.salesOrderId,
    input.organizationId,
  );
}

export type GetConsignmentByIdDependencies = {
  consignmentRepository: CourierConsignmentRepository;
};

export async function getConsignmentById(
  dependencies: GetConsignmentByIdDependencies,
  input: { consignmentId: string; organizationId: string },
): Promise<CourierConsignment> {
  const consignment = await dependencies.consignmentRepository.findById(
    input.consignmentId,
    input.organizationId,
  );
  if (!consignment) {
    throw new NotFoundError(
      `Courier consignment ${input.consignmentId} was not found.`,
    );
  }
  return consignment;
}
