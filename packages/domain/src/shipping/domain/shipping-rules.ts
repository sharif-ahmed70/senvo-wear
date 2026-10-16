import { BusinessRuleError, ConflictError } from "../../errors.js";
import type { CourierConsignment, ShipmentStatus } from "./models.js";

export const ALLOWED_SHIPMENT_TRANSITIONS: Record<
  ShipmentStatus,
  readonly ShipmentStatus[]
> = {
  DRAFT: ["BOOKED", "PICKED_UP", "IN_TRANSIT", "CANCELLED"],
  BOOKED: ["PICKED_UP", "IN_TRANSIT", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "DELIVERED", "RETURNED_TO_ORIGIN", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED", "RETURNED_TO_ORIGIN", "CANCELLED"],
  DELIVERED: [],
  RETURNED_TO_ORIGIN: [],
  CANCELLED: [],
};

export const TERMINAL_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "DELIVERED",
  "RETURNED_TO_ORIGIN",
  "CANCELLED",
];

export const ACTIVE_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "BOOKED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
];

/**
 * Determines whether a transition from one shipment status to another is permitted.
 * Same status to same status is considered an idempotent valid transition.
 */
export function canTransitionShipmentStatus(
  from: ShipmentStatus,
  to: ShipmentStatus,
): boolean {
  if (from === to) {
    return true;
  }
  return ALLOWED_SHIPMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Asserts that a shipment status transition is valid, throwing descriptive domain errors
 * with specific protections for delivered, cancelled, and returned states.
 */
export function assertValidShipmentTransition(
  from: ShipmentStatus,
  to: ShipmentStatus,
): void {
  if (from === to) {
    return;
  }

  if (from === "DELIVERED") {
    throw new ConflictError(
      "Delivered shipment cannot be modified or moved back to transit.",
    );
  }

  if (from === "CANCELLED") {
    throw new ConflictError(
      "Cancelled shipment cannot be dispatched or modified.",
    );
  }

  if (from === "RETURNED_TO_ORIGIN") {
    throw new ConflictError(
      "Shipment already returned to origin cannot be modified or re-dispatched.",
    );
  }

  const allowed = ALLOWED_SHIPMENT_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new BusinessRuleError(
      `Invalid shipment transition from ${from} to ${to}.`,
    );
  }
}

/**
 * Validates that an order is in an eligible state to have a parcel dispatched.
 */
export function assertOrderCanBeDispatched(order: {
  cancelledAt?: Date | null;
  customerPhone?: string | null;
  deliveryAddressLine1?: string | null;
  id: string;
  orderNumber: string;
  status: string;
}): void {
  if (order.status === "CANCELLED" || order.cancelledAt) {
    throw new BusinessRuleError(
      `Cannot dispatch sales order ${order.orderNumber} because it is cancelled.`,
    );
  }

  if (order.status === "DRAFT") {
    throw new BusinessRuleError(
      `Cannot dispatch sales order ${order.orderNumber} because it is still a draft. Only CONFIRMED or FULFILLED orders can be dispatched.`,
    );
  }

  if (!order.deliveryAddressLine1 || !order.deliveryAddressLine1.trim()) {
    throw new BusinessRuleError(
      `Cannot dispatch sales order ${order.orderNumber} without a delivery address.`,
    );
  }

  if (!order.customerPhone || !order.customerPhone.trim()) {
    throw new BusinessRuleError(
      `Cannot dispatch sales order ${order.orderNumber} without a customer phone number.`,
    );
  }
}

/**
 * Validates that an order does not already have an active or delivered shipment in flight.
 */
export function assertNoActiveShipment(
  existingConsignments: CourierConsignment[],
  orderNumber?: string,
): void {
  const active = existingConsignments.find((c) =>
    ACTIVE_SHIPMENT_STATUSES.includes(c.status),
  );

  if (active) {
    const label = orderNumber ? ` for order ${orderNumber}` : "";
    throw new ConflictError(
      `An active or delivered shipment consignment (${active.consignmentNumber}, status: ${active.status}) already exists${label}. Duplicate dispatch is prevented.`,
    );
  }
}

/**
 * Calculates or normalizes COD amount in BigInt minor units.
 */
export function normalizeCodAmount(
  amountMinor: bigint | number | string | null | undefined,
): bigint {
  if (amountMinor === undefined || amountMinor === null) {
    return 0n;
  }
  const parsed = BigInt(amountMinor.toString());
  if (parsed < 0n) {
    throw new BusinessRuleError("COD amount cannot be negative.");
  }
  return parsed;
}
