import type { AuthenticatedPrincipal } from "@senvo/domain";

export type ApplicationAuthenticationRequest = {
  requestId: string;
  userId: string | null;
};

export type ApplicationAuthenticationService = {
  authenticate(
    request: ApplicationAuthenticationRequest,
  ): Promise<AuthenticatedPrincipal>;
};

export async function requireAuthentication(
  authenticationService: ApplicationAuthenticationService | undefined,
  request: ApplicationAuthenticationRequest,
): Promise<AuthenticatedPrincipal | null> {
  if (!authenticationService) {
    return null;
  }
  return authenticationService.authenticate(request);
}
