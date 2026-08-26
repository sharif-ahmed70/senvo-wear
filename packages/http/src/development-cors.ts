import type { RequestListener } from "node:http";

const allowedHeaders = [
  "content-type",
  "x-request-id",
  "x-dev-user-id",
  "x-dev-organization-id",
  "x-dev-permissions",
  "authorization",
  "x-csrf-token",
].join(", ");

export function createDevelopmentCorsRequestListener(
  listener: RequestListener,
  allowedOrigin: string,
): RequestListener {
  return (request, response) => {
    const origin = request.headers.origin;
    response.setHeader("vary", "Origin");
    if (origin && origin !== allowedOrigin) {
      response.statusCode = 403;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          error: {
            code: "AUTHORIZATION.ORIGIN",
            message: "Origin is not allowed.",
          },
          requestId: "development-cors",
          success: false,
        }),
      );
      return;
    }
    if (origin === allowedOrigin) {
      response.setHeader("access-control-allow-origin", allowedOrigin);
      response.setHeader("access-control-allow-credentials", "true");
      response.setHeader(
        "access-control-allow-methods",
        "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      );
      response.setHeader("access-control-allow-headers", allowedHeaders);
    }
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    listener(request, response);
  };
}
