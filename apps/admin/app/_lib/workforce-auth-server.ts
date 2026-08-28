import { cookies } from "next/headers";
import { cache } from "react";
import {
  adminPermissionKeys,
  type AdminPermissionKey,
  type AdminSession,
} from "./admin-access";

export const adminSessionCookieName = "senvo_admin_session";
export const adminCsrfCookieName = "senvo_admin_csrf";

export type AdminAuthState = {
  reason: "access-denied" | "service-unavailable" | "session-expired" | "signed-out";
  session: AdminSession | null;
};

type WorkforceSessionPayload = {
  displayName?: unknown;
  organizationName?: unknown;
  permissions?: unknown;
  role?: unknown;
  userId?: unknown;
};

type ApiEnvelope<T> =
  | { data: T; requestId: string; success: true }
  | {
      error?: { code?: unknown; message?: unknown };
      requestId?: string;
      success: false;
    };

const permissionKeys = new Set<string>(adminPermissionKeys);

export const getWorkforceAuthState = cache(
  async (): Promise<AdminAuthState> => {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(adminSessionCookieName)?.value?.trim();
    if (!sessionToken) return { reason: "signed-out", session: null };

    let response: Response;
    try {
      response = await fetch(`${resolveAdminApiUpstreamUrl()}/admin/auth/session`, {
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${sessionToken}`,
          "x-request-id": crypto.randomUUID(),
        },
      });
    } catch {
      return { reason: "service-unavailable", session: null };
    }

    if (response.status === 401) {
      return { reason: "session-expired", session: null };
    }
    if (response.status === 403) {
      return { reason: "access-denied", session: null };
    }
    if (!response.ok) {
      return { reason: "service-unavailable", session: null };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { reason: "service-unavailable", session: null };
    }

    const session = sessionFromPayload(payload);
    if (!session) {
      return { reason: "service-unavailable", session: null };
    }
    return { reason: "signed-out", session };
  },
);

export async function getAdminSession(): Promise<AdminSession | null> {
  return (await getWorkforceAuthState()).session;
}

export function resolveAdminApiUpstreamUrl(): string {
  const configured = process.env.SENVO_ADMIN_API_UPSTREAM_URL?.trim();
  const value =
    configured || (process.env.NODE_ENV === "production" ? "" : "http://localhost:4000");
  if (!value) {
    throw new Error("SENVO_ADMIN_API_UPSTREAM_URL is required in production.");
  }
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("SENVO_ADMIN_API_UPSTREAM_URL must be an origin URL.");
  }
  return url.origin;
}

export function resolveWorkforceUpstreamOrigin(requestOrigin: string): string {
  const configured =
    process.env.SENVO_ADMIN_UPSTREAM_ORIGIN?.trim() ||
    process.env.SENVO_API_ALLOWED_ORIGIN?.trim() ||
    requestOrigin;
  return new URL(configured).origin;
}

function sessionFromPayload(payload: unknown): AdminSession | null {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
    return null;
  }
  const data = payload.data as WorkforceSessionPayload;
  if (
    typeof data.displayName !== "string" ||
    typeof data.organizationName !== "string" ||
    typeof data.userId !== "string" ||
    !isAdminRole(data.role)
  ) {
    return null;
  }

  return {
    displayName: data.displayName,
    organizationName: data.organizationName,
    permissions: normalizePermissions(data.permissions),
    role: data.role,
    userId: data.userId,
  };
}

function normalizePermissions(value: unknown): AdminPermissionKey[] {
  if (!Array.isArray(value)) return [];
  const normalized: AdminPermissionKey[] = [];
  for (const permission of value) {
    const key = permissionKey(permission);
    if (key && permissionKeys.has(key) && !normalized.includes(key as AdminPermissionKey)) {
      normalized.push(key as AdminPermissionKey);
    }
  }
  return normalized;
}

function permissionKey(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  const resource = value.resource;
  const action = value.action;
  return typeof resource === "string" && typeof action === "string"
    ? `${resource}:${action}`
    : null;
}

function isAdminRole(value: unknown): value is AdminSession["role"] {
  return value === "OWNER" || value === "ADMIN" || value === "MANAGER" || value === "STAFF";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
