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

export const workforceSessionCookie = "senvo_workforce_session";
export const workforceCsrfCookie = "senvo_workforce_csrf";

export type WorkforceAuthenticationHttpOptions = {
  application: WorkforceAuthenticationService;
  cookieDomain?: string;
  delegate: RequestListener;
  omitSessionTokenInBody?: boolean;
  publicOrigin: string | readonly string[];
  sameSite?: "Lax" | "Strict" | "None";
  secureCookies: boolean;
};

export function createWorkforceAuthenticationRequestListener(
  options: WorkforceAuthenticationHttpOptions,
): RequestListener {
  const allowedOrigins: readonly string[] =
    typeof options.publicOrigin === "string"
      ? options.publicOrigin
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
      : options.publicOrigin;
  const allowedSet = new Set(allowedOrigins);
  const normalizedOptions = {
    ...options,
    allowedOrigins: allowedSet,
    sameSite: options.sameSite ?? "Lax",
  };
  return (request, response) => {
    const path = pathname(request);
    if (!path.startsWith("/admin/auth/")) {
      options.delegate(request, response);
      return;
    }
    void handle(normalizedOptions, request, response);
  };
}

async function handle(
  options: {
    allowedOrigins: ReadonlySet<string>;
    application: WorkforceAuthenticationService;
    cookieDomain?: string;
    omitSessionTokenInBody?: boolean;
    publicOrigin: string | readonly string[];
    sameSite: "Lax" | "Strict" | "None";
    secureCookies: boolean;
  },
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const requestId = requestIdFrom(request);
  applySecurityHeaders(response, defaultHttpSecurityHeaders);
  try {
    if (request.method !== "GET") assertOrigin(request, options.allowedOrigins);

    const path = pathname(request);

    const body = request.method === "GET" ? {} : await readBody(request);
    const { token: sessionToken, fromCookie } =
      extractWorkforceSessionToken(request);
    const csrfToken = header(request, "x-csrf-token") ?? "";

    if (matches(request, path, "POST", "/admin/auth/login")) {
      const input = parse(workforceLoginInputSchema, body);
      const result = await options.application.login(input);
      setWorkforceCookies(
        response,
        result.sessionToken,
        result.csrfToken,
        result.expiresAt,
        options.secureCookies,
        options.cookieDomain,
        options.sameSite,
      );
      return write(
        response,
        createApiSuccess(
          {
            principal: result.principal,
            csrfToken: result.csrfToken,
            expiresAt: result.expiresAt,
            sessionToken:
              options.secureCookies || options.omitSessionTokenInBody
                ? undefined
                : result.sessionToken,
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
      if (fromCookie || csrfToken) {
        await options.application.authorizeMutation(sessionToken, csrfToken);
      }
      await options.application.logout(sessionToken);
      clearWorkforceCookies(
        response,
        options.secureCookies,
        options.cookieDomain,
      );
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

export function extractWorkforceSessionToken(request: IncomingMessage): {
  fromCookie: boolean;
  token: string;
} {
  const cookieHeader = header(request, "cookie");
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const sessionFromCookie = cookies.get(workforceSessionCookie);
    if (sessionFromCookie) {
      return { fromCookie: true, token: sessionFromCookie };
    }
  }
  const bearer = extractBearerToken(request);
  if (bearer) {
    return { fromCookie: false, token: bearer };
  }
  return { fromCookie: false, token: "" };
}

function extractBearerToken(request: IncomingMessage): string {
  const authorization = header(request, "authorization");
  if (!authorization) return "";
  const match = /^Bearer\s+(.+)$/u.exec(authorization.trim());
  return match?.[1]?.trim() ?? "";
}

function setWorkforceCookies(
  response: ServerResponse,
  sessionToken: string,
  csrfToken: string,
  expiresAt: string,
  secure: boolean,
  domain?: string,
  sameSite: "Lax" | "Strict" | "None" = "Lax",
): void {
  const maxAge = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
  appendCookie(
    response,
    serializeCookie({
      domain,
      httpOnly: true,
      maxAgeSeconds: maxAge,
      name: workforceSessionCookie,
      path: "/",
      sameSite,
      secure,
      value: sessionToken,
    }),
  );
  appendCookie(
    response,
    serializeCookie({
      domain,
      httpOnly: false,
      maxAgeSeconds: maxAge,
      name: workforceCsrfCookie,
      path: "/",
      sameSite,
      secure,
      value: csrfToken,
    }),
  );
}

function clearWorkforceCookies(
  response: ServerResponse,
  secure: boolean,
  domain?: string,
): void {
  appendCookie(
    response,
    serializeCookie({
      domain,
      httpOnly: true,
      maxAgeSeconds: 0,
      name: workforceSessionCookie,
      path: "/",
      secure,
      value: "",
    }),
  );
  appendCookie(
    response,
    serializeCookie({
      domain,
      httpOnly: false,
      maxAgeSeconds: 0,
      name: workforceCsrfCookie,
      path: "/",
      secure,
      value: "",
    }),
  );
}

function appendCookie(response: ServerResponse, cookieString: string): void {
  const existing = response.getHeader("set-cookie");
  if (!existing) {
    response.setHeader("set-cookie", cookieString);
  } else if (Array.isArray(existing)) {
    response.setHeader("set-cookie", [...existing, cookieString]);
  } else {
    response.setHeader("set-cookie", [String(existing), cookieString]);
  }
}

function parseCookies(headerValue: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of headerValue.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      const key = part.slice(0, eq).trim();
      const val = part.slice(eq + 1).trim();
      try {
        map.set(key, decodeURIComponent(val));
      } catch {
        map.set(key, val);
      }
    }
  }
  return map;
}

function serializeCookie(options: {
  name: string;
  value: string;
  maxAgeSeconds?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  domain?: string;
  path?: string;
}): string {
  const parts = [`${options.name}=${encodeURIComponent(options.value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
  }
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join("; ");
}

function assertOrigin(
  request: IncomingMessage,
  allowedOrigins: ReadonlySet<string>,
): void {
  const origin = header(request, "origin");
  if (!origin || !allowedOrigins.has(origin)) {
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
