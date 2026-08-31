import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createDevelopmentCorsRequestListener } from "./development-cors.js";

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

describe("development CORS boundary", () => {
  it("answers an allowed Storefront preflight without reaching the API", async () => {
    let calls = 0;
    const url = await startServer((_request, response) => {
      calls += 1;
      response.end();
    });
    const response = await fetch(url, {
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
      },
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(calls).toBe(0);
  });

  it("rejects any other browser origin", async () => {
    const url = await startServer((_request, response) => response.end());
    const response = await fetch(url, {
      headers: { origin: "https://example.com" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.json()).toMatchObject({
      error: { code: "AUTHORIZATION.ORIGIN" },
      success: false,
    });
  });

  it("delegates allowed requests and preserves the exact origin", async () => {
    const url = await startServer((_request, response) => {
      response.statusCode = 200;
      response.end("catalog");
    });
    const response = await fetch(url, {
      headers: { origin: "http://localhost:3000" },
    });

    expect(await response.text()).toBe("catalog");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
  });

  it("allows workforce authentication headers on allowed-origin preflight", async () => {
    let calls = 0;
    const url = await startServer((_request, response) => {
      calls += 1;
      response.end();
    });
    const response = await fetch(url, {
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-headers": "authorization, x-csrf-token",
        "access-control-request-method": "POST",
      },
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(calls).toBe(0);
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "content-type, x-request-id, x-dev-user-id, x-dev-organization-id, x-dev-permissions, authorization, x-csrf-token",
    );
  });
});

async function startServer(
  listener: Parameters<typeof createDevelopmentCorsRequestListener>[0],
): Promise<string> {
  const server = createServer(
    createDevelopmentCorsRequestListener(listener, [
      "http://localhost:3000",
      "http://localhost:3001",
    ]),
  );
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
