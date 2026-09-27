import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProtectedApiHandler,
  type ApiHandler,
  type ApiRequest,
  type CatalogApiHandlers,
  type OrganizationManagementApiHandlers,
  type PosApiHandlers,
  type ProcurementApiHandlers,
  type StorefrontApiHandlers,
} from "@senvo/api";
import type { ApplicationAuthorizationService } from "@senvo/application";
import {
  createApiFailure,
  createApiSuccess,
  createInventoryMovementServiceInputSchema,
  updateVariantPriceServiceInputSchema,
  postInventoryMovementServiceInputSchema,
  type ApiResponse,
  type CreateInventoryMovementServiceInputContract,
  type InventoryAvailabilityReadContract,
  type InventoryMovementHistoryContract,
  type InventoryReadPageContract,
  type PostInventoryMovementServiceInputContract,
  type SalesOrderDetailsReadContract,
  type SalesOrderServiceContract,
  type StockLocationReadContract,
  type VariantInventoryAvailabilityContract,
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
  it("routes variant price PATCH with path ownership and validates its payload", async () => {
    const requests: unknown[] = [];
    const handler = createProtectedApiHandler({
      authenticationService: new DevelopmentAuthenticationService("test"),
      authorizationService: { authorize: () => Promise.resolve() },
      permission: { action: "UPDATE", resource: "CATALOG" },
      inputSchema: updateVariantPriceServiceInputSchema,
      execute: (_context, input) => {
        requests.push(input);
        return Promise.resolve({ ok: true, data: input });
      },
    });
    const fallback = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        catalog: {
          updateVariantPrice: handler,
        } as unknown as CatalogApiHandlers,
        createSalesOrder: fallback,
        postInventoryMovement: fallback,
      },
    });
    const response = await fetch(
      `${runtime.url}/catalog/variants/${movementId}/price`,
      {
        method: "PATCH",
        headers: developmentHeaders(suppliedRequestId),
        body: JSON.stringify({
          variantId: userId,
          sellingPriceMinor: 12550,
          expectedSellingPriceMinor: 0,
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(requests).toEqual([
      {
        variantId: movementId,
        sellingPriceMinor: 12550,
        expectedSellingPriceMinor: 0,
      },
    ]);
    const invalid = await fetch(
      `${runtime.url}/catalog/variants/${movementId}/price`,
      {
        method: "PATCH",
        headers: developmentHeaders(suppliedRequestId),
        body: JSON.stringify({
          sellingPriceMinor: -1,
          expectedSellingPriceMinor: 0,
        }),
      },
    );
    expect(invalid.status).toBe(400);
    expect(requests).toHaveLength(1);
  });
  it("routes all public storefront operations without employee headers", async () => {
    const listCatalog = new RecordingApiHandler(
      createApiSuccess(
        {
          categories: [],
          collections: [],
          hasMore: false,
          page: 1,
          pageSize: 24,
          products: [],
        },
        suppliedRequestId,
      ),
    );
    const getProduct = new RecordingApiHandler(
      createApiSuccess(
        {
          category: { code: "tops", id: "category-1", name: "Tops" },
          collection: null,
          description: null,
          id: "product-1",
          name: "Everyday Tee",
          primaryImage: null,
          productCode: "TEE-1",
          slug: "everyday-tee",
          variants: [],
        },
        suppliedRequestId,
      ),
    );
    const checkout = new RecordingApiHandler(
      createApiSuccess(
        {
          currencyCode: "BDT" as const,
          orderId: "10000000-0000-4000-8000-000000000010",
          orderNumber: "WEB-1001",
          payment: null,
          paymentPreference: "CASH_ON_DELIVERY" as const,
          status: "RESERVED" as const,
          totalMinor: 2500,
        },
        suppliedRequestId,
      ),
    );
    const paymentOptions = new RecordingApiHandler(
      createApiSuccess(
        { methods: ["CASH_ON_DELIVERY" as const] },
        suppliedRequestId,
      ),
    );
    const paymentStatus = new RecordingApiHandler(
      createApiSuccess(
        {
          amountMinor: 2500,
          currencyCode: "BDT" as const,
          orderNumber: "WEB-1001",
          payment: {
            publicToken: "payment_public_token_1234567890123456",
            redirectUrl: null,
            resolutionStatus: "NORMAL" as const,
            status: "PENDING" as const,
          },
        },
        suppliedRequestId,
      ),
    );
    const paymentNotification = new RecordingApiHandler(
      createApiSuccess({ accepted: true, replayed: false }, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: checkout,
        postInventoryMovement: checkout,
        storefront: {
          checkout,
          getProduct,
          listCatalog,
          paymentNotification,
          paymentOptions,
          paymentStatus,
          retryPayment: paymentStatus,
        } satisfies StorefrontApiHandlers,
      },
    });
    const headers = new Headers({ "x-request-id": suppliedRequestId });

    const catalogResponse = await fetch(
      `${runtime.url}/storefront/catalog?search=tee`,
      { headers },
    );
    const productResponse = await fetch(
      `${runtime.url}/storefront/products/everyday-tee`,
      { headers },
    );
    const checkoutResponse = await fetch(
      `${runtime.url}/storefront/checkouts`,
      {
        body: JSON.stringify({ lines: [] }),
        headers: new Headers({
          "content-type": "application/json",
          "x-request-id": suppliedRequestId,
        }),
        method: "POST",
      },
    );
    const paymentStatusResponse = await fetch(
      `${runtime.url}/storefront/payments/payment_public_token_1234567890123456`,
      { headers },
    );
    const ipnResponse = await fetch(
      `${runtime.url}/payments/providers/sslcommerz/ipn`,
      {
        body: new URLSearchParams({
          status: "VALID",
          tran_id: "SW-ORDER-1",
          val_id: "validation-1",
          verify_key: "status,tran_id,val_id",
          verify_sign: "00000000000000000000000000000000",
        }),
        headers: new Headers({
          "content-type": "application/x-www-form-urlencoded",
          "x-request-id": suppliedRequestId,
        }),
        method: "POST",
      },
    );
    const malformedIpnResponse = await fetch(
      `${runtime.url}/payments/providers/sslcommerz/ipn`,
      {
        body: "status=VALID&status=FAILED",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      },
    );

    expect([
      catalogResponse.status,
      productResponse.status,
      checkoutResponse.status,
      paymentStatusResponse.status,
      ipnResponse.status,
      malformedIpnResponse.status,
    ]).toEqual([200, 200, 201, 200, 200, 400]);
    expect(listCatalog.requests[0]).toMatchObject({
      context: {
        authenticatedUser: null,
        organizationId: "",
        permissions: [],
        requestId: suppliedRequestId,
      },
      input: { search: "tee" },
    });
    expect(getProduct.requests[0]?.input).toEqual({ slug: "everyday-tee" });
    expect(checkout.requests[0]?.input).toEqual({ lines: [] });
    expect(paymentStatus.requests[0]?.input).toEqual({
      publicToken: "payment_public_token_1234567890123456",
    });
    expect(paymentNotification.requests[0]?.input).toMatchObject({
      status: "VALID",
      tran_id: "SW-ORDER-1",
      val_id: "validation-1",
    });
    expect(paymentNotification.requests).toHaveLength(1);
  });

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

  it("maps a successful create inventory movement draft response to HTTP 201", async () => {
    const authorization = new AllowAuthorizationService();
    const runtime = await startProtectedInventoryRuntime(authorization);

    const payload = {
      destinationLocationId: "10000000-0000-4000-8000-000000000004",
      idempotencyKey: "admin-receive:123",
      lines: [
        {
          productVariantId: "10000000-0000-4000-8000-000000000005",
          quantity: 10,
        },
      ],
      movementNumber: "REC-1001",
      note: "Receiving stock",
      occurredAt: "2026-07-03T00:00:00.000Z",
      referenceId: "REC-123",
      referenceType: "ADMIN_RECEIPT",
      sourceLocationId: null,
      type: "RECEIPT",
    };

    const response = await fetch(`${runtime.url}/inventory/movement-drafts`, {
      body: JSON.stringify(payload),
      headers: developmentHeaders(suppliedRequestId),
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      data: { id: movementId },
      requestId: suppliedRequestId,
      success: true,
    });
    expect(authorization.calls).toEqual([
      {
        organizationId,
        permission: { action: "CREATE", resource: "INVENTORY" },
        requestId: suppliedRequestId,
        userId,
      },
    ]);
  });

  it.each(["OPENING", "ISSUE", "TRANSFER", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"])(
    "returns HTTP 400 for unsupported draft type %s",
    async (type) => {
      const runtime = await startProtectedInventoryRuntime();
      const response = await fetch(`${runtime.url}/inventory/movement-drafts`, {
        body: JSON.stringify({
          destinationLocationId: "10000000-0000-4000-8000-000000000004",
          idempotencyKey: "receipt-scope-1",
          lines: [
            {
              productVariantId: "10000000-0000-4000-8000-000000000005",
              quantity: 5,
            },
          ],
          movementNumber: "REC-SCOPE",
          occurredAt: "2026-07-03T00:00:00.000Z",
          type,
        }),
        headers: developmentHeaders(suppliedRequestId),
        method: "POST",
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        success: false,
        error: { code: "VALIDATION.INVALID_INPUT" },
      });
    },
  );

  it("returns HTTP 400 when creating movement draft with invalid payload", async () => {
    const runtime = await startProtectedInventoryRuntime();

    const response = await fetch(`${runtime.url}/inventory/movement-drafts`, {
      body: JSON.stringify({ lines: [] }),
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

  it("routes inventory read query parameters and variant identifiers", async () => {
    const availability = new RecordingApiHandler<
      InventoryReadPageContract<InventoryAvailabilityReadContract>
    >(
      createApiSuccess(
        { hasMore: false, items: [], nextCursor: null },
        suppliedRequestId,
      ),
    );
    const variant =
      new RecordingApiHandler<VariantInventoryAvailabilityContract>(
        createApiSuccess(
          {
            locations: [],
            variant: {
              color: "Black",
              id: movementId,
              productId: "10000000-0000-4000-8000-000000000004",
              productName: "Classic Tee",
              size: "M",
              sku: "TEE-BLK-M",
            },
          },
          suppliedRequestId,
        ),
      );
    const locations = new RecordingApiHandler<
      InventoryReadPageContract<StockLocationReadContract>
    >(
      createApiSuccess(
        { hasMore: false, items: [], nextCursor: null },
        suppliedRequestId,
      ),
    );
    const movements = new RecordingApiHandler<
      InventoryReadPageContract<InventoryMovementHistoryContract>
    >(
      createApiSuccess(
        { hasMore: false, items: [], nextCursor: null },
        suppliedRequestId,
      ),
    );
    const fallback = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const headers = developmentHeaders(suppliedRequestId);
    headers.set("x-dev-permissions", "INVENTORY:READ");
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        inventoryRead: {
          getVariantAvailability: variant,
          listAvailability: availability,
          listLocations: locations,
          listMovements: movements,
        },
        postInventoryMovement: fallback,
      },
    });

    const response = await fetch(
      `${runtime.url}/inventory/availability?pageSize=10&search=SKU`,
      { headers },
    );
    expect(response.status).toBe(200);
    expect(availability.requests.at(0)?.input).toEqual({
      pageSize: "10",
      search: "SKU",
    });

    await fetch(
      `${runtime.url}/inventory/variants/${movementId}/availability`,
      { headers },
    );
    expect(variant.requests.at(0)?.input).toEqual({ variantId: movementId });
  });

  it("routes sales list, details, and lifecycle action inputs", async () => {
    const list = new RecordingApiHandler(
      createApiSuccess(
        { hasMore: false, items: [], nextCursor: null },
        suppliedRequestId,
      ),
    );
    const details = new RecordingApiHandler(
      createApiSuccess({} as SalesOrderDetailsReadContract, suppliedRequestId),
    );
    const reserve = new RecordingApiHandler(
      createApiSuccess({} as SalesOrderServiceContract, suppliedRequestId),
    );
    const fallback = new RecordingApiHandler(
      createApiSuccess({} as SalesOrderServiceContract, suppliedRequestId),
    );
    const headers = developmentHeaders(suppliedRequestId);
    headers.set("x-dev-permissions", "SALES_ORDER:READ,SALES_ORDER:UPDATE");
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        postInventoryMovement: fallback,
        salesManagement: {
          cancel: fallback,
          confirm: fallback,
          fulfill: fallback,
          getDetails: details,
          list,
          reserve,
        },
      },
    });

    await fetch(
      `${runtime.url}/sales/orders?pageSize=10&search=SO-1&status=DRAFT`,
      { headers },
    );
    expect(list.requests.at(0)?.input).toEqual({
      pageSize: "10",
      search: "SO-1",
      status: "DRAFT",
    });

    await fetch(`${runtime.url}/sales/orders/${movementId}`, { headers });
    expect(details.requests.at(0)?.input).toEqual({ salesOrderId: movementId });

    await fetch(`${runtime.url}/sales/orders/${movementId}/reserve`, {
      body: JSON.stringify({ expectedVersion: 2 }),
      headers,
      method: "POST",
    });
    expect(reserve.requests.at(0)?.input).toEqual({
      expectedVersion: 2,
      salesOrderId: movementId,
    });
  });

  it("routes organization store and team path inputs", async () => {
    const storeStatus = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const teamRole = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const fallback = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        organizationManagement: {
          assignTeamMemberRole: teamRole,
          createStore: fallback,
          createTeamMember: fallback,
          getProfile: fallback,
          listRoles: fallback,
          listStores: fallback,
          listTeam: fallback,
          updateProfile: fallback,
          updateStore: fallback,
          updateStoreStatus: storeStatus,
          updateTeamMemberStatus: fallback,
        } as unknown as OrganizationManagementApiHandlers,
        postInventoryMovement: fallback,
      },
    });
    const headers = developmentHeaders(suppliedRequestId);

    await fetch(`${runtime.url}/organization/stores/${movementId}/status`, {
      body: JSON.stringify({ expectedVersion: 2, status: "INACTIVE" }),
      headers,
      method: "PATCH",
    });
    await fetch(`${runtime.url}/organization/team/${movementId}/role`, {
      body: JSON.stringify({ expectedVersion: 3, role: "MANAGER" }),
      headers,
      method: "PATCH",
    });

    expect(storeStatus.requests.at(0)?.input).toEqual({
      expectedVersion: 2,
      status: "INACTIVE",
      storeId: movementId,
    });
    expect(teamRole.requests.at(0)?.input).toEqual({
      expectedVersion: 3,
      role: "MANAGER",
      teamMemberId: movementId,
    });
  });

  it("maps the media product path and allows its bounded upload envelope", async () => {
    const media = new RecordingApiHandler(
      createApiSuccess({ assetId: movementId }, suppliedRequestId),
    );
    const fallback = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        catalog: {
          getPrimaryProductImage: fallback,
          removePrimaryProductImage: fallback,
          setPrimaryProductImage: media,
        } as unknown as CatalogApiHandlers,
        createSalesOrder: fallback,
        postInventoryMovement: fallback,
      },
    });
    const response = await fetch(
      `${runtime.url}/catalog/products/${movementId}/primary-image`,
      {
        body: JSON.stringify({ contentBase64: "A".repeat(1_100_000) }),
        headers: developmentHeaders(suppliedRequestId),
        method: "PUT",
      },
    );
    expect(response.status).toBe(200);
    expect(media.requests.at(0)?.input).toMatchObject({
      productId: movementId,
    });
  });

  it("keeps gallery product and link ownership in the HTTP path", async () => {
    const media = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const fallback = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const linkId = "20000000-0000-4000-8000-000000000099";
    const runtime = await startRuntime({
      handlers: {
        catalog: {
          updateProductMedia: media,
        } as unknown as CatalogApiHandlers,
        createSalesOrder: fallback,
        postInventoryMovement: fallback,
      },
    });
    await fetch(
      `${runtime.url}/catalog/products/${movementId}/media/${linkId}`,
      {
        body: JSON.stringify({
          altText: "Oxford shirt side",
          linkId: "browser-link",
          organizationId: "browser-org",
          productId: "browser-product",
          productVariantId: null,
        }),
        headers: developmentHeaders(suppliedRequestId),
        method: "PATCH",
      },
    );
    expect(media.requests.at(0)?.input).toEqual({
      altText: "Oxford shirt side",
      linkId,
      organizationId: "browser-org",
      productId: movementId,
      productVariantId: null,
    });
  });

  it("rejects media bodies beyond the dedicated upload limit", async () => {
    const media = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const fallback = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        catalog: {
          getPrimaryProductImage: fallback,
          removePrimaryProductImage: fallback,
          setPrimaryProductImage: media,
        } as unknown as CatalogApiHandlers,
        createSalesOrder: fallback,
        postInventoryMovement: fallback,
      },
    });
    const response = await fetch(
      `${runtime.url}/catalog/products/${movementId}/primary-image`,
      {
        body: JSON.stringify({ contentBase64: "A".repeat(7_100_000) }),
        headers: developmentHeaders(suppliedRequestId),
        method: "PUT",
      },
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION.PAYLOAD_TOO_LARGE" },
      requestId: suppliedRequestId,
    });
    expect(media.requests).toHaveLength(0);
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

  it("maps the checkout cart path into trusted handler input", async () => {
    const checkout = new RecordingApiHandler(
      createApiSuccess({ status: "COMPLETED" }, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: checkout,
        pos: { checkoutCart: checkout } as unknown as PosApiHandlers,
        postInventoryMovement: checkout,
      },
    });
    const response = await fetch(
      `${runtime.url}/pos/carts/${movementId}/checkout`,
      {
        body: JSON.stringify({
          allowOutstanding: false,
          idempotencyKey: "checkout-http-001",
          payments: [{ amountMinor: 2500, method: "CASH" }],
        }),
        headers: developmentHeaders(suppliedRequestId),
        method: "POST",
      },
    );
    expect(response.status).toBe(201);
    expect(checkout.requests.at(0)?.input).toEqual({
      allowOutstanding: false,
      cartId: movementId,
      idempotencyKey: "checkout-http-001",
      payments: [{ amountMinor: 2500, method: "CASH" }],
    });
  });

  it("maps idempotency conflicts to HTTP 409 without changing the API code", async () => {
    const checkout = new RecordingApiHandler(
      createApiFailure({
        code: "CONFLICT.IDEMPOTENCY",
        message: "This request was already used with different details.",
        requestId: suppliedRequestId,
      }),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: checkout,
        pos: { checkoutCart: checkout } as unknown as PosApiHandlers,
        postInventoryMovement: checkout,
      },
    });

    const response = await fetch(
      `${runtime.url}/pos/carts/${movementId}/checkout`,
      {
        body: JSON.stringify({
          allowOutstanding: false,
          idempotencyKey: "checkout-http-001",
          payments: [{ amountMinor: 2500, method: "CASH" }],
        }),
        headers: developmentHeaders(suppliedRequestId),
        method: "POST",
      },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: "CONFLICT.IDEMPOTENCY",
        message: "This request was already used with different details.",
      },
      success: false,
    });
  });

  it("maps a strict cart read path without editable trusted context", async () => {
    const getCart = new RecordingApiHandler(
      createApiSuccess({ id: movementId, lines: [] }, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: getCart,
        pos: { getCart } as unknown as PosApiHandlers,
        postInventoryMovement: getCart,
      },
    });
    const response = await fetch(`${runtime.url}/pos/carts/${movementId}`, {
      headers: developmentHeaders(suppliedRequestId),
    });
    expect(response.status).toBe(200);
    expect(getCart.requests.at(0)?.input).toEqual({ cartId: movementId });
    expect(getCart.requests.at(0)?.context.organizationId).toBe(organizationId);
  });

  it("maps the trusted current-cashier session path without identity input", async () => {
    const currentSessions = new RecordingApiHandler(
      createApiSuccess([], suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: currentSessions,
        pos: {
          listCurrentSessions: currentSessions,
        } as unknown as PosApiHandlers,
        postInventoryMovement: currentSessions,
      },
    });
    const response = await fetch(`${runtime.url}/pos/sessions/current`, {
      headers: developmentHeaders(suppliedRequestId),
    });
    expect(response.status).toBe(200);
    expect(currentSessions.requests.at(0)?.input).toEqual({});
    expect(currentSessions.requests.at(0)?.context).toMatchObject({
      authenticatedUser: { userId },
      organizationId,
    });
  });

  it("maps the receipt path to an organization-scoped checkout lookup", async () => {
    const receipt = new RecordingApiHandler(
      createApiSuccess({ receiptNumber: "RCP-001" }, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: receipt,
        pos: { getReceipt: receipt } as unknown as PosApiHandlers,
        postInventoryMovement: receipt,
      },
    });
    const response = await fetch(
      `${runtime.url}/pos/checkouts/${movementId}/receipt`,
      { headers: developmentHeaders(suppliedRequestId) },
    );
    expect(response.status).toBe(200);
    expect(receipt.requests.at(0)?.input).toEqual({ checkoutId: movementId });
    expect(receipt.requests.at(0)?.context.organizationId).toBe(organizationId);
  });

  it("maps refund issue and receipt paths without trusted fields", async () => {
    const createRefund = new RecordingApiHandler(
      createApiSuccess({ replayed: false }, suppliedRequestId),
    );
    const getRefundReceipt = new RecordingApiHandler(
      createApiSuccess({ receiptNumber: "REF-001" }, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: createRefund,
        pos: { createRefund, getRefundReceipt } as unknown as PosApiHandlers,
        postInventoryMovement: createRefund,
      },
    });
    const issueResponse = await fetch(
      `${runtime.url}/pos/checkouts/${movementId}/refunds`,
      {
        body: JSON.stringify({
          idempotencyKey: "refund-http-001",
          refunds: [{ amountMinor: 500, method: "CASH" }],
        }),
        headers: developmentHeaders(suppliedRequestId),
        method: "POST",
      },
    );
    expect(issueResponse.status).toBe(201);
    expect(createRefund.requests.at(0)?.input).toEqual({
      checkoutId: movementId,
      idempotencyKey: "refund-http-001",
      refunds: [{ amountMinor: 500, method: "CASH" }],
    });
    expect(createRefund.requests.at(0)?.context).toMatchObject({
      authenticatedUser: { userId },
      organizationId,
    });

    const receiptResponse = await fetch(
      `${runtime.url}/pos/refunds/${movementId}/receipt`,
      { headers: developmentHeaders(suppliedRequestId) },
    );
    expect(receiptResponse.status).toBe(200);
    expect(getRefundReceipt.requests.at(0)?.input).toEqual({
      refundId: movementId,
    });
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

  it("routes procurement supplier requests to supplier handlers", async () => {
    const listRequests: unknown[] = [];
    const createRequests: unknown[] = [];
    const getRequests: unknown[] = [];
    const updateRequests: unknown[] = [];
    const deactivateRequests: unknown[] = [];

    const mockSupplier = {
      address: "Babubazar, Dhaka",
      code: "SUP-001",
      contactPerson: "Rahim",
      createdAt: "2026-09-01T00:00:00.000Z",
      email: "rahim@supplier.test",
      id: movementId,
      name: "Babubazar Textiles",
      notes: null,
      organizationId,
      phone: "+8801711000000",
      status: "ACTIVE" as const,
      updatedAt: "2026-09-01T00:00:00.000Z",
    };

    const procurementHandlers: ProcurementApiHandlers = {
      createSupplier: {
        handle: (req) => {
          createRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess(mockSupplier, suppliedRequestId),
          );
        },
      },
      deactivateSupplier: {
        handle: (req) => {
          deactivateRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess(
              { ...mockSupplier, status: "INACTIVE" as const },
              suppliedRequestId,
            ),
          );
        },
      },
      getSupplier: {
        handle: (req) => {
          getRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess(mockSupplier, suppliedRequestId),
          );
        },
      },
      listSuppliers: {
        handle: (req) => {
          listRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess([mockSupplier], suppliedRequestId),
          );
        },
      },
      updateSupplier: {
        handle: (req) => {
          updateRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess(mockSupplier, suppliedRequestId),
          );
        },
      },
      confirmPurchase: {
        handle: () =>
          Promise.resolve(
            createApiSuccess(
              {
                createdAt: "2026-09-01T00:00:00.000Z",
                destinationLocationId: movementId,
                expectedDeliveryDate: null,
                id: movementId,
                idempotencyKey: null,
                lines: [],
                notes: null,
                organizationId,
                purchaseDate: "2026-09-01T00:00:00.000Z",
                purchaseNumber: "PO-001",
                receiptMovementId: "mov-1",
                status: "POSTED",
                supplierId: movementId,
                totalCostMinor: "0",
                updatedAt: "2026-09-01T00:00:00.000Z",
              },
              suppliedRequestId,
            ),
          ),
      },
      createPurchaseDraft: {
        handle: () =>
          Promise.resolve(
            createApiSuccess(
              {
                createdAt: "2026-09-01T00:00:00.000Z",
                destinationLocationId: movementId,
                expectedDeliveryDate: null,
                id: movementId,
                idempotencyKey: null,
                lines: [],
                notes: null,
                organizationId,
                purchaseDate: "2026-09-01T00:00:00.000Z",
                purchaseNumber: "PO-001",
                receiptMovementId: null,
                status: "DRAFT",
                supplierId: movementId,
                totalCostMinor: "0",
                updatedAt: "2026-09-01T00:00:00.000Z",
              },
              suppliedRequestId,
            ),
          ),
      },
      getPurchase: {
        handle: () =>
          Promise.resolve(
            createApiSuccess(
              {
                createdAt: "2026-09-01T00:00:00.000Z",
                destinationLocationId: movementId,
                expectedDeliveryDate: null,
                id: movementId,
                idempotencyKey: null,
                lines: [],
                notes: null,
                organizationId,
                purchaseDate: "2026-09-01T00:00:00.000Z",
                purchaseNumber: "PO-001",
                receiptMovementId: null,
                status: "DRAFT",
                supplierId: movementId,
                totalCostMinor: "0",
                updatedAt: "2026-09-01T00:00:00.000Z",
              },
              suppliedRequestId,
            ),
          ),
      },
      listPurchases: {
        handle: () => Promise.resolve(createApiSuccess([], suppliedRequestId)),
      },
    };

    const fallback = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        postInventoryMovement: fallback,
        procurement: procurementHandlers,
      },
    });

    const listRes = await fetch(
      `${runtime.url}/procurement/suppliers?search=Babu&status=ACTIVE`,
      {
        headers: developmentHeaders(suppliedRequestId),
      },
    );
    expect(listRes.status).toBe(200);
    expect(listRequests).toEqual([{ search: "Babu", status: "ACTIVE" }]);

    const createRes = await fetch(`${runtime.url}/procurement/suppliers`, {
      body: JSON.stringify({ code: "SUP-001", name: "Babubazar Textiles" }),
      headers: developmentHeaders(suppliedRequestId),
      method: "POST",
    });
    expect(createRes.status).toBe(201);
    expect(createRequests).toEqual([
      { code: "SUP-001", name: "Babubazar Textiles" },
    ]);

    const getRes = await fetch(
      `${runtime.url}/procurement/suppliers/${movementId}`,
      {
        headers: developmentHeaders(suppliedRequestId),
      },
    );
    expect(getRes.status).toBe(200);
    expect(getRequests).toEqual([{ supplierId: movementId }]);

    const patchRes = await fetch(
      `${runtime.url}/procurement/suppliers/${movementId}`,
      {
        body: JSON.stringify({ name: "Updated Textiles" }),
        headers: developmentHeaders(suppliedRequestId),
        method: "PATCH",
      },
    );
    expect(patchRes.status).toBe(200);
    expect(updateRequests).toEqual([
      { name: "Updated Textiles", supplierId: movementId },
    ]);

    const deactRes = await fetch(
      `${runtime.url}/procurement/suppliers/${movementId}/deactivate`,
      {
        headers: developmentHeaders(suppliedRequestId),
        method: "POST",
      },
    );
    expect(deactRes.status).toBe(200);
    expect(deactivateRequests).toEqual([{ supplierId: movementId }]);

    const deleteRes = await fetch(
      `${runtime.url}/procurement/suppliers/${movementId}`,
      {
        headers: developmentHeaders(suppliedRequestId),
        method: "DELETE",
      },
    );
    expect(deleteRes.status).toBe(200);
    expect(deactivateRequests).toHaveLength(2);
  });

  it("routes procurement purchase requests to purchase handlers", async () => {
    const listRequests: unknown[] = [];
    const createRequests: unknown[] = [];
    const getRequests: unknown[] = [];
    const confirmRequests: unknown[] = [];

    const mockPurchase = {
      createdAt: "2026-09-27T00:00:00.000Z",
      destinationLocationId: movementId,
      expectedDeliveryDate: null,
      id: movementId,
      idempotencyKey: null,
      lines: [
        {
          id: "line-1",
          lineNumber: 1,
          notes: null,
          productName: "Signature Heavyweight Tee",
          productVariantId: movementId,
          purchaseId: movementId,
          quantity: 10,
          sku: "SHT-BLK-M",
          totalCostMinor: "500000",
          unitCostMinor: 50000,
          variantName: "Black / M",
        },
      ],
      notes: null,
      organizationId,
      purchaseDate: "2026-09-27T00:00:00.000Z",
      purchaseNumber: "PO-20260927-001",
      receiptMovementId: null,
      status: "DRAFT" as const,
      supplierId: movementId,
      totalCostMinor: "500000",
      updatedAt: "2026-09-27T00:00:00.000Z",
    };

    const procurementHandlers: ProcurementApiHandlers = {
      confirmPurchase: {
        handle: (req) => {
          confirmRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess(
              {
                ...mockPurchase,
                receiptMovementId: "mov-rcpt-001",
                status: "POSTED" as const,
              },
              suppliedRequestId,
            ),
          );
        },
      },
      createPurchaseDraft: {
        handle: (req) => {
          createRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess(mockPurchase, suppliedRequestId),
          );
        },
      },
      createSupplier: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      deactivateSupplier: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      getPurchase: {
        handle: (req) => {
          getRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess(mockPurchase, suppliedRequestId),
          );
        },
      },
      getSupplier: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      listPurchases: {
        handle: (req) => {
          listRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess([mockPurchase], suppliedRequestId),
          );
        },
      },
      listSuppliers: {
        handle: () => Promise.resolve(createApiSuccess([], suppliedRequestId)),
      },
      updateSupplier: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
    };

    const fallback = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        postInventoryMovement: fallback,
        procurement: procurementHandlers,
      },
    });

    // 1. GET /procurement/purchases (with query params)
    const listRes = await fetch(
      `${runtime.url}/procurement/purchases?status=DRAFT&limit=25&offset=5`,
      {
        headers: developmentHeaders(suppliedRequestId),
      },
    );
    expect(listRes.status).toBe(200);
    expect(listRequests).toEqual([
      { limit: "25", offset: "5", status: "DRAFT" },
    ]);

    // 2. POST /procurement/purchases (create draft)
    const draftPayload = {
      destinationLocationId: movementId,
      lines: [
        {
          lineNumber: 1,
          productName: "Signature Heavyweight Tee",
          productVariantId: movementId,
          quantity: 10,
          sku: "SHT-BLK-M",
          unitCostMinor: 50000,
        },
      ],
      supplierId: movementId,
    };
    const createRes = await fetch(`${runtime.url}/procurement/purchases`, {
      body: JSON.stringify(draftPayload),
      headers: developmentHeaders(suppliedRequestId),
      method: "POST",
    });
    expect(createRes.status).toBe(201);
    expect(createRequests).toEqual([draftPayload]);

    // 3. GET /procurement/purchases/:id (get details)
    const getRes = await fetch(
      `${runtime.url}/procurement/purchases/${movementId}`,
      {
        headers: developmentHeaders(suppliedRequestId),
      },
    );
    expect(getRes.status).toBe(200);
    expect(getRequests).toEqual([{ purchaseId: movementId }]);

    // 4. POST /procurement/purchases/:id/confirm (with idempotency key)
    const confirmRes = await fetch(
      `${runtime.url}/procurement/purchases/${movementId}/confirm`,
      {
        body: JSON.stringify({ idempotencyKey: "idem_confirm_123" }),
        headers: developmentHeaders(suppliedRequestId),
        method: "POST",
      },
    );
    expect(confirmRes.status).toBe(200);
    const confirmBody = (await confirmRes.json()) as {
      data: { status: string; receiptMovementId: string };
    };
    expect(confirmBody.data.status).toBe("POSTED");
    expect(confirmBody.data.receiptMovementId).toBe("mov-rcpt-001");
    expect(confirmRequests).toEqual([
      { idempotencyKey: "idem_confirm_123", purchaseId: movementId },
    ]);

    // 5. POST /procurement/purchases/:id/confirm (safe retry without body)
    const retryRes = await fetch(
      `${runtime.url}/procurement/purchases/${movementId}/confirm`,
      {
        headers: developmentHeaders(suppliedRequestId),
        method: "POST",
      },
    );
    expect(retryRes.status).toBe(200);
    expect(confirmRequests).toHaveLength(2);
    expect(confirmRequests[1]).toEqual({ purchaseId: movementId });
  });
});

class RecordingApiHandler<T = unknown> implements ApiHandler<T> {
  readonly requests: ApiRequest[] = [];

  constructor(private readonly response: ApiResponse<T>) {}

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
  const createDraft = createProtectedApiHandler<
    CreateInventoryMovementServiceInputContract,
    { id: string }
  >({
    authenticationService: new DevelopmentAuthenticationService("test"),
    authorizationService,
    execute: () => Promise.resolve({ data: { id: movementId }, ok: true }),
    inputSchema: createInventoryMovementServiceInputSchema,
    permission: { action: "CREATE", resource: "INVENTORY" },
  });
  return startRuntime({
    handlers: {
      createInventoryMovementDraft: createDraft,
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
