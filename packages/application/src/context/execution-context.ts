import { ValidationApplicationServiceError } from "../errors/application-error.js";
import type { PermissionKey } from "@senvo/domain";

export type ApplicationActorType = "ANONYMOUS" | "INTERNAL" | "SYSTEM";
export type ApplicationAuthenticationState =
  "ANONYMOUS" | "AUTHENTICATED" | "SYSTEM";
export type ApplicationRole = "OWNER" | "ADMIN" | "MANAGER" | "STAFF";
export type ApplicationSource =
  "ADMIN" | "JOB" | "POS" | "STOREFRONT" | "INTERNAL";

export type ApplicationExecutionContext = {
  actorId?: string | null;
  actorType?: ApplicationActorType;
  authenticationState?: ApplicationAuthenticationState;
  organizationId: string;
  permissions?: readonly PermissionKey[] | null;
  role?: ApplicationRole | null;
  requestId?: string;
  source?: ApplicationSource;
  userId?: string | null;
};

export type ApplicationContext = {
  actorId: string | null;
  actorType: ApplicationActorType;
  authenticationState: ApplicationAuthenticationState;
  organizationId: string;
  permissions: readonly PermissionKey[] | null;
  role: ApplicationRole | null;
  requestId: string;
  source: ApplicationSource;
  userId: string | null;
};

export type ValidatedApplicationExecutionContext = ApplicationContext;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const requestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/u;
const actorTypes: readonly ApplicationActorType[] = [
  "ANONYMOUS",
  "INTERNAL",
  "SYSTEM",
];
const authenticationStates: readonly ApplicationAuthenticationState[] = [
  "ANONYMOUS",
  "AUTHENTICATED",
  "SYSTEM",
];
const roles: readonly ApplicationRole[] = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "STAFF",
];
const permissionResources: readonly PermissionKey["resource"][] = [
  "ORGANIZATION",
  "TEAM",
  "USER",
  "CATALOG",
  "INVENTORY",
  "RESERVATION",
  "SALES_ORDER",
  "SALES",
  "POS",
  "REPORT",
];
const permissionActions: readonly PermissionKey["action"][] = [
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "CANCEL",
  "FULFILL",
];
const sources: readonly ApplicationSource[] = [
  "ADMIN",
  "JOB",
  "POS",
  "STOREFRONT",
  "INTERNAL",
];

export function validateExecutionContext(
  context: ApplicationExecutionContext,
): ValidatedApplicationExecutionContext {
  const requestId = context.requestId;
  if (!uuidPattern.test(context.organizationId)) {
    throw new ValidationApplicationServiceError(
      "Application context organizationId must be a valid UUID.",
    );
  }
  if (!requestIdPattern.test(requestId ?? "")) {
    throw new ValidationApplicationServiceError(
      "Application context requestId is invalid.",
    );
  }
  if (context.actorId && !uuidPattern.test(context.actorId)) {
    throw new ValidationApplicationServiceError(
      "Application context actorId must be a valid UUID.",
    );
  }
  if (context.userId && !uuidPattern.test(context.userId)) {
    throw new ValidationApplicationServiceError(
      "Application context userId must be a valid UUID.",
    );
  }
  if (context.actorType && !actorTypes.includes(context.actorType)) {
    throw new ValidationApplicationServiceError(
      "Application context actorType is invalid.",
    );
  }
  if (
    context.authenticationState &&
    !authenticationStates.includes(context.authenticationState)
  ) {
    throw new ValidationApplicationServiceError(
      "Application context authenticationState is invalid.",
    );
  }
  if (context.role && !roles.includes(context.role)) {
    throw new ValidationApplicationServiceError(
      "Application context role is invalid.",
    );
  }
  if (context.permissions) {
    for (const permission of context.permissions) {
      if (
        !permissionResources.includes(permission.resource) ||
        !permissionActions.includes(permission.action)
      ) {
        throw new ValidationApplicationServiceError(
          "Application context permissions are invalid.",
        );
      }
    }
  }
  if (context.source && !sources.includes(context.source)) {
    throw new ValidationApplicationServiceError(
      "Application context source is invalid.",
    );
  }
  const authenticationState =
    context.authenticationState ??
    (context.userId
      ? "AUTHENTICATED"
      : context.actorType === "SYSTEM"
        ? "SYSTEM"
        : "ANONYMOUS");
  if (authenticationState === "AUTHENTICATED" && !context.userId) {
    throw new ValidationApplicationServiceError(
      "Authenticated application context requires userId.",
    );
  }
  return {
    actorId: context.actorId ?? null,
    actorType: context.actorType ?? "ANONYMOUS",
    authenticationState,
    organizationId: context.organizationId,
    permissions: context.permissions ?? null,
    role: context.role ?? null,
    requestId: requestId ?? "",
    source: context.source ?? "INTERNAL",
    userId: context.userId ?? null,
  };
}
