import { randomUUID } from "node:crypto";
import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from "node:http";
import {
  WorkforceAuthenticationError,
  type WorkforceAuthenticationService,
} from "@senvo/application";
import {
  createApiFailure,
  createApiSuccess,
  workforceLoginInputSchema,
  workforceLogoutInputSchema,
  type ApiResponse,
} from "@senvo/contracts";
import {
  applySecurityHeaders,
  defaultHttpSecurityHeaders,
} from "./security-headers.js";

export function createWorkforceAuthenticationRequestListener(options: {
  application: WorkforceAuthenticationService;
  delegate: RequestListener;
  publicOrigin: string;
  secureCookies: boolean;
}): RequestListener {
  return (request, response) => {
    const path = pathname(request);
    if (!path.startsWith("/admin/auth/")) {
      options.delegate(request, response);
      return;
    }
    void handle(options, request, response);
  };
}

async function handle(
  options: {
    application: WorkforceAuthenticationService;
    publicOrigin: string;
    secureCookies: boolean;
  },
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const requestId = requestIdFrom(request);
  applySecurityHeaders(response, defaultHttpSecurityHeaders);
  try {
    if (request.method !== "GET") assertOrigin(request, options.publicOrigin);
    const path = pathname(request);
    const body = request.method === "GET" ? {} : await readBody(request);
    const sessionToken = extractBearerToken(request);
    const csrfToken = header(request, "x-csrf-token") ?? "";

    if (matches(request, path, "POST", "/admin/auth/login")) {
      const input = parse(workforceLoginInputSchema, body);
      const result = await options.application.login(input);
      return write(
        response,
        createApiSuccess(
          {
            principal: result.principal,
            csrfToken: result.csrfToken,
            expiresAt: result.expiresAt,
            sessionToken: result.sessionToken,
          },
          requestId,
        ),
      );
    }

    if (matches(request, path, "GET", "/admin/auth/session")) {
      if (!sessionToken) throw unauthorized();
      const principal =
        await options.application.authenticateSession(sessionToken);
      return write(
        response,
        createApiSuccess(
          {
            csrfTokenHash: principal.csrfTokenHash,
            displayName: principal.displayName,
            expiresAt: principal.expiresAt,
            organizationId: principal.organizationId,
            organizationName: principal.organizationName,
            permissions: principal.permissions,
            role: principal.role,
            sessionId: principal.sessionId,
            userId: principal.userId,
          },
          requestId,
        ),
      );
    }

    if (matches(request, path, "POST", "/admin/auth/logout")) {
      parse(workforceLogoutInputSchema, body);
      if (!sessionToken) throw unauthorized();
      await options.application.authorizeMutation(sessionToken, csrfToken);
      await options.application.logout(sessionToken);
      return write(response, createApiSuccess({ loggedOut: true }, requestId));
    }

    write(
      response,
      createApiFailure({
        code: "NOT_FOUND.ROUTE",
        message: "The requested route was not found.",
        requestId,
      }),
      404,
    );
  } catch (error) {
    writeFailure(response, error, requestId);
  }
}

function parse<T>(
  schema: {
    safeParse(value: unknown):
      | { data: T; success: true }
      | {
          error: { issues: { message: string; path: PropertyKey[] }[] };
          success: false;
        };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      (fieldErrors[field] ??= []).push(issue.message);
    }
    throw new WorkforceAuthenticationError(
      "VALIDATION",
      "Input is invalid.",
      fieldErrors,
    );
  }
  return parsed.data;
}

function extractBearerToken(request: IncomingMessage): string {
  const authorization = header(request, "authorization");
  if (!authorization) return "";
  const match = /^Bearer\s+(.+)$/u.exec(authorization.trim());
  return match?.[1]?.trim() ?? "";
}

function assertOrigin(request: IncomingMessage, publicOrigin: string): void {
  if (header(request, "origin") !== publicOrigin) {
    throw new WorkforceAuthenticationError(
      "UNAUTHORIZED",
      "Request origin is not allowed.",
    );
  }
}

function matches(
  request: IncomingMessage,
  path: string,
  method: string,
  expectedPath: string,
): boolean {
  return request.method === method && path === expectedPath;
}

function pathname(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://senvo.local").pathname;
}

function requestIdFrom(request: IncomingMessage): string {
  const supplied = header(request, "x-request-id");
  return supplied && /^[A-Za-z0-9._:-]{8,128}$/u.test(supplied)
    ? supplied
    : randomUUID();
}

function header(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    bytes += chunk.byteLength;
    if (bytes > 65_536) {
      throw new WorkforceAuthenticationError(
        "VALIDATION",
        "Request is too large.",
      );
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new WorkforceAuthenticationError("VALIDATION", "Input is invalid.");
  }
}

function writeFailure(
  response: ServerResponse,
  error: unknown,
  requestId: string,
): void {
  if (error instanceof WorkforceAuthenticationError) {
    const unauthorizedError =
      error.code === "UNAUTHORIZED" || error.code === "INVALID_CREDENTIALS";
    const status =
      error.code === "RATE_LIMITED"
        ? 429
        : error.code === "ACCOUNT_DISABLED"
          ? 403
          : error.code === "MEMBERSHIP_INACTIVE"
            ? 403
            : unauthorizedError
              ? 401
              : 400;
    write(
      response,
      createApiFailure({
        code:
          error.code === "RATE_LIMITED"
            ? "RATE_LIMIT.AUTHENTICATION"
            : error.code === "ACCOUNT_DISABLED"
              ? "AUTHORIZATION.ACCOUNT_DISABLED"
              : error.code === "MEMBERSHIP_INACTIVE"
                ? "AUTHORIZATION.MEMBERSHIP_INACTIVE"
                : unauthorizedError
                  ? "AUTHENTICATION.REQUIRED"
                  : "VALIDATION.AUTHENTICATION",
        details: undefined,
        fieldErrors: error.fieldErrors,
        message: error.message,
        requestId,
      }),
      status,
    );
    return;
  }
  write(
    response,
    createApiFailure({
      code: "INTERNAL.UNEXPECTED",
      message: "An unexpected error occurred.",
      requestId,
    }),
    500,
  );
}

function write(
  response: ServerResponse,
  body: ApiResponse<unknown>,
  status = 200,
): void {
  response.statusCode = status;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("x-request-id", body.requestId);
  response.end(JSON.stringify(body));
}

function unauthorized(): WorkforceAuthenticationError {
  return new WorkforceAuthenticationError(
    "UNAUTHORIZED",
    "Authentication is required.",
  );
}
