import { describe, expect, it } from "vitest";
import { SslCommerzAdapter, loadSslCommerzConfig } from "./index.js";

const enabled = process.env.SSLCOMMERZ_SANDBOX_VERIFY === "true";

describe.skipIf(!enabled)("SSLCOMMERZ sandbox verification", () => {
  it("creates a real hosted sandbox session with dedicated credentials", async () => {
    const adapter = new SslCommerzAdapter(
      loadSslCommerzConfig({
        ...process.env,
        SSLCOMMERZ_ENABLED: "true",
        SSLCOMMERZ_ENVIRONMENT: "sandbox",
      }),
    );
    const transactionId = `SWE2E${Date.now()}`;
    const result = await adapter.createSession({
      amountMinor: 1000,
      currencyCode: "BDT",
      customer: {
        email: "sandbox@senvo.test",
        name: "SENVO Sandbox",
        phone: "01700000000",
      },
      orderNumber: transactionId,
      providerTransactionId: transactionId,
    });
    expect(result.redirectUrl).toMatch(
      /^https:\/\/sandbox\.sslcommerz\.com\//u,
    );
    expect(result.sessionId).not.toBe("");
  });
});
