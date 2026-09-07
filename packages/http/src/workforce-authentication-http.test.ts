import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  WorkforceAuthenticationError,
  type WorkforceAuthenticationService,
} from "@senvo/application";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkforceAuthenticationRequestListener,
  workforceCsrfCookie,
  workforceSessionCookie,
} from "./workforce-authentication-http.js";

const servers: Server[] = [];
const publicOrigin = "http://localhost:3000";

const workforceSession = {
  csrfToken: "workforce-csrf-secret",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  principal: {
    displayName: "SENVO Admin",
    organizationId: "organization-1",
    organizationName: "SENVO Wear",
    permissions: [{ resource: "ORGANIZATION", action: "READ" }],
    role: "ADMIN" as const,
    userId: "user-1",
  },
  sessionToken: "opaque-workforce-session-token",
};

const authenticatedPrincipal = {
  csrfTokenHash: "hashed-csrf",
  displayName: "SENVO Admin",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  organizationId: "organization-1",
  organizationName: "SENVO Wear",
  permissions: [{ resource: "ORGANIZATION", action: "READ" }],
  role: "ADMIN" as const,
  sessionId: "session-1",
  userId: "user-1",
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("workforce authentication HTTP boundary", () => {
  it("returns session and CSRF tokens on successful login", async () => {
    const application = workforceApplication();
    const url = await start(application);
    const response = await fetch(url + "/admin/auth/login", {
      body: JSON.stringify({
        email: "admin@senvo.test",
        password: "StrongPass123!",
      }),
      headers: { "content-type": "application/json", origin: publicOrigin },
      method: "POST",
    });
    const body = (await response.json()) as {
      data: { csrfToken: string; sessionToken: string; principal: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.data.sessionToken).toBe(workforceSession.sessionToken);
    expect(body.data.csrfToken).toBe(workforceSession.csrfToken);
    expect(body.data.principal).toBeDefined();
  });

  it("returns 401 when credentials are invalid", async () => {
    const application = workforceApplication({
      login: vi.fn(() =>
        Promise.reject(
          new WorkforceAuthenticationError(
            "INVALID_CREDENTIALS",
            "Invalid credentials.",
          ),
        ),
      ),
    });
    const url = await start(application);
    const response = await fetch(url + "/admin/auth/login", {
      body: JSON.stringify({
        email: "admin@senvo.test",
        password: "WrongPass999!",
      }),
      headers: { "content-type": "application/json", origin: publicOrigin },
      method: "POST",
    });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("AUTHENTICATION.REQUIRED");
  });

  it("rejects cross-origin mutations before invoking authentication logic", async () => {
    const application = workforceApplication();
    const url = await start(application);
    const response = await fetch(url + "/admin/auth/login", {
      body: "{}",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.test",
      },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(application.login).not.toHaveBeenCalled();
  });

  it("returns strict field validation for workforce login", async () => {
    const application = workforceApplication();
    const url = await start(application);
    const response = await fetch(url + "/admin/auth/login", {
      body: JSON.stringify({ email: "not-an-email", password: "short" }),
      headers: { "content-type": "application/json", origin: publicOrigin },
      method: "POST",
    });
    const body = (await response.json()) as {
      error: { fieldErrors: Record<string, string[]> };
    };

    expect(response.status).toBe(400);
    expect(
      body.error.fieldErrors.email ?? body.error.fieldErrors.form,
    ).toBeDefined();
  });

  it("returns the authenticated principal from Bearer token", async () => {
    const application = workforceApplication();
    const url = await start(application);
    const response = await fetch(url + "/admin/auth/session", {
      headers: {
        authorization: "Bearer " + workforceSession.sessionToken,
        origin: publicOrigin,
      },
      method: "GET",
    });
    const body = (await response.json()) as {
      data: { userId: string; organizationId: string };
    };

    expect(response.status).toBe(200);
    expect(body.data.userId).toBe(authenticatedPrincipal.userId);
    expect(application.authenticateSession).toHaveBeenCalledWith(
      workforceSession.sessionToken,
    );
  });

  it("returns 401 when Bearer token is missing for session", async () => {
    const application = workforceApplication();
    const url = await start(application);
    const response = await fetch(url + "/admin/auth/session", {
      headers: { origin: publicOrigin },
      method: "GET",
    });

    expect(response.status).toBe(401);
    expect(application.authenticateSession).not.toHaveBeenCalled();
  });

  it("requires both Bearer session and CSRF double-submit for logout", async () => {
    const application = workforceApplication();
    const url = await start(application);
    const response = await fetch(url + "/admin/auth/logout", {
      body: "{}",
      headers: {
        authorization: "Bearer " + workforceSession.sessionToken,
        "content-type": "application/json",
        origin: publicOrigin,
        "x-csrf-token": workforceSession.csrfToken,
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(application.authorizeMutation).toHaveBeenCalledWith(
      workforceSession.sessionToken,
      workforceSession.csrfToken,
    );
    expect(application.logout).toHaveBeenCalledWith(
      workforceSession.sessionToken,
    );
  });

  it("delegates unknown /admin/auth routes to 404", async () => {
    const application = workforceApplication();
    const url = await start(application);
    const response = await fetch(url + "/admin/auth/unknown", {
      headers: { origin: publicOrigin },
      method: "GET",
    });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND.ROUTE");
  });

  it("passes non-/admin/auth routes to delegate", async () => {
    const application = workforceApplication();
    const delegate = vi.fn((_request: unknown, response: unknown) => {
      (response as { statusCode: number; end: () => void }).statusCode = 200;
      (response as { end: () => void }).end();
    });
    const url = await startWithDelegate(application, delegate);
    const response = await fetch(url + "/storefront/catalog", {
      headers: { origin: publicOrigin },
      method: "GET",
    });

    expect(response.status).toBe(200);
    expect(delegate).toHaveBeenCalled();
  });

  it("rejects unknown origin localhost:3999 in multi-origin setup", async () => {
    const application = workforceApplication();
    const url = await start(application, [
      "http://localhost:3000",
      "http://localhost:3001",
    ]);
    const response = await fetch(url + "/admin/auth/login", {
      body: JSON.stringify({
        email: "admin@senvo.test",
        password: "StrongPass123!",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3999",
      },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(application.login).not.toHaveBeenCalled();
  });

  it("rejects wildcard origin * in multi-origin setup", async () => {
    const application = workforceApplication();
    const url = await start(application, [
      "http://localhost:3000",
      "http://localhost:3001",
    ]);
    const response = await fetch(url + "/admin/auth/login", {
      body: JSON.stringify({
        email: "admin@senvo.test",
        password: "StrongPass123!",
      }),
      headers: {
        "content-type": "application/json",
        origin: "*",
      },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(application.login).not.toHaveBeenCalled();
  });

  it("sets HttpOnly session cookie on login", async () => {
    const application = workforceApplication();
    const url = await startWithOptions({
      application,
      delegate: (_req, res) => {
        (res as { statusCode: number; end: () => void }).statusCode = 404;
        (res as { end: () => void }).end();
      },
      publicOrigin,
      secureCookies: false,
    });

    const response = await fetch(url + "/admin/auth/login", {
      body: JSON.stringify({
        email: "admin@senvo.test",
        password: "StrongPass123!",
      }),
      headers: {
        "content-type": "application/json",
        origin: publicOrigin,
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(
      cookies.some((c) => c.startsWith(`${workforceSessionCookie}=`)),
    ).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${workforceCsrfCookie}=`))).toBe(
      true,
    );
  });

  it("omits sessionToken from response body when omitSessionTokenInBody is set", async () => {
    const application = workforceApplication();
    const url = await startWithOptions({
      application,
      delegate: (_req, res) => {
        (res as { statusCode: number; end: () => void }).statusCode = 404;
        (res as { end: () => void }).end();
      },
      omitSessionTokenInBody: true,
      publicOrigin,
      secureCookies: false,
    });

    const response = await fetch(url + "/admin/auth/login", {
      body: JSON.stringify({
        email: "admin@senvo.test",
        password: "StrongPass123!",
      }),
      headers: {
        "content-type": "application/json",
        origin: publicOrigin,
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { csrfToken: string; sessionToken?: string };
    };
    expect(body.data.csrfToken).toBe(workforceSession.csrfToken);
    expect(body.data.sessionToken).toBeUndefined();
  });

  it("restores session via senvo_workforce_session cookie", async () => {
    const application = workforceApplication();
    const url = await start(application);

    const response = await fetch(url + "/admin/auth/session", {
      headers: {
        cookie: `${workforceSessionCookie}=${workforceSession.sessionToken}`,
        origin: publicOrigin,
      },
      method: "GET",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { userId: string };
    };
    expect(body.data.userId).toBe(authenticatedPrincipal.userId);
    expect(application.authenticateSession).toHaveBeenCalledWith(
      workforceSession.sessionToken,
    );
  });

  it("requires CSRF validation for cookie-authenticated logout", async () => {
    const application = workforceApplication();
    const url = await start(application);

    // Missing CSRF token
    const unauthenticatedResponse = await fetch(url + "/admin/auth/logout", {
      body: "{}",
      headers: {
        "content-type": "application/json",
        cookie: `${workforceSessionCookie}=${workforceSession.sessionToken}`,
        origin: publicOrigin,
      },
      method: "POST",
    });

    expect(unauthenticatedResponse.status).toBe(401);
    expect(application.logout).not.toHaveBeenCalled();

    // With valid CSRF token header
    const authenticatedResponse = await fetch(url + "/admin/auth/logout", {
      body: "{}",
      headers: {
        "content-type": "application/json",
        cookie: `${workforceSessionCookie}=${workforceSession.sessionToken}`,
        origin: publicOrigin,
        "x-csrf-token": workforceSession.csrfToken,
      },
      method: "POST",
    });

    expect(authenticatedResponse.status).toBe(200);
    expect(application.authorizeMutation).toHaveBeenCalledWith(
      workforceSession.sessionToken,
      workforceSession.csrfToken,
    );
  });
});

function workforceApplication(
  overrides: Partial<WorkforceAuthenticationService> = {},
): WorkforceAuthenticationService & {
  authenticateSession: ReturnType<typeof vi.fn>;
  authorizeMutation: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
} {
  return {
    authenticateSession: vi.fn(() => Promise.resolve(authenticatedPrincipal)),
    authorizeMutation: vi.fn(() => Promise.resolve(authenticatedPrincipal)),
    login: vi.fn(() => Promise.resolve(workforceSession)),
    logout: vi.fn(() => Promise.resolve()),
    ...overrides,
  } as unknown as WorkforceAuthenticationService & {
    authenticateSession: ReturnType<typeof vi.fn>;
    authorizeMutation: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
}

async function start(
  application: WorkforceAuthenticationService,
  origin: string | readonly string[] = publicOrigin,
) {
  return startWithDelegate(
    application,
    (_request, response) => {
      (response as { statusCode: number }).statusCode = 404;
      (response as { end: () => void }).end();
    },
    origin,
  );
}

async function startWithDelegate(
  application: WorkforceAuthenticationService,
  delegate: (request: unknown, response: unknown) => void,
  origin: string | readonly string[] = publicOrigin,
) {
  const server = createServer(
    createWorkforceAuthenticationRequestListener({
      application,
      delegate,
      publicOrigin: origin,
      secureCookies: false,
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return "http://127.0.0.1:" + address.port;
}

async function startWithOptions(
  options: Parameters<typeof createWorkforceAuthenticationRequestListener>[0],
) {
  const server = createServer(
    createWorkforceAuthenticationRequestListener(options),
  );
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return "http://127.0.0.1:" + address.port;
}
