import { describe, expect, it, vi } from "vitest";
import type { StorefrontApplicationService } from "@senvo/application";
import { createStorefrontApiHandlers } from "./storefront-handlers.js";

const context = {
  authenticatedUser: null,
  organizationId: "",
  permissions: [],
  requestId: "request-public-123",
};

describe("storefront API handlers", () => {
  it("returns public catalog data with request ID propagation", async () => {
    const application = fakeApplication();
    const handlers = createStorefrontApiHandlers(application);
    const response = await handlers.listCatalog.handle({
      context,
      input: { search: "tee" },
    });
    expect(response).toMatchObject({
      requestId: context.requestId,
      success: true,
    });
    expect(application.listCatalog).toHaveBeenCalledWith(context.requestId, {
      search: "tee",
    });
  });

  it("rejects trusted checkout fields before application execution", async () => {
    const application = fakeApplication();
    const handlers = createStorefrontApiHandlers(application);
    const response = await handlers.checkout.handle({
      context,
      input: {
        customer: { name: "Sharif Ahmed", phone: "01712345678" },
        deliveryAddress: {
          city: "Dhaka",
          district: "Dhaka",
          line1: "House 10",
        },
        idempotencyKey: "web:test-123",
        lines: [
          {
            productVariantId: "22222222-2222-4222-8222-222222222222",
            quantity: 1,
            reviewedUnitPriceMinor: 129900,
          },
        ],
        organizationId: "11111111-1111-4111-8111-111111111111",
        paymentPreference: "CASH_ON_DELIVERY",
      },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(application.checkout).not.toHaveBeenCalled();
  });

  it("maps application idempotency conflicts without exposing internals", async () => {
    const application = fakeApplication();
    vi.mocked(application.checkout).mockResolvedValue({
      error: {
        code: "IDEMPOTENCY_CONFLICT",
        message: "This request was already used with different details.",
        requestId: context.requestId,
        retryable: false,
      },
      ok: false,
    });
    const response = await createStorefrontApiHandlers(
      application,
    ).checkout.handle({
      context,
      input: {
        customer: { name: "Sharif Ahmed", phone: "01712345678" },
        deliveryAddress: {
          city: "Dhaka",
          district: "Dhaka",
          line1: "House 10",
        },
        idempotencyKey: "web:test-123",
        lines: [
          {
            productVariantId: "22222222-2222-4222-8222-222222222222",
            quantity: 1,
            reviewedUnitPriceMinor: 129900,
          },
        ],
        paymentPreference: "CASH_ON_DELIVERY",
      },
    });
    expect(response).toMatchObject({
      error: { code: "CONFLICT.IDEMPOTENCY" },
      requestId: context.requestId,
      success: false,
    });
  });

  it("maps reviewed-price changes as a safe business response", async () => {
    const application = fakeApplication();
    vi.mocked(application.checkout).mockResolvedValue({
      error: {
        code: "BUSINESS_RULE_VIOLATION",
        message:
          "Product prices changed. Refresh and review the current total.",
        requestId: context.requestId,
        retryable: false,
      },
      ok: false,
    });
    const response = await createStorefrontApiHandlers(
      application,
    ).checkout.handle({
      context,
      input: {
        customer: { name: "Sharif Ahmed", phone: "01712345678" },
        deliveryAddress: {
          city: "Dhaka",
          district: "Dhaka",
          line1: "House 10",
        },
        idempotencyKey: "web:price-change",
        lines: [
          {
            productVariantId: "22222222-2222-4222-8222-222222222222",
            quantity: 1,
            reviewedUnitPriceMinor: 1,
          },
        ],
        paymentPreference: "CASH_ON_DELIVERY",
      },
    });
    expect(response).toMatchObject({
      error: {
        code: "BUSINESS_RULE.VIOLATION",
        message:
          "Product prices changed. Refresh and review the current total.",
      },
      requestId: context.requestId,
      success: false,
    });
  });
});

function fakeApplication() {
  return {
    checkout: vi.fn(() =>
      Promise.resolve({
        data: {
          currencyCode: "BDT",
          orderId: "33333333-3333-4333-8333-333333333333",
          orderNumber: "WEB-ABC",
          paymentPreference: "CASH_ON_DELIVERY",
          status: "RESERVED",
          totalMinor: 129900,
        },
        ok: true as const,
      }),
    ),
    getProduct: vi.fn(() => Promise.resolve({ data: null, ok: true as const })),
    listCatalog: vi.fn(() =>
      Promise.resolve({
        data: {
          categories: [],
          collections: [],
          hasMore: false,
          page: 1,
          pageSize: 24,
          products: [],
        },
        ok: true as const,
      }),
    ),
  } as unknown as Pick<
    StorefrontApplicationService,
    "checkout" | "getProduct" | "listCatalog"
  >;
}
