import { storefrontApiBaseUrl } from "./storefront-api";

export type CustomerProfile = {
  customerAccountId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  organizationId: string;
  phone: string | null;
  phoneVerified: boolean;
  status: "ACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED" | "DISABLED";
  userId: string;
};

export type CustomerSession = {
  expiresAt: string;
  profile: CustomerProfile;
};

type ApiResponse<T> =
  | { data: T; requestId: string; success: true }
  | {
      error: {
        code: string;
        fieldErrors?: Record<string, string[]>;
        message: string;
      };
      requestId: string;
      success: false;
    };

export class CustomerAuthApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string[]> | undefined,
    readonly requestId: string,
  ) {
    super(Object.values(fieldErrors ?? {}).flat()[0] ?? message);
    this.name = "CustomerAuthApiError";
  }
}

async function request<T>(
  path: string,
  input?: unknown,
  method: "GET" | "POST" = "POST",
): Promise<T> {
  const csrf = readCookie("senvo_customer_csrf");
  const response = await fetch(`${storefrontApiBaseUrl()}${path}`, {
    body: method === "GET" ? undefined : JSON.stringify(input ?? {}),
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    method,
  });
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.success) {
    throw new CustomerAuthApiError(
      body.error.code,
      body.error.message,
      body.error.fieldErrors,
      body.requestId,
    );
  }
  return body.data;
}

export const customerAuthApi = {
  googleStart(termsAccepted: boolean, redirect: string) {
    return request<{ url: string }>("/storefront/auth/google/start", {
      redirect,
      termsAccepted,
    });
  },
  forgotPassword(email: string) {
    return request<{ message: string }>("/storefront/auth/password/forgot", {
      email,
    });
  },
  login(input: { email: string; password: string; rememberMe: boolean }) {
    return request<CustomerSession>("/storefront/auth/login", input);
  },
  logout() {
    return request<{ loggedOut: true }>("/storefront/auth/logout");
  },
  logoutAll() {
    return request<{ loggedOut: true }>("/storefront/auth/logout-all");
  },
  register(input: {
    confirmPassword: string;
    email: string;
    firstName: string;
    lastName: string;
    marketingConsent: boolean;
    password: string;
    phone: string | null;
    rememberMe: boolean;
    termsAccepted: true;
  }) {
    return request<CustomerSession & { verificationDelivery: string }>(
      "/storefront/auth/register",
      input,
    );
  },
  requestOtp(channel: "EMAIL" | "PHONE", destination: string) {
    return request<{ delivery: string; expiresInSeconds: number }>(
      "/storefront/auth/otp/request",
      { channel, destination },
    );
  },
  requestEmailVerification() {
    return request<{ delivery: string }>(
      "/storefront/auth/email-verification/request",
    );
  },
  resetPassword(input: {
    challengeId: string;
    confirmPassword: string;
    password: string;
    token: string;
  }) {
    return request<{ reset: true }>("/storefront/auth/password/reset", input);
  },
  session() {
    return request<CustomerSession>(
      "/storefront/auth/session",
      undefined,
      "GET",
    );
  },
  verifyEmail(challengeId: string, token: string) {
    return request<{ verified: true }>(
      "/storefront/auth/email-verification/verify",
      { challengeId, token },
    );
  },
  verifyOtp(input: {
    channel: "EMAIL" | "PHONE";
    code: string;
    destination: string;
    onboarding?: {
      email: string;
      firstName: string;
      lastName: string;
      termsAccepted: true;
    };
    rememberMe: boolean;
  }) {
    return request<CustomerSession>("/storefront/auth/otp/verify", input);
  },
};

export function safeAccountRedirect(
  value: string | null,
  fallback = "/",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  try {
    const url = new URL(value, "http://senvo.local");
    return url.origin === "http://senvo.local"
      ? `${url.pathname}${url.search}`
      : fallback;
  } catch {
    return fallback;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}
