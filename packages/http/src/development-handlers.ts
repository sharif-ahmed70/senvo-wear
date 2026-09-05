import {
  createCatalogApiHandlers,
  createInventoryReadApiHandlers,
  createOnlinePaymentApiHandlers,
  createOrganizationManagementApiHandlers,
  createPosApiHandlers,
  createPostInventoryMovementApiHandler,
  createSalesOrderApiHandler,
  createSalesOrderManagementApiHandlers,
  createSalesSourceApiHandlers,
  createStorefrontApiHandlers,
} from "@senvo/api";
import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationServices,
} from "@senvo/application";
import type { SenvoHttpHandlers } from "./node-http-adapter.js";

export type DevelopmentApiHandlerOptions = {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
  services: ApplicationServices;
};

export function createDevelopmentApiHandlers(
  options: DevelopmentApiHandlerOptions,
): SenvoHttpHandlers {
  return {
    catalog: createCatalogApiHandlers({
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      catalog: options.services.catalog,
    }),
    createSalesOrder: createSalesOrderApiHandler({
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      sales: options.services.sales,
    }),
    inventoryRead: createInventoryReadApiHandlers({
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      inventory: options.services.inventory,
    }),
    organizationManagement: createOrganizationManagementApiHandlers({
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      organization: options.services.organization,
    }),
    pos: createPosApiHandlers({
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      pos: options.services.pos,
    }),
    postInventoryMovement: createPostInventoryMovementApiHandler({
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      inventory: options.services.inventory,
    }),
    salesManagement: createSalesOrderManagementApiHandlers({
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      sales: options.services.sales,
    }),
    salesSource: createSalesSourceApiHandlers({
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      sales: options.services.sales,
    }),
    storefront: createStorefrontApiHandlers(options.services.storefront),
    ...(options.services.onlinePayments
      ? {
          onlinePayments: createOnlinePaymentApiHandlers({
            application: options.services.onlinePayments,
            authenticationService: options.authenticationService,
            authorizationService: options.authorizationService,
          }),
        }
      : {}),
  };
}
