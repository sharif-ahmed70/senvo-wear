import type { StorefrontApplicationService } from "@senvo/application";
import {
  storefrontCatalogQuerySchema,
  storefrontCheckoutInputSchema,
  storefrontPaymentOptionsInputSchema,
  storefrontPaymentRetryInputSchema,
  storefrontPaymentStatusInputSchema,
  providerNotificationInputSchema,
  storefrontProductQuerySchema,
  type ProviderNotificationResultContract,
  type StorefrontCheckoutResultContract,
  type StorefrontPaymentOptionsResultContract,
  type StorefrontPaymentStatusResultContract,
} from "@senvo/contracts";
import type { StorefrontCatalog, StorefrontProduct } from "@senvo/domain";
import { createPublicApiHandler, type ApiHandler } from "./api-handler.js";

export type StorefrontApplication = Pick<
  StorefrontApplicationService,
  | "checkout"
  | "getProduct"
  | "listCatalog"
  | "paymentNotification"
  | "paymentOptions"
  | "paymentStatus"
  | "retryPayment"
>;

export type StorefrontApiHandlers = {
  checkout: ApiHandler<StorefrontCheckoutResultContract>;
  getProduct: ApiHandler<StorefrontProduct>;
  listCatalog: ApiHandler<StorefrontCatalog>;
  paymentNotification: ApiHandler<ProviderNotificationResultContract>;
  paymentOptions: ApiHandler<StorefrontPaymentOptionsResultContract>;
  paymentStatus: ApiHandler<StorefrontPaymentStatusResultContract>;
  retryPayment: ApiHandler<StorefrontPaymentStatusResultContract>;
};

export function createStorefrontApiHandlers(
  application: StorefrontApplication,
): StorefrontApiHandlers {
  return {
    checkout: createPublicApiHandler({
      execute: (requestId, input) => application.checkout(requestId, input),
      inputSchema: storefrontCheckoutInputSchema,
    }),
    getProduct: createPublicApiHandler({
      execute: (requestId, input) => application.getProduct(requestId, input),
      inputSchema: storefrontProductQuerySchema,
    }),
    listCatalog: createPublicApiHandler({
      execute: (requestId, input) => application.listCatalog(requestId, input),
      inputSchema: storefrontCatalogQuerySchema,
    }),
    paymentNotification: createPublicApiHandler({
      execute: (requestId, input) =>
        application.paymentNotification(requestId, input),
      inputSchema: providerNotificationInputSchema,
    }),
    paymentOptions: createPublicApiHandler({
      execute: (requestId) => application.paymentOptions(requestId),
      inputSchema: storefrontPaymentOptionsInputSchema,
    }),
    paymentStatus: createPublicApiHandler({
      execute: (requestId, input) =>
        application.paymentStatus(requestId, input),
      inputSchema: storefrontPaymentStatusInputSchema,
    }),
    retryPayment: createPublicApiHandler({
      execute: (requestId, input) => application.retryPayment(requestId, input),
      inputSchema: storefrontPaymentRetryInputSchema,
    }),
  };
}
