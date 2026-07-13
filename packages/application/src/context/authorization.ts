import type { PermissionKey } from "@senvo/domain";
import type { ValidatedApplicationExecutionContext } from "./execution-context.js";

export type ApplicationAuthorizationService = {
  authorize(
    context: ValidatedApplicationExecutionContext,
    permission: PermissionKey,
  ): Promise<void>;
};

export async function requireAuthorization(
  authorizationService: ApplicationAuthorizationService | undefined,
  context: ValidatedApplicationExecutionContext,
  permission: PermissionKey,
): Promise<void> {
  if (!authorizationService) {
    return;
  }
  await authorizationService.authorize(context, permission);
}
