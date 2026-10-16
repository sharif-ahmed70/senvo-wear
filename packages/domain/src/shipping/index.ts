export type {
  CourierConsignment,
  CourierProvider,
  ShipmentReturnEvent,
  ShipmentStatus,
} from "./domain/models.js";

export {
  ACTIVE_SHIPMENT_STATUSES,
  ALLOWED_SHIPMENT_TRANSITIONS,
  TERMINAL_SHIPMENT_STATUSES,
  assertNoActiveShipment,
  assertOrderCanBeDispatched,
  assertValidShipmentTransition,
  canTransitionShipmentStatus,
  normalizeCodAmount,
} from "./domain/shipping-rules.js";

export type {
  CourierConsignmentRepository,
  CreateCourierConsignmentRecord,
  UpdateCourierConsignmentRecord,
} from "./repositories/courier-consignment-repository.js";

export {
  dispatchSalesOrder,
  getConsignmentById,
  getShipmentsByOrderId,
  updateShipmentStatus,
} from "./application/shipping-use-cases.js";
export type {
  DispatchSalesOrderDependencies,
  DispatchSalesOrderInput,
  DispatchSalesOrderResult,
  GetConsignmentByIdDependencies,
  GetShipmentsByOrderIdDependencies,
  UpdateShipmentStatusDependencies,
  UpdateShipmentStatusInput,
  UpdateShipmentStatusResult,
} from "./application/shipping-use-cases.js";
