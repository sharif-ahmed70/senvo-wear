import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProtectedApiHandler,
  type ApiHandler,
  type ApiRequest,
} from "@senvo/api";
import type { ApplicationAuthorizationService } from "@senvo/application";
import {
  createApiSuccess,
  postInventoryMovementServiceInputSchema,
  type ApiResponse,
  type PostInventoryMovementServiceInputContract,
} from "@senvo/contracts";
import {
  DefaultRequestIdFactory,
  DevelopmentAuthenticationService,
  DevelopmentHeaderRequestContextFactory,
  createSenvoHttpServer,
  type NodeHttpAdapterOptions,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const movementId = "10000000-0000-4000-8000-000000000003";
const suppliedRequestId = "req_http_adapter_1";
const generatedRequestId = "req_generated_http_1";
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

describe("Node HTTP runtime adapter", () => {
  it("routes a sales request and converts development headers to context", async () => {
    const sales = new RecordingApiHandler(
      createApiSuccess({ id: "sales-order-1" }, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: sales,
        postInventoryMovement: new RecordingApiHandler(
          createApiSuccess({}, suppliedRequestId),
        ),
      },
    });

    const response = await fetch(`${runtime.url}/sales-orders`, {
      body: JSON.stringify({ orderNumber: "SO-HTTP-1" }),
      headers: developmentHeaders(suppliedRequestId),
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      data: { id: "sales-order-1" },
      requestId: suppliedRequestId,
      success: true,
    });
    expect(response.headers.get("x-request-id")).toBe(suppliedRequestId);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(sales.requests).toEqual([
      {
        context: {
          authenticatedUser: { userId },
          organizationId,
          permissions: [
            { action: "CREATE", resource: "SALES_ORDER" },
            { action: "UPDATE", resource: "INVENTORY" },
          ],
          requestId: suppliedRequestId,
        },
        input: { orderNumber: "SO-HTTP-1" },
      },
    ]);
  });

  it("generates and propagates a request ID when the header is absent", async () => {
    const inventory = new ContextEchoApiHandler();
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: inventory,
        postInventoryMovement: inventory,
      },
      requestIdFactory: new DefaultRequestIdFactory(() => generatedRequestId),
    });

    const response = await fetch(`${runtime.url}/inventory/movements`, {
      body: JSON.stringify({ movementId }),
      headers: developmentHeaders(),
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(generatedRequestId);
    expect(await response.json()).toEqual({
      data: { requestId: generatedRequestId },
      requestId: generatedRequestId,
      success: true,
    });
  });

  it("returns gateway validation failures as HTTP 400 responses", async () => {
    const runtime = await startProtectedInventoryRuntime();

    const response = await fetch(`${runtime.url}/inventory/movements`, {
      body: JSON.stringify({ movementId, unknown: true }),
      headers: developmentHeaders(suppliedRequestId),
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION.INVALID_INPUT",
        message: "Input is invalid.",
      },
      requestId: suppliedRequestId,
      success: false,
    });
  });

  it("returns authentication rejection as HTTP 401", async () => {
    const runtime = await startProtectedInventoryRuntime();
    const headers = developmentHeaders(suppliedRequestId);
    headers.delete("x-dev-user-id");

    const response = await fetch(`${runtime.url}/inventory/movements`, {
      body: JSON.stringify({ movementId }),
      headers,
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "AUTHENTICATION.REQUIRED",
        message: "Authentication is required.",
      },
      requestId: suppliedRequestId,
      success: false,
    });
  });

  it("maps a successful protected inventory response to HTTP 200", async () => {
    const authorization = new AllowAuthorizationService();
    const runtime = await startProtectedInventoryRuntime(authorization);

    const response = await fetch(`${runtime.url}/inventory/movements`, {
      body: JSON.stringify({ movementId }),
      headers: developmentHeaders(suppliedRequestId),
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { id: movementId },
      requestId: suppliedRequestId,
      success: true,
    });
    expect(authorization.calls).toEqual([
      {
        organizationId,
        permission: { action: "UPDATE", resource: "INVENTORY" },
        requestId: suppliedRequestId,
        userId,
      },
    ]);
  });

  it("rejects malformed JSON without calling an API handler", async () => {
    const inventory = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: inventory,
        postInventoryMovement: inventory,
      },
    });

    const response = await fetch(`${runtime.url}/inventory/movements`, {
      body: "{",
      headers: developmentHeaders(suppliedRequestId),
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION.INVALID_JSON",
        message: "Request body must contain valid JSON.",
      },
      requestId: suppliedRequestId,
      success: false,
    });
    expect(inventory.requests).toEqual([]);
  });

  it("does not allow development authentication adapters in production", () => {
    expect(
      () => new DevelopmentAuthenticationService("production" as "development"),
    ).toThrow("unavailable in production");
    expect(
      () =>
        new DevelopmentHeaderRequestContextFactory(
          "production" as "development",
        ),
    ).toThrow("unavailable in production");
  });
});

class RecordingApiHandler implements ApiHandler<unknown> {
  readonly requests: ApiRequest[] = [];

  constructor(private readonly response: ApiResponse<unknown>) {}

  handle(request: ApiRequest) {
    this.requests.push(request);
    return Promise.resolve(this.response);
  }
}

class ContextEchoApiHandler implements ApiHandler<unknown> {
  handle(request: ApiRequest) {
    return Promise.resolve(
      createApiSuccess(
        { requestId: request.context.requestId },
        request.context.requestId,
      ),
    );
  }
}

class AllowAuthorizationService implements ApplicationAuthorizationService {
  readonly calls: Array<{
    organizationId: string;
    permission: Parameters<ApplicationAuthorizationService["authorize"]>[1];
    requestId: string;
    userId: string | null;
  }> = [];

  authorize(
    context: Parameters<ApplicationAuthorizationService["authorize"]>[0],
    permission: Parameters<ApplicationAuthorizationService["authorize"]>[1],
  ) {
    this.calls.push({
      organizationId: context.organizationId,
      permission,
      requestId: context.requestId,
      userId: context.userId,
    });
    return Promise.resolve();
  }
}

async function startProtectedInventoryRuntime(
  authorizationService = new AllowAuthorizationService(),
) {
  const inventory = createProtectedApiHandler<
    PostInventoryMovementServiceInputContract,
    { id: string }
  >({
    authenticationService: new DevelopmentAuthenticationService("test"),
    authorizationService,
    execute: (_context, input) =>
      Promise.resolve({ data: { id: input.movementId }, ok: true }),
    inputSchema: postInventoryMovementServiceInputSchema,
    permission: { action: "UPDATE", resource: "INVENTORY" },
  });
  return startRuntime({
    handlers: {
      createSalesOrder: inventory,
      postInventoryMovement: inventory,
    },
  });
}

async function startRuntime(
  overrides: Pick<NodeHttpAdapterOptions, "handlers"> &
    Partial<Omit<NodeHttpAdapterOptions, "handlers" | "contextFactory">>,
) {
  const server = createSenvoHttpServer({
    contextFactory: new DevelopmentHeaderRequestContextFactory("test"),
    ...overrides,
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${address.port}` };
}

function developmentHeaders(requestId?: string): Headers {
  const headers = new Headers({
    "content-type": "application/json",
    "x-dev-organization-id": organizationId,
    "x-dev-permissions": "SALES_ORDER:CREATE,INVENTORY:UPDATE",
    "x-dev-user-id": userId,
  });
  if (requestId) {
    headers.set("x-request-id", requestId);
  }
  return headers;
}
