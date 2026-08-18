import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  OnlinePaymentApplicationService,
} from "@senvo/application";
import {
  onlinePaymentAdminInputSchema,
  onlinePaymentReconcileInputSchema,
  providerRefundInputSchema,
  providerRefundRefreshInputSchema,
  type OnlinePaymentAdminResultContract,
  type ProviderRefundContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

export type OnlinePaymentApplication = Pick<
  OnlinePaymentApplicationService,
  "getAdmin" | "reconcile" | "refund" | "refreshRefund"
>;

export type OnlinePaymentApiHandlers = {
  getOrderPayment: ApiHandler<OnlinePaymentAdminResultContract>;
  reconcile: ApiHandler<OnlinePaymentAdminResultContract>;
  refund: ApiHandler<ProviderRefundContract>;
  refreshRefund: ApiHandler<ProviderRefundContract>;
};

export function createOnlinePaymentApiHandlers(dependencies: {
  application: OnlinePaymentApplication;
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
}): OnlinePaymentApiHandlers {
  const protectedHandler = <TInput, TOutput>(input: {
    execute: (
      context: Parameters<OnlinePaymentApplicationService["getAdmin"]>[0],
      payload: TInput,
    ) =>
      ReturnType<OnlinePaymentApplicationService["getAdmin"]> | Promise<never>;
    inputSchema: Parameters<
      typeof createProtectedApiHandler<TInput, TOutput>
    >[0]["inputSchema"];
    permission: "APPROVE" | "READ";
  }) =>
    createProtectedApiHandler<TInput, TOutput>({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: input.execute as never,
      inputSchema: input.inputSchema,
      permission: { action: input.permission, resource: "PAYMENT" },
    });

  return {
    getOrderPayment: protectedHandler({
      execute: (context, input) =>
        dependencies.application.getAdmin(context, input),
      inputSchema: onlinePaymentAdminInputSchema,
      permission: "READ",
    }),
    reconcile: protectedHandler({
      execute: (context, input) =>
        dependencies.application.reconcile(context, input) as never,
      inputSchema: onlinePaymentReconcileInputSchema,
      permission: "APPROVE",
    }),
    refund: protectedHandler({
      execute: (context, input) =>
        dependencies.application.refund(context, input) as never,
      inputSchema: providerRefundInputSchema,
      permission: "APPROVE",
    }),
    refreshRefund: protectedHandler({
      execute: (context, input) =>
        dependencies.application.refreshRefund(context, input) as never,
      inputSchema: providerRefundRefreshInputSchema,
      permission: "APPROVE",
    }),
  };
}
