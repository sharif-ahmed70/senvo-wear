import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
  type ServerResponse,
} from "node:http";
import type { ApiHandler } from "@senvo/api";
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
  method: "POST";
  path: string;
  successStatus: number;
};

export type SenvoHttpHandlers = {
  createSalesOrder: ApiHandler<unknown>;
  postInventoryMovement: ApiHandler<unknown>;
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
    const route = matchRoute(input.routes, input.request);
    if (!route) {
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
    const body = await readJsonBody(input.request, input.maximumBodyBytes);
    const apiResponse = await route.handler.handle({
      context: requestContext,
      input: body,
    });
    writeJson(
      input.response,
      apiResponse,
      apiResponse.success ? route.successStatus : statusForFailure(apiResponse),
    );
  } catch (error) {
    writeAdapterFailure(input.response, error, requestId);
  }
}

function createRoutes(handlers: SenvoHttpHandlers): readonly HttpRoute[] {
  return [
    {
      handler: handlers.createSalesOrder,
      method: "POST",
      path: "/sales-orders",
      successStatus: 201,
    },
    {
      handler: handlers.postInventoryMovement,
      method: "POST",
      path: "/inventory/movements",
      successStatus: 200,
    },
  ];
}

function matchRoute(
  routes: readonly HttpRoute[],
  request: IncomingMessage,
): HttpRoute | null {
  return (
    routes.find(
      (route) =>
        route.method === request.method &&
        route.path === requestUrlPath(request),
    ) ?? null
  );
}

function routeFailure(
  routes: readonly HttpRoute[],
  request: IncomingMessage,
  requestId: string,
): { response: ApiFailure; status: number } {
  const pathExists = routes.some(
    (route) => route.path === requestUrlPath(request),
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
