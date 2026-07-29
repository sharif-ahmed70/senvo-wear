import type { ApplicationAuthenticationService } from "@senvo/application";
import { AuthenticationError } from "@senvo/domain";

export type DevelopmentRuntimeEnvironment = "development" | "test";

export class DevelopmentAuthenticationService implements ApplicationAuthenticationService {
  constructor(environment: DevelopmentRuntimeEnvironment) {
    assertDevelopmentEnvironment(environment);
  }

  authenticate(request: { requestId: string; userId: string | null }) {
    if (!request.userId) {
      return Promise.reject(new AuthenticationError());
    }
    return Promise.resolve({
      authenticatedUserId: request.userId,
      provider: "PASSWORD" as const,
      requestId: request.requestId,
    });
  }
}

export function assertDevelopmentEnvironment(
  environment: string,
): asserts environment is DevelopmentRuntimeEnvironment {
  if (environment !== "development" && environment !== "test") {
    throw new Error(
      "Development HTTP authentication is unavailable in production.",
    );
  }
}
