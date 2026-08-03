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
  SalesOrderManagementApiHandlers,
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
  handler: ApiHandler<unknown>;
  input(
    body: unknown,
    match: RegExpMatchArray,
    request: IncomingMessage,
  ): unknown;
  method: "GET" | "PATCH" | "POST";
  path: RegExp;
  successStatus: number;
};

export type SenvoHttpHandlers = {
  catalog?: CatalogApiHandlers;
  createSalesOrder: ApiHandler<unknown>;
  inventoryRead?: InventoryReadApiHandlers;
  postInventoryMovement: ApiHandler<unknown>;
  salesManagement?: SalesOrderManagementApiHandlers;
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
    const requestContext = await input.contextFactory.create({
      headers: input.request.headers,
      requestId,
    });
    const body =
      input.request.method === "GET"
        ? {}
        : await readJsonBody(input.request, input.maximumBodyBytes);
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
  return routes;
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
  pathIdField?: "categoryId" | "colorId" | "productId" | "sizeId",
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
  const chunks: Uint8Array[] = [];
  let bodyBytes = 0;
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    bodyBytes += chunk.byteLength;
    if (bodyBytes > maximumBodyBytes) {
      throw new PayloadTooLargeError();
    }
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : undefined;
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
  if (
    error instanceof SyntaxError ||
    error instanceof HttpRequestContextError
  ) {
    writeJson(response, {
      response: createApiFailure({
        code:
          error instanceof SyntaxError
            ? "VALIDATION.INVALID_JSON"
            : "VALIDATION.INVALID_CONTEXT",
        message:
          error instanceof SyntaxError
            ? "Request body must contain valid JSON."
            : "Request context is invalid.",
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
