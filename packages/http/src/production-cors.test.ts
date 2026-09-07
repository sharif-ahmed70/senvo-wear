import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createProductionCorsRequestListener } from "./production-cors.js";

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

describe("production-cors", () => {
  const adminOrigins = ["https://admin.senvo.com", "https://pos.senvo.com"];
  const storefrontOrigins = [
    "https://senvo.com",
    "https://storefront.senvo.com",
  ];

  it("answers allowed Admin preflight on admin routes without reaching the delegate", async () => {
    let calls = 0;
    const url = await startServer(
      (_req, res) => {
        calls += 1;
        res.end();
      },
      { adminOrigins, storefrontOrigins },
    );

    const response = await fetch(`${url}/admin/auth/login`, {
      headers: {
        origin: "https://admin.senvo.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-csrf-token",
      },
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://admin.senvo.com",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(calls).toBe(0);
  });

  it("answers allowed Storefront preflight on storefront routes", async () => {
    let calls = 0;
    const url = await startServer(
      (_req, res) => {
        calls += 1;
        res.end();
      },
      { adminOrigins, storefrontOrigins },
    );

    const response = await fetch(`${url}/storefront/catalog`, {
      headers: {
        origin: "https://senvo.com",
        "access-control-request-method": "GET",
      },
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://senvo.com",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(calls).toBe(0);
  });

  it("rejects Storefront origin on Admin routes", async () => {
    const url = await startServer((_req, res) => res.end(), {
      adminOrigins,
      storefrontOrigins,
    });

    const response = await fetch(`${url}/admin/products`, {
      headers: { origin: "https://senvo.com" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AUTHORIZATION.ORIGIN");
  });

  it("rejects Admin origin on Storefront routes", async () => {
    const url = await startServer((_req, res) => res.end(), {
      adminOrigins,
      storefrontOrigins,
    });

    const response = await fetch(`${url}/storefront/cart`, {
      headers: { origin: "https://admin.senvo.com" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AUTHORIZATION.ORIGIN");
  });

  it("rejects untrusted origin on any route", async () => {
    const url = await startServer((_req, res) => res.end(), {
      adminOrigins,
      storefrontOrigins,
    });

    const response = await fetch(`${url}/health`, {
      headers: { origin: "https://malicious.example.com" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("passes non-browser requests without origin header to delegate", async () => {
    const url = await startServer(
      (_req, res) => {
        res.statusCode = 200;
        res.end("server-to-server");
      },
      { adminOrigins, storefrontOrigins },
    );

    const response = await fetch(`${url}/admin/sync`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("server-to-server");
  });
});

async function startServer(
  listener: Parameters<typeof createProductionCorsRequestListener>[0],
  options: Parameters<typeof createProductionCorsRequestListener>[1],
): Promise<string> {
  const server = createServer(
    createProductionCorsRequestListener(listener, options),
  );
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
