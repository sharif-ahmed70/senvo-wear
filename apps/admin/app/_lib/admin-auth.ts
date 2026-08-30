import { AdminApiClient, AdminApiError } from "./api-client";
import { adminSessionFromPrincipal, type AdminSession } from "./admin-access";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminCredentials = {
  csrfToken: string;
  expiresAt: string;
  rememberMe: boolean;
  sessionToken: string;
};

export type AdminLoginError =
  | { kind: "invalid_credentials" }
  | { kind: "account_disabled" }
  | { kind: "membership_inactive" }
  | { kind: "rate_limited" }
  | { kind: "network" }
  | { kind: "unknown"; message: string };

export type AdminLoginResult =
  | { error: AdminLoginError; ok: false }
  | { credentials: AdminCredentials; ok: true; session: AdminSession };

export type AdminLogoutResult = { ok: true } | { ok: false };

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "senvo.admin.session";

function getStorage(type: "local" | "session"): Storage | null {
  if (
    typeof window === "undefined" &&
    typeof globalThis.localStorage === "undefined"
  ) {
    return null;
  }
  try {
    return type === "local"
      ? (globalThis.localStorage ?? window?.localStorage ?? null)
      : (globalThis.sessionStorage ?? window?.sessionStorage ?? null);
  } catch {
    return null;
  }
}

export function storeCredentials(credentials: AdminCredentials): void {
  const value = JSON.stringify(credentials);
  const local = getStorage("local");
  const session = getStorage("session");
  if (credentials.rememberMe) {
    local?.setItem(STORAGE_KEY, value);
    session?.removeItem(STORAGE_KEY);
  } else {
    session?.setItem(STORAGE_KEY, value);
    local?.removeItem(STORAGE_KEY);
  }
}

export function readStoredCredentials(): AdminCredentials | null {
  try {
    const session = getStorage("session");
    const local = getStorage("local");
    const raw = session?.getItem(STORAGE_KEY) ?? local?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isCredentials(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  const session = getStorage("session");
  const local = getStorage("local");
  session?.removeItem(STORAGE_KEY);
  local?.removeItem(STORAGE_KEY);
}

function isCredentials(value: unknown): value is AdminCredentials {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.sessionToken === "string" &&
    typeof c.csrfToken === "string" &&
    typeof c.expiresAt === "string" &&
    typeof c.rememberMe === "boolean"
  );
}

// ---------------------------------------------------------------------------
// Auth client
// ---------------------------------------------------------------------------

export class AdminAuthClient {
  private readonly client: AdminApiClient;

  constructor(options: { baseUrl?: string; fetcher?: typeof fetch } = {}) {
    this.client = new AdminApiClient(options);
  }

  /** Authenticate with email + password. Stores credentials on success. */
  async login(
    email: string,
    password: string,
    rememberMe: boolean,
  ): Promise<AdminLoginResult> {
    try {
      const { data } = await this.client.request<{
        csrfToken: string;
        expiresAt: string;
        principal: {
          displayName: string;
          organizationId: string;
          organizationName: string;
          permissions: { resource: string; action: string }[];
          role: "OWNER" | "ADMIN" | "MANAGER" | "STAFF";
          userId: string;
        };
        sessionToken: string;
      }>("/admin/auth/login", {
        body: { email, password, rememberMe },
        method: "POST",
      });

      const credentials: AdminCredentials = {
        csrfToken: data.csrfToken,
        expiresAt: data.expiresAt,
        rememberMe,
        sessionToken: data.sessionToken,
      };

      storeCredentials(credentials);

      return {
        credentials,
        ok: true,
        session: adminSessionFromPrincipal(data.principal),
      };
    } catch (error) {
      return { error: loginErrorFrom(error), ok: false };
    }
  }

  /**
   * Restore a previously stored session by validating it with the backend.
   * Clears credentials and returns null if the session is expired or invalid.
   */
  async restoreSession(): Promise<{
    credentials: AdminCredentials;
    session: AdminSession;
  } | null> {
    const stored = readStoredCredentials();
    if (!stored) return null;

    // Optimistic expiry check (client-side only — backend is authoritative)
    if (new Date(stored.expiresAt).getTime() <= Date.now()) {
      clearCredentials();
      return null;
    }

    try {
      const { data } = await this.client.request<{
        csrfTokenHash: string;
        displayName: string;
        expiresAt: string;
        organizationId: string;
        organizationName: string;
        permissions: { resource: string; action: string }[];
        role: "OWNER" | "ADMIN" | "MANAGER" | "STAFF";
        sessionId: string;
        userId: string;
      }>("/admin/auth/session", {
        headers: { Authorization: `Bearer ${stored.sessionToken}` },
        method: "GET",
      });

      return {
        credentials: stored,
        session: adminSessionFromPrincipal(data),
      };
    } catch (error) {
      if (isAuthFailure(error)) {
        clearCredentials();
      }
      return null;
    }
  }

  /**
   * Logout: calls the backend to revoke the session, then clears local
   * credentials regardless of server response (idempotent cleanup).
   */
  async logout(credentials: AdminCredentials): Promise<AdminLogoutResult> {
    try {
      await this.client.request("/admin/auth/logout", {
        body: {},
        headers: {
          Authorization: `Bearer ${credentials.sessionToken}`,
          "x-csrf-token": credentials.csrfToken,
        },
        method: "POST",
      });
    } catch {
      // Session already expired server-side — still safe to clear locally
    } finally {
      clearCredentials();
    }
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAuthFailure(error: unknown): boolean {
  if (!(error instanceof AdminApiError)) return false;
  return (
    error.status === 401 ||
    error.code === "AUTHENTICATION.REQUIRED" ||
    error.category === "AUTHENTICATION" ||
    error.category === "AUTHORIZATION"
  );
}

function loginErrorFrom(error: unknown): AdminLoginError {
  if (!(error instanceof AdminApiError)) {
    return { kind: "network" };
  }
  switch (error.code) {
    case "AUTHENTICATION.REQUIRED":
    case "VALIDATION.AUTHENTICATION":
      return { kind: "invalid_credentials" };
    case "AUTHORIZATION.ACCOUNT_DISABLED":
      return { kind: "account_disabled" };
    case "AUTHORIZATION.MEMBERSHIP_INACTIVE":
      return { kind: "membership_inactive" };
    case "RATE_LIMIT.AUTHENTICATION":
      return { kind: "rate_limited" };
    default:
      if (error.status === 0) return { kind: "network" };
      return { kind: "unknown", message: error.message };
  }
}
