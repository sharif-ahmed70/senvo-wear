import { randomUUID } from "node:crypto";
import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from "node:http";
import {
  CustomerAuthenticationError,
  type CustomerAuthenticationService,
  type CustomerSessionResult,
} from "@senvo/application";
import {
  createApiFailure,
  createApiSuccess,
  customerForgotPasswordInputSchema,
  customerGoogleStartInputSchema,
  customerLoginInputSchema,
  customerLogoutInputSchema,
  customerOtpRequestInputSchema,
  customerOtpVerifyInputSchema,
  customerRegisterInputSchema,
  customerResetPasswordInputSchema,
  customerVerificationInputSchema,
  customerVerificationRequestInputSchema,
  type ApiResponse,
} from "@senvo/contracts";
import {
  applySecurityHeaders,
  defaultHttpSecurityHeaders,
} from "./security-headers.js";

const sessionCookie = "senvo_customer_session";
const csrfCookie = "senvo_customer_csrf";
const googleCookie = "senvo_google_oauth";

export function createCustomerAuthenticationRequestListener(options: {
  application: CustomerAuthenticationService;
  delegate: RequestListener;
  publicOrigin: string;
  secureCookies: boolean;
}): RequestListener {
  return (request, response) => {
    const path = pathname(request);
    if (!path.startsWith("/storefront/auth/")) {
      options.delegate(request, response);
      return;
    }
    void handle(options, request, response);
  };
}

async function handle(
  options: {
    application: CustomerAuthenticationService;
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
    const cookies = parseCookies(request.headers.cookie);
    const session = cookies.get(sessionCookie) ?? "";
    const csrf = header(request, "x-csrf-token") ?? "";

    if (matches(request, path, "POST", "/storefront/auth/google/start")) {
      const input = parse(customerGoogleStartInputSchema, body);
      const result = await options.application.startGoogle({
        termsAccepted: input.termsAccepted,
      });
      const oauthState = Buffer.from(
        JSON.stringify({
          challengeId: result.challengeId,
          codeVerifier: result.codeVerifier,
          redirect: safeRedirect(input.redirect),
          state: result.state,
        }),
      ).toString("base64url");
      response.setHeader(
        "set-cookie",
        cookie(googleCookie, oauthState, 600, true, options.secureCookies),
      );
      return write(response, createApiSuccess({ url: result.url }, requestId));
    }
    if (matches(request, path, "GET", "/storefront/auth/google/callback")) {
      const query = new URL(request.url ?? "/", "http://senvo.local")
        .searchParams;
      const oauth = parseGoogleCookie(cookies.get(googleCookie));
      const code = query.get("code") ?? "";
      const state = query.get("state") ?? "";
      if (!oauth || !code || state !== oauth.state) throw unauthorized();
      const result = await options.application.completeGoogle({
        challengeId: oauth.challengeId,
        code,
        codeVerifier: oauth.codeVerifier,
        state,
      });
      setSession(response, result, options.secureCookies);
      appendCookie(
        response,
        cookie(googleCookie, "", 0, true, options.secureCookies),
      );
      response.statusCode = 302;
      response.setHeader("location", oauth.redirect);
      response.end();
      return;
    }

    if (matches(request, path, "POST", "/storefront/auth/register")) {
      const result = await options.application.register(
        parse(customerRegisterInputSchema, body),
      );
      setSession(response, result, options.secureCookies);
      return write(
        response,
        createApiSuccess(publicSession(result), requestId),
        201,
      );
    }
    if (matches(request, path, "POST", "/storefront/auth/login")) {
      const result = await options.application.login(
        parse(customerLoginInputSchema, body),
      );
      setSession(response, result, options.secureCookies);
      return write(
        response,
        createApiSuccess(publicSession(result), requestId),
      );
    }
    if (matches(request, path, "GET", "/storefront/auth/session")) {
      if (!session) throw unauthorized();
      const result = await options.application.authenticateSession(session);
      return write(
        response,
        createApiSuccess(publicSession(result), requestId),
      );
    }
    if (matches(request, path, "POST", "/storefront/auth/logout")) {
      parse(customerLogoutInputSchema, body);
      await options.application.authorizeMutation(session, csrf);
      await options.application.logout(session);
      clearSession(response, options.secureCookies);
      return write(response, createApiSuccess({ loggedOut: true }, requestId));
    }
    if (matches(request, path, "POST", "/storefront/auth/logout-all")) {
      parse(customerLogoutInputSchema, body);
      await options.application.authorizeMutation(session, csrf);
      await options.application.logoutAll(session);
      clearSession(response, options.secureCookies);
      return write(response, createApiSuccess({ loggedOut: true }, requestId));
    }
    if (matches(request, path, "POST", "/storefront/auth/otp/request")) {
      const result = await options.application.requestOtp(
        parse(customerOtpRequestInputSchema, body),
      );
      return write(response, createApiSuccess(result, requestId));
    }
    if (matches(request, path, "POST", "/storefront/auth/otp/verify")) {
      const result = await options.application.verifyOtp(
        parse(customerOtpVerifyInputSchema, body),
      );
      setSession(response, result, options.secureCookies);
      return write(
        response,
        createApiSuccess(publicSession(result), requestId),
      );
    }
    if (matches(request, path, "POST", "/storefront/auth/password/forgot")) {
      await options.application.requestPasswordReset(
        parse(customerForgotPasswordInputSchema, body),
      );
      return write(
        response,
        createApiSuccess(
          {
            message:
              "If an account exists for this email, password reset instructions have been sent.",
          },
          requestId,
        ),
      );
    }
    if (matches(request, path, "POST", "/storefront/auth/password/reset")) {
      await options.application.resetPassword(
        parse(customerResetPasswordInputSchema, body),
      );
      clearSession(response, options.secureCookies);
      return write(response, createApiSuccess({ reset: true }, requestId));
    }
    if (
      matches(
        request,
        path,
        "POST",
        "/storefront/auth/email-verification/request",
      )
    ) {
      parse(customerVerificationRequestInputSchema, body);
      await options.application.authorizeMutation(session, csrf);
      const result =
        await options.application.requestEmailVerification(session);
      return write(response, createApiSuccess(result, requestId));
    }
    if (
      matches(
        request,
        path,
        "POST",
        "/storefront/auth/email-verification/verify",
      )
    ) {
      await options.application.verifyEmail(
        parse(customerVerificationInputSchema, body),
      );
      return write(response, createApiSuccess({ verified: true }, requestId));
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
    throw new CustomerAuthenticationError(
      "VALIDATION",
      "Input is invalid.",
      undefined,
      fieldErrors,
    );
  }
  return parsed.data;
}

function setSession(
  response: ServerResponse,
  result: CustomerSessionResult,
  secure: boolean,
): void {
  const maxAge = Math.max(
    0,
    Math.floor((Date.parse(result.expiresAt) - Date.now()) / 1000),
  );
  response.setHeader("set-cookie", [
    cookie(sessionCookie, result.sessionToken, maxAge, true, secure),
    cookie(csrfCookie, result.csrfToken, maxAge, false, secure),
  ]);
}

function clearSession(response: ServerResponse, secure: boolean): void {
  response.setHeader("set-cookie", [
    cookie(sessionCookie, "", 0, true, secure),
    cookie(csrfCookie, "", 0, false, secure),
  ]);
}

function appendCookie(response: ServerResponse, value: string): void {
  const existing = response.getHeader("set-cookie");
  response.setHeader("set-cookie", [
    ...(Array.isArray(existing)
      ? existing.map(String)
      : existing
        ? [String(existing)]
        : []),
    value,
  ]);
}

function cookie(
  name: string,
  value: string,
  maxAge: number,
  httpOnly: boolean,
  secure: boolean,
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
    ...(httpOnly ? ["HttpOnly"] : []),
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function publicSession(result: CustomerSessionResult) {
  return { expiresAt: result.expiresAt, profile: result.profile };
}

function parseCookies(value: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of value?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    try {
      result.set(
        part.slice(0, separator).trim(),
        decodeURIComponent(part.slice(separator + 1).trim()),
      );
    } catch {
      continue;
    }
  }
  return result;
}

function parseGoogleCookie(value: string | undefined): {
  challengeId: string;
  codeVerifier: string;
  redirect: string;
  state: string;
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    return typeof parsed.challengeId === "string" &&
      typeof parsed.codeVerifier === "string" &&
      typeof parsed.redirect === "string" &&
      typeof parsed.state === "string"
      ? {
          challengeId: parsed.challengeId,
          codeVerifier: parsed.codeVerifier,
          redirect: safeRedirect(parsed.redirect),
          state: parsed.state,
        }
      : null;
  } catch {
    return null;
  }
}

function safeRedirect(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "http://senvo.local");
    return url.origin === "http://senvo.local"
      ? `${url.pathname}${url.search}`
      : "/";
  } catch {
    return "/";
  }
}

function assertOrigin(request: IncomingMessage, publicOrigin: string): void {
  if (header(request, "origin") !== publicOrigin) {
    throw new CustomerAuthenticationError(
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
  const value = request.headers[name];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    bytes += chunk.byteLength;
    if (bytes > 65_536) {
      throw new CustomerAuthenticationError(
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
    throw new CustomerAuthenticationError("VALIDATION", "Input is invalid.");
  }
}

function writeFailure(
  response: ServerResponse,
  error: unknown,
  requestId: string,
): void {
  if (error instanceof CustomerAuthenticationError) {
    const unauthorizedError =
      error.code === "UNAUTHORIZED" || error.code === "INVALID_CREDENTIALS";
    const status =
      error.code === "RATE_LIMITED"
        ? 429
        : error.code === "DELIVERY_UNAVAILABLE"
          ? 503
          : error.code === "ACCOUNT_DISABLED"
            ? 403
            : unauthorizedError
              ? 401
              : error.code === "CONFLICT"
                ? 409
                : 400;
    write(
      response,
      createApiFailure({
        code:
          error.code === "RATE_LIMITED"
            ? "RATE_LIMIT.AUTHENTICATION"
            : error.code === "DELIVERY_UNAVAILABLE"
              ? "INTEGRATION.AUTHENTICATION_DELIVERY"
              : error.code === "ACCOUNT_DISABLED"
                ? "AUTHORIZATION.ACCOUNT_DISABLED"
                : unauthorizedError
                  ? "AUTHENTICATION.REQUIRED"
                  : error.code === "CONFLICT"
                    ? "CONFLICT.IDENTITY"
                    : "VALIDATION.AUTHENTICATION",
        details:
          error.retryAfterSeconds === undefined
            ? undefined
            : { retryAfterSeconds: error.retryAfterSeconds },
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

function unauthorized(): CustomerAuthenticationError {
  return new CustomerAuthenticationError(
    "UNAUTHORIZED",
    "Authentication is required.",
  );
}
