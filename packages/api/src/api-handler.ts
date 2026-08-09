import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  createApiFailure,
  createApiSuccess,
  type ApiResponse,
} from "@senvo/contracts";
import { mapApplicationFailure, mapThrownError } from "./error-mapping.js";
import {
  createApplicationContext,
  type ApiRequestContext,
} from "./request-context.js";

type SafeParseIssue = {
  message: string;
  path: PropertyKey[];
};

export type StrictInputSchema<TInput> = {
  safeParse(
    input: unknown,
  ):
    | { data: TInput; success: true }
    | { error: { issues: SafeParseIssue[] }; success: false };
};

export type ApiRequest = {
  context: ApiRequestContext;
  input: unknown;
};

export type ApiHandler<TOutput> = {
  handle(request: ApiRequest): Promise<ApiResponse<TOutput>>;
};

export type ProtectedApiHandlerOptions<TInput, TOutput> = {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
  execute(
    context: ApplicationContext,
    input: TInput,
  ): Promise<ApplicationServiceResult<TOutput>>;
  inputSchema: StrictInputSchema<TInput>;
  permission: Parameters<ApplicationAuthorizationService["authorize"]>[1];
};

export type PublicApiHandlerOptions<TInput, TOutput> = {
  execute(
    requestId: string,
    input: TInput,
  ): Promise<ApplicationServiceResult<TOutput>>;
  inputSchema: StrictInputSchema<TInput>;
};

export function createPublicApiHandler<TInput, TOutput>(
  options: PublicApiHandlerOptions<TInput, TOutput>,
): ApiHandler<TOutput> {
  return {
    async handle(request): Promise<ApiResponse<TOutput>> {
      const parsed = options.inputSchema.safeParse(request.input);
      if (!parsed.success) {
        return createApiFailure({
          code: "VALIDATION.INVALID_INPUT",
          fieldErrors: mapFieldErrors(parsed.error.issues),
          message: "Input is invalid.",
          requestId: request.context.requestId,
        });
      }
      try {
        const result = await options.execute(
          request.context.requestId,
          parsed.data,
        );
        return result.ok
          ? createApiSuccess(result.data, request.context.requestId)
          : mapApplicationFailure(result.error, request.context.requestId);
      } catch (error) {
        return mapThrownError(error, request.context.requestId);
      }
    },
  };
}

export function createProtectedApiHandler<TInput, TOutput>(
  options: ProtectedApiHandlerOptions<TInput, TOutput>,
): ApiHandler<TOutput> {
  return {
    async handle(request): Promise<ApiResponse<TOutput>> {
      const parsed = options.inputSchema.safeParse(request.input);
      if (!parsed.success) {
        return createApiFailure({
          code: "VALIDATION.INVALID_INPUT",
          fieldErrors: mapFieldErrors(parsed.error.issues),
          message: "Input is invalid.",
          requestId: request.context.requestId,
        });
      }

      try {
        const principal = await options.authenticationService.authenticate({
          requestId: request.context.requestId,
          userId: request.context.authenticatedUser?.userId ?? null,
        });
        const applicationContext = createApplicationContext({
          authenticatedUserId: principal.authenticatedUserId,
          requestContext: request.context,
        });
        await options.authorizationService.authorize(
          applicationContext,
          options.permission,
        );
        const result = await options.execute(applicationContext, parsed.data);
        if (!result.ok) {
          return mapApplicationFailure(result.error, request.context.requestId);
        }
        return createApiSuccess(result.data, request.context.requestId);
      } catch (error) {
        return mapThrownError(error, request.context.requestId);
      }
    },
  };
}

function mapFieldErrors(
  issues: readonly SafeParseIssue[],
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "input";
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  return fieldErrors;
}
