import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  createSupplierServiceInputSchema,
  deactivateSupplierServiceInputSchema,
  getSupplierServiceInputSchema,
  listSuppliersServiceInputSchema,
  updateSupplierServiceInputSchema,
  type CreateSupplierServiceInputContract,
  type DeactivateSupplierServiceInputContract,
  type GetSupplierServiceInputContract,
  type ListSuppliersServiceInputContract,
  type SupplierContract,
  type UpdateSupplierServiceInputContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

type SecurityDependencies = {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
};

export type ProcurementApplication = {
  createSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>>;
  deactivateSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>>;
  getSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>>;
  listSuppliers(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract[]>>;
  updateSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>>;
};

export type ProcurementApiHandlers = {
  createSupplier: ApiHandler<SupplierContract>;
  deactivateSupplier: ApiHandler<SupplierContract>;
  getSupplier: ApiHandler<SupplierContract>;
  listSuppliers: ApiHandler<SupplierContract[]>;
  updateSupplier: ApiHandler<SupplierContract>;
};

export function createProcurementApiHandlers(
  dependencies: SecurityDependencies & {
    procurement: ProcurementApplication;
  },
): ProcurementApiHandlers {
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
      permission: { action: options.action, resource: "PROCUREMENT" },
    });

  return {
    createSupplier: handler<
      CreateSupplierServiceInputContract,
      SupplierContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.procurement.createSupplier(context, input),
      inputSchema: createSupplierServiceInputSchema,
    }),
    deactivateSupplier: handler<
      DeactivateSupplierServiceInputContract,
      SupplierContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.procurement.deactivateSupplier(context, input),
      inputSchema: deactivateSupplierServiceInputSchema,
    }),
    getSupplier: handler<GetSupplierServiceInputContract, SupplierContract>({
      action: "READ",
      execute: (context, input) =>
        dependencies.procurement.getSupplier(context, input),
      inputSchema: getSupplierServiceInputSchema,
    }),
    listSuppliers: handler<
      ListSuppliersServiceInputContract,
      SupplierContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.procurement.listSuppliers(context, input),
      inputSchema: listSuppliersServiceInputSchema,
    }),
    updateSupplier: handler<
      UpdateSupplierServiceInputContract,
      SupplierContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.procurement.updateSupplier(context, input),
      inputSchema: updateSupplierServiceInputSchema,
    }),
  };
}
