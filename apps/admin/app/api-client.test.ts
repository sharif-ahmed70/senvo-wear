import { describe, expect, it, vi } from "vitest";
import { AdminApiClient, AdminApiError } from "./_lib/api-client";

describe("AdminApiClient", () => {
  it("uses POS barcode and cart routes without trusted fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          data: {},
          requestId: "req_pos_sale",
          success: true,
        }),
      ),
    );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });
    const cartId = "10000000-0000-4000-8000-000000000001";
    const itemId = "10000000-0000-4000-8000-000000000002";
    const productVariantId = "10000000-0000-4000-8000-000000000003";

    await client.lookupPosSale(" CODE / 1 ");
    await client.getPosCart(cartId);
    await client.addPosCartItem({ cartId, productVariantId, quantity: 1 });
    await client.updatePosCartItem({ cartId, itemId, quantity: 2 });
    await client.removePosCartItem({ cartId, itemId });
    await client.checkoutPosCart({
      allowOutstanding: false,
      cartId,
      idempotencyKey: "pos-safe-retry-1",
      payments: [{ amountMinor: 250000, method: "CASH" }],
    });

    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "https://admin.example.test/pos/barcode/CODE%20%2F%201",
      `https://admin.example.test/pos/carts/${cartId}`,
      `https://admin.example.test/pos/carts/${cartId}/items`,
      `https://admin.example.test/pos/carts/${cartId}/items/${itemId}`,
      `https://admin.example.test/pos/carts/${cartId}/items/${itemId}`,
      `https://admin.example.test/pos/carts/${cartId}/checkout`,
    ]);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual([
      "GET",
      "GET",
      "POST",
      "PATCH",
      "DELETE",
      "POST",
    ]);
    const bodies = fetcher.mock.calls.flatMap((call) =>
      typeof call[1]?.body === "string" ? [call[1].body] : [],
    );
    for (const body of bodies) {
      expect(body).not.toMatch(
        /organizationId|staffId|permissions|channel|totalMinor/u,
      );
    }
    expect(JSON.parse(bodies.at(-1) ?? "{}")).toEqual({
      allowOutstanding: false,
      idempotencyKey: "pos-safe-retry-1",
      payments: [{ amountMinor: 250000, method: "CASH" }],
    });
  });
  it("propagates request IDs and returns a standard success response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          data: { id: "order-1" },
          requestId: "req_response_1",
          success: true,
        },
        {
          headers: { "x-request-id": "req_response_1" },
          status: 201,
        },
      ),
    );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test/",
      createRequestId: () => "req_generated_1",
      fetcher,
    });

    await expect(
      client.request<{ id: string }>("/sales-orders", {
        body: { orderNumber: "SO-1" },
        method: "POST",
      }),
    ).resolves.toEqual({
      data: { id: "order-1" },
      requestId: "req_response_1",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://admin.example.test/sales-orders",
      expect.objectContaining({
        body: JSON.stringify({ orderNumber: "SO-1" }),
        method: "POST",
      }),
    );
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-request-id")).toBe("req_generated_1");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("maps unauthorized API responses to a typed error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "AUTHENTICATION.REQUIRED",
            message: "Authentication is required.",
          },
          requestId: "req_auth_1",
          success: false,
        },
        { status: 401 },
      ),
    );
    const client = new AdminApiClient({ fetcher });

    const error = await client
      .request("/sales-orders", { requestId: "req_auth_1" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({
      category: "AUTHENTICATION",
      code: "AUTHENTICATION.REQUIRED",
      requestId: "req_auth_1",
      status: 401,
    });
  });

  it("rejects malformed service responses without exposing their body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("<html>failure</html>", { status: 502 }));
    const client = new AdminApiClient({
      createRequestId: () => "req_invalid_1",
      fetcher,
    });

    await expect(client.request("/inventory/movements")).rejects.toMatchObject({
      code: "INTERNAL.INVALID_RESPONSE",
      message: "The admin service returned an invalid response.",
      requestId: "req_invalid_1",
      status: 502,
    });
  });

  it("includes credentials and automatically attaches CSRF header on state-changing requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          data: { success: true },
          requestId: "req_csrf_1",
          success: true,
        }),
      ),
    );
    const client = new AdminApiClient({
      fetcher,
      getCsrfToken: () => "mock-csrf-token",
    });

    await client.request("/test-post", {
      body: { foo: "bar" },
      method: "POST",
    });
    const postCall = fetcher.mock.calls[0];
    expect(postCall?.[1]?.credentials).toBe("include");
    const postHeaders = new Headers(postCall?.[1]?.headers);
    expect(postHeaders.get("x-csrf-token")).toBe("mock-csrf-token");

    await client.request("/test-get", { method: "GET" });
    const getCall = fetcher.mock.calls[1];
    expect(getCall?.[1]?.credentials).toBe("include");
    const getHeaders = new Headers(getCall?.[1]?.headers);
    expect(getHeaders.get("x-csrf-token")).toBeNull();
  });

  it("uses typed catalog endpoints and preserves standard error handling", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [],
        requestId: "req_catalog_1",
        success: true,
      }),
    );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });

    await client.listProducts({ requestId: "req_catalog_1" });

    expect(fetcher).toHaveBeenCalledWith(
      "https://admin.example.test/catalog/products",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("uses catalog attribute endpoints for create and status updates", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          data: {},
          requestId: "req_attributes_1",
          success: true,
        }),
      ),
    );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });

    await client.createColor(
      { code: "NAVY", hexValue: "#000080", name: "Navy" },
      { requestId: "req_attributes_1" },
    );
    await client.updateSizeStatus(
      {
        sizeId: "10000000-0000-4000-8000-000000000001",
        status: "INACTIVE",
      },
      { requestId: "req_attributes_2" },
    );

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://admin.example.test/catalog/colors",
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://admin.example.test/catalog/sizes/10000000-0000-4000-8000-000000000001/status",
    );
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: "PATCH" });
  });

  it("uses barcode endpoints without trusted context fields", async () => {
    const variantId = "10000000-0000-4000-8000-000000000020";
    const barcodeId = "10000000-0000-4000-8000-000000000021";
    const barcode = {
      createdAt: "2026-08-03T00:00:00.000Z",
      id: barcodeId,
      organizationId: "10000000-0000-4000-8000-000000000022",
      productVariantId: variantId,
      status: "ACTIVE",
      type: "INTERNAL",
      updatedAt: "2026-08-03T00:00:00.000Z",
      value: "SENVO-SHIRT-L",
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: barcode,
          requestId: "req_barcode_1",
          success: true,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: { ...barcode, status: "INACTIVE" },
          requestId: "req_barcode_2",
          success: true,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            barcode,
            color: "Black",
            productName: "Oxford Shirt",
            size: "Large",
            sku: "OXFORD-BLK-L",
            variantId,
          },
          requestId: "req_barcode_3",
          success: true,
        }),
      );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });

    await client.createVariantBarcode(
      { type: "INTERNAL", value: "senvo-shirt-l", variantId },
      { requestId: "req_barcode_1" },
    );
    await client.updateBarcodeStatus(
      { barcodeId, status: "INACTIVE" },
      { requestId: "req_barcode_2" },
    );
    await client.lookupBarcode("CODE / 1", { requestId: "req_barcode_3" });

    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      `https://admin.example.test/catalog/variants/${variantId}/barcodes`,
      `https://admin.example.test/catalog/barcodes/${barcodeId}/status`,
      "https://admin.example.test/catalog/barcodes/lookup/CODE%20%2F%201",
    ]);
    const rawCreateBody = fetcher.mock.calls[0]?.[1]?.body;
    const rawStatusBody = fetcher.mock.calls[1]?.[1]?.body;
    expect(typeof rawCreateBody).toBe("string");
    expect(typeof rawStatusBody).toBe("string");
    const createBody = JSON.parse(
      typeof rawCreateBody === "string" ? rawCreateBody : "{}",
    ) as Record<string, unknown>;
    const statusBody = JSON.parse(
      typeof rawStatusBody === "string" ? rawStatusBody : "{}",
    ) as Record<string, unknown>;
    expect(createBody).toEqual({ type: "INTERNAL", value: "senvo-shirt-l" });
    expect(statusBody).toEqual({ status: "INACTIVE" });
    for (const body of [createBody, statusBody]) {
      expect(body).not.toHaveProperty("organizationId");
      expect(body).not.toHaveProperty("createdBy");
      expect(body).not.toHaveProperty("permissions");
    }
  });

  it("uses typed inventory read endpoints with encoded filters", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          data: { hasMore: false, items: [], nextCursor: null },
          requestId: "req_inventory_1",
          success: true,
        }),
      ),
    );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });

    await client.listInventoryAvailability(
      { locationId: "10000000-0000-4000-8000-000000000001", search: "A B" },
      { requestId: "req_inventory_1" },
    );
    await client.listInventoryMovements(
      { cursor: "cursor|1", status: "POSTED" },
      { requestId: "req_inventory_2" },
    );

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://admin.example.test/inventory/availability?locationId=10000000-0000-4000-8000-000000000001&search=A+B",
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://admin.example.test/inventory/movements?cursor=cursor%7C1&status=POSTED",
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
  });

  it("uses typed inventory movement draft and posting endpoints", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          data: {
            id: "10000000-0000-4000-8000-000000000001",
            movementNumber: "RC-001",
            status: "DRAFT",
          },
          requestId: "req_draft_1",
          success: true,
        }),
      ),
    );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });

    const draftInput = {
      destinationLocationId: "10000000-0000-4000-8000-000000000002",
      idempotencyKey: "admin-receive:receipt-1",
      lines: [
        {
          productVariantId: "10000000-0000-4000-8000-000000000003",
          quantity: 10,
        },
      ],
      movementNumber: "RC-001",
      note: "Stock arrival",
      occurredAt: "2026-09-24T12:00:00.000Z",
      referenceId: "receipt-1",
      referenceType: "ADMIN_RECEIPT",
      sourceLocationId: null,
      type: "RECEIPT" as const,
    };

    await client.createInventoryMovementDraft(draftInput, {
      requestId: "req_draft_1",
    });
    await client.postInventoryMovement(
      { movementId: "10000000-0000-4000-8000-000000000001" },
      { requestId: "req_post_1" },
    );

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://admin.example.test/inventory/movement-drafts",
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify(draftInput),
      method: "POST",
    });

    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://admin.example.test/inventory/movements",
    );
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({
        movementId: "10000000-0000-4000-8000-000000000001",
      }),
      method: "POST",
    });
  });

  it("uses typed sales read and lifecycle endpoints", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          data: { hasMore: false, items: [], nextCursor: null },
          requestId: "req_sales_1",
          success: true,
        }),
      ),
    );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });
    const salesOrderId = "10000000-0000-4000-8000-000000000003";

    await client.listSalesOrders(
      { search: "SO 1", status: "DRAFT" },
      { requestId: "req_sales_1" },
    );
    await client.reserveSalesOrder(
      { expectedVersion: 2, salesOrderId },
      { requestId: "req_sales_2" },
    );

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://admin.example.test/sales/orders?search=SO+1&status=DRAFT",
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      `https://admin.example.test/sales/orders/${salesOrderId}/reserve`,
    );
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({ expectedVersion: 2 }),
      method: "POST",
    });
  });

  it("uses typed organization, store, team, and role endpoints without trusted context fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          data: {},
          requestId: "req_settings_1",
          success: true,
        }),
      ),
    );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });
    const storeId = "10000000-0000-4000-8000-000000000010";
    const teamMemberId = "10000000-0000-4000-8000-000000000011";

    await client.getOrganizationProfile({ requestId: "req_settings_1" });
    await client.updateStoreStatus(
      { expectedVersion: 2, status: "INACTIVE", storeId },
      { requestId: "req_settings_2" },
    );
    await client.assignTeamMemberRole(
      { expectedVersion: 3, role: "MANAGER", teamMemberId },
      { requestId: "req_settings_3" },
    );
    await client.listRoles({ requestId: "req_settings_4" });

    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "https://admin.example.test/organization",
      `https://admin.example.test/organization/stores/${storeId}/status`,
      `https://admin.example.test/organization/team/${teamMemberId}/role`,
      "https://admin.example.test/organization/roles",
    ]);
    const statusRequestBody = fetcher.mock.calls[1]?.[1]?.body;
    const roleRequestBody = fetcher.mock.calls[2]?.[1]?.body;
    expect(typeof statusRequestBody).toBe("string");
    expect(typeof roleRequestBody).toBe("string");
    const statusBody = JSON.parse(
      typeof statusRequestBody === "string" ? statusRequestBody : "{}",
    ) as Record<string, unknown>;
    const roleBody = JSON.parse(
      typeof roleRequestBody === "string" ? roleRequestBody : "{}",
    ) as Record<string, unknown>;
    expect(statusBody).toEqual({ expectedVersion: 2, status: "INACTIVE" });
    expect(roleBody).toEqual({ expectedVersion: 3, role: "MANAGER" });
    expect(statusBody).not.toHaveProperty("organizationId");
    expect(roleBody).not.toHaveProperty("userId");
    expect(roleBody).not.toHaveProperty("permissions");
  });

  it("maps organization API errors with request IDs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "CONFLICT.STATE",
            message: "Store code already exists.",
          },
          requestId: "req_store_error_1",
          success: false,
        },
        { status: 409 },
      ),
    );
    const client = new AdminApiClient({ fetcher });

    await expect(
      client.createStore(
        { code: "MAIN", name: "Main Store" },
        { requestId: "req_store_error_1" },
      ),
    ).rejects.toMatchObject({
      category: "CONFLICT",
      requestId: "req_store_error_1",
      status: 409,
    });
  });

  it("uses sales source endpoints without trusted staff or organization fields", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: {}, requestId: "req_booth_1", success: true }),
      );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });
    await client.createSalesBooth(
      {
        endDate: "2026-08-10",
        location: "UIU",
        name: "UIU Spring Fest 2026",
        startDate: "2026-08-08",
      },
      { requestId: "req_booth_1" },
    );
    const rawBody = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof rawBody).toBe("string");
    const body = JSON.parse(
      typeof rawBody === "string" ? rawBody : "{}",
    ) as Record<string, unknown>;
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://admin.example.test/sales/booths",
    );
    expect(body).not.toHaveProperty("organizationId");
    expect(body).not.toHaveProperty("responsibleStaffId");
    expect(body).not.toHaveProperty("permissions");
  });

  it("uses POS endpoints without trusted context fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          data: {},
          requestId: "req_pos_client_1",
          success: true,
        }),
      ),
    );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });
    await client.createSalesCounter(
      {
        branchId: "10000000-0000-4000-8000-000000000010",
        code: "MAIN-01",
        name: "Main counter",
        type: "STORE",
      },
      { requestId: "req_pos_client_1" },
    );
    await client.openSalesSession(
      { counterId: "10000000-0000-4000-8000-000000000011" },
      { requestId: "req_pos_client_2" },
    );
    await client.listCurrentSalesSessions({ requestId: "req_pos_client_5" });
    await client.checkoutPosCart(
      {
        allowOutstanding: false,
        cartId: "10000000-0000-4000-8000-000000000012",
        idempotencyKey: "checkout-client-001",
        payments: [{ amountMinor: 2500, method: "CASH" }],
      },
      { requestId: "req_pos_client_3" },
    );
    await client.getPosReceipt("10000000-0000-4000-8000-000000000013", {
      requestId: "req_pos_client_4",
    });
    await client.getPosPaymentAccount("10000000-0000-4000-8000-000000000013", {
      requestId: "req_pos_client_6",
    });
    await client.collectPosPayment(
      {
        checkoutId: "10000000-0000-4000-8000-000000000013",
        idempotencyKey: "payment-collection-001",
        payments: [{ amountMinor: 500, method: "CASH" }],
      },
      { requestId: "req_pos_client_7" },
    );
    await client.getPaymentCollectionReceipt(
      "10000000-0000-4000-8000-000000000014",
      { requestId: "req_pos_client_8" },
    );
    await client.getPosReturns("10000000-0000-4000-8000-000000000013", {
      requestId: "req_pos_client_9",
    });
    await client.createPosReturn(
      {
        checkoutId: "10000000-0000-4000-8000-000000000013",
        destinationLocationId: "10000000-0000-4000-8000-000000000015",
        idempotencyKey: "return-client-001",
        lines: [
          {
            quantity: 1,
            salesOrderLineId: "10000000-0000-4000-8000-000000000016",
          },
        ],
        reasonCode: "SIZE_OR_FIT",
      },
      { requestId: "req_pos_client_10" },
    );
    await client.getPosReturnReceipt("10000000-0000-4000-8000-000000000017", {
      requestId: "req_pos_client_11",
    });
    await client.getPosRefunds("10000000-0000-4000-8000-000000000013", {
      requestId: "req_pos_client_12",
    });
    await client.createPosRefund(
      {
        checkoutId: "10000000-0000-4000-8000-000000000013",
        idempotencyKey: "refund-client-001",
        refunds: [{ amountMinor: 500, method: "CASH" }],
      },
      { requestId: "req_pos_client_13" },
    );
    await client.getPosRefundReceipt("10000000-0000-4000-8000-000000000018", {
      requestId: "req_pos_client_14",
    });
    const bodies = fetcher.mock.calls.map(
      (call) =>
        JSON.parse(
          typeof call[1]?.body === "string" ? call[1].body : "{}",
        ) as Record<string, unknown>,
    );
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "https://admin.example.test/pos/counters",
      "https://admin.example.test/pos/sessions/open",
      "https://admin.example.test/pos/sessions/current",
      "https://admin.example.test/pos/carts/10000000-0000-4000-8000-000000000012/checkout",
      "https://admin.example.test/pos/checkouts/10000000-0000-4000-8000-000000000013/receipt",
      "https://admin.example.test/pos/checkouts/10000000-0000-4000-8000-000000000013/payments",
      "https://admin.example.test/pos/checkouts/10000000-0000-4000-8000-000000000013/payment-collections",
      "https://admin.example.test/pos/payment-collections/10000000-0000-4000-8000-000000000014/receipt",
      "https://admin.example.test/pos/checkouts/10000000-0000-4000-8000-000000000013/returns",
      "https://admin.example.test/pos/checkouts/10000000-0000-4000-8000-000000000013/returns",
      "https://admin.example.test/pos/returns/10000000-0000-4000-8000-000000000017/receipt",
      "https://admin.example.test/pos/checkouts/10000000-0000-4000-8000-000000000013/refunds",
      "https://admin.example.test/pos/checkouts/10000000-0000-4000-8000-000000000013/refunds",
      "https://admin.example.test/pos/refunds/10000000-0000-4000-8000-000000000018/receipt",
    ]);
    for (const body of bodies) {
      expect(body).not.toHaveProperty("organizationId");
      expect(body).not.toHaveProperty("userId");
      expect(body).not.toHaveProperty("role");
      expect(body).not.toHaveProperty("permissions");
      expect(body).not.toHaveProperty("cartId");
      expect(body).not.toHaveProperty("staffId");
      expect(body).not.toHaveProperty("totalMinor");
    }
  });

  it("uses product media routes without trusted storage or organization fields", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({ data: {}, requestId: "req_media_1", success: true }),
        ),
      );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });
    const productId = "10000000-0000-4000-8000-000000000001";

    await client.setPrimaryProductImage(
      {
        altText: "Navy oxford shirt",
        contentBase64: "iVBORw0KGgo=",
        contentType: "image/png",
        idempotencyKey: "media-upload-1",
        productId,
      },
      { requestId: "req_media_1" },
    );
    await client.removePrimaryProductImage(productId, {
      requestId: "req_media_2",
    });
    const linkId = "10000000-0000-4000-8000-000000000002";
    await client.addProductMedia({
      altText: "Navy oxford side",
      contentBase64: "iVBORw0KGgo=",
      contentType: "image/png",
      idempotencyKey: "media-upload-2",
      productId,
      productVariantId: null,
    });
    await client.reorderProductMedia({ linkIds: [linkId], productId });
    await client.setProductMediaPrimary(productId, linkId);
    await client.updateProductMedia({
      altText: "Updated description",
      linkId,
      productId,
      productVariantId: null,
    });
    await client.archiveProductMedia(productId, linkId);

    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      `https://admin.example.test/catalog/products/${productId}/primary-image`,
      `https://admin.example.test/catalog/products/${productId}/primary-image`,
      `https://admin.example.test/catalog/products/${productId}/media`,
      `https://admin.example.test/catalog/products/${productId}/media/reorder`,
      `https://admin.example.test/catalog/products/${productId}/media/${linkId}/primary`,
      `https://admin.example.test/catalog/products/${productId}/media/${linkId}`,
      `https://admin.example.test/catalog/products/${productId}/media/${linkId}`,
    ]);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual([
      "PUT",
      "DELETE",
      "POST",
      "PATCH",
      "PATCH",
      "PATCH",
      "DELETE",
    ]);
    const rawBody = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof rawBody).toBe("string");
    const body = JSON.parse(
      typeof rawBody === "string" ? rawBody : "{}",
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("productId");
    expect(body).not.toHaveProperty("organizationId");
    expect(body).not.toHaveProperty("storageKey");
    for (const call of fetcher.mock.calls.slice(2)) {
      const candidate = (
        typeof call[1]?.body === "string" ? JSON.parse(call[1].body) : {}
      ) as Record<string, unknown>;
      expect(candidate).not.toHaveProperty("productId");
      expect(candidate).not.toHaveProperty("linkId");
      expect(candidate).not.toHaveProperty("organizationId");
      expect(candidate).not.toHaveProperty("storageKey");
    }
  });

  it("uses governed online payment routes without tenant or actor fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((input) => {
      const path =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const data = path.includes("/refunds")
        ? {
            amountMinor: 1000,
            confirmedAt: null,
            failureCode: null,
            id: "10000000-0000-4000-8000-000000000003",
            providerRefundReference: null,
            status: "PENDING",
          }
        : {
            attempt: {
              amountMinor: 1000,
              bankTransactionId: null,
              currencyCode: "BDT",
              failureCode: null,
              id: "10000000-0000-4000-8000-000000000002",
              provider: "SSLCOMMERZ",
              providerTransactionId: "SW-ORDER-1",
              resolutionStatus: "NORMAL",
              status: "PENDING",
            },
            reconciliations: [],
            refunds: [],
          };
      return Promise.resolve(
        Response.json({ data, requestId: "request-payment", success: true }),
      );
    });
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });
    const orderId = "10000000-0000-4000-8000-000000000001";
    const attemptId = "10000000-0000-4000-8000-000000000002";
    const refundId = "10000000-0000-4000-8000-000000000003";
    await client.getOnlinePayment(orderId);
    await client.reconcileOnlinePayment(attemptId);
    await client.createProviderRefund({
      amountMinor: 1000,
      idempotencyKey: "admin-refund:test-1",
      paymentAttemptId: attemptId,
      reason: "Cancelled order",
    });
    await client.refreshProviderRefund(refundId);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      `https://admin.example.test/sales-orders/${orderId}/payment`,
      `https://admin.example.test/payments/attempts/${attemptId}/reconcile`,
      `https://admin.example.test/payments/attempts/${attemptId}/refunds`,
      `https://admin.example.test/payments/refunds/${refundId}/refresh`,
    ]);
    const bodies = fetcher.mock.calls.map(
      (call) =>
        JSON.parse(
          typeof call[1]?.body === "string" ? call[1].body : "{}",
        ) as Record<string, unknown>,
    );
    for (const body of bodies) {
      expect(body).not.toHaveProperty("organizationId");
      expect(body).not.toHaveProperty("userId");
      expect(body).not.toHaveProperty("permissions");
      expect(body).not.toHaveProperty("paymentAttemptId");
      expect(body).not.toHaveProperty("providerRefundId");
    }
  });
  it("withSession attaches Authorization: Bearer header on every request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: [], requestId: "req-bearer", success: true }),
      );
    const base = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });
    const client = base.withSession("my-session-token");

    await client.listProducts();

    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer my-session-token");
  });

  it("withSession does not override an explicitly provided Authorization header", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: {},
        requestId: "req-bearer-override",
        success: true,
      }),
    );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    }).withSession("default-token");

    await client.request("/catalog/products", {
      headers: { Authorization: "Bearer explicit-token" },
    });

    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer explicit-token");
  });

  it("base client without session does not attach Authorization header", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: [], requestId: "req-no-auth", success: true }),
      );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });

    await client.listProducts();

    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBeNull();
  });

  it("authenticated Admin runtime automatically supplies Authorization: Bearer on existing business requests (Catalog, Inventory, Sales, POS)", async () => {
    class InMemoryStorage implements Storage {
      private readonly store = new Map<string, string>();
      get length() {
        return this.store.size;
      }
      clear() {
        this.store.clear();
      }
      getItem(key: string) {
        return this.store.get(key) ?? null;
      }
      key(index: number) {
        return Array.from(this.store.keys())[index] ?? null;
      }
      removeItem(key: string) {
        this.store.delete(key);
      }
      setItem(key: string, value: string) {
        this.store.set(key, value);
      }
    }
    const mockStorage = new InMemoryStorage();
    const originalSession = globalThis.sessionStorage;
    globalThis.sessionStorage = mockStorage;

    try {
      // Simulate workforce login: credentials stored in session storage
      mockStorage.setItem(
        "senvo.admin.session",
        JSON.stringify({
          csrfToken: "csrf-val",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          rememberMe: false,
          sessionToken: "workforce-live-token-456",
        }),
      );

      const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
        Promise.resolve(
          Response.json({
            data: [],
            requestId: "req-business-call",
            success: true,
          }),
        ),
      );

      // Existing component pattern: module-level instantiated client without explicit sessionToken
      const standardClient = new AdminApiClient({
        baseUrl: "https://admin.example.test",
        fetcher,
      });

      // 1. Catalog route
      await standardClient.listProducts();
      let callHeaders = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
      expect(callHeaders.get("authorization")).toBe(
        "Bearer workforce-live-token-456",
      );

      // 2. Inventory route
      await standardClient.listStockLocations();
      callHeaders = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
      expect(callHeaders.get("authorization")).toBe(
        "Bearer workforce-live-token-456",
      );

      // 3. Sales route
      await standardClient.listSalesOrders();
      callHeaders = new Headers(fetcher.mock.calls[2]?.[1]?.headers);
      expect(callHeaders.get("authorization")).toBe(
        "Bearer workforce-live-token-456",
      );

      // 4. POS route
      await standardClient.listSalesCounters();
      callHeaders = new Headers(fetcher.mock.calls[3]?.[1]?.headers);
      expect(callHeaders.get("authorization")).toBe(
        "Bearer workforce-live-token-456",
      );

      // 5. On logout: storage cleared -> subsequent requests have no Bearer token
      mockStorage.clear();
      await standardClient.listProducts();
      callHeaders = new Headers(fetcher.mock.calls[4]?.[1]?.headers);
      expect(callHeaders.get("authorization")).toBeNull();
    } finally {
      globalThis.sessionStorage = originalSession;
    }
  });
});
