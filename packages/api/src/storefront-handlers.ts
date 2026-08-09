import type { StorefrontApplicationService } from "@senvo/application";
import {
  storefrontCatalogQuerySchema,
  storefrontCheckoutInputSchema,
  storefrontProductQuerySchema,
  type StorefrontCheckoutResultContract,
} from "@senvo/contracts";
import type { StorefrontCatalog, StorefrontProduct } from "@senvo/domain";
import { createPublicApiHandler, type ApiHandler } from "./api-handler.js";

export type StorefrontApplication = Pick<
  StorefrontApplicationService,
  "checkout" | "getProduct" | "listCatalog"
>;

export type StorefrontApiHandlers = {
  checkout: ApiHandler<StorefrontCheckoutResultContract>;
  getProduct: ApiHandler<StorefrontProduct>;
  listCatalog: ApiHandler<StorefrontCatalog>;
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
  };
}
