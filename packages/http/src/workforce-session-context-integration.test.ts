/**
 * Integration test: Bearer token → WorkforceSessionRequestContextFactory →
 * ApiRequestContext delivered to a business handler.
 *
 * This test proves the ACTUAL composed HTTP request path used when
 * AUTH_SECRET is set in the development server (and in production). It wires
 * createWorkforceAuthenticationRequestListener (auth routes) over
 * createSenvoHttpRequestListener (business routes) with
 * WorkforceSessionRequestContextFactory as the contextFactory, then makes a
 * real HTTP request and verifies the handler receives the correct context from
 * the workforce session.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ApiRequest } from "@senvo/api";
import {
  WorkforceAuthenticationError,
  type WorkforceAuthenticationService,
} from "@senvo/application";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkforceAuthenticationRequestListener } from "./workforce-authentication-http.js";
import { createSenvoHttpRequestListener } from "./node-http-adapter.js";
import { WorkforceSessionRequestContextFactory } from "./request-context.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const publicOrigin = "http://localhost:3000";
const sessionToken = "valid-workforce-bearer-token";

const authenticatedPrincipal = {
  csrfTokenHash: "hash-csrf",
  displayName: "Alice Admin",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  organizationId: "org-integration-1",
  organizationName: "SENVO Wear",
  permissions: [
    { resource: "CATALOG", action: "READ" },
    { resource: "INVENTORY", action: "UPDATE" },
  ],
  role: "ADMIN" as const,
  sessionId: "session-integration-1",
  userId: "user-integration-1",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const servers: Server[] = [];

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

function makeWorkforceService(
  overrides: Partial<
    Record<keyof WorkforceAuthenticationService, ReturnType<typeof vi.fn>>
  > = {},
) {
  return {
    authenticateSession: vi.fn(() => Promise.resolve(authenticatedPrincipal)),
    authorizeMutation: vi.fn(() => Promise.resolve()),
    login: vi.fn(() => Promise.resolve({} as never)),
    logout: vi.fn(() => Promise.resolve()),
    ...overrides,
  } as unknown as WorkforceAuthenticationService & {
    authenticateSession: ReturnType<typeof vi.fn>;
    authorizeMutation: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
}

/**
 * Creates the same listener composition as development-server.ts uses when
 * AUTH_SECRET is set:
 *   workforceAuthListener (auth routes) → apiListener (business routes)
 *   apiListener uses WorkforceSessionRequestContextFactory
 */
async function startIntegratedServer(
  workforceService: WorkforceAuthenticationService,
  capturedContext: { value: unknown },
): Promise<string> {
  // Stub handler that captures the request context received by the handler
  const captureHandler = {
    handle: vi.fn((request: ApiRequest) => {
      capturedContext.value = request.context;
      return Promise.resolve({
        data: { captured: true },
        requestId: "req-test",
        success: true as const,
      });
    }),
  };

  const apiListener = createSenvoHttpRequestListener({
    contextFactory: new WorkforceSessionRequestContextFactory(workforceService),
    handlers: {
      createSalesOrder: captureHandler,
      postInventoryMovement: captureHandler,
    },
  });

  const composedListener = createWorkforceAuthenticationRequestListener({
    application: workforceService,
    delegate: apiListener,
    publicOrigin,
    secureCookies: false,
  });

  const server = createServer(composedListener);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return "http://127.0.0.1:" + address.port;
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("Bearer token → WorkforceSessionRequestContextFactory → ApiRequestContext (integration)", () => {
  it("delivers correct userId, organizationId and permissions from the workforce session to a business handler", async () => {
    const service = makeWorkforceService();
    const capturedContext = { value: undefined as unknown };

    const url = await startIntegratedServer(service, capturedContext);

    const response = await fetch(url + "/sales-orders", {
      body: JSON.stringify({}),
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "content-type": "application/json",
        origin: publicOrigin,
      },
      method: "POST",
    });

    // The handler ran (even if it returned a validation error the context was set)
    expect(response.status).not.toBe(401);
    // The workforce service authenticateSession was called with the token
    expect(service.authenticateSession).toHaveBeenCalledWith(sessionToken);
    // The context passed to the handler matches the principal from the session
    const ctx = capturedContext.value as {
      authenticatedUser: { userId: string } | null;
      organizationId: string;
      permissions: { resource: string; action: string }[];
    };
    expect(ctx.authenticatedUser?.userId).toBe("user-integration-1");
    expect(ctx.organizationId).toBe("org-integration-1");
    expect(ctx.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource: "CATALOG", action: "READ" }),
        expect.objectContaining({ resource: "INVENTORY", action: "UPDATE" }),
      ]),
    );
  });

  it("returns 401 when no Bearer token is supplied to a business route", async () => {
    const service = makeWorkforceService();
    const capturedContext = { value: undefined as unknown };

    const url = await startIntegratedServer(service, capturedContext);

    const response = await fetch(url + "/sales-orders", {
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json",
        origin: publicOrigin,
      },
      method: "POST",
    });

    // HttpRequestContextError from WorkforceSessionRequestContextFactory
    // should be caught and produce a 401
    expect(response.status).toBe(401);
    expect(service.authenticateSession).not.toHaveBeenCalled();
  });

  it("returns 401 when the workforce service rejects an invalid token", async () => {
    const service = makeWorkforceService({
      authenticateSession: vi.fn(() =>
        Promise.reject(
          new WorkforceAuthenticationError("UNAUTHORIZED", "Invalid token."),
        ),
      ),
    });
    const capturedContext = { value: undefined as unknown };

    const url = await startIntegratedServer(service, capturedContext);

    const response = await fetch(url + "/sales-orders", {
      body: JSON.stringify({}),
      headers: {
        authorization: "Bearer bad-token",
        "content-type": "application/json",
        origin: publicOrigin,
      },
      method: "POST",
    });

    expect(response.status).toBe(401);
  });
});
