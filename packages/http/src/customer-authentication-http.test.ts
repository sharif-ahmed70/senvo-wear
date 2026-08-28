import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { CustomerAuthenticationService } from "@senvo/application";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCustomerAuthenticationRequestListener } from "./customer-authentication-http.js";

const servers: Server[] = [];
const publicOrigin = "http://localhost:3000";
const session = {
  csrfToken: "csrf-secret",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  profile: {
    customerAccountId: "customer-1",
    email: "customer@example.com",
    emailVerified: true,
    firstName: "SENVO",
    lastName: "Customer",
    organizationId: "organization-1",
    phone: null,
    phoneVerified: false,
    status: "ACTIVE" as const,
    userId: "user-1",
  },
  sessionToken: "opaque-session-secret",
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

describe("customer authentication HTTP boundary", () => {
  it("sets secure server-managed cookies and never exposes auth secrets in JSON", async () => {
    const application = authApplication();
    const url = await start(application);
    const response = await fetch(url + "/storefront/auth/login", {
      body: JSON.stringify({
        email: "customer@example.com",
        password: "Strong!Password123",
        rememberMe: true,
      }),
      headers: { "content-type": "application/json", origin: publicOrigin },
      method: "POST",
    });
    const text = await response.text();
    const cookies = response.headers.getSetCookie();

    expect(response.status).toBe(200);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain("HttpOnly");
    expect(cookies[0]).toContain("SameSite=Lax");
    expect(cookies[0]).toContain("Secure");
    expect(cookies[1]).not.toContain("HttpOnly");
    expect(text).not.toContain(session.sessionToken);
    expect(text).not.toContain(session.csrfToken);
  });

  it("rejects cross-origin mutations before invoking authentication logic", async () => {
    const application = authApplication();
    const url = await start(application);
    const response = await fetch(url + "/storefront/auth/login", {
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

  it("returns strict field validation without accepting customer roles", async () => {
    const application = authApplication();
    const url = await start(application);
    const response = await fetch(url + "/storefront/auth/register", {
      body: JSON.stringify({
        email: "not-an-email",
        role: "ADMIN",
      }),
      headers: { "content-type": "application/json", origin: publicOrigin },
      method: "POST",
    });
    const body = (await response.json()) as {
      error: { fieldErrors: Record<string, string[]> };
    };

    expect(response.status).toBe(400);
    expect(body.error.fieldErrors.email).toBeDefined();
    expect(body.error.fieldErrors.form).toBeDefined();
  });

  it("requires both the opaque session and double-submit CSRF value for logout", async () => {
    const application = authApplication();
    const url = await start(application);
    const response = await fetch(url + "/storefront/auth/logout", {
      body: "{}",
      headers: {
        "content-type": "application/json",
        cookie:
          "senvo_customer_session=opaque-session-secret; senvo_customer_csrf=csrf-secret",
        origin: publicOrigin,
        "x-csrf-token": "csrf-secret",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(application.authorizeMutation).toHaveBeenCalledWith(
      "opaque-session-secret",
      "csrf-secret",
    );
    expect(application.logout).toHaveBeenCalledWith("opaque-session-secret");
  });

  it("keeps Google account-creation consent out of the browser OAuth cookie", async () => {
    const application = authApplication();
    const url = await start(application);
    const response = await fetch(url + "/storefront/auth/google/start", {
      body: JSON.stringify({
        redirect: "https://evil.test/account",
        termsAccepted: true,
      }),
      headers: { "content-type": "application/json", origin: publicOrigin },
      method: "POST",
    });
    const cookieHeader = response.headers.getSetCookie()[0] ?? "";
    const encoded =
      cookieHeader.split(";")[0]?.split("=").slice(1).join("=") ?? "";
    const oauthState = JSON.parse(
      Buffer.from(decodeURIComponent(encoded), "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(application.startGoogle).toHaveBeenCalledWith({
      termsAccepted: true,
    });
    expect(oauthState.redirect).toBe("/");
    expect(oauthState).not.toHaveProperty("termsAccepted");
  });
});

function authApplication() {
  return {
    authorizeMutation: vi.fn(() => Promise.resolve(session.profile)),
    login: vi.fn(() => Promise.resolve(session)),
    logout: vi.fn(() => Promise.resolve()),
    startGoogle: vi.fn(() =>
      Promise.resolve({
        challengeId: "challenge-1",
        codeVerifier: "code-verifier",
        state: "oauth-state",
        url: "https://accounts.google.com/o/oauth2/v2/auth",
      }),
    ),
  } as unknown as CustomerAuthenticationService & {
    authorizeMutation: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    startGoogle: ReturnType<typeof vi.fn>;
  };
}

async function start(application: CustomerAuthenticationService) {
  const server = createServer(
    createCustomerAuthenticationRequestListener({
      application,
      delegate: (_request, response) => {
        response.statusCode = 404;
        response.end();
      },
      publicOrigin,
      secureCookies: true,
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
