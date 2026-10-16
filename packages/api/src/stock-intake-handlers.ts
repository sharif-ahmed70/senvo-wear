import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  createStockIntakeServiceInputSchema,
  type CreateStockIntakeServiceInputContract,
  type StockIntakeContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

export type StockIntakeApplication = {
  recordStockIntake(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<StockIntakeContract>>;
};

export type StockIntakeApiHandlers = {
  recordStockIntake: ApiHandler<StockIntakeContract>;
};

/**
 * The gateway checks PROCUREMENT:CREATE; the application service additionally
 * requires CATALOG and INVENTORY create/update because one intake writes to all
 * three modules.
 */
export function createStockIntakeApiHandlers(dependencies: {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
  stockIntake: StockIntakeApplication;
}): StockIntakeApiHandlers {
  return {
    recordStockIntake: createProtectedApiHandler<
      CreateStockIntakeServiceInputContract,
      StockIntakeContract
    >({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) =>
        dependencies.stockIntake.recordStockIntake(context, input),
      inputSchema: createStockIntakeServiceInputSchema,
      permission: { action: "CREATE", resource: "PROCUREMENT" },
    }),
  };
}
