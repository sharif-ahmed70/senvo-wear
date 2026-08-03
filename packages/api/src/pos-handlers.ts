import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  addPosCartItemServiceInputSchema,
  checkoutPosCartServiceInputSchema,
  closeSalesSessionServiceInputSchema,
  createSalesCounterServiceInputSchema,
  lookupPosSaleServiceInputSchema,
  getPosCheckoutServiceInputSchema,
  openSalesSessionServiceInputSchema,
  posEmptyInputSchema,
  removePosCartItemServiceInputSchema,
  updatePosCartItemServiceInputSchema,
  updateSalesCounterStatusServiceInputSchema,
  type PosCartLineContract,
  type PosCheckoutContract,
  type PosSaleLookupContract,
  type SalesCounterContract,
  type SalesSessionContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

export type PosApplication = {
  addCartItem(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosCartLineContract>>;
  closeSession(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesSessionContract>>;
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
  listCheckouts(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PosCheckoutContract[]>>;
  listSessions(
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
  addCartItem: ApiHandler<PosCartLineContract>;
  closeSession: ApiHandler<SalesSessionContract>;
  checkoutCart: ApiHandler<PosCheckoutContract>;
  createCounter: ApiHandler<SalesCounterContract>;
  listCounters: ApiHandler<SalesCounterContract[]>;
  getCheckout: ApiHandler<PosCheckoutContract>;
  listCheckouts: ApiHandler<PosCheckoutContract[]>;
  listSessions: ApiHandler<SalesSessionContract[]>;
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
    listCheckouts: handler("READ", posEmptyInputSchema, (context, input) =>
      dependencies.pos.listCheckouts(context, input),
    ),
    listSessions: handler("READ", posEmptyInputSchema, (context, input) =>
      dependencies.pos.listSessions(context, input),
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
