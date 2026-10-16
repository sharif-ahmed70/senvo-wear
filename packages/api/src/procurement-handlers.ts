import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  confirmPurchaseServiceInputSchema,
  createPurchaseDraftServiceInputSchema,
  createSupplierServiceInputSchema,
  deactivateSupplierServiceInputSchema,
  getPurchaseServiceInputSchema,
  getSupplierServiceInputSchema,
  listPurchasesServiceInputSchema,
  listSuppliersServiceInputSchema,
  updateSupplierServiceInputSchema,
  createSupplierPaymentServiceInputSchema,
  createSupplierAdjustmentServiceInputSchema,
  getSupplierBalanceServiceInputSchema,
  getSupplierLedgerServiceInputSchema,
  listSupplierPaymentsServiceInputSchema,
  type ConfirmPurchaseServiceInputContract,
  type CreatePurchaseDraftServiceInputContract,
  type CreateSupplierServiceInputContract,
  type DeactivateSupplierServiceInputContract,
  type GetPurchaseServiceInputContract,
  type GetSupplierServiceInputContract,
  type ListPurchasesServiceInputContract,
  type ListSuppliersServiceInputContract,
  type PurchaseContract,
  type SupplierContract,
  type UpdateSupplierServiceInputContract,
  type CreateSupplierPaymentServiceInputContract,
  type CreateSupplierAdjustmentServiceInputContract,
  type GetSupplierBalanceServiceInputContract,
  type GetSupplierLedgerServiceInputContract,
  type ListSupplierPaymentsServiceInputContract,
  type SupplierPaymentContract,
  type SupplierLedgerEntryContract,
  type SupplierBalanceSummaryContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

type SecurityDependencies = {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
};

export type ProcurementApplication = {
  confirmPurchase(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PurchaseContract>>;
  createPurchaseDraft(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PurchaseContract>>;
  createSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>>;
  deactivateSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>>;
  getPurchase(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PurchaseContract>>;
  getSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>>;
  listPurchases(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PurchaseContract[]>>;
  listSuppliers(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract[]>>;
  updateSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>>;
  recordSupplierPayment(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierPaymentContract>>;
  getSupplierBalance(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierBalanceSummaryContract>>;
  listSupplierLedger(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierLedgerEntryContract[]>>;
  listSupplierPayments(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierPaymentContract[]>>;
  recordSupplierAdjustment(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierLedgerEntryContract>>;
};

export type ProcurementApiHandlers = {
  confirmPurchase: ApiHandler<PurchaseContract>;
  createPurchaseDraft: ApiHandler<PurchaseContract>;
  createSupplier: ApiHandler<SupplierContract>;
  deactivateSupplier: ApiHandler<SupplierContract>;
  getPurchase: ApiHandler<PurchaseContract>;
  getSupplier: ApiHandler<SupplierContract>;
  listPurchases: ApiHandler<PurchaseContract[]>;
  listSuppliers: ApiHandler<SupplierContract[]>;
  updateSupplier: ApiHandler<SupplierContract>;
  recordSupplierPayment: ApiHandler<SupplierPaymentContract>;
  recordSupplierAdjustment: ApiHandler<SupplierLedgerEntryContract>;
  getSupplierBalance: ApiHandler<SupplierBalanceSummaryContract>;
  listSupplierLedger: ApiHandler<SupplierLedgerEntryContract[]>;
  listSupplierPayments: ApiHandler<SupplierPaymentContract[]>;
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
    confirmPurchase: handler<
      ConfirmPurchaseServiceInputContract,
      PurchaseContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.procurement.confirmPurchase(context, input),
      inputSchema: confirmPurchaseServiceInputSchema,
    }),
    createPurchaseDraft: handler<
      CreatePurchaseDraftServiceInputContract,
      PurchaseContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.procurement.createPurchaseDraft(context, input),
      inputSchema: createPurchaseDraftServiceInputSchema,
    }),
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
    getPurchase: handler<GetPurchaseServiceInputContract, PurchaseContract>({
      action: "READ",
      execute: (context, input) =>
        dependencies.procurement.getPurchase(context, input),
      inputSchema: getPurchaseServiceInputSchema,
    }),
    getSupplier: handler<GetSupplierServiceInputContract, SupplierContract>({
      action: "READ",
      execute: (context, input) =>
        dependencies.procurement.getSupplier(context, input),
      inputSchema: getSupplierServiceInputSchema,
    }),
    listPurchases: handler<
      ListPurchasesServiceInputContract,
      PurchaseContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.procurement.listPurchases(context, input),
      inputSchema: listPurchasesServiceInputSchema,
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
    recordSupplierPayment: handler<
      CreateSupplierPaymentServiceInputContract,
      SupplierPaymentContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.procurement.recordSupplierPayment(context, input),
      inputSchema: createSupplierPaymentServiceInputSchema,
    }),
    recordSupplierAdjustment: handler<
      CreateSupplierAdjustmentServiceInputContract,
      SupplierLedgerEntryContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.procurement.recordSupplierAdjustment(context, input),
      inputSchema: createSupplierAdjustmentServiceInputSchema,
    }),
    getSupplierBalance: handler<
      GetSupplierBalanceServiceInputContract,
      SupplierBalanceSummaryContract
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.procurement.getSupplierBalance(context, input),
      inputSchema: getSupplierBalanceServiceInputSchema,
    }),
    listSupplierLedger: handler<
      GetSupplierLedgerServiceInputContract,
      SupplierLedgerEntryContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.procurement.listSupplierLedger(context, input),
      inputSchema: getSupplierLedgerServiceInputSchema,
    }),
    listSupplierPayments: handler<
      ListSupplierPaymentsServiceInputContract,
      SupplierPaymentContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.procurement.listSupplierPayments(context, input),
      inputSchema: listSupplierPaymentsServiceInputSchema,
    }),
  };
}
