import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminApiUpstreamUrl,
  resolveWorkforceUpstreamOrigin,
} from "../../../_lib/workforce-auth-server";

type UpstreamLoginSuccess = {
  csrfToken?: unknown;
  expiresAt?: unknown;
  sessionToken?: unknown;
};

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestUrl.origin) {
    return failure(403, requestId, "AUTHENTICATION.REQUIRED", "Request origin is not allowed.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(400, requestId, "VALIDATION.AUTHENTICATION", "Input is invalid.");
  }

  if (!isLoginInput(body)) {
    return failure(400, requestId, "VALIDATION.AUTHENTICATION", "Email, password and remember-me state are required.");
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${resolveAdminApiUpstreamUrl()}/admin/auth/login`, {
      body: JSON.stringify(body),
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: resolveWorkforceUpstreamOrigin(origin),
        "x-request-id": requestId,
      },
      method: "POST",
    });
  } catch {
    return failure(503, requestId, "INTEGRATION.NETWORK_FAILURE", "The workforce authentication service could not be reached.");
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return failure(502, requestId, "INTERNAL.INVALID_RESPONSE", "The workforce authentication service returned an invalid response.");
  }

  if (!upstream.ok) {
    return json(payload, upstream.status, upstream.headers.get("x-request-id") ?? requestId);
  }
  if (!isSuccessfulEnvelope(payload) || !isRecord(payload.data)) {
    return failure(502, requestId, "INTERNAL.INVALID_RESPONSE", "The workforce authentication service returned an invalid response.");
  }

  const data = payload.data as UpstreamLoginSuccess;
  if (
    typeof data.sessionToken !== "string" ||
    typeof data.csrfToken !== "string" ||
    typeof data.expiresAt !== "string"
  ) {
    return failure(502, requestId, "INTERNAL.INVALID_RESPONSE", "The workforce authentication service returned an invalid response.");
  }

  const expires = new Date(data.expiresAt);
  if (Number.isNaN(expires.getTime())) {
    return failure(502, requestId, "INTERNAL.INVALID_RESPONSE", "The workforce authentication service returned an invalid session expiry.");
  }

  const cookieStore = await cookies();
  const cookieOptions = {
    expires,
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  cookieStore.set(adminSessionCookieName, data.sessionToken, cookieOptions);
  cookieStore.set(adminCsrfCookieName, data.csrfToken, cookieOptions);

  return json(
    {
      data: { signedIn: true },
      requestId: upstream.headers.get("x-request-id") ?? requestId,
      success: true,
    },
    200,
    upstream.headers.get("x-request-id") ?? requestId,
  );
}

function isLoginInput(value: unknown): value is {
  email: string;
  password: string;
  rememberMe: boolean;
} {
  if (!isRecord(value)) return false;
  return (
    typeof value.email === "string" &&
    typeof value.password === "string" &&
    typeof value.rememberMe === "boolean"
  );
}

function isSuccessfulEnvelope(value: unknown): value is { data: unknown; success: true } {
  return isRecord(value) && value.success === true && "data" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function failure(status: number, requestId: string, code: string, message: string) {
  return json(
    { error: { code, message }, requestId, success: false },
    status,
    requestId,
  );
}

function json(payload: unknown, status: number, requestId: string) {
  return NextResponse.json(payload, {
    headers: {
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
    status,
  });
}
