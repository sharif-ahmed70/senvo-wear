import type { IncomingHttpHeaders } from "node:http";
import type { ApiRequestContext } from "@senvo/api";
import type { ApplicationContext } from "@senvo/application";
import type { AuthenticationSessionApplicationService } from "@senvo/application";
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

export class ProductionSessionRequestContextFactory implements HttpRequestContextFactory {
  constructor(
    private readonly sessions: Pick<
      AuthenticationSessionApplicationService,
      "resolve"
    >,
    private readonly cookieName = "senvo_session",
  ) {}

  async create(input: {
    headers: IncomingHttpHeaders;
    requestId: string;
  }): Promise<ApiRequestContext> {
    const token = cookieValue(input.headers.cookie, this.cookieName);
    if (!token) {
      return {
        authenticatedUser: null,
        organizationId: "",
        permissions: [],
        requestId: input.requestId,
      };
    }
    const principal = await this.sessions.resolve(token);
    return {
      authenticatedUser: { userId: principal.userId },
      organizationId: principal.organizationId,
      permissions: principal.permissions,
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

export function cookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  for (const pair of cookieHeader?.split(";") ?? []) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    }
  }
  return null;
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
