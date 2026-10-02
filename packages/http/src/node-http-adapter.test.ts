import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProcurementApiHandlers,
  createProtectedApiHandler,
  createStockIntakeApiHandlers,
  type ApiHandler,
  type ApiRequest,
  type CatalogApiHandlers,
  type OrganizationManagementApiHandlers,
  type PosApiHandlers,
  type ProcurementApiHandlers,
  type ProcurementApplication,
  type ShippingApiHandlers,
  type StorefrontApiHandlers,
} from "@senvo/api";
import type { ApplicationAuthorizationService } from "@senvo/application";
import { AuthorizationError } from "@senvo/domain";
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
    const products = new RecordingApiHandler(
      createApiSuccess(
        { hasMore: false, items: [], nextCursor: null },
        suppliedRequestId,
      ),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        inventoryRead: {
          listProductSummaries: products,
          getVariantAvailability: variant,
          listAvailability: availability,
          listLocations: locations,
          listMovements: movements,
        },
        postInventoryMovement: fallback,
      },
    });

    const productResponse = await fetch(
      `${runtime.url}/inventory/products?pageSize=2&lowStockThreshold=0`,
      { headers },
    );
    expect(productResponse.status).toBe(200);
    expect(products.requests[0]?.input).toEqual({
      pageSize: "2",
      lowStockThreshold: "0",
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

  it("routes POS session reconciliation and settlement requests with proper status codes", async () => {
    const sessionId = "10000000-0000-4000-8000-000000000099";

    const getReconciliation = new RecordingApiHandler(
      createApiSuccess(
        { sessionId, expectedCashMinor: 50000 },
        suppliedRequestId,
      ),
    );
    const closeSettlement = new RecordingApiHandler(
      createApiSuccess(
        { id: "settle-1", status: "BALANCED" },
        suppliedRequestId,
      ),
    );

    const fallback = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );

    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        pos: {
          closeSessionWithSettlement: closeSettlement,
          getReconciliationSummary: getReconciliation,
        } as unknown as PosApiHandlers,
        postInventoryMovement: fallback,
      },
    });

    // 1. GET /pos/sessions/:sessionId/reconciliation - 200
    const recRes = await fetch(
      `${runtime.url}/pos/sessions/${sessionId}/reconciliation`,
      { headers: developmentHeaders(suppliedRequestId) },
    );
    expect(recRes.status).toBe(200);
    expect(getReconciliation.requests.at(0)?.input).toEqual({ sessionId });

    // 2. POST /pos/sessions/:sessionId/settlement - 200
    const settleRes = await fetch(
      `${runtime.url}/pos/sessions/${sessionId}/settlement`,
      {
        body: JSON.stringify({
          actualBankTransferMinor: 0,
          actualCardMinor: 0,
          actualCashMinor: 50000,
          actualMobileBankingMinor: 0,
          expectedVersion: 1,
        }),
        headers: developmentHeaders(suppliedRequestId),
        method: "POST",
      },
    );
    expect(settleRes.status).toBe(200);
    expect(closeSettlement.requests.at(0)?.input).toEqual({
      actualBankTransferMinor: 0,
      actualCardMinor: 0,
      actualCashMinor: 50000,
      actualMobileBankingMinor: 0,
      expectedVersion: 1,
      sessionId,
    });

    // 3. Error mapping: 400 validation
    const fail400 = new RecordingApiHandler(
      createApiFailure({
        code: "VALIDATION.INPUT",
        message: "actualCashMinor must be non-negative.",
        requestId: suppliedRequestId,
      }),
    );
    const runtime400 = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        pos: {
          closeSessionWithSettlement: fail400,
        } as unknown as PosApiHandlers,
        postInventoryMovement: fallback,
      },
    });
    const res400 = await fetch(
      `${runtime400.url}/pos/sessions/${sessionId}/settlement`,
      {
        body: JSON.stringify({ actualCashMinor: -100 }),
        headers: developmentHeaders(suppliedRequestId),
        method: "POST",
      },
    );
    expect(res400.status).toBe(400);

    // 4. Error mapping: 401 unauthenticated
    const fail401 = new RecordingApiHandler(
      createApiFailure({
        code: "AUTHENTICATION.REQUIRED",
        message: "Authentication is required.",
        requestId: suppliedRequestId,
      }),
    );
    const runtime401 = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        pos: {
          getReconciliationSummary: fail401,
        } as unknown as PosApiHandlers,
        postInventoryMovement: fallback,
      },
    });
    const res401 = await fetch(
      `${runtime401.url}/pos/sessions/${sessionId}/reconciliation`,
      { headers: developmentHeaders(suppliedRequestId) },
    );
    expect(res401.status).toBe(401);

    // 5. Error mapping: 403 permission
    const fail403 = new RecordingApiHandler(
      createApiFailure({
        code: "AUTHORIZATION.FORBIDDEN",
        message: "You are not allowed to close this session.",
        requestId: suppliedRequestId,
      }),
    );
    const runtime403 = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        pos: {
          closeSessionWithSettlement: fail403,
        } as unknown as PosApiHandlers,
        postInventoryMovement: fallback,
      },
    });
    const res403 = await fetch(
      `${runtime403.url}/pos/sessions/${sessionId}/settlement`,
      {
        body: JSON.stringify({ actualCashMinor: 50000, expectedVersion: 1 }),
        headers: developmentHeaders(suppliedRequestId),
        method: "POST",
      },
    );
    expect(res403.status).toBe(403);

    // 6. Error mapping: 404 missing session
    const fail404 = new RecordingApiHandler(
      createApiFailure({
        code: "NOT_FOUND.SESSION",
        message: "Sales session was not found.",
        requestId: suppliedRequestId,
      }),
    );
    const runtime404 = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        pos: {
          getReconciliationSummary: fail404,
        } as unknown as PosApiHandlers,
        postInventoryMovement: fallback,
      },
    });
    const res404 = await fetch(
      `${runtime404.url}/pos/sessions/${sessionId}/reconciliation`,
      { headers: developmentHeaders(suppliedRequestId) },
    );
    expect(res404.status).toBe(404);

    // 7. Error mapping: 409 duplicate / concurrency conflict
    const fail409 = new RecordingApiHandler(
      createApiFailure({
        code: "CONCURRENCY.VERSION_CONFLICT",
        message: "Open sales session was not found or changed.",
        requestId: suppliedRequestId,
      }),
    );
    const runtime409 = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        pos: {
          closeSessionWithSettlement: fail409,
        } as unknown as PosApiHandlers,
        postInventoryMovement: fallback,
      },
    });
    const res409 = await fetch(
      `${runtime409.url}/pos/sessions/${sessionId}/settlement`,
      {
        body: JSON.stringify({ actualCashMinor: 50000, expectedVersion: 1 }),
        headers: developmentHeaders(suppliedRequestId),
        method: "POST",
      },
    );
    expect(res409.status).toBe(409);
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

  it("routes stock intake POST with trusted context and returns HTTP 201", async () => {
    const authorization = new AllowAuthorizationService();
    const received: unknown[] = [];
    const fallback = new RecordingApiHandler(
      createApiSuccess({}, suppliedRequestId),
    );
    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: fallback,
        postInventoryMovement: fallback,
        stockIntake: createStockIntakeApiHandlers({
          authenticationService: new DevelopmentAuthenticationService("test"),
          authorizationService: authorization,
          stockIntake: {
            recordStockIntake: (context, input) => {
              received.push({ context, input });
              return Promise.resolve({
                data: { replayed: false } as never,
                ok: true,
              });
            },
          },
        }),
      },
    });
    const payload = {
      idempotencyKey: "intake-http-0001",
      lines: [
        {
          colorName: "Black",
          quantity: 1,
          sellingPriceMinor: 1_000,
          sizeName: "M",
          unitCostMinor: 500,
        },
      ],
      product: {
        audienceCategoryName: "Men",
        name: "Tee",
        typeCategoryName: "T-shirt",
      },
      purchase: {
        destinationLocationId: "10000000-0000-4000-8000-000000000004",
      },
      supplier: null,
    };

    const response = await fetch(`${runtime.url}/inventory/stock-intakes`, {
      body: JSON.stringify(payload),
      headers: developmentHeaders(suppliedRequestId),
      method: "POST",
    });
    const rejected = await fetch(`${runtime.url}/inventory/stock-intakes`, {
      body: JSON.stringify({ ...payload, organizationId }),
      headers: developmentHeaders(suppliedRequestId),
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(rejected.status).toBe(400);
    expect(received).toEqual([
      {
        context: expect.objectContaining({ organizationId, userId }) as unknown,
        input: payload,
      },
    ]);
    expect(authorization.calls[0]?.permission).toEqual({
      action: "CREATE",
      resource: "PROCUREMENT",
    });
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
      recordSupplierPayment: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      recordSupplierAdjustment: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      getSupplierBalance: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      listSupplierLedger: {
        handle: () => Promise.resolve(createApiSuccess([], suppliedRequestId)),
      },
      listSupplierPayments: {
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
      recordSupplierPayment: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      recordSupplierAdjustment: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      getSupplierBalance: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      listSupplierLedger: {
        handle: () => Promise.resolve(createApiSuccess([], suppliedRequestId)),
      },
      listSupplierPayments: {
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

  it("enforces authentication, authorization, tenant isolation, and error mapping on purchase endpoints", async () => {
    const notFoundPurchaseId = "30000000-0000-4000-8000-000000000001";
    const postedPurchaseId = "20000000-0000-4000-8000-000000000001";
    const cancelledPurchaseId = "20000000-0000-4000-8000-000000000002";

    const procurementApp: ProcurementApplication = {
      confirmPurchase: (context, payload: any) => {
        if (payload?.purchaseId === postedPurchaseId) {
          return Promise.resolve({
            error: {
              code: "CONFLICT",
              message: "Cannot confirm a purchase that is already posted.",
              requestId: context.requestId ?? suppliedRequestId,
              retryable: false,
            },
            ok: false,
          });
        }
        if (payload?.purchaseId === cancelledPurchaseId) {
          return Promise.resolve({
            error: {
              code: "BUSINESS_RULE_VIOLATION",
              message: "Cannot confirm a cancelled purchase.",
              requestId: context.requestId ?? suppliedRequestId,
              retryable: false,
            },
            ok: false,
          });
        }
        return Promise.resolve({
          data: {
            id: payload?.purchaseId,
            receiptMovementId: "mov-123",
            status: "POSTED",
          } as any,
          ok: true,
        });
      },
      createPurchaseDraft: (_context, payload: any) => {
        return Promise.resolve({
          data: {
            id: movementId,
            lines: payload.lines,
            status: "DRAFT",
          } as any,
          ok: true,
        });
      },
      createSupplier: () => Promise.resolve({ data: {} as any, ok: true }),
      deactivateSupplier: () => Promise.resolve({ data: {} as any, ok: true }),
      getPurchase: (context, payload: any) => {
        if (payload?.purchaseId === notFoundPurchaseId) {
          return Promise.resolve({
            error: {
              code: "NOT_FOUND",
              message: "The requested purchase was not found.",
              requestId: context.requestId ?? suppliedRequestId,
              retryable: false,
            },
            ok: false,
          });
        }
        return Promise.resolve({
          data: {
            id: payload?.purchaseId,
            status: "DRAFT",
          } as any,
          ok: true,
        });
      },
      getSupplier: () => Promise.resolve({ data: {} as any, ok: true }),
      listPurchases: () => Promise.resolve({ data: [], ok: true }),
      listSuppliers: () => Promise.resolve({ data: [], ok: true }),
      updateSupplier: () => Promise.resolve({ data: {} as any, ok: true }),
      recordSupplierPayment: () =>
        Promise.resolve({ data: {} as any, ok: true }),
      recordSupplierAdjustment: () =>
        Promise.resolve({ data: {} as any, ok: true }),
      getSupplierBalance: () => Promise.resolve({ data: {} as any, ok: true }),
      listSupplierLedger: () => Promise.resolve({ data: [] as any, ok: true }),
      listSupplierPayments: () =>
        Promise.resolve({ data: [] as any, ok: true }),
    };

    const authorizationService: ApplicationAuthorizationService = {
      authorize(context, permission) {
        const hasPermission =
          context.permissions?.some(
            (p) =>
              p.action === permission.action &&
              p.resource === permission.resource,
          ) ?? false;
        if (!hasPermission) {
          return Promise.reject(new AuthorizationError("Permission denied."));
        }
        return Promise.resolve();
      },
    };

    const procurementHandlers = createProcurementApiHandlers({
      authenticationService: new DevelopmentAuthenticationService("test"),
      authorizationService,
      procurement: procurementApp,
    });

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

    const validDraftPayload = {
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

    // 1. HTTP 401 — Missing authentication (no user identity)
    const unauthenticatedHeaders = new Headers({
      "content-type": "application/json",
      "x-dev-organization-id": organizationId,
      "x-dev-permissions":
        "PROCUREMENT:CREATE,PROCUREMENT:READ,PROCUREMENT:UPDATE",
      "x-request-id": suppliedRequestId,
    });

    const unauthPostRes = await fetch(`${runtime.url}/procurement/purchases`, {
      body: JSON.stringify(validDraftPayload),
      headers: unauthenticatedHeaders,
      method: "POST",
    });
    expect(unauthPostRes.status).toBe(401);
    expect(await unauthPostRes.json()).toMatchObject({
      error: { code: "AUTHENTICATION.REQUIRED" },
      success: false,
    });

    const unauthGetRes = await fetch(
      `${runtime.url}/procurement/purchases/${movementId}`,
      { headers: unauthenticatedHeaders },
    );
    expect(unauthGetRes.status).toBe(401);
    expect(await unauthGetRes.json()).toMatchObject({
      error: { code: "AUTHENTICATION.REQUIRED" },
      success: false,
    });

    // 2. HTTP 403 — Authenticated staff without required permissions
    const readOnlyHeaders = developmentHeaders(suppliedRequestId);
    readOnlyHeaders.set("x-dev-permissions", "PROCUREMENT:READ");

    const forbiddenCreateRes = await fetch(
      `${runtime.url}/procurement/purchases`,
      {
        body: JSON.stringify(validDraftPayload),
        headers: readOnlyHeaders,
        method: "POST",
      },
    );
    expect(forbiddenCreateRes.status).toBe(403);
    expect(await forbiddenCreateRes.json()).toMatchObject({
      error: { code: "AUTHORIZATION.FORBIDDEN" },
      success: false,
    });

    const forbiddenConfirmRes = await fetch(
      `${runtime.url}/procurement/purchases/${movementId}/confirm`,
      {
        body: JSON.stringify({ idempotencyKey: "idem_1" }),
        headers: readOnlyHeaders,
        method: "POST",
      },
    );
    expect(forbiddenConfirmRes.status).toBe(403);
    expect(await forbiddenConfirmRes.json()).toMatchObject({
      error: { code: "AUTHORIZATION.FORBIDDEN" },
      success: false,
    });

    const createOnlyHeaders = developmentHeaders(suppliedRequestId);
    createOnlyHeaders.set("x-dev-permissions", "PROCUREMENT:CREATE");

    const forbiddenGetRes = await fetch(
      `${runtime.url}/procurement/purchases/${movementId}`,
      { headers: createOnlyHeaders },
    );
    expect(forbiddenGetRes.status).toBe(403);
    expect(await forbiddenGetRes.json()).toMatchObject({
      error: { code: "AUTHORIZATION.FORBIDDEN" },
      success: false,
    });

    // 3. HTTP 200/201 — Authenticated with correct permissions
    const authorizedHeaders = developmentHeaders(suppliedRequestId);
    authorizedHeaders.set(
      "x-dev-permissions",
      "PROCUREMENT:CREATE,PROCUREMENT:READ,PROCUREMENT:UPDATE",
    );

    const successfulCreate = await fetch(
      `${runtime.url}/procurement/purchases`,
      {
        body: JSON.stringify(validDraftPayload),
        headers: authorizedHeaders,
        method: "POST",
      },
    );
    expect(successfulCreate.status).toBe(201);
    expect(await successfulCreate.json()).toMatchObject({
      data: { id: movementId, status: "DRAFT" },
      success: true,
    });

    // 4. HTTP 400 — Validation errors & injected organizationId
    const injectedBodyRes = await fetch(
      `${runtime.url}/procurement/purchases`,
      {
        body: JSON.stringify({
          ...validDraftPayload,
          organizationId: "99999999-9999-4999-a999-999999999999",
        }),
        headers: authorizedHeaders,
        method: "POST",
      },
    );
    expect(injectedBodyRes.status).toBe(400);
    expect(await injectedBodyRes.json()).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });

    const injectedQueryRes = await fetch(
      `${runtime.url}/procurement/purchases?organizationId=99999999-9999-4999-a999-999999999999`,
      { headers: authorizedHeaders },
    );
    expect(injectedQueryRes.status).toBe(400);
    expect(await injectedQueryRes.json()).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });

    const invalidUuidRes = await fetch(
      `${runtime.url}/procurement/purchases/1234-abcd`,
      { headers: authorizedHeaders },
    );
    expect(invalidUuidRes.status).toBe(400);
    expect(await invalidUuidRes.json()).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });

    const invalidValuesRes = await fetch(
      `${runtime.url}/procurement/purchases`,
      {
        body: JSON.stringify({
          ...validDraftPayload,
          lines: [
            {
              ...validDraftPayload.lines[0],
              quantity: 0,
              unitCostMinor: -1,
            },
          ],
        }),
        headers: authorizedHeaders,
        method: "POST",
      },
    );
    expect(invalidValuesRes.status).toBe(400);
    expect(await invalidValuesRes.json()).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });

    // 5. HTTP 404 — Purchase not found / cross-tenant isolation
    const notFoundRes = await fetch(
      `${runtime.url}/procurement/purchases/${notFoundPurchaseId}`,
      { headers: authorizedHeaders },
    );
    expect(notFoundRes.status).toBe(404);
    expect(await notFoundRes.json()).toMatchObject({
      error: { code: "NOT_FOUND.RESOURCE" },
      success: false,
    });

    // 6. HTTP 409 — Conflict on invalid state transition (already POSTED / CANCELLED)
    const conflictPostedRes = await fetch(
      `${runtime.url}/procurement/purchases/${postedPurchaseId}/confirm`,
      {
        body: JSON.stringify({ idempotencyKey: "idem_posted" }),
        headers: authorizedHeaders,
        method: "POST",
      },
    );
    expect(conflictPostedRes.status).toBe(409);
    expect(await conflictPostedRes.json()).toMatchObject({
      error: { code: "CONFLICT.STATE" },
      success: false,
    });

    const conflictCancelledRes = await fetch(
      `${runtime.url}/procurement/purchases/${cancelledPurchaseId}/confirm`,
      {
        body: JSON.stringify({ idempotencyKey: "idem_cancelled" }),
        headers: authorizedHeaders,
        method: "POST",
      },
    );
    expect(conflictCancelledRes.status).toBe(409);
    expect(await conflictCancelledRes.json()).toMatchObject({
      error: { code: "BUSINESS_RULE.VIOLATION" },
      success: false,
    });
  });

  it("routes procurement payment and ledger requests to handlers", async () => {
    const paymentRequests: unknown[] = [];
    const listPaymentRequests: unknown[] = [];
    const balanceRequests: unknown[] = [];
    const ledgerRequests: unknown[] = [];

    const mockPayment = {
      amountMinor: "500000",
      createdAt: "2026-09-28T00:00:00.000Z",
      id: "33333333-3333-4333-8333-333333333333",
      idempotencyKey: null,
      notes: null,
      organizationId,
      paymentDate: "2026-09-28T00:00:00.000Z",
      paymentMethod: "CASH" as const,
      purchaseId: null,
      reference: null,
      supplierId: movementId,
      updatedAt: "2026-09-28T00:00:00.000Z",
    };

    const mockBalance = {
      lastBillDate: null,
      lastPaymentDate: null,
      organizationId,
      outstandingBalanceMinor: "1500000",
      supplierId: movementId,
      totalAdjustedMinor: "0",
      totalBilledMinor: "2000000",
      totalPaidMinor: "500000",
    };

    const procurementHandlers: ProcurementApiHandlers = {
      confirmPurchase: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      createPurchaseDraft: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
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
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      getSupplier: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      listPurchases: {
        handle: () => Promise.resolve(createApiSuccess([], suppliedRequestId)),
      },
      listSuppliers: {
        handle: () => Promise.resolve(createApiSuccess([], suppliedRequestId)),
      },
      updateSupplier: {
        handle: () =>
          Promise.resolve(createApiSuccess({} as never, suppliedRequestId)),
      },
      recordSupplierPayment: {
        handle: (req) => {
          paymentRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess(mockPayment, suppliedRequestId),
          );
        },
      },
      getSupplierBalance: {
        handle: (req) => {
          balanceRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess(mockBalance, suppliedRequestId),
          );
        },
      },
      listSupplierLedger: {
        handle: (req) => {
          ledgerRequests.push(req.input);
          return Promise.resolve(createApiSuccess([], suppliedRequestId));
        },
      },
      listSupplierPayments: {
        handle: (req) => {
          listPaymentRequests.push(req.input);
          return Promise.resolve(
            createApiSuccess([mockPayment], suppliedRequestId),
          );
        },
      },
      recordSupplierAdjustment: {
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

    // 1. GET /procurement/suppliers/:id/balance
    const balanceRes = await fetch(
      `${runtime.url}/procurement/suppliers/${movementId}/balance`,
      {
        headers: { authorization: "Bearer admin-token" },
      },
    );
    expect(balanceRes.status).toBe(200);
    expect(balanceRequests).toEqual([{ supplierId: movementId }]);

    // 2. GET /procurement/suppliers/:id/ledger
    const ledgerRes = await fetch(
      `${runtime.url}/procurement/suppliers/${movementId}/ledger?limit=10&offset=0`,
      {
        headers: { authorization: "Bearer admin-token" },
      },
    );
    expect(ledgerRes.status).toBe(200);
    expect(ledgerRequests).toEqual([
      expect.objectContaining({
        limit: "10",
        offset: "0",
        supplierId: movementId,
      }),
    ]);

    // 3. GET /procurement/payments
    const listPayRes = await fetch(
      `${runtime.url}/procurement/payments?limit=5`,
      {
        headers: { authorization: "Bearer admin-token" },
      },
    );
    expect(listPayRes.status).toBe(200);
    expect(listPaymentRequests).toEqual([
      expect.objectContaining({ limit: "5" }),
    ]);

    // 4. POST /procurement/payments
    const postPayRes = await fetch(`${runtime.url}/procurement/payments`, {
      body: JSON.stringify({
        amountMinor: "500000",
        paymentMethod: "CASH",
        supplierId: movementId,
      }),
      headers: {
        authorization: "Bearer admin-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(postPayRes.status).toBe(201);
    expect(paymentRequests).toEqual([
      {
        amountMinor: "500000",
        paymentMethod: "CASH",
        supplierId: movementId,
      },
    ]);
  });

  it("routes shipping dispatch, tracking, and consignment requests to handlers", async () => {
    const consignmentId = "30000000-0000-4000-8000-000000000001";
    const salesOrderId = "20000000-0000-4000-8000-000000000001";

    const dispatchHandler = new RecordingApiHandler(
      createApiSuccess(
        { id: consignmentId, status: "BOOKED" },
        suppliedRequestId,
      ),
    );
    const getShipmentByOrderHandler = new RecordingApiHandler(
      createApiSuccess(
        [{ id: consignmentId, status: "BOOKED" }],
        suppliedRequestId,
      ),
    );
    const updateStatusHandler = new RecordingApiHandler(
      createApiSuccess(
        { id: consignmentId, status: "IN_TRANSIT" },
        suppliedRequestId,
      ),
    );
    const getConsignmentHandler = new RecordingApiHandler(
      createApiSuccess(
        { id: consignmentId, status: "BOOKED" },
        suppliedRequestId,
      ),
    );

    const shippingHandlers: ShippingApiHandlers = {
      dispatch: dispatchHandler as any,
      getConsignment: getConsignmentHandler as any,
      getShipmentByOrder: getShipmentByOrderHandler as any,
      updateStatus: updateStatusHandler as any,
    };

    const runtime = await startRuntime({
      handlers: {
        createSalesOrder: new RecordingApiHandler(
          createApiSuccess({ id: "sales-order-id" }, suppliedRequestId),
        ),
        postInventoryMovement: new RecordingApiHandler(
          createApiSuccess({ id: "movement-id" }, suppliedRequestId),
        ),
        shipping: shippingHandlers,
      },
    });

    // 1. POST /sales/orders/:id/dispatch
    const dispatchRes = await fetch(
      `${runtime.url}/sales/orders/${salesOrderId}/dispatch`,
      {
        body: JSON.stringify({
          courierProvider: "STEADFAST",
          trackingCode: "ST-9988",
        }),
        headers: developmentHeaders(),
        method: "POST",
      },
    );
    expect(dispatchRes.status).toBe(200);
    expect(dispatchHandler.requests).toHaveLength(1);
    expect(dispatchHandler.requests[0]?.input).toEqual({
      courierProvider: "STEADFAST",
      salesOrderId,
      trackingCode: "ST-9988",
    });
    expect(dispatchHandler.requests[0]?.context.organizationId).toBe(
      organizationId,
    );

    // 2. GET /sales/orders/:id/shipment
    const getShipmentRes = await fetch(
      `${runtime.url}/sales/orders/${salesOrderId}/shipment`,
      {
        headers: developmentHeaders(),
        method: "GET",
      },
    );
    expect(getShipmentRes.status).toBe(200);
    expect(getShipmentByOrderHandler.requests).toHaveLength(1);
    expect(getShipmentByOrderHandler.requests[0]?.input).toEqual({
      salesOrderId,
    });
    expect(getShipmentByOrderHandler.requests[0]?.context.organizationId).toBe(
      organizationId,
    );

    // 3. PATCH /shipping/consignments/:id/status
    const updateRes = await fetch(
      `${runtime.url}/shipping/consignments/${consignmentId}/status`,
      {
        body: JSON.stringify({
          note: "Departed hub",
          status: "IN_TRANSIT",
        }),
        headers: developmentHeaders(),
        method: "PATCH",
      },
    );
    expect(updateRes.status).toBe(200);
    expect(updateStatusHandler.requests).toHaveLength(1);
    expect(updateStatusHandler.requests[0]?.input).toEqual({
      consignmentId,
      note: "Departed hub",
      status: "IN_TRANSIT",
    });
    expect(updateStatusHandler.requests[0]?.context.organizationId).toBe(
      organizationId,
    );

    // 4. GET /shipping/consignments/:id
    const getConsignmentRes = await fetch(
      `${runtime.url}/shipping/consignments/${consignmentId}`,
      {
        headers: developmentHeaders(),
        method: "GET",
      },
    );
    expect(getConsignmentRes.status).toBe(200);
    expect(getConsignmentHandler.requests).toHaveLength(1);
    expect(getConsignmentHandler.requests[0]?.input).toEqual({
      consignmentId,
    });
    expect(getConsignmentHandler.requests[0]?.context.organizationId).toBe(
      organizationId,
    );
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
