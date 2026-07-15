import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  createSalesOrderServiceInputSchema,
  postInventoryMovementServiceInputSchema,
  type CreateSalesOrderServiceInputContract,
  type InventoryMovementContract,
  type PostInventoryMovementServiceInputContract,
  type SalesOrderServiceContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

type SecurityDependencies = {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
};

export type SalesOrderCreationApplication = {
  createOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>>;
};

export type InventoryMovementPostingApplication = {
  postMovement(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<InventoryMovementContract>>;
};

export function createSalesOrderApiHandler(
  dependencies: SecurityDependencies & {
    sales: SalesOrderCreationApplication;
  },
): ApiHandler<SalesOrderServiceContract> {
  return createProtectedApiHandler<
    CreateSalesOrderServiceInputContract,
    SalesOrderServiceContract
  >({
    authenticationService: dependencies.authenticationService,
    authorizationService: dependencies.authorizationService,
    execute: (context, input) => dependencies.sales.createOrder(context, input),
    inputSchema: createSalesOrderServiceInputSchema,
    permission: { action: "CREATE", resource: "SALES_ORDER" },
  });
}

export function createPostInventoryMovementApiHandler(
  dependencies: SecurityDependencies & {
    inventory: InventoryMovementPostingApplication;
  },
): ApiHandler<InventoryMovementContract> {
  return createProtectedApiHandler<
    PostInventoryMovementServiceInputContract,
    InventoryMovementContract
  >({
    authenticationService: dependencies.authenticationService,
    authorizationService: dependencies.authorizationService,
    execute: (context, input) =>
      dependencies.inventory.postMovement(context, input),
    inputSchema: postInventoryMovementServiceInputSchema,
    permission: { action: "UPDATE", resource: "INVENTORY" },
  });
}
