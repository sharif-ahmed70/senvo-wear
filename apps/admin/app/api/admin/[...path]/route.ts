import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminApiUpstreamUrl,
  resolveWorkforceUpstreamOrigin,
} from "../../../_lib/workforce-auth-server";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export function GET(request: Request, context: RouteContext) {
  return proxyAdminRequest(request, context);
}

export function POST(request: Request, context: RouteContext) {
  return proxyAdminRequest(request, context);
}

export function PATCH(request: Request, context: RouteContext) {
  return proxyAdminRequest(request, context);
}

export function PUT(request: Request, context: RouteContext) {
  return proxyAdminRequest(request, context);
}

export function DELETE(request: Request, context: RouteContext) {
  return proxyAdminRequest(request, context);
}

async function proxyAdminRequest(request: Request, context: RouteContext) {
  const requestUrl = new URL(request.url);
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const method = request.method.toUpperCase();
  const mutation = method !== "GET" && method !== "HEAD";
  const origin = request.headers.get("origin");

  if (mutation && (!origin || origin !== requestUrl.origin)) {
    return failure(403, requestId, "AUTHENTICATION.REQUIRED", "Request origin is not allowed.");
  }

  const { path } = await context.params;
  if (!path.length || path.some((segment) => !segment || segment === "." || segment === "..")) {
    return failure(404, requestId, "NOT_FOUND.ROUTE", "The requested route was not found.");
  }
  const upstreamPath = `/${path.map(encodeURIComponent).join("/")}`;
  if (upstreamPath.startsWith("/admin/auth/")) {
    return failure(404, requestId, "NOT_FOUND.ROUTE", "The requested route was not found.");
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(adminSessionCookieName)?.value?.trim();
  const csrfToken = cookieStore.get(adminCsrfCookieName)?.value?.trim();
  if (!sessionToken) {
    return failure(401, requestId, "AUTHENTICATION.REQUIRED", "Authentication is required.");
  }
  if (mutation && !csrfToken) {
    return failure(401, requestId, "AUTHENTICATION.REQUIRED", "Authentication is required.");
  }

  const upstreamUrl = new URL(upstreamPath, `${resolveAdminApiUpstreamUrl()}/`);
  upstreamUrl.search = requestUrl.search;

  const headers = new Headers();
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${sessionToken}`);
  headers.set("x-request-id", requestId);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (mutation && csrfToken) {
    headers.set("x-csrf-token", csrfToken);
    headers.set(
      "origin",
      resolveWorkforceUpstreamOrigin(origin ?? requestUrl.origin),
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      body: mutation ? await request.text() : undefined,
      cache: "no-store",
      headers,
      method,
    });
  } catch {
    return failure(503, requestId, "INTEGRATION.NETWORK_FAILURE", "The admin service could not be reached.");
  }

  if (upstream.status === 401) {
    cookieStore.delete(adminSessionCookieName);
    cookieStore.delete(adminCsrfCookieName);
  }

  const responseHeaders = new Headers();
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set(
    "content-type",
    upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
  );
  responseHeaders.set(
    "x-request-id",
    upstream.headers.get("x-request-id") ?? requestId,
  );

  return new Response(await upstream.arrayBuffer(), {
    headers: responseHeaders,
    status: upstream.status,
  });
}

function failure(status: number, requestId: string, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message }, requestId, success: false },
    {
      headers: {
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
      status,
    },
  );
}
