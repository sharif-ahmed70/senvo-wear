import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  SslCommerzAdapter,
  loadSslCommerzConfig,
  type SslCommerzConfig,
} from "./index.js";

const config: SslCommerzConfig = {
  callbackBaseUrl: "https://shop.senvo.test",
  enabled: true,
  environment: "sandbox",
  ipnUrl: "https://api.senvo.test/payments/providers/sslcommerz/ipn",
  storeId: "sandbox-store",
  storePassword: "server-secret",
  timeoutMs: 5000,
};

describe("SslCommerzAdapter", () => {
  it("creates a hosted session from server-owned amount and callbacks", async () => {
    const fetcher = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) => {
        if (!(init?.body instanceof URLSearchParams)) {
          throw new Error("Expected form-encoded session request.");
        }
        const body = init.body;
        expect(body.get("total_amount")).toBe("1299.00");
        expect(body.get("tran_id")).toBe("SW-ORDER-1");
        expect(body.get("success_url")).toBe(
          "https://shop.senvo.test/payment-return/success",
        );
        expect(body.get("ipn_url")).toBe(config.ipnUrl);
        return Promise.resolve(
          Response.json({
            GatewayPageURL: "https://sandbox.sslcommerz.com/gwprocess/redirect",
            sessionkey: "session-123",
          }),
        );
      },
    );
    const result = await new SslCommerzAdapter(config, fetcher).createSession({
      amountMinor: 129900,
      currencyCode: "BDT",
      customer: { email: null, name: "Customer", phone: "01700000000" },
      orderNumber: "WEB-1001",
      providerTransactionId: "SW-ORDER-1",
    });
    expect(result).toEqual({
      expiresAt: null,
      redirectUrl: "https://sandbox.sslcommerz.com/gwprocess/redirect",
      sessionId: "session-123",
    });
  });

  it("verifies the documented IPN hash without exposing the store password", () => {
    const payload = {
      amount: "1299.00",
      status: "VALID",
      tran_id: "SW-ORDER-1",
      verify_key: "amount,status,tran_id",
    };
    const storeHash = createHash("md5")
      .update(config.storePassword)
      .digest("hex");
    const verifySign = createHash("md5")
      .update(
        `amount=1299.00&status=VALID&store_passwd=${storeHash}&tran_id=SW-ORDER-1`,
      )
      .digest("hex");
    const adapter = new SslCommerzAdapter(config, vi.fn() as typeof fetch);
    expect(
      adapter.validateNotificationSignature({
        ...payload,
        verify_sign: verifySign,
      }),
    ).toBe(true);
    expect(
      adapter.validateNotificationSignature({
        ...payload,
        amount: "1.00",
        verify_sign: verifySign,
      }),
    ).toBe(false);
  });

  it("maps validation, transaction query, refund initiation, and refund query", async () => {
    const fetcher = vi.fn((input: string | URL | Request) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );
      if (url.searchParams.has("val_id")) {
        return Promise.resolve(
          Response.json({
            amount: "1299.00",
            bank_tran_id: "bank-1",
            currency: "BDT",
            risk_level: "0",
            status: "VALID",
            tran_id: "SW-ORDER-1",
            val_id: "validation-1",
          }),
        );
      }
      if (url.searchParams.has("refund_amount")) {
        expect(url.searchParams.get("refund_trans_id")).toBe("refund-1");
        return Promise.resolve(
          Response.json({
            refund_ref_id: "provider-refund-1",
            status: "success",
          }),
        );
      }
      if (url.searchParams.has("refund_ref_id")) {
        return Promise.resolve(Response.json({ status: "refunded" }));
      }
      return Promise.resolve(
        Response.json({
          element: [
            {
              amount: "1299",
              currency: "BDT",
              status: "PENDING",
              tran_id: "SW-ORDER-1",
            },
          ],
        }),
      );
    });
    const adapter = new SslCommerzAdapter(config, fetcher);
    await expect(
      adapter.validateTransaction("validation-1"),
    ).resolves.toMatchObject({
      amountMinor: 129900,
      status: "SUCCEEDED",
    });
    await expect(adapter.queryTransaction("SW-ORDER-1")).resolves.toMatchObject(
      { status: "PENDING" },
    );
    await expect(
      adapter.initiateRefund({
        amountMinor: 5000,
        bankTransactionId: "bank-1",
        providerRefundTransactionId: "refund-1",
        reason: "Cancelled order",
      }),
    ).resolves.toEqual({
      providerRefundReference: "provider-refund-1",
      status: "PENDING",
    });
    await expect(adapter.queryRefund("provider-refund-1")).resolves.toEqual({
      providerRefundReference: "provider-refund-1",
      status: "CONFIRMED",
    });
  });

  it("normalizes timeout and rejects non-HTTPS configuration", async () => {
    expect(() =>
      loadSslCommerzConfig({
        SSLCOMMERZ_ENABLED: "true",
        SSLCOMMERZ_IPN_URL: "http://api.test/ipn",
        SSLCOMMERZ_STORE_ID: "store",
        SSLCOMMERZ_STORE_PASSWORD: "secret",
        STOREFRONT_PUBLIC_BASE_URL: "https://shop.test",
      }),
    ).toThrow("SSLCOMMERZ_IPN_URL must use HTTPS");
    const adapter = new SslCommerzAdapter(
      config,
      vi.fn(() => Promise.reject(new Error("timeout"))),
    );
    await expect(adapter.queryTransaction("SW-ORDER-1")).rejects.toMatchObject({
      code: "PROVIDER_NETWORK_ERROR",
      outcomeUncertain: true,
    });
  });
});
