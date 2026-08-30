import { describe, expect, it, vi } from "vitest";
import type { WorkforceAuthenticationService } from "@senvo/application";
import {
  HttpRequestContextError,
  WorkforceSessionRequestContextFactory,
} from "./request-context.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const authenticatedPrincipal = {
  csrfTokenHash: "hash-csrf",
  displayName: "Alice Admin",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  organizationId: "org-1",
  organizationName: "SENVO Wear",
  permissions: [
    { resource: "CATALOG", action: "READ" },
    { resource: "INVENTORY", action: "UPDATE" },
    { resource: "ORGANIZATION", action: "READ" },
    { resource: "TEAM", action: "READ" },
    { resource: "SALES", action: "READ" },
    { resource: "POS", action: "CREATE" },
    { resource: "PAYMENT", action: "APPROVE" },
    { resource: "RECEIPT", action: "READ" },
    // Backend might send a future resource not yet in the allowlist
    { resource: "FUTURE_RESOURCE", action: "READ" },
  ],
  role: "ADMIN" as const,
  sessionId: "session-1",
  userId: "user-1",
};

function makeWorkforce(
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorkforceSessionRequestContextFactory", () => {
  it("authenticates a valid Bearer token and returns populated context", async () => {
    const service = makeWorkforce();
    const factory = new WorkforceSessionRequestContextFactory(service);

    const context = await factory.create({
      headers: { authorization: "Bearer valid-session-token" },
      requestId: "req-123",
    });

    expect(context.authenticatedUser).toEqual({ userId: "user-1" });
    expect(context.organizationId).toBe("org-1");
    expect(context.requestId).toBe("req-123");
    expect(service.authenticateSession).toHaveBeenCalledWith(
      "valid-session-token",
    );
  });

  it("maps only whitelisted permission resources and actions", async () => {
    const service = makeWorkforce();
    const factory = new WorkforceSessionRequestContextFactory(service);

    const context = await factory.create({
      headers: { authorization: "Bearer valid-session-token" },
      requestId: "req-1",
    });

    // CATALOG:READ, INVENTORY:UPDATE, ORGANIZATION:READ, TEAM:READ, SALES:READ, POS:CREATE, PAYMENT:APPROVE, RECEIPT:READ are valid
    expect(context.permissions).toContainEqual({
      resource: "CATALOG",
      action: "READ",
    });
    expect(context.permissions).toContainEqual({
      resource: "INVENTORY",
      action: "UPDATE",
    });
    expect(context.permissions).toContainEqual({
      resource: "ORGANIZATION",
      action: "READ",
    });
    expect(context.permissions).toContainEqual({
      resource: "TEAM",
      action: "READ",
    });
    expect(context.permissions).toContainEqual({
      resource: "SALES",
      action: "READ",
    });
    expect(context.permissions).toContainEqual({
      resource: "POS",
      action: "CREATE",
    });
    expect(context.permissions).toContainEqual({
      resource: "PAYMENT",
      action: "APPROVE",
    });
    expect(context.permissions).toContainEqual({
      resource: "RECEIPT",
      action: "READ",
    });
    // FUTURE_RESOURCE:READ must NOT appear
    expect(
      context.permissions.some(
        (p) => (p.resource as string) === "FUTURE_RESOURCE",
      ),
    ).toBe(false);
  });

  it("throws HttpRequestContextError when Authorization header is missing", async () => {
    const service = makeWorkforce();
    const factory = new WorkforceSessionRequestContextFactory(service);

    await expect(
      factory.create({ headers: {}, requestId: "req-1" }),
    ).rejects.toThrow(HttpRequestContextError);

    expect(service.authenticateSession).not.toHaveBeenCalled();
  });

  it("throws HttpRequestContextError when Authorization is not Bearer", async () => {
    const service = makeWorkforce();
    const factory = new WorkforceSessionRequestContextFactory(service);

    await expect(
      factory.create({
        headers: { authorization: "Basic dXNlcjpwYXNz" },
        requestId: "req-1",
      }),
    ).rejects.toThrow(HttpRequestContextError);
  });

  it("propagates service errors (e.g. expired session) unchanged", async () => {
    const service = makeWorkforce({
      authenticateSession: vi.fn(() =>
        Promise.reject(new Error("Session expired")),
      ),
    });
    const factory = new WorkforceSessionRequestContextFactory(service);

    await expect(
      factory.create({
        headers: { authorization: "Bearer expired-token" },
        requestId: "req-1",
      }),
    ).rejects.toThrow("Session expired");
  });
});
