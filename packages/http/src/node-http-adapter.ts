import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
  type ServerResponse,
} from "node:http";
import type {
  ApiHandler,
  CatalogApiHandlers,
  InventoryReadApiHandlers,
  OrganizationManagementApiHandlers,
  OnlinePaymentApiHandlers,
  PosApiHandlers,
  ProcurementApiHandlers,
  SalesOrderManagementApiHandlers,
  SalesSourceApiHandlers,
  StorefrontApiHandlers,
} from "@senvo/api";
import {
  createApiFailure,
  type ApiFailure,
  type ApiResponse,
} from "@senvo/contracts";
import {
  headerValue,
  HttpRequestContextError,
  type HttpRequestContextFactory,
} from "./request-context.js";
import {
  DefaultRequestIdFactory,
  type RequestIdFactory,
} from "./request-id.js";
import {
  applySecurityHeaders,
  defaultHttpSecurityHeaders,
  type HttpSecurityHeaders,
} from "./security-headers.js";

const defaultMaximumBodyBytes = 1_048_576;

type HttpRoute = {
  bodyType?: "form" | "json";
  handler: ApiHandler<unknown>;
  input(
    body: unknown,
    match: RegExpMatchArray,
    request: IncomingMessage,
  ): unknown;
  maximumBodyBytes?: number;
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  path: RegExp;
  successStatus: number;
  public?: boolean;
};

export type SenvoHttpHandlers = {
  catalog?: CatalogApiHandlers;
  createSalesOrder: ApiHandler<unknown>;
  inventoryRead?: InventoryReadApiHandlers;
  organizationManagement?: OrganizationManagementApiHandlers;
  onlinePayments?: OnlinePaymentApiHandlers;
  pos?: PosApiHandlers;
  procurement?: ProcurementApiHandlers;
  createInventoryMovementDraft?: ApiHandler<unknown>;
  postInventoryMovement: ApiHandler<unknown>;
  salesManagement?: SalesOrderManagementApiHandlers;
  salesSource?: SalesSourceApiHandlers;
  storefront?: StorefrontApiHandlers;
};

export type NodeHttpAdapterOptions = {
  contextFactory: HttpRequestContextFactory;
  handlers: SenvoHttpHandlers;
  maximumBodyBytes?: number;
  requestIdFactory?: RequestIdFactory;
  securityHeaders?: HttpSecurityHeaders;
};

export function createSenvoHttpServer(options: NodeHttpAdapterOptions): Server {
  return createServer(createSenvoHttpRequestListener(options));
}

export function createSenvoHttpRequestListener(
  options: NodeHttpAdapterOptions,
): RequestListener {
  const requestIdFactory =
    options.requestIdFactory ?? new DefaultRequestIdFactory();
  const securityHeaders = options.securityHeaders ?? defaultHttpSecurityHeaders;
  const maximumBodyBytes = options.maximumBodyBytes ?? defaultMaximumBodyBytes;
  const routes = createRoutes(options.handlers);

  return (request, response) => {
    void handleRequest({
      contextFactory: options.contextFactory,
      maximumBodyBytes,
      request,
      requestIdFactory,
      response,
      routes,
      securityHeaders,
    });
  };
}

async function handleRequest(input: {
  contextFactory: HttpRequestContextFactory;
  maximumBodyBytes: number;
  request: IncomingMessage;
  requestIdFactory: RequestIdFactory;
  response: ServerResponse;
  routes: readonly HttpRoute[];
  securityHeaders: HttpSecurityHeaders;
}): Promise<void> {
  const requestId = input.requestIdFactory.create(
    headerValue(input.request.headers, "x-request-id"),
  );
  applySecurityHeaders(input.response, input.securityHeaders);

  try {
    const matchedRoute = matchRoute(input.routes, input.request);
    if (!matchedRoute) {
      writeJson(
        input.response,
        routeFailure(input.routes, input.request, requestId),
      );
      return;
    }
    const requestContext = matchedRoute.route.public
      ? {
          authenticatedUser: null,
          organizationId: "",
          permissions: [],
          requestId,
        }
      : await input.contextFactory.create({
          headers: input.request.headers,
          requestId,
        });
    const body =
      input.request.method === "GET"
        ? {}
        : matchedRoute.route.bodyType === "form"
          ? await readFormBody(
              input.request,
              matchedRoute.route.maximumBodyBytes ?? input.maximumBodyBytes,
            )
          : await readJsonBody(
              input.request,
              matchedRoute.route.maximumBodyBytes ?? input.maximumBodyBytes,
            );
    const apiResponse = await matchedRoute.route.handler.handle({
      context: requestContext,
      input: matchedRoute.route.input(body, matchedRoute.match, input.request),
    });
    writeJson(
      input.response,
      apiResponse,
      apiResponse.success
        ? matchedRoute.route.successStatus
        : statusForFailure(apiResponse),
    );
  } catch (error) {
    writeAdapterFailure(input.response, error, requestId);
  }
}

function createRoutes(handlers: SenvoHttpHandlers): readonly HttpRoute[] {
  const routes: HttpRoute[] = [
    {
      handler: handlers.createSalesOrder,
      input: bodyInput,
      method: "POST",
      path: /^\/sales-orders$/u,
      successStatus: 201,
    },
    {
      handler: handlers.postInventoryMovement,
      input: bodyInput,
      method: "POST",
      path: /^\/inventory\/movements$/u,
      successStatus: 200,
    },
    ...(handlers.createInventoryMovementDraft
      ? [
          {
            handler: handlers.createInventoryMovementDraft,
            input: bodyInput,
            method: "POST" as const,
            path: /^\/inventory\/movement-drafts$/u,
            successStatus: 201,
          },
        ]
      : []),
  ];
  if (handlers.catalog) {
    routes.push(
      catalogRoute(
        "GET",
        /^\/catalog\/categories$/u,
        handlers.catalog.listCategories,
      ),
      catalogRoute(
        "POST",
        /^\/catalog\/categories$/u,
        handlers.catalog.createCategory,
        201,
      ),
      catalogRoute(
        "GET",
        /^\/catalog\/collections\/(?<id>[0-9a-f-]+)\/products$/iu,
        handlers.catalog.listCollectionProducts,
        200,
        "collectionId",
      ),
      catalogRoute(
        "PATCH",
        /^\/catalog\/categories\/(?<id>[0-9a-f-]+)\/status$/iu,
        handlers.catalog.updateCategoryStatus,
        200,
        "categoryId",
      ),
      catalogRoute(
        "GET",
        /^\/catalog\/collections$/u,
        handlers.catalog.listCollections,
      ),
      catalogRoute(
        "POST",
        /^\/catalog\/collections$/u,
        handlers.catalog.createCollection,
        201,
      ),
      catalogRoute("GET", /^\/catalog\/colors$/u, handlers.catalog.listColors),
      catalogRoute(
        "POST",
        /^\/catalog\/colors$/u,
        handlers.catalog.createColor,
        201,
      ),
      catalogRoute(
        "PATCH",
        /^\/catalog\/colors\/(?<id>[0-9a-f-]+)\/status$/iu,
        handlers.catalog.updateColorStatus,
        200,
        "colorId",
      ),
      catalogRoute("GET", /^\/catalog\/sizes$/u, handlers.catalog.listSizes),
      catalogRoute(
        "POST",
        /^\/catalog\/sizes$/u,
        handlers.catalog.createSize,
        201,
      ),
      catalogRoute(
        "PATCH",
        /^\/catalog\/sizes\/(?<id>[0-9a-f-]+)\/status$/iu,
        handlers.catalog.updateSizeStatus,
        200,
        "sizeId",
      ),
      catalogRoute(
        "GET",
        /^\/catalog\/products$/u,
        handlers.catalog.listProducts,
      ),
      catalogRoute(
        "POST",
        /^\/catalog\/products$/u,
        handlers.catalog.createProduct,
        201,
      ),
      catalogRoute(
        "GET",
        /^\/catalog\/products\/(?<id>[0-9a-f-]+)$/iu,
        handlers.catalog.getProduct,
        200,
        "productId",
      ),
      catalogRoute(
        "GET",
        /^\/catalog\/products\/(?<id>[0-9a-f-]+)\/primary-image$/iu,
        handlers.catalog.getPrimaryProductImage,
        200,
        "productId",
      ),
      {
        handler: handlers.catalog.setPrimaryProductImage,
        input: pathBodyInput("productId"),
        maximumBodyBytes: 7_100_000,
        method: "PUT",
        path: /^\/catalog\/products\/(?<id>[0-9a-f-]+)\/primary-image$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.catalog.removePrimaryProductImage,
        input: pathBodyInput("productId"),
        method: "DELETE",
        path: /^\/catalog\/products\/(?<id>[0-9a-f-]+)\/primary-image$/iu,
        successStatus: 200,
      },
      catalogRoute(
        "GET",
        /^\/catalog\/products\/(?<id>[0-9a-f-]+)\/media$/iu,
        handlers.catalog.listProductMedia,
        200,
        "productId",
      ),
      {
        handler: handlers.catalog.addProductMedia,
        input: pathBodyInput("productId"),
        maximumBodyBytes: 7_100_000,
        method: "POST",
        path: /^\/catalog\/products\/(?<id>[0-9a-f-]+)\/media$/iu,
        successStatus: 201,
      },
      productMediaRoute(
        "PATCH",
        /^\/catalog\/products\/(?<productId>[0-9a-f-]+)\/media\/reorder$/iu,
        handlers.catalog.reorderProductMedia,
      ),
      productMediaRoute(
        "PATCH",
        /^\/catalog\/products\/(?<productId>[0-9a-f-]+)\/media\/(?<linkId>[0-9a-f-]+)\/primary$/iu,
        handlers.catalog.setExistingPrimary,
      ),
      productMediaRoute(
        "PATCH",
        /^\/catalog\/products\/(?<productId>[0-9a-f-]+)\/media\/(?<linkId>[0-9a-f-]+)$/iu,
        handlers.catalog.updateProductMedia,
      ),
      productMediaRoute(
        "DELETE",
        /^\/catalog\/products\/(?<productId>[0-9a-f-]+)\/media\/(?<linkId>[0-9a-f-]+)$/iu,
        handlers.catalog.archiveProductMedia,
      ),
      productMediaRoute(
        "PATCH",
        /^\/catalog\/collections\/(?<collectionId>[0-9a-f-]+)\/products\/reorder$/iu,
        handlers.catalog.reorderCollectionProducts,
      ),
      catalogRoute(
        "GET",
        /^\/catalog\/variants\/(?<id>[0-9a-f-]+)\/barcodes$/iu,
        handlers.catalog.listVariantBarcodes,
        200,
        "variantId",
      ),
      catalogRoute(
        "POST",
        /^\/catalog\/variants\/(?<id>[0-9a-f-]+)\/barcodes$/iu,
        handlers.catalog.createVariantBarcode,
        201,
        "variantId",
      ),
      catalogRoute(
        "PATCH",
        /^\/catalog\/barcodes\/(?<id>[0-9a-f-]+)\/status$/iu,
        handlers.catalog.updateBarcodeStatus,
        200,
        "barcodeId",
      ),
      {
        handler: handlers.catalog.lookupBarcode,
        input: barcodeLookupInput,
        method: "GET",
        path: /^\/catalog\/barcodes\/lookup\/(?<value>[^/]+)$/u,
        successStatus: 200,
      },
      catalogRoute(
        "GET",
        /^\/catalog\/products\/(?<id>[0-9a-f-]+)\/variants$/iu,
        handlers.catalog.listVariants,
        200,
        "productId",
      ),
      catalogRoute(
        "POST",
        /^\/catalog\/products\/(?<id>[0-9a-f-]+)\/variants$/iu,
        handlers.catalog.createVariant,
        201,
        "productId",
      ),
      catalogRoute(
        "PATCH",
        /^\/catalog\/variants\/(?<id>[0-9a-f-]+)\/price$/iu,
        handlers.catalog.updateVariantPrice,
        200,
        "variantId",
      ),
    );
  }
  if (handlers.storefront) {
    routes.push(
      {
        handler: handlers.storefront.listCatalog,
        input: queryInput,
        method: "GET",
        path: /^\/storefront\/catalog$/u,
        public: true,
        successStatus: 200,
      },
      {
        handler: handlers.storefront.getProduct,
        input: (_body, match) => ({
          slug: decodeURIComponent(match.groups?.slug ?? ""),
        }),
        method: "GET",
        path: /^\/storefront\/products\/(?<slug>[a-z0-9-]+)$/u,
        public: true,
        successStatus: 200,
      },
      {
        handler: handlers.storefront.checkout,
        input: bodyInput,
        method: "POST",
        path: /^\/storefront\/checkouts$/u,
        public: true,
        successStatus: 201,
      },
      {
        handler: handlers.storefront.paymentOptions,
        input: () => ({}),
        method: "GET",
        path: /^\/storefront\/payment-options$/u,
        public: true,
        successStatus: 200,
      },
      {
        handler: handlers.storefront.paymentStatus,
        input: (_body, match) => ({ publicToken: match.groups?.token }),
        method: "GET",
        path: /^\/storefront\/payments\/(?<token>[A-Za-z0-9_-]{32,64})$/u,
        public: true,
        successStatus: 200,
      },
      {
        handler: handlers.storefront.retryPayment,
        input: pathBodyInput("publicToken", "token"),
        method: "POST",
        path: /^\/storefront\/payments\/(?<token>[A-Za-z0-9_-]{32,64})\/retry$/u,
        public: true,
        successStatus: 200,
      },
      {
        bodyType: "form",
        handler: handlers.storefront.paymentNotification,
        input: bodyInput,
        maximumBodyBytes: 65_536,
        method: "POST",
        path: /^\/payments\/providers\/sslcommerz\/ipn$/u,
        public: true,
        successStatus: 200,
      },
    );
  }
  if (handlers.onlinePayments) {
    routes.push(
      {
        handler: handlers.onlinePayments.getOrderPayment,
        input: (_body, match) => ({ salesOrderId: match.groups?.id }),
        method: "GET",
        path: /^\/sales-orders\/(?<id>[0-9a-f-]+)\/payment$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.onlinePayments.reconcile,
        input: (_body, match) => ({ paymentAttemptId: match.groups?.id }),
        method: "POST",
        path: /^\/payments\/attempts\/(?<id>[0-9a-f-]+)\/reconcile$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.onlinePayments.refund,
        input: pathBodyInput("paymentAttemptId"),
        method: "POST",
        path: /^\/payments\/attempts\/(?<id>[0-9a-f-]+)\/refunds$/iu,
        successStatus: 201,
      },
      {
        handler: handlers.onlinePayments.refreshRefund,
        input: (_body, match) => ({ providerRefundId: match.groups?.id }),
        method: "POST",
        path: /^\/payments\/refunds\/(?<id>[0-9a-f-]+)\/refresh$/iu,
        successStatus: 200,
      },
    );
  }
  if (handlers.inventoryRead) {
    routes.push(
      {
        handler: handlers.inventoryRead.listAvailability,
        input: queryInput,
        method: "GET",
        path: /^\/inventory\/availability$/u,
        successStatus: 200,
      },
      {
        handler: handlers.inventoryRead.listLocations,
        input: queryInput,
        method: "GET",
        path: /^\/inventory\/locations$/u,
        successStatus: 200,
      },
      {
        handler: handlers.inventoryRead.listMovements,
        input: queryInput,
        method: "GET",
        path: /^\/inventory\/movements$/u,
        successStatus: 200,
      },
      {
        handler: handlers.inventoryRead.getVariantAvailability,
        input: variantAvailabilityInput,
        method: "GET",
        path: /^\/inventory\/variants\/(?<id>[0-9a-f-]+)\/availability$/iu,
        successStatus: 200,
      },
    );
  }
  if (handlers.organizationManagement) {
    const organization = handlers.organizationManagement;
    routes.push(
      organizationRoute("GET", /^\/organization$/u, organization.getProfile),
      organizationRoute(
        "PATCH",
        /^\/organization$/u,
        organization.updateProfile,
      ),
      organizationRoute(
        "GET",
        /^\/organization\/stores$/u,
        organization.listStores,
      ),
      organizationRoute(
        "POST",
        /^\/organization\/stores$/u,
        organization.createStore,
        201,
      ),
      organizationRoute(
        "PATCH",
        /^\/organization\/stores\/(?<id>[0-9a-f-]+)$/iu,
        organization.updateStore,
        200,
        "storeId",
      ),
      organizationRoute(
        "PATCH",
        /^\/organization\/stores\/(?<id>[0-9a-f-]+)\/status$/iu,
        organization.updateStoreStatus,
        200,
        "storeId",
      ),
      organizationRoute(
        "GET",
        /^\/organization\/team$/u,
        organization.listTeam,
      ),
      organizationRoute(
        "POST",
        /^\/organization\/team$/u,
        organization.createTeamMember,
        201,
      ),
      organizationRoute(
        "PATCH",
        /^\/organization\/team\/(?<id>[0-9a-f-]+)\/status$/iu,
        organization.updateTeamMemberStatus,
        200,
        "teamMemberId",
      ),
      organizationRoute(
        "PATCH",
        /^\/organization\/team\/(?<id>[0-9a-f-]+)\/role$/iu,
        organization.assignTeamMemberRole,
        200,
        "teamMemberId",
      ),
      organizationRoute(
        "GET",
        /^\/organization\/roles$/u,
        organization.listRoles,
      ),
    );
  }
  if (handlers.salesManagement) {
    routes.push(
      {
        handler: handlers.salesManagement.list,
        input: queryInput,
        method: "GET",
        path: /^\/sales\/orders$/u,
        successStatus: 200,
      },
      {
        handler: handlers.salesManagement.getDetails,
        input: salesOrderPathQueryInput,
        method: "GET",
        path: /^\/sales\/orders\/(?<id>[0-9a-f-]+)$/iu,
        successStatus: 200,
      },
      salesActionRoute(
        /^\/sales\/orders\/(?<id>[0-9a-f-]+)\/reserve$/iu,
        handlers.salesManagement.reserve,
      ),
      salesActionRoute(
        /^\/sales\/orders\/(?<id>[0-9a-f-]+)\/confirm$/iu,
        handlers.salesManagement.confirm,
      ),
      salesActionRoute(
        /^\/sales\/orders\/(?<id>[0-9a-f-]+)\/fulfill$/iu,
        handlers.salesManagement.fulfill,
      ),
      salesActionRoute(
        /^\/sales\/orders\/(?<id>[0-9a-f-]+)\/cancel$/iu,
        handlers.salesManagement.cancel,
      ),
    );
  }
  if (handlers.salesSource) {
    routes.push(
      {
        handler: handlers.salesSource.listBooths,
        input: emptyInput,
        method: "GET",
        path: /^\/sales\/booths$/u,
        successStatus: 200,
      },
      {
        handler: handlers.salesSource.createBooth,
        input: bodyInput,
        method: "POST",
        path: /^\/sales\/booths$/u,
        successStatus: 201,
      },
      {
        handler: handlers.salesSource.updateBoothStatus,
        input: boothStatusInput,
        method: "PATCH",
        path: /^\/sales\/booths\/(?<id>[0-9a-f-]+)\/status$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.salesSource.getSummary,
        input: emptyInput,
        method: "GET",
        path: /^\/sales\/sources\/summary$/u,
        successStatus: 200,
      },
    );
  }
  if (handlers.pos) {
    routes.push(
      {
        handler: handlers.pos.listCounters,
        input: emptyInput,
        method: "GET",
        path: /^\/pos\/counters$/u,
        successStatus: 200,
      },
      {
        handler: handlers.pos.createCounter,
        input: bodyInput,
        method: "POST",
        path: /^\/pos\/counters$/u,
        successStatus: 201,
      },
      {
        handler: handlers.pos.updateCounterStatus,
        input: pathBodyInput("counterId"),
        method: "PATCH",
        path: /^\/pos\/counters\/(?<id>[0-9a-f-]+)\/status$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.listCurrentSessions,
        input: emptyInput,
        method: "GET",
        path: /^\/pos\/sessions\/current$/u,
        successStatus: 200,
      },
      {
        handler: handlers.pos.listSessions,
        input: emptyInput,
        method: "GET",
        path: /^\/pos\/sessions$/u,
        successStatus: 200,
      },
      {
        handler: handlers.pos.openSession,
        input: bodyInput,
        method: "POST",
        path: /^\/pos\/sessions\/open$/u,
        successStatus: 201,
      },
      {
        handler: handlers.pos.closeSession,
        input: pathBodyInput("sessionId"),
        method: "POST",
        path: /^\/pos\/sessions\/(?<id>[0-9a-f-]+)\/close$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.lookupSale,
        input: (_body, match) => ({
          value: decodeURIComponent(match.groups?.value ?? ""),
        }),
        method: "GET",
        path: /^\/pos\/barcode\/(?<value>[^/]+)$/u,
        successStatus: 200,
      },
      {
        handler: handlers.pos.listCheckouts,
        input: emptyInput,
        method: "GET",
        path: /^\/pos\/checkouts$/u,
        successStatus: 200,
      },
      {
        handler: handlers.pos.getReceipt,
        input: (_body, match) => ({ checkoutId: match.groups?.id }),
        method: "GET",
        path: /^\/pos\/checkouts\/(?<id>[0-9a-f-]+)\/receipt$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.getPaymentAccount,
        input: (_body, match) => ({ checkoutId: match.groups?.id }),
        method: "GET",
        path: /^\/pos\/checkouts\/(?<id>[0-9a-f-]+)\/payments$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.collectPayment,
        input: pathBodyInput("checkoutId"),
        method: "POST",
        path: /^\/pos\/checkouts\/(?<id>[0-9a-f-]+)\/payment-collections$/iu,
        successStatus: 201,
      },
      {
        handler: handlers.pos.getPaymentCollectionReceipt,
        input: (_body, match) => ({ collectionId: match.groups?.id }),
        method: "GET",
        path: /^\/pos\/payment-collections\/(?<id>[0-9a-f-]+)\/receipt$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.getRefunds,
        input: (_body, match) => ({ checkoutId: match.groups?.id }),
        method: "GET",
        path: /^\/pos\/checkouts\/(?<id>[0-9a-f-]+)\/refunds$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.createRefund,
        input: pathBodyInput("checkoutId"),
        method: "POST",
        path: /^\/pos\/checkouts\/(?<id>[0-9a-f-]+)\/refunds$/iu,
        successStatus: 201,
      },
      {
        handler: handlers.pos.getRefundReceipt,
        input: (_body, match) => ({ refundId: match.groups?.id }),
        method: "GET",
        path: /^\/pos\/refunds\/(?<id>[0-9a-f-]+)\/receipt$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.getReturns,
        input: (_body, match) => ({ checkoutId: match.groups?.id }),
        method: "GET",
        path: /^\/pos\/checkouts\/(?<id>[0-9a-f-]+)\/returns$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.createReturn,
        input: pathBodyInput("checkoutId"),
        method: "POST",
        path: /^\/pos\/checkouts\/(?<id>[0-9a-f-]+)\/returns$/iu,
        successStatus: 201,
      },
      {
        handler: handlers.pos.getReturnReceipt,
        input: (_body, match) => ({ returnId: match.groups?.id }),
        method: "GET",
        path: /^\/pos\/returns\/(?<id>[0-9a-f-]+)\/receipt$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.getCheckout,
        input: (_body, match) => ({ checkoutId: match.groups?.id }),
        method: "GET",
        path: /^\/pos\/checkouts\/(?<id>[0-9a-f-]+)$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.getCart,
        input: (_body, match) => ({ cartId: match.groups?.id }),
        method: "GET",
        path: /^\/pos\/carts\/(?<id>[0-9a-f-]+)$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.checkoutCart,
        input: pathBodyInput("cartId"),
        method: "POST",
        path: /^\/pos\/carts\/(?<id>[0-9a-f-]+)\/checkout$/iu,
        successStatus: 201,
      },
      {
        handler: handlers.pos.addCartItem,
        input: pathBodyInput("cartId"),
        method: "POST",
        path: /^\/pos\/carts\/(?<id>[0-9a-f-]+)\/items$/iu,
        successStatus: 201,
      },
      {
        handler: handlers.pos.updateCartItem,
        input: (body, match) => ({
          ...(isObject(body) ? body : {}),
          cartId: match.groups?.cartId,
          itemId: match.groups?.itemId,
        }),
        method: "PATCH",
        path: /^\/pos\/carts\/(?<cartId>[0-9a-f-]+)\/items\/(?<itemId>[0-9a-f-]+)$/iu,
        successStatus: 200,
      },
      {
        handler: handlers.pos.removeCartItem,
        input: (_body, match) => ({
          cartId: match.groups?.cartId,
          itemId: match.groups?.itemId,
        }),
        method: "DELETE",
        path: /^\/pos\/carts\/(?<cartId>[0-9a-f-]+)\/items\/(?<itemId>[0-9a-f-]+)$/iu,
        successStatus: 200,
      },
    );
  }
  if (handlers.procurement) {
    const procurement = handlers.procurement;
    routes.push(
      {
        handler: procurement.listSuppliers,
        input: queryInput,
        method: "GET",
        path: /^\/procurement\/suppliers$/u,
        successStatus: 200,
      },
      {
        handler: procurement.createSupplier,
        input: bodyInput,
        method: "POST",
        path: /^\/procurement\/suppliers$/u,
        successStatus: 201,
      },
      {
        handler: procurement.getSupplier,
        input: (_body, match) => ({ supplierId: match.groups?.id }),
        method: "GET",
        path: /^\/procurement\/suppliers\/(?<id>[0-9a-f-]+)$/iu,
        successStatus: 200,
      },
      {
        handler: procurement.updateSupplier,
        input: pathBodyInput("supplierId"),
        method: "PATCH",
        path: /^\/procurement\/suppliers\/(?<id>[0-9a-f-]+)$/iu,
        successStatus: 200,
      },
      {
        handler: procurement.deactivateSupplier,
        input: (_body, match) => ({ supplierId: match.groups?.id }),
        method: "POST",
        path: /^\/procurement\/suppliers\/(?<id>[0-9a-f-]+)\/deactivate$/iu,
        successStatus: 200,
      },
      {
        handler: procurement.deactivateSupplier,
        input: (_body, match) => ({ supplierId: match.groups?.id }),
        method: "DELETE",
        path: /^\/procurement\/suppliers\/(?<id>[0-9a-f-]+)$/iu,
        successStatus: 200,
      },
      {
        handler: procurement.listPurchases,
        input: queryInput,
        method: "GET",
        path: /^\/procurement\/purchases$/u,
        successStatus: 200,
      },
      {
        handler: procurement.createPurchaseDraft,
        input: bodyInput,
        method: "POST",
        path: /^\/procurement\/purchases$/u,
        successStatus: 201,
      },
      {
        handler: procurement.getPurchase,
        input: (_body, match) => ({ purchaseId: match.groups?.id }),
        method: "GET",
        path: /^\/procurement\/purchases\/(?<id>[0-9a-f-]+)$/iu,
        successStatus: 200,
      },
      {
        handler: procurement.confirmPurchase,
        input: pathBodyInput("purchaseId"),
        method: "POST",
        path: /^\/procurement\/purchases\/(?<id>[0-9a-f-]+)\/confirm$/iu,
        successStatus: 200,
      },
      {
        handler: procurement.getSupplierBalance,
        input: (_body, match) => ({ supplierId: match.groups?.id }),
        method: "GET",
        path: /^\/procurement\/suppliers\/(?<id>[0-9a-f-]+)\/balance$/iu,
        successStatus: 200,
      },
      {
        handler: procurement.listSupplierLedger,
        input: supplierLedgerInput,
        method: "GET",
        path: /^\/procurement\/suppliers\/(?<id>[0-9a-f-]+)\/ledger$/iu,
        successStatus: 200,
      },
      {
        handler: procurement.listSupplierPayments,
        input: queryInput,
        method: "GET",
        path: /^\/procurement\/payments$/u,
        successStatus: 200,
      },
      {
        handler: procurement.recordSupplierPayment,
        input: bodyInput,
        method: "POST",
        path: /^\/procurement\/payments$/u,
        successStatus: 201,
      },
      {
        handler: procurement.recordSupplierAdjustment,
        input: pathBodyInput("supplierId"),
        method: "POST",
        path: /^\/procurement\/suppliers\/(?<id>[0-9a-f-]+)\/adjustments$/iu,
        successStatus: 201,
      },
    );
  }
  return routes;
}

function pathBodyInput(field: string, pathGroup = "id"): HttpRoute["input"] {
  return (body, match) => ({
    ...(isObject(body) ? body : {}),
    [field]: match.groups?.[pathGroup],
  });
}

function productMediaRoute(
  method: HttpRoute["method"],
  path: RegExp,
  handler: ApiHandler<unknown>,
): HttpRoute {
  return {
    handler,
    input: (body, match) => ({
      ...(isObject(body) ? body : {}),
      ...match.groups,
    }),
    method,
    path,
    successStatus: 200,
  };
}

function organizationRoute(
  method: HttpRoute["method"],
  path: RegExp,
  handler: ApiHandler<unknown>,
  successStatus = 200,
  pathIdField?: "storeId" | "teamMemberId",
): HttpRoute {
  return {
    handler,
    input: (body, match) =>
      pathIdField
        ? { ...(isObject(body) ? body : {}), [pathIdField]: match.groups?.id }
        : method === "GET"
          ? {}
          : body,
    method,
    path,
    successStatus,
  };
}

function salesActionRoute(
  path: RegExp,
  handler: ApiHandler<unknown>,
): HttpRoute {
  return {
    handler,
    input: (body, match) => ({
      ...(isObject(body) ? body : {}),
      salesOrderId: match.groups?.id,
    }),
    method: "POST",
    path,
    successStatus: 200,
  };
}

function emptyInput(): Record<string, never> {
  return {};
}

function boothStatusInput(
  body: unknown,
  match: RegExpMatchArray,
): Record<string, unknown> {
  return {
    ...(isObject(body) ? body : {}),
    boothId: match.groups?.id,
  };
}

function salesOrderPathQueryInput(
  body: unknown,
  match: RegExpMatchArray,
  request: IncomingMessage,
): Record<string, unknown> {
  return {
    ...queryInput(body, match, request),
    salesOrderId: match.groups?.id,
  };
}

function queryInput(
  _body: unknown,
  _match: RegExpMatchArray,
  request: IncomingMessage,
): Record<string, string> {
  const url = new URL(request.url ?? "/", "http://senvo.local");
  return Object.fromEntries(url.searchParams.entries());
}

function variantAvailabilityInput(
  body: unknown,
  match: RegExpMatchArray,
  request: IncomingMessage,
): Record<string, unknown> {
  return {
    ...queryInput(body, match, request),
    variantId: match.groups?.id,
  };
}

function supplierLedgerInput(
  body: unknown,
  match: RegExpMatchArray,
  request: IncomingMessage,
): Record<string, unknown> {
  return {
    ...queryInput(body, match, request),
    supplierId: match.groups?.id,
  };
}

function matchRoute(
  routes: readonly HttpRoute[],
  request: IncomingMessage,
): { match: RegExpMatchArray; route: HttpRoute } | null {
  const path = requestUrlPath(request);
  for (const route of routes) {
    const match = path.match(route.path);
    if (route.method === request.method && match) {
      return { match, route };
    }
  }
  return null;
}

function routeFailure(
  routes: readonly HttpRoute[],
  request: IncomingMessage,
  requestId: string,
): { response: ApiFailure; status: number } {
  const pathExists = routes.some((route) =>
    route.path.test(requestUrlPath(request)),
  );
  return {
    response: createApiFailure({
      code: pathExists ? "VALIDATION.METHOD_NOT_ALLOWED" : "NOT_FOUND.ROUTE",
      message: pathExists
        ? "HTTP method is not allowed."
        : "The requested route was not found.",
      requestId,
    }),
    status: pathExists ? 405 : 404,
  };
}

function catalogRoute(
  method: HttpRoute["method"],
  path: RegExp,
  handler: ApiHandler<unknown>,
  successStatus = 200,
  pathIdField?:
    | "barcodeId"
    | "categoryId"
    | "collectionId"
    | "colorId"
    | "productId"
    | "sizeId"
    | "variantId",
): HttpRoute {
  return {
    handler,
    input: (body, match) =>
      pathIdField
        ? {
            ...(isObject(body) ? body : {}),
            [pathIdField]: match.groups?.id,
          }
        : method === "GET"
          ? {}
          : body,
    method,
    path,
    successStatus,
  };
}

function barcodeLookupInput(
  _body: unknown,
  match: RegExpMatchArray,
): Record<string, unknown> {
  return { value: decodeURIComponent(match.groups?.value ?? "") };
}

function bodyInput(body: unknown): unknown {
  return body;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestUrlPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://localhost").pathname;
}

async function readJsonBody(
  request: IncomingMessage,
  maximumBodyBytes: number,
): Promise<unknown> {
  const rawBody = await readBody(request, maximumBodyBytes);
  return rawBody ? JSON.parse(rawBody) : undefined;
}

async function readFormBody(
  request: IncomingMessage,
  maximumBodyBytes: number,
): Promise<Record<string, string>> {
  const rawBody = await readBody(request, maximumBodyBytes);
  const body: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    if (Object.hasOwn(body, key)) {
      throw new SyntaxError("Form fields must be unique.");
    }
    body[key] = value;
  }
  return body;
}

async function readBody(
  request: IncomingMessage,
  maximumBodyBytes: number,
): Promise<string> {
  const chunks: Uint8Array[] = [];
  let bodyBytes = 0;
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    bodyBytes += chunk.byteLength;
    if (bodyBytes > maximumBodyBytes) {
      throw new PayloadTooLargeError();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeAdapterFailure(
  response: ServerResponse,
  error: unknown,
  requestId: string,
): void {
  if (error instanceof PayloadTooLargeError) {
    writeJson(response, {
      response: createApiFailure({
        code: "VALIDATION.PAYLOAD_TOO_LARGE",
        message: "Request payload is too large.",
        requestId,
      }),
      status: 413,
    });
    return;
  }
  if (error instanceof HttpRequestContextError) {
    writeJson(response, {
      response: createApiFailure({
        code: "AUTHENTICATION.REQUIRED",
        message: "Authentication is required.",
        requestId,
      }),
      status: 401,
    });
    return;
  }
  if (error instanceof SyntaxError) {
    writeJson(response, {
      response: createApiFailure({
        code: "VALIDATION.INVALID_JSON",
        message: "Request body must contain valid JSON.",
        requestId,
      }),
      status: 400,
    });
    return;
  }

  writeJson(response, {
    response: createApiFailure({
      code: "INTERNAL.UNEXPECTED",
      message: "An unexpected error occurred.",
      requestId,
    }),
    status: 500,
  });
}

function statusForFailure(response: ApiFailure): number {
  const category = response.error.code.split(".", 1)[0];
  switch (category) {
    case "VALIDATION":
      return 400;
    case "AUTHENTICATION":
      return 401;
    case "AUTHORIZATION":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "BUSINESS_RULE":
    case "CONCURRENCY":
      return 409;
    default:
      return 500;
  }
}

function writeJson(
  response: ServerResponse,
  output:
    ApiResponse<unknown> | { response: ApiResponse<unknown>; status: number },
  status = 200,
): void {
  const body = "response" in output ? output.response : output;
  const responseStatus = "response" in output ? output.status : status;
  response.statusCode = responseStatus;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("x-request-id", body.requestId);
  response.end(JSON.stringify(body));
}

class PayloadTooLargeError extends Error {}
