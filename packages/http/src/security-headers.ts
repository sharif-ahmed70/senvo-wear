import type { ServerResponse } from "node:http";

export type HttpSecurityHeaders = Readonly<Record<string, string>>;

export const defaultHttpSecurityHeaders: HttpSecurityHeaders = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

export function applySecurityHeaders(
  response: ServerResponse,
  headers: HttpSecurityHeaders,
): void {
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
}
