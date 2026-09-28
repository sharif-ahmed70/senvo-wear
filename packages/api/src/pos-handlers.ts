import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  addPosCartItemServiceInputSchema,
  collectPosPaymentServiceInputSchema,
  createPaymentRefundServiceInputSchema,
  createPosReturnServiceInputSchema,
  checkoutPosCartServiceInputSchema,
  closeSalesSessionServiceInputSchema,
  closeSalesSessionWithSettlementServiceInputSchema,
  createSalesCounterServiceInputSchema,
  getSalesSessionReconciliationServiceInputSchema,
  lookupPosSaleServiceInputSchema,
  getPosCheckoutServiceInputSchema,
  getPaymentCollectionReceiptServiceInputSchema,
  getPaymentRefundReceiptServiceInputSchema,
  getPosReturnReceiptServiceInputSchema,
  getPosCartServiceInputSchema,
  openSalesSessionServiceInputSchema,
  posEmptyInputSchema,
  removePosCartItemServiceInputSchema,
  updatePosCartItemServiceInputSchema,
  updateSalesCounterStatusServiceInputSchema,
  type PosCartLineContract,
  type PosCartDetailsContract,
  type PosCheckoutContract,
  type CollectPosPaymentResultContract,
  type PaymentAccountContract,
  type PaymentCollectionReceiptContract,
  type PaymentRefundAccountContract,
  type PaymentRefundReceiptContract,
  type PaymentRefundResultContract,
  type PosRegisterSettlementContract,
  type PosReturnAccountContract,
  type PosReturnReceiptContract,
  type PosReturnResultContract,
  type PosSaleLookupContract,
  type PosSessionReconciliationSummaryContract,
  type SalesReceiptContract,
  type SalesCounterContract,
  type SalesSessionContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

export type PosApplication = {
  collectPayment(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CollectPosPaymentResultContract>>;
  createRefund(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PaymentRefundResultContract>>;
  getRefunds(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PaymentRefundAccountContract>>;
  getRefundReceipt(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PaymentRefundReceiptContract>>;
  createReturn(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosReturnResultContract>>;
  getReturns(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosReturnAccountContract>>;
  getReturnReceipt(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosReturnReceiptContract>>;
  addCartItem(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosCartLineContract>>;
  closeSession(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesSessionContract>>;
  getReconciliationSummary(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosSessionReconciliationSummaryContract>>;
  closeSessionWithSettlement(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosRegisterSettlementContract>>;
  checkoutCart(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosCheckoutContract>>;
  createCounter(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesCounterContract>>;
  listCounters(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesCounterContract[]>>;
  getCheckout(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosCheckoutContract>>;
  getCart(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosCartDetailsContract>>;
  getReceipt(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesReceiptContract>>;
  getPaymentAccount(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PaymentAccountContract>>;
  getPaymentCollectionReceipt(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PaymentCollectionReceiptContract>>;
  listCheckouts(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosCheckoutContract[]>>;
  listSessions(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesSessionContract[]>>;
  listCurrentSessions(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesSessionContract[]>>;
  lookupSale(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosSaleLookupContract>>;
  openSession(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesSessionContract>>;
  removeCartItem(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<null>>;
  updateCartItem(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosCartLineContract>>;
  updateCounterStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesCounterContract>>;
};

export type PosApiHandlers = {
  collectPayment: ApiHandler<CollectPosPaymentResultContract>;
  createRefund: ApiHandler<PaymentRefundResultContract>;
  getRefunds: ApiHandler<PaymentRefundAccountContract>;
  getRefundReceipt: ApiHandler<PaymentRefundReceiptContract>;
  createReturn: ApiHandler<PosReturnResultContract>;
  getReturns: ApiHandler<PosReturnAccountContract>;
  getReturnReceipt: ApiHandler<PosReturnReceiptContract>;
  addCartItem: ApiHandler<PosCartLineContract>;
  closeSession: ApiHandler<SalesSessionContract>;
  getReconciliationSummary: ApiHandler<PosSessionReconciliationSummaryContract>;
  closeSessionWithSettlement: ApiHandler<PosRegisterSettlementContract>;
  checkoutCart: ApiHandler<PosCheckoutContract>;
  createCounter: ApiHandler<SalesCounterContract>;
  listCounters: ApiHandler<SalesCounterContract[]>;
  getCheckout: ApiHandler<PosCheckoutContract>;
  getCart: ApiHandler<PosCartDetailsContract>;
  getReceipt: ApiHandler<SalesReceiptContract>;
  getPaymentAccount: ApiHandler<PaymentAccountContract>;
  getPaymentCollectionReceipt: ApiHandler<PaymentCollectionReceiptContract>;
  listCheckouts: ApiHandler<PosCheckoutContract[]>;
  listSessions: ApiHandler<SalesSessionContract[]>;
  listCurrentSessions: ApiHandler<SalesSessionContract[]>;
  lookupSale: ApiHandler<PosSaleLookupContract>;
  openSession: ApiHandler<SalesSessionContract>;
  removeCartItem: ApiHandler<null>;
  updateCartItem: ApiHandler<PosCartLineContract>;
  updateCounterStatus: ApiHandler<SalesCounterContract>;
};

export function createPosApiHandlers(dependencies: {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
  pos: PosApplication;
}): PosApiHandlers {
  const handler = <TInput, TOutput>(
    action: "CREATE" | "READ" | "UPDATE",
    inputSchema: Parameters<
      typeof createProtectedApiHandler<TInput, TOutput>
    >[0]["inputSchema"],
    execute: (
      context: ApplicationExecutionContext,
      input: TInput,
    ) => Promise<ApplicationServiceResult<TOutput>>,
  ) =>
    createProtectedApiHandler<TInput, TOutput>({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute,
      inputSchema,
      permission: { action, resource: "POS" },
    });
  return {
    collectPayment: createProtectedApiHandler({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) =>
        dependencies.pos.collectPayment(context, input),
      inputSchema: collectPosPaymentServiceInputSchema,
      permission: { action: "CREATE", resource: "PAYMENT" },
    }),
    createRefund: createProtectedApiHandler({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) =>
        dependencies.pos.createRefund(context, input),
      inputSchema: createPaymentRefundServiceInputSchema,
      permission: { action: "CREATE", resource: "PAYMENT" },
    }),
    getRefunds: createProtectedApiHandler({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) => dependencies.pos.getRefunds(context, input),
      inputSchema: getPosCheckoutServiceInputSchema,
      permission: { action: "READ", resource: "PAYMENT" },
    }),
    getRefundReceipt: createProtectedApiHandler({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) =>
        dependencies.pos.getRefundReceipt(context, input),
      inputSchema: getPaymentRefundReceiptServiceInputSchema,
      permission: { action: "READ", resource: "RECEIPT" },
    }),
    createReturn: handler(
      "UPDATE",
      createPosReturnServiceInputSchema,
      (context, input) => dependencies.pos.createReturn(context, input),
    ),
    getReturns: handler(
      "READ",
      getPosCheckoutServiceInputSchema,
      (context, input) => dependencies.pos.getReturns(context, input),
    ),
    getReturnReceipt: createProtectedApiHandler({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) =>
        dependencies.pos.getReturnReceipt(context, input),
      inputSchema: getPosReturnReceiptServiceInputSchema,
      permission: { action: "READ", resource: "RECEIPT" },
    }),
    addCartItem: handler(
      "CREATE",
      addPosCartItemServiceInputSchema,
      (context, input) => dependencies.pos.addCartItem(context, input),
    ),
    closeSession: handler(
      "UPDATE",
      closeSalesSessionServiceInputSchema,
      (context, input) => dependencies.pos.closeSession(context, input),
    ),
    getReconciliationSummary: handler(
      "READ",
      getSalesSessionReconciliationServiceInputSchema,
      (context, input) =>
        dependencies.pos.getReconciliationSummary(context, input),
    ),
    closeSessionWithSettlement: handler(
      "UPDATE",
      closeSalesSessionWithSettlementServiceInputSchema,
      (context, input) =>
        dependencies.pos.closeSessionWithSettlement(context, input),
    ),
    checkoutCart: handler(
      "UPDATE",
      checkoutPosCartServiceInputSchema,
      (context, input) => dependencies.pos.checkoutCart(context, input),
    ),
    createCounter: handler(
      "CREATE",
      createSalesCounterServiceInputSchema,
      (context, input) => dependencies.pos.createCounter(context, input),
    ),
    listCounters: handler("READ", posEmptyInputSchema, (context, input) =>
      dependencies.pos.listCounters(context, input),
    ),
    getCheckout: handler(
      "READ",
      getPosCheckoutServiceInputSchema,
      (context, input) => dependencies.pos.getCheckout(context, input),
    ),
    getCart: handler("READ", getPosCartServiceInputSchema, (context, input) =>
      dependencies.pos.getCart(context, input),
    ),
    getReceipt: createProtectedApiHandler({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) => dependencies.pos.getReceipt(context, input),
      inputSchema: getPosCheckoutServiceInputSchema,
      permission: { action: "READ", resource: "RECEIPT" },
    }),
    getPaymentAccount: createProtectedApiHandler({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) =>
        dependencies.pos.getPaymentAccount(context, input),
      inputSchema: getPosCheckoutServiceInputSchema,
      permission: { action: "READ", resource: "PAYMENT" },
    }),
    getPaymentCollectionReceipt: createProtectedApiHandler({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) =>
        dependencies.pos.getPaymentCollectionReceipt(context, input),
      inputSchema: getPaymentCollectionReceiptServiceInputSchema,
      permission: { action: "READ", resource: "RECEIPT" },
    }),
    listCheckouts: handler("READ", posEmptyInputSchema, (context, input) =>
      dependencies.pos.listCheckouts(context, input),
    ),
    listSessions: handler("READ", posEmptyInputSchema, (context, input) =>
      dependencies.pos.listSessions(context, input),
    ),
    listCurrentSessions: handler(
      "READ",
      posEmptyInputSchema,
      (context, input) => dependencies.pos.listCurrentSessions(context, input),
    ),
    lookupSale: handler(
      "READ",
      lookupPosSaleServiceInputSchema,
      (context, input) => dependencies.pos.lookupSale(context, input),
    ),
    openSession: handler(
      "CREATE",
      openSalesSessionServiceInputSchema,
      (context, input) => dependencies.pos.openSession(context, input),
    ),
    removeCartItem: handler(
      "UPDATE",
      removePosCartItemServiceInputSchema,
      (context, input) => dependencies.pos.removeCartItem(context, input),
    ),
    updateCartItem: handler(
      "UPDATE",
      updatePosCartItemServiceInputSchema,
      (context, input) => dependencies.pos.updateCartItem(context, input),
    ),
    updateCounterStatus: handler(
      "UPDATE",
      updateSalesCounterStatusServiceInputSchema,
      (context, input) => dependencies.pos.updateCounterStatus(context, input),
    ),
  };
}
