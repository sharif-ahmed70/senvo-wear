import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminApiUpstreamUrl,
  resolveWorkforceUpstreamOrigin,
} from "../../../_lib/workforce-auth-server";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestUrl.origin) {
    return response(
      { error: { code: "AUTHENTICATION.REQUIRED", message: "Request origin is not allowed." }, requestId, success: false },
      403,
      requestId,
    );
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(adminSessionCookieName)?.value?.trim();
  const csrfToken = cookieStore.get(adminCsrfCookieName)?.value?.trim();

  if (sessionToken && csrfToken) {
    try {
      await fetch(`${resolveAdminApiUpstreamUrl()}/admin/auth/logout`, {
        body: JSON.stringify({}),
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${sessionToken}`,
          "content-type": "application/json",
          origin: resolveWorkforceUpstreamOrigin(origin),
          "x-csrf-token": csrfToken,
          "x-request-id": requestId,
        },
        method: "POST",
      });
    } catch {
      // Local sign-out still completes. The server session will expire naturally if
      // the upstream service cannot be reached during this request.
    }
  }

  cookieStore.delete(adminSessionCookieName);
  cookieStore.delete(adminCsrfCookieName);

  return response({ data: { loggedOut: true }, requestId, success: true }, 200, requestId);
}

function response(payload: unknown, status: number, requestId: string) {
  return NextResponse.json(payload, {
    headers: {
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
    status,
  });
}
