import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  dispatchSalesOrderServiceInputSchema,
  getConsignmentByIdServiceInputSchema,
  getShipmentsByOrderIdServiceInputSchema,
  updateShipmentStatusServiceInputSchema,
  type CourierConsignmentContract,
  type DispatchSalesOrderServiceInputContract,
  type GetConsignmentByIdServiceInputContract,
  type GetShipmentsByOrderIdServiceInputContract,
  type UpdateShipmentStatusServiceInputContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

export type ShippingApplication = {
  dispatchSalesOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CourierConsignmentContract>>;
  getConsignment(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CourierConsignmentContract>>;
  getShipmentByOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CourierConsignmentContract[]>>;
  updateShipmentStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CourierConsignmentContract>>;
};

type SecurityDependencies = {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
};

export type ShippingApiDependencies = SecurityDependencies & {
  shipping: ShippingApplication;
};

export type ShippingApiHandlers = {
  dispatch: ApiHandler<CourierConsignmentContract>;
  getConsignment: ApiHandler<CourierConsignmentContract>;
  getShipmentByOrder: ApiHandler<CourierConsignmentContract[]>;
  updateStatus: ApiHandler<CourierConsignmentContract>;
};

export function createShippingApiHandlers(
  dependencies: ShippingApiDependencies,
): ShippingApiHandlers {
  const handler = <TInput, TOutput>(options: {
    action: "READ" | "UPDATE";
    execute: (
      context: ApplicationExecutionContext,
      input: TInput,
    ) => Promise<ApplicationServiceResult<TOutput>>;
    inputSchema: Parameters<
      typeof createProtectedApiHandler<TInput, TOutput>
    >[0]["inputSchema"];
  }) =>
    createProtectedApiHandler<TInput, TOutput>({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: options.execute,
      inputSchema: options.inputSchema,
      permission: { action: options.action, resource: "SALES_ORDER" },
    });

  return {
    dispatch: handler<
      DispatchSalesOrderServiceInputContract,
      CourierConsignmentContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.shipping.dispatchSalesOrder(context, input),
      inputSchema: dispatchSalesOrderServiceInputSchema,
    }),
    getConsignment: handler<
      GetConsignmentByIdServiceInputContract,
      CourierConsignmentContract
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.shipping.getConsignment(context, input),
      inputSchema: getConsignmentByIdServiceInputSchema,
    }),
    getShipmentByOrder: handler<
      GetShipmentsByOrderIdServiceInputContract,
      CourierConsignmentContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.shipping.getShipmentByOrder(context, input),
      inputSchema: getShipmentsByOrderIdServiceInputSchema,
    }),
    updateStatus: handler<
      UpdateShipmentStatusServiceInputContract,
      CourierConsignmentContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.shipping.updateShipmentStatus(context, input),
      inputSchema: updateShipmentStatusServiceInputSchema,
    }),
  };
}
