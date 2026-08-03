import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  createSalesBoothServiceInputSchema,
  salesSourceEmptyInputSchema,
  updateSalesBoothStatusServiceInputSchema,
  type CreateSalesBoothServiceInputContract,
  type SalesBoothContract,
  type SalesSourceSummaryContract,
  type UpdateSalesBoothStatusServiceInputContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

export type SalesSourceApplication = {
  createSalesBooth(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesBoothContract>>;
  getSalesSourceSummary(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesSourceSummaryContract>>;
  listSalesBooths(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesBoothContract[]>>;
  updateSalesBoothStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesBoothContract>>;
};

export type SalesSourceApiHandlers = {
  createBooth: ApiHandler<SalesBoothContract>;
  getSummary: ApiHandler<SalesSourceSummaryContract>;
  listBooths: ApiHandler<SalesBoothContract[]>;
  updateBoothStatus: ApiHandler<SalesBoothContract>;
};

export function createSalesSourceApiHandlers(dependencies: {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
  sales: SalesSourceApplication;
}): SalesSourceApiHandlers {
  const handler = <TInput, TOutput>(options: {
    action: "CREATE" | "READ" | "UPDATE";
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
      permission: { action: options.action, resource: "SALES" },
    });

  return {
    createBooth: handler<
      CreateSalesBoothServiceInputContract,
      SalesBoothContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.sales.createSalesBooth(context, input),
      inputSchema: createSalesBoothServiceInputSchema,
    }),
    getSummary: handler<Record<string, never>, SalesSourceSummaryContract>({
      action: "READ",
      execute: (context, input) =>
        dependencies.sales.getSalesSourceSummary(context, input),
      inputSchema: salesSourceEmptyInputSchema,
    }),
    listBooths: handler<Record<string, never>, SalesBoothContract[]>({
      action: "READ",
      execute: (context, input) =>
        dependencies.sales.listSalesBooths(context, input),
      inputSchema: salesSourceEmptyInputSchema,
    }),
    updateBoothStatus: handler<
      UpdateSalesBoothStatusServiceInputContract,
      SalesBoothContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.sales.updateSalesBoothStatus(context, input),
      inputSchema: updateSalesBoothStatusServiceInputSchema,
    }),
  };
}
