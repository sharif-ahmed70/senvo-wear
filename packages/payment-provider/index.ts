import { createHash, timingSafeEqual } from "node:crypto";
import type {
  OnlinePaymentProviderAdapter,
  ProviderPaymentObservation,
  ProviderRefundStatus,
  ProviderSessionRequest,
  ProviderSessionResult,
} from "@senvo/domain";

export type SslCommerzEnvironment = "production" | "sandbox";

export type SslCommerzConfig = {
  callbackBaseUrl: string;
  enabled: boolean;
  environment: SslCommerzEnvironment;
  ipnUrl: string;
  storeId: string;
  storePassword: string;
  timeoutMs: number;
};

export type SslCommerzEnvironmentInput = Record<string, string | undefined>;

export function loadSslCommerzConfig(
  environment: SslCommerzEnvironmentInput,
): SslCommerzConfig {
  const enabled = environment.SSLCOMMERZ_ENABLED === "true";
  const providerEnvironment = environment.SSLCOMMERZ_ENVIRONMENT ?? "sandbox";
  if (
    providerEnvironment !== "sandbox" &&
    providerEnvironment !== "production"
  ) {
    throw new Error("SSLCOMMERZ_ENVIRONMENT must be sandbox or production.");
  }
  const callbackBaseUrl = environment.STOREFRONT_PUBLIC_BASE_URL?.trim() ?? "";
  const ipnUrl = environment.SSLCOMMERZ_IPN_URL?.trim() ?? "";
  const storeId = environment.SSLCOMMERZ_STORE_ID?.trim() ?? "";
  const storePassword = environment.SSLCOMMERZ_STORE_PASSWORD?.trim() ?? "";
  if (enabled) {
    assertHttpsUrl(callbackBaseUrl, "STOREFRONT_PUBLIC_BASE_URL");
    assertHttpsUrl(ipnUrl, "SSLCOMMERZ_IPN_URL");
    if (!storeId || !storePassword) {
      throw new Error(
        "SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD are required when the provider is enabled.",
      );
    }
  }
  const timeoutMs = Number(environment.SSLCOMMERZ_TIMEOUT_MS ?? "10000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error("SSLCOMMERZ_TIMEOUT_MS must be between 1000 and 30000.");
  }
  return {
    callbackBaseUrl: callbackBaseUrl.replace(/\/$/u, ""),
    enabled,
    environment: providerEnvironment,
    ipnUrl,
    storeId,
    storePassword,
    timeoutMs,
  };
}

export class PaymentProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly outcomeUncertain = false,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

export class SslCommerzAdapter implements OnlinePaymentProviderAdapter {
  readonly enabled: boolean;
  private readonly baseUrl: string;

  constructor(
    private readonly config: SslCommerzConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.enabled = config.enabled;
    this.baseUrl =
      config.environment === "production"
        ? "https://securepay.sslcommerz.com"
        : "https://sandbox.sslcommerz.com";
  }

  async createSession(
    input: ProviderSessionRequest,
  ): Promise<ProviderSessionResult> {
    this.assertEnabled();
    const body = new URLSearchParams({
      cancel_url: `${this.config.callbackBaseUrl}/payment-return/cancel`,
      currency: input.currencyCode,
      cus_add1: "Provided during SENVO checkout",
      cus_city: "Bangladesh",
      cus_country: "Bangladesh",
      cus_email: input.customer.email ?? "no-email@senvo.invalid",
      cus_name: input.customer.name,
      cus_phone: input.customer.phone,
      cus_postcode: "0000",
      fail_url: `${this.config.callbackBaseUrl}/payment-return/fail`,
      ipn_url: this.config.ipnUrl,
      product_category: "apparel",
      product_name: `SENVO order ${input.orderNumber}`,
      product_profile: "general",
      shipping_method: "YES",
      ship_add1: "Provided during SENVO checkout",
      ship_city: "Bangladesh",
      ship_country: "Bangladesh",
      ship_name: input.customer.name,
      ship_postcode: "0000",
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      success_url: `${this.config.callbackBaseUrl}/payment-return/success`,
      total_amount: minorToDecimal(input.amountMinor),
      tran_id: input.providerTransactionId,
      value_a: input.providerTransactionId,
    });
    const response = await this.request(
      `${this.baseUrl}/gwprocess/v4/api.php`,
      {
        body,
        method: "POST",
      },
    );
    const redirectUrl = requiredHttps(
      response.GatewayPageURL,
      "GatewayPageURL",
    );
    const sessionId = requiredString(response.sessionkey, "sessionkey", 160);
    return { expiresAt: null, redirectUrl, sessionId };
  }

  validateNotificationSignature(
    payload: Readonly<Record<string, string>>,
  ): boolean {
    const signature = payload.verify_sign;
    const keys = payload.verify_key
      ?.split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    if (!signature || !keys?.length || !/^[a-f0-9]{32}$/iu.test(signature))
      return false;
    const values = new Map<string, string>();
    for (const key of keys) {
      const value = payload[key];
      if (value === undefined) return false;
      values.set(key, value);
    }
    values.set(
      "store_passwd",
      createHash("md5").update(this.config.storePassword).digest("hex"),
    );
    const canonical = [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const expected = createHash("md5").update(canonical).digest("hex");
    return timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature.toLowerCase()),
    );
  }

  async validateTransaction(
    validationId: string,
  ): Promise<ProviderPaymentObservation> {
    this.assertEnabled();
    return this.paymentObservation(
      await this.get("/validator/api/validationserverAPI.php", {
        val_id: validationId,
      }),
    );
  }

  async queryTransaction(
    providerTransactionId: string,
  ): Promise<ProviderPaymentObservation> {
    this.assertEnabled();
    const response = await this.get(
      "/validator/api/merchantTransIDvalidationAPI.php",
      {
        tran_id: providerTransactionId,
      },
    );
    const element = firstArrayElement(response.element ?? response);
    return this.paymentObservation(isRecord(element) ? element : response);
  }

  async initiateRefund(input: {
    amountMinor: number;
    bankTransactionId: string;
    providerRefundTransactionId: string;
    reason: string;
  }): Promise<{
    providerRefundReference: string | null;
    status: ProviderRefundStatus;
  }> {
    this.assertEnabled();
    const response = await this.get(
      "/validator/api/merchantTransIDvalidationAPI.php",
      {
        bank_tran_id: input.bankTransactionId,
        refe_id: input.providerRefundTransactionId,
        refund_amount: minorToDecimal(input.amountMinor),
        refund_remarks: input.reason.slice(0, 255),
        refund_trans_id: input.providerRefundTransactionId,
        v: "1",
      },
    );
    return {
      providerRefundReference: optionalString(response.refund_ref_id, 160),
      status: mapRefundStatus(response.status),
    };
  }

  async queryRefund(providerRefundReference: string): Promise<{
    providerRefundReference: string;
    status: ProviderRefundStatus;
  }> {
    this.assertEnabled();
    const response = await this.get(
      "/validator/api/merchantTransIDvalidationAPI.php",
      {
        refund_ref_id: providerRefundReference,
      },
    );
    return {
      providerRefundReference,
      status: mapRefundStatus(response.status),
    };
  }

  private async get(path: string, query: Record<string, string>) {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries({
      ...query,
      format: "json",
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
    })) {
      url.searchParams.set(key, value);
    }
    return this.request(url.toString(), { method: "GET" });
  }

  private async request(
    url: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers:
          init.body instanceof URLSearchParams
            ? { "content-type": "application/x-www-form-urlencoded" }
            : undefined,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch {
      throw new PaymentProviderError(
        "PROVIDER_NETWORK_ERROR",
        "The payment provider could not be reached.",
        true,
      );
    }
    if (!response.ok) {
      throw new PaymentProviderError(
        "PROVIDER_HTTP_ERROR",
        "The payment provider rejected the request.",
        response.status >= 500,
      );
    }
    const body: unknown = await response.json();
    if (!isRecord(body)) {
      throw new PaymentProviderError(
        "PROVIDER_INVALID_RESPONSE",
        "The payment provider response was invalid.",
      );
    }
    return body;
  }

  private paymentObservation(
    response: Record<string, unknown>,
  ): ProviderPaymentObservation {
    const providerStatus = optionalString(response.status, 40) ?? "UNKNOWN";
    const amount = optionalDecimalToMinor(response.amount);
    return {
      amountMinor: amount,
      bankTransactionId: optionalString(response.bank_tran_id, 160),
      currencyCode: optionalString(response.currency, 3),
      providerStatus,
      providerTransactionId:
        optionalString(response.tran_id, 64) ??
        optionalString(response.value_a, 64) ??
        "",
      riskLevel: optionalInteger(response.risk_level),
      status: mapPaymentStatus(providerStatus),
      validationId: optionalString(response.val_id, 120),
    };
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new PaymentProviderError(
        "PROVIDER_DISABLED",
        "Online payment is unavailable.",
      );
    }
  }
}

function mapPaymentStatus(
  status: string,
): ProviderPaymentObservation["status"] {
  switch (status.trim().toUpperCase()) {
    case "VALID":
    case "VALIDATED":
      return "SUCCEEDED";
    case "FAILED":
      return "FAILED";
    case "CANCELLED":
      return "CANCELLED";
    case "EXPIRED":
      return "EXPIRED";
    case "PENDING":
    case "UNATTEMPTED":
      return "PENDING";
    default:
      return "UNKNOWN";
  }
}

function mapRefundStatus(value: unknown): ProviderRefundStatus {
  const status = typeof value === "string" ? value.toLowerCase() : "";
  if (status === "refunded") return "CONFIRMED";
  if (status === "success" || status === "processing") return "PENDING";
  if (status === "cancelled") return "CANCELLED";
  return "FAILED";
}

function minorToDecimal(value: number): string {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PaymentProviderError(
      "INVALID_AMOUNT",
      "Payment amount is invalid.",
    );
  }
  return (value / 100).toFixed(2);
}

function optionalDecimalToMinor(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/u.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

function optionalInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function optionalString(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim() && value.length <= maximum
    ? value.trim()
    : null;
}

function requiredString(
  value: unknown,
  field: string,
  maximum: number,
): string {
  const normalized = optionalString(value, maximum);
  if (!normalized) {
    throw new PaymentProviderError(
      "PROVIDER_INVALID_RESPONSE",
      `The payment provider omitted ${field}.`,
    );
  }
  return normalized;
}

function requiredHttps(value: unknown, field: string): string {
  const normalized = requiredString(value, field, 1000);
  assertHttpsUrl(normalized, field);
  return normalized;
}

function assertHttpsUrl(value: string, field: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${field} must use HTTPS.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstArrayElement(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const elements: unknown[] = value;
  return elements[0];
}
