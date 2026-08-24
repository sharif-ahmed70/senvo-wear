import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationServiceResult,
  CommerceApplicationService,
} from "@senvo/application";
import {
  commerceEmptyInputSchema,
  commerceIdInputSchema,
  createCustomerServiceInputSchema,
  createVendorServiceInputSchema,
  receivePurchaseServiceInputSchema,
  recordVendorPaymentServiceInputSchema,
  updateCustomerServiceInputSchema,
  updateVendorServiceInputSchema,
  type CustomerProfileContract,
  type CustomerSummaryContract,
  type PurchaseOrderSummaryContract,
  type VendorPaymentContract,
  type VendorSummaryContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

export type CommerceApiHandlers = {
  createCustomer: ApiHandler<CustomerSummaryContract>;
  createVendor: ApiHandler<VendorSummaryContract>;
  getCustomer: ApiHandler<CustomerProfileContract>;
  listCustomers: ApiHandler<CustomerSummaryContract[]>;
  listPurchases: ApiHandler<PurchaseOrderSummaryContract[]>;
  listVendors: ApiHandler<VendorSummaryContract[]>;
  receivePurchase: ApiHandler<PurchaseOrderSummaryContract>;
  recordVendorPayment: ApiHandler<VendorPaymentContract>;
  updateCustomer: ApiHandler<CustomerSummaryContract>;
  updateVendor: ApiHandler<VendorSummaryContract>;
};

export function createCommerceApiHandlers(dependencies: {
  application: CommerceApplicationService;
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
}): CommerceApiHandlers {
  const handler = (
    method: keyof CommerceApplicationService,
    inputSchema: Parameters<typeof createProtectedApiHandler>[0]["inputSchema"],
    action: "CREATE" | "READ" | "UPDATE",
    resource: "INVENTORY" | "SALES",
  ) =>
    createProtectedApiHandler({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) =>
        dependencies.application[method](context, input) as Promise<
          ApplicationServiceResult<unknown>
        >,
      inputSchema,
      permission: { action, resource },
    });
  return {
    createCustomer: handler(
      "createCustomer",
      createCustomerServiceInputSchema,
      "CREATE",
      "SALES",
    ),
    createVendor: handler(
      "createVendor",
      createVendorServiceInputSchema,
      "CREATE",
      "INVENTORY",
    ),
    getCustomer: handler("getCustomer", commerceIdInputSchema, "READ", "SALES"),
    listCustomers: handler(
      "listCustomers",
      commerceEmptyInputSchema,
      "READ",
      "SALES",
    ),
    listPurchases: handler(
      "listPurchases",
      commerceEmptyInputSchema,
      "READ",
      "INVENTORY",
    ),
    listVendors: handler(
      "listVendors",
      commerceEmptyInputSchema,
      "READ",
      "INVENTORY",
    ),
    receivePurchase: handler(
      "receivePurchase",
      receivePurchaseServiceInputSchema,
      "CREATE",
      "INVENTORY",
    ),
    recordVendorPayment: handler(
      "recordVendorPayment",
      recordVendorPaymentServiceInputSchema,
      "UPDATE",
      "INVENTORY",
    ),
    updateCustomer: handler(
      "updateCustomer",
      updateCustomerServiceInputSchema,
      "UPDATE",
      "SALES",
    ),
    updateVendor: handler(
      "updateVendor",
      updateVendorServiceInputSchema,
      "UPDATE",
      "INVENTORY",
    ),
  } as unknown as CommerceApiHandlers;
}
