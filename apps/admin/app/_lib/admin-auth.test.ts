import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminAuthClient,
  clearCredentials,
  readStoredCredentials,
  storeCredentials,
  type AdminCredentials,
} from "./admin-auth";
import {
  adminSessionFromPrincipal,
  permissionsFromPrincipal,
} from "./admin-access";

// ---------------------------------------------------------------------------
// Mock Storage for node environment
// ---------------------------------------------------------------------------

class MockStorage implements Storage {
  private readonly store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

globalThis.sessionStorage = new MockStorage();
globalThis.localStorage = new MockStorage();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sessionCredentials = (): AdminCredentials => ({
  csrfToken: "csrf-abc",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  rememberMe: false,
  sessionToken: "token-xyz",
});

const ownerPrincipal = {
  displayName: "Alice Owner",
  organizationId: "org-1",
  organizationName: "SENVO Wear",
  permissions: [
    { resource: "CATALOG", action: "READ" },
    { resource: "CATALOG", action: "CREATE" },
    { resource: "INVENTORY", action: "READ" },
    { resource: "ORGANIZATION", action: "READ" },
    { resource: "SALES_ORDER", action: "READ" },
  ],
  role: "OWNER" as const,
  userId: "user-1",
};

// ---------------------------------------------------------------------------
// Storage tests
// ---------------------------------------------------------------------------

describe("credential storage", () => {
  afterEach(() => {
    clearCredentials();
  });

  it("stores sessionStorage when rememberMe is false", () => {
    const creds = { ...sessionCredentials(), rememberMe: false };
    storeCredentials(creds);
    expect(sessionStorage.getItem("senvo.admin.session")).toBeTruthy();
    expect(localStorage.getItem("senvo.admin.session")).toBeNull();
  });

  it("stores localStorage when rememberMe is true", () => {
    const creds = { ...sessionCredentials(), rememberMe: true };
    storeCredentials(creds);
    expect(localStorage.getItem("senvo.admin.session")).toBeTruthy();
    expect(sessionStorage.getItem("senvo.admin.session")).toBeNull();
  });

  it("reads back sessionStorage credentials correctly", () => {
    const creds = { ...sessionCredentials(), rememberMe: false };
    storeCredentials(creds);
    const read = readStoredCredentials();
    expect(read).toEqual(creds);
  });

  it("reads back localStorage credentials correctly", () => {
    const creds = { ...sessionCredentials(), rememberMe: true };
    storeCredentials(creds);
    const read = readStoredCredentials();
    expect(read).toEqual(creds);
  });

  it("returns null when nothing is stored", () => {
    expect(readStoredCredentials()).toBeNull();
  });

  it("clearCredentials removes both storages", () => {
    const creds = { ...sessionCredentials(), rememberMe: false };
    storeCredentials(creds);
    clearCredentials();
    expect(readStoredCredentials()).toBeNull();
    expect(sessionStorage.getItem("senvo.admin.session")).toBeNull();
    expect(localStorage.getItem("senvo.admin.session")).toBeNull();
  });

  it("returns null for corrupted storage value", () => {
    sessionStorage.setItem("senvo.admin.session", "{invalid}");
    expect(readStoredCredentials()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Permission mapping tests
// ---------------------------------------------------------------------------

describe("permissionsFromPrincipal", () => {
  it("maps explicit backend permissions to AdminPermissionKey", () => {
    const perms = permissionsFromPrincipal(ownerPrincipal);
    expect(perms).toContain("CATALOG:READ");
    expect(perms).toContain("CATALOG:CREATE");
    expect(perms).toContain("INVENTORY:READ");
    expect(perms).toContain("ORGANIZATION:READ");
    expect(perms).toContain("SALES_ORDER:READ");
  });

  it("OWNER with no matching backend permissions gets no unsupported Admin permissions", () => {
    const perms = permissionsFromPrincipal({
      ...ownerPrincipal,
      permissions: [],
    });
    // No role-based fallback — must be empty
    expect(perms).toHaveLength(0);
    expect(perms).not.toContain("SALES:READ");
    expect(perms).not.toContain("POS:READ");
    expect(perms).not.toContain("TEAM:READ");
    expect(perms).not.toContain("PAYMENT:READ");
    expect(perms).not.toContain("RECEIPT:READ");
  });

  it("only includes permissions the backend explicitly provides, regardless of role", () => {
    // STAFF with only CATALOG:READ — should get exactly that
    const perms = permissionsFromPrincipal({
      ...ownerPrincipal,
      role: "STAFF",
      permissions: [{ resource: "CATALOG", action: "READ" }],
    });
    expect(perms).toEqual(["CATALOG:READ"]);
    expect(perms).not.toContain("POS:READ");
    expect(perms).not.toContain("SALES:CREATE");
  });

  it("silently ignores unknown backend resources", () => {
    const perms = permissionsFromPrincipal({
      ...ownerPrincipal,
      permissions: [
        { resource: "UNKNOWN_FUTURE_RESOURCE", action: "READ" },
        { resource: "CATALOG", action: "READ" },
      ],
    });
    expect(perms).toContain("CATALOG:READ");
    // No "UNKNOWN_FUTURE_RESOURCE:READ" entry
    expect(perms.some((p) => p.startsWith("UNKNOWN"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// adminSessionFromPrincipal tests
// ---------------------------------------------------------------------------

describe("adminSessionFromPrincipal", () => {
  it("maps displayName, organizationName, role, userId", () => {
    const session = adminSessionFromPrincipal(ownerPrincipal);
    expect(session.displayName).toBe("Alice Owner");
    expect(session.organizationName).toBe("SENVO Wear");
    expect(session.role).toBe("OWNER");
    expect(session.userId).toBe("user-1");
  });

  it("permissions array reflects only explicit backend permissions", () => {
    const session = adminSessionFromPrincipal(ownerPrincipal);
    // ownerPrincipal has 5 explicit permissions all in the allowlist
    expect(session.permissions.length).toBe(5);
    expect(session.permissions).toContain("CATALOG:READ");
    expect(session.permissions).toContain("INVENTORY:READ");
  });
});

// ---------------------------------------------------------------------------
// AdminAuthClient tests
// ---------------------------------------------------------------------------

const sessionResponse = {
  csrfTokenHash: "hash-csrf",
  displayName: "Alice Owner",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  organizationId: "org-1",
  organizationName: "SENVO Wear",
  permissions: [{ resource: "CATALOG", action: "READ" }],
  role: "OWNER" as const,
  sessionId: "session-1",
  userId: "user-1",
};

const loginResponse = {
  csrfToken: "csrf-abc",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  principal: ownerPrincipal,
  sessionToken: "token-xyz",
};

function makeApiSuccess<T>(data: T): Response {
  return new Response(
    JSON.stringify({ data, requestId: "req-1", success: true }),
    {
      headers: { "content-type": "application/json", "x-request-id": "req-1" },
      status: 200,
    },
  );
}

function makeApiFailure(code: string, status: number): Response {
  return new Response(
    JSON.stringify({
      error: { code, message: "err" },
      requestId: "req-1",
      success: false,
    }),
    {
      headers: { "content-type": "application/json", "x-request-id": "req-1" },
      status,
    },
  );
}

describe("AdminAuthClient", () => {
  beforeEach(() => {
    clearCredentials();
  });

  afterEach(() => {
    clearCredentials();
    vi.restoreAllMocks();
  });

  it("login: success stores credentials and returns session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeApiSuccess(loginResponse));
    const client = new AdminAuthClient({ fetcher });

    const result = await client.login("admin@test.com", "Pass123!", false);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.displayName).toBe("Alice Owner");
      expect(result.credentials.sessionToken).toBe("token-xyz");
    }
    expect(readStoredCredentials()?.sessionToken).toBe("token-xyz");
  });

  it("login: invalid credentials returns kind=invalid_credentials", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeApiFailure("AUTHENTICATION.REQUIRED", 401));
    const client = new AdminAuthClient({ fetcher });

    const result = await client.login("admin@test.com", "wrong", false);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_credentials");
    }
  });

  it("login: account disabled returns kind=account_disabled", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeApiFailure("AUTHORIZATION.ACCOUNT_DISABLED", 403));
    const client = new AdminAuthClient({ fetcher });

    const result = await client.login("admin@test.com", "Pass123!", false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("account_disabled");
  });

  it("login: membership inactive returns kind=membership_inactive", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        makeApiFailure("AUTHORIZATION.MEMBERSHIP_INACTIVE", 403),
      );
    const client = new AdminAuthClient({ fetcher });

    const result = await client.login("admin@test.com", "Pass123!", false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("membership_inactive");
  });

  it("restoreSession: returns null when no credentials stored", async () => {
    const client = new AdminAuthClient();
    const result = await client.restoreSession();
    expect(result).toBeNull();
  });

  it("restoreSession: validates stored token with backend", async () => {
    storeCredentials(sessionCredentials());
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeApiSuccess(sessionResponse));
    const client = new AdminAuthClient({ fetcher });

    const result = await client.restoreSession();

    expect(result).not.toBeNull();
    expect(result?.session.displayName).toBe("Alice Owner");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/admin/auth/session"),
      expect.anything(),
    );
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer token-xyz");
  });

  it("restoreSession: clears credentials on 401 and returns null", async () => {
    storeCredentials(sessionCredentials());
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeApiFailure("AUTHENTICATION.REQUIRED", 401));
    const client = new AdminAuthClient({ fetcher });

    const result = await client.restoreSession();

    expect(result).toBeNull();
    expect(readStoredCredentials()).toBeNull();
  });

  it("restoreSession: clears credentials when stored token is expired", async () => {
    storeCredentials({
      ...sessionCredentials(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const fetcher = vi.fn<typeof fetch>();
    const client = new AdminAuthClient({ fetcher });

    const result = await client.restoreSession();

    expect(result).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(readStoredCredentials()).toBeNull();
  });

  it("logout: calls endpoint with Bearer + CSRF and clears credentials", async () => {
    const creds = sessionCredentials();
    storeCredentials(creds);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeApiSuccess({ loggedOut: true }));
    const client = new AdminAuthClient({ fetcher });

    await client.logout(creds);

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/admin/auth/logout"),
      expect.objectContaining({ method: "POST" }),
    );
    // Credentials cleared after logout
    expect(readStoredCredentials()).toBeNull();
  });

  it("logout: clears local credentials even if server returns error", async () => {
    const creds = sessionCredentials();
    storeCredentials(creds);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeApiFailure("AUTHENTICATION.REQUIRED", 401));
    const client = new AdminAuthClient({ fetcher });

    await client.logout(creds);
    expect(readStoredCredentials()).toBeNull();
  });
});
