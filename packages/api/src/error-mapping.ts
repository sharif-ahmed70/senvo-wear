import {
  ApplicationServiceError,
  type ApplicationServiceErrorCode,
  type ApplicationServiceErrorShape,
} from "@senvo/application";
import {
  createApiFailure,
  type ApiErrorCode,
  type ApiFailure,
} from "@senvo/contracts";
import { ApplicationError, type ApplicationErrorCategory } from "@senvo/domain";

const applicationErrorCodes: Record<ApplicationServiceErrorCode, ApiErrorCode> =
  {
    BUSINESS_RULE_VIOLATION: "BUSINESS_RULE.VIOLATION",
    CONCURRENCY_CONFLICT: "CONCURRENCY.VERSION_MISMATCH",
    CONFLICT: "CONFLICT.STATE",
    FORBIDDEN: "AUTHORIZATION.FORBIDDEN",
    IDEMPOTENCY_CONFLICT: "CONFLICT.IDEMPOTENCY",
    INTERNAL_ERROR: "INTERNAL.UNEXPECTED",
    NOT_FOUND: "NOT_FOUND.RESOURCE",
    UNAUTHORIZED: "AUTHENTICATION.REQUIRED",
    VALIDATION_ERROR: "VALIDATION.INVALID_INPUT",
  };

export function mapApplicationFailure(
  error: ApplicationServiceErrorShape,
  requestId: string,
): ApiFailure {
  return createApiFailure({
    code: applicationErrorCodes[error.code],
    message: error.message,
    requestId,
  });
}

export function mapThrownError(error: unknown, requestId: string): ApiFailure {
  if (error instanceof ApplicationError) {
    return createApiFailure({
      code: mapDomainCategory(error.category),
      message: error.publicMessage,
      requestId,
    });
  }
  if (error instanceof ApplicationServiceError) {
    return createApiFailure({
      code: applicationErrorCodes[error.code],
      message: error.message,
      requestId,
    });
  }
  return createApiFailure({
    code: "INTERNAL.UNEXPECTED",
    message: "An unexpected error occurred.",
    requestId,
  });
}

function mapDomainCategory(category: ApplicationErrorCategory): ApiErrorCode {
  switch (category) {
    case "VALIDATION":
      return "VALIDATION.INVALID_INPUT";
    case "AUTHENTICATION":
      return "AUTHENTICATION.REQUIRED";
    case "AUTHORIZATION":
      return "AUTHORIZATION.FORBIDDEN";
    case "NOT_FOUND":
      return "NOT_FOUND.RESOURCE";
    case "CONFLICT":
      return "CONFLICT.STATE";
    case "BUSINESS_RULE":
      return "BUSINESS_RULE.VIOLATION";
    case "CONCURRENCY":
      return "CONCURRENCY.VERSION_MISMATCH";
    default:
      return "INTERNAL.UNEXPECTED";
  }
}
