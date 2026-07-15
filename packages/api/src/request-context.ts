import {
  validateExecutionContext,
  type ApplicationContext,
  type ApplicationExecutionContext,
} from "@senvo/application";

export type ApiAuthenticatedUser = {
  userId: string;
};

export type ApiRequestContext = {
  authenticatedUser: ApiAuthenticatedUser | null;
  organizationId: string;
  permissions: NonNullable<ApplicationContext["permissions"]>;
  requestId: string;
};

export function createApplicationContext(input: {
  authenticatedUserId: string;
  requestContext: ApiRequestContext;
}): ApplicationContext {
  const context: ApplicationExecutionContext = {
    actorId: input.authenticatedUserId,
    actorType: "INTERNAL",
    authenticationState: "AUTHENTICATED",
    organizationId: input.requestContext.organizationId,
    permissions: input.requestContext.permissions,
    requestId: input.requestContext.requestId,
    source: "INTERNAL",
    userId: input.authenticatedUserId,
  };
  return validateExecutionContext(context);
}
