import { describe, expect, it, vi } from "vitest";
import { AdminApiClient, AdminApiError } from "./_lib/api-client";

describe("AdminApiClient", () => {
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
});
