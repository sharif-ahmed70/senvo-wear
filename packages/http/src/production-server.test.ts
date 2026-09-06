import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ApplicationServices } from "@senvo/application";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductionServerConfig } from "./production-server-config.js";
import {
  createProductionRequestListener,
  nullLogger,
  shutdownProductionServer,
} from "./production-server.js";
import {
  workforceCsrfCookie,
  workforceSessionCookie,
} from "./workforce-authentication-http.js";

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

const mockConfig: ProductionServerConfig = {
  adminOrigins: ["https://admin.senvo.com"],
  allowedOrigins: ["https://admin.senvo.com", "https://senvo.com"],
  authSecret: "test-auth-secret-needs-to-be-at-least-32-chars-long",
  cookieDomain: undefined,
  cookieSameSite: "lax",
  cookieSecure: false, // false for local HTTP test runner
  databaseUrl: "postgresql://senvo:pass@db.example.com:5432/senvo",
  host: "127.0.0.1",
  organizationCode: "SENVO",
  port: 4000,
  storefrontOrigins: ["https://senvo.com"],
};

describe("production server HTTP listener", () => {
  it("responds to /health with status ok", async () => {
    const services = createMockServices();
    const url = await startServer(services, mockConfig);

    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; uptime: number };
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });

  it("responds to /ready with 200 when checkReadiness returns true", async () => {
    const services = createMockServices({
      checkReadiness: vi.fn(async () => true),
    });
    const url = await startServer(services, mockConfig);

    const response = await fetch(`${url}/ready`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("ready");
  });

  it("responds to /ready with 503 when checkReadiness returns false", async () => {
    const services = createMockServices({
      checkReadiness: vi.fn(async () => false),
    });
    const url = await startServer(services, mockConfig);

    const response = await fetch(`${url}/ready`);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("unavailable");
  });

  it("sets HttpOnly session and CSRF cookies on workforce login", async () => {
    const services = createMockServices();
    const url = await startServer(services, mockConfig);

    const response = await fetch(`${url}/admin/auth/login`, {
      body: JSON.stringify({
        email: "admin@senvo.test",
        password: "ValidPassword123!",
      }),
      headers: {
        "content-type": "application/json",
        origin: "https://admin.senvo.com",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const setCookieHeaders = response.headers.getSetCookie();
    expect(setCookieHeaders.length).toBeGreaterThanOrEqual(2);

    const sessionCookieHeader = setCookieHeaders.find((c) =>
      c.startsWith(`${workforceSessionCookie}=`),
    );
    expect(sessionCookieHeader).toBeDefined();
    expect(sessionCookieHeader).toContain("HttpOnly");
    expect(sessionCookieHeader).toContain("SameSite=Lax");

    const csrfCookieHeader = setCookieHeaders.find((c) =>
      c.startsWith(`${workforceCsrfCookie}=`),
    );
    expect(csrfCookieHeader).toBeDefined();

    const body = (await response.json()) as {
      data: { csrfToken: string; sessionToken?: string };
    };
    expect(body.data.csrfToken).toBe("csrf-test-token");
    // sessionToken must NOT be present in JSON body in production
    expect(body.data.sessionToken).toBeUndefined();
  });

  it("authenticates workforce session via cookie", async () => {
    const services = createMockServices();
    const url = await startServer(services, mockConfig);

    const response = await fetch(`${url}/admin/auth/session`, {
      headers: {
        cookie: `${workforceSessionCookie}=valid-session-token`,
        origin: "https://admin.senvo.com",
      },
      method: "GET",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { userId: string };
    };
    expect(body.data.userId).toBe("user-1");
    expect(
      services.workforceAuthentication!.authenticateSession,
    ).toHaveBeenCalledWith("valid-session-token");
  });

  it("gracefully shuts down the server and disconnects services", async () => {
    const services = createMockServices({
      disconnect: vi.fn(async () => {}),
    });
    const { server, url } = await startServerWithHandle(services, mockConfig);

    const healthRes = await fetch(`${url}/health`);
    expect(healthRes.status).toBe(200);

    await shutdownProductionServer({
      logger: nullLogger,
      server,
      services,
    });

    expect(services.disconnect).toHaveBeenCalledTimes(1);
    await expect(fetch(`${url}/health`)).rejects.toThrow();
  });
});

function createMockServices(
  overrides: Partial<ApplicationServices> = {},
): ApplicationServices {
  return {
    checkReadiness: vi.fn(async () => true),
    customerAuthentication: undefined,
    disconnect: vi.fn(async () => {}),
    workforceAuthentication: {
      authenticateSession: vi.fn(async (_token: string) => ({
        csrfTokenHash: "csrf-hash",
        displayName: "SENVO Admin",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        organizationId: "org-1",
        organizationName: "SENVO",
        permissions: [{ action: "READ", resource: "ORGANIZATION" }],
        role: "ADMIN" as const,
        sessionId: "sess-1",
        userId: "user-1",
      })),
      authorizeMutation: vi.fn(async () => ({
        csrfTokenHash: "csrf-hash",
        displayName: "SENVO Admin",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        organizationId: "org-1",
        organizationName: "SENVO",
        permissions: [{ action: "READ", resource: "ORGANIZATION" }],
        role: "ADMIN" as const,
        sessionId: "sess-1",
        userId: "user-1",
      })),
      login: vi.fn(async () => ({
        csrfToken: "csrf-test-token",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        principal: {
          displayName: "SENVO Admin",
          organizationId: "org-1",
          organizationName: "SENVO",
          permissions: [{ action: "READ", resource: "ORGANIZATION" }],
          role: "ADMIN" as const,
          userId: "user-1",
        },
        sessionToken: "valid-session-token",
      })),
      logout: vi.fn(async () => {}),
    } as unknown as ApplicationServices["workforceAuthentication"],
    ...overrides,
  } as unknown as ApplicationServices;
}

async function startServer(
  services: ApplicationServices,
  config: ProductionServerConfig,
): Promise<string> {
  const { url } = await startServerWithHandle(services, config);
  return url;
}

async function startServerWithHandle(
  services: ApplicationServices,
  config: ProductionServerConfig,
): Promise<{ server: Server; url: string }> {
  const { WorkforceSessionRequestContextFactory } =
    await import("./request-context.js");
  const contextFactory = new WorkforceSessionRequestContextFactory(
    services.workforceAuthentication!,
  );

  const listener = createProductionRequestListener({
    config,
    contextFactory,
    logger: nullLogger,
    services,
  });

  const server = createServer(listener);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
  return { server, url: `http://127.0.0.1:${address.port}` };
}
