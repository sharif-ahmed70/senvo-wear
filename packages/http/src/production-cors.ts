import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from "node:http";

export type ProductionCorsOptions = {
  adminOrigins: readonly string[];
  storefrontOrigins: readonly string[];
};

export function createProductionCorsRequestListener(
  delegate: RequestListener,
  options: ProductionCorsOptions,
): RequestListener {
  const adminSet = new Set(options.adminOrigins);
  const storefrontSet = new Set(options.storefrontOrigins);
  const allSet = new Set([
    ...options.adminOrigins,
    ...options.storefrontOrigins,
  ]);

  return (request: IncomingMessage, response: ServerResponse) => {
    const rawOrigin: unknown = request.headers.origin;
    const origin =
      typeof rawOrigin === "string"
        ? rawOrigin
        : Array.isArray(rawOrigin) && typeof rawOrigin[0] === "string"
          ? rawOrigin[0]
          : undefined;
    const path = pathname(request);

    const allowedSet = path.startsWith("/admin/")
      ? adminSet
      : path.startsWith("/storefront/")
        ? storefrontSet
        : allSet;

    response.setHeader("vary", "Origin");

    if (origin && !allowedSet.has(origin)) {
      response.statusCode = 403;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          error: {
            code: "AUTHORIZATION.ORIGIN",
            message: "Origin is not allowed.",
          },
          requestId: "production-cors",
          success: false,
        }),
      );
      return;
    }

    if (origin && allowedSet.has(origin)) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("access-control-allow-credentials", "true");
      response.setHeader(
        "access-control-allow-methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      response.setHeader(
        "access-control-allow-headers",
        "content-type, authorization, x-request-id, x-csrf-token",
      );
      response.setHeader("access-control-max-age", "86400");
    }

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.setHeader("content-length", "0");
      response.end();
      return;
    }

    delegate(request, response);
  };
}

function pathname(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", "http://senvo.internal").pathname;
  } catch {
    return "/";
  }
}
