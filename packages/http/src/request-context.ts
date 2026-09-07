import type { IncomingHttpHeaders } from "node:http";
import type { ApiRequestContext } from "@senvo/api";
import type {
  ApplicationContext,
  WorkforceAuthenticationService,
} from "@senvo/application";
import { assertDevelopmentEnvironment } from "./development-authentication.js";

type Permission = NonNullable<ApplicationContext["permissions"]>[number];

const permissionActions = new Set<Permission["action"]>([
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "CANCEL",
  "FULFILL",
]);
const permissionResources = new Set<Permission["resource"]>([
  "ORGANIZATION",
  "USER",
  "CATALOG",
  "INVENTORY",
  "RESERVATION",
  "SALES_ORDER",
  "REPORT",
  "TEAM",
  "SALES",
  "POS",
  "PAYMENT",
  "RECEIPT",
]);

export type HttpRequestContextFactory = {
  create(input: {
    headers: IncomingHttpHeaders;
    requestId: string;
  }): ApiRequestContext | Promise<ApiRequestContext>;
};

export class DevelopmentHeaderRequestContextFactory implements HttpRequestContextFactory {
  constructor(environment: "development" | "test") {
    assertDevelopmentEnvironment(environment);
  }

  create(input: {
    headers: IncomingHttpHeaders;
    requestId: string;
  }): ApiRequestContext {
    const userId = headerValue(input.headers, "x-dev-user-id");
    return {
      authenticatedUser: userId ? { userId } : null,
      organizationId: headerValue(input.headers, "x-dev-organization-id") ?? "",
      permissions: parsePermissions(
        headerValue(input.headers, "x-dev-permissions"),
      ),
      requestId: input.requestId,
    };
  }
}

/**
 * Production-ready request context factory that authenticates incoming Admin
 * business API requests by validating the Bearer workforce session token.
 *
 * The development server continues to use DevelopmentHeaderRequestContextFactory.
 * This factory is exported for production deployment wiring.
 */
export class WorkforceSessionRequestContextFactory implements HttpRequestContextFactory {
  constructor(
    private readonly workforceAuthentication: WorkforceAuthenticationService,
  ) {}

  async create(input: {
    headers: IncomingHttpHeaders;
    requestId: string;
  }): Promise<ApiRequestContext> {
    const token =
      extractCookieToken(input.headers.cookie, "senvo_workforce_session") ||
      bearerToken(input.headers);
    if (!token) {
      throw new HttpRequestContextError(
        "Authentication is required for authenticated requests.",
      );
    }
    let principal;
    try {
      principal = await this.workforceAuthentication.authenticateSession(token);
    } catch (error) {
      if (error instanceof HttpRequestContextError) throw error;
      throw new HttpRequestContextError(
        error instanceof Error ? error.message : "Authentication is required.",
      );
    }
    const permissions = principal.permissions.filter(
      (p): p is Permission =>
        permissionResources.has(p.resource as Permission["resource"]) &&
        permissionActions.has(p.action as Permission["action"]),
    );
    return {
      authenticatedUser: { userId: principal.userId },
      organizationId: principal.organizationId,
      permissions,
      requestId: input.requestId,
    };
  }
}

export class HttpRequestContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpRequestContextError";
  }
}

export function headerValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | null {
  const value = headers[name];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function bearerToken(headers: IncomingHttpHeaders): string {
  const authorization = headerValue(headers, "authorization");
  if (!authorization) return "";
  const match = /^Bearer\s+(.+)$/u.exec(authorization.trim());
  return match?.[1]?.trim() ?? "";
}

function parsePermissions(value: string | null): Permission[] {
  if (!value?.trim()) {
    return [];
  }
  return value.split(",").map((entry) => {
    const [resource, action, extra] = entry.trim().toUpperCase().split(":");
    if (
      extra !== undefined ||
      !resource ||
      !action ||
      !permissionResources.has(resource as Permission["resource"]) ||
      !permissionActions.has(action as Permission["action"])
    ) {
      throw new HttpRequestContextError(
        "Development permission header is invalid.",
      );
    }
    return {
      action: action as Permission["action"],
      resource: resource as Permission["resource"],
    };
  });
}

function extractCookieToken(
  cookieHeader: string | undefined,
  name: string,
): string {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      const key = part.slice(0, eq).trim();
      if (key === name) {
        const val = part.slice(eq + 1).trim();
        try {
          return decodeURIComponent(val);
        } catch {
          return val;
        }
      }
    }
  }
  return "";
}
