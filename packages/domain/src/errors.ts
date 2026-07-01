export type ApplicationErrorCategory =
  | "VALIDATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BUSINESS_RULE"
  | "CONCURRENCY"
  | "RATE_LIMIT"
  | "INTEGRATION"
  | "INTERNAL";

export type PublicApplicationError = {
  category: ApplicationErrorCategory;
  code: `${ApplicationErrorCategory}.${string}`;
  message: string;
};

export class ApplicationError extends Error {
  readonly category: ApplicationErrorCategory;
  readonly code: `${ApplicationErrorCategory}.${string}`;
  readonly publicMessage: string;

  constructor(input: {
    category: ApplicationErrorCategory;
    code: `${ApplicationErrorCategory}.${string}`;
    cause?: unknown;
    message: string;
    publicMessage?: string;
  }) {
    super(input.message, { cause: input.cause });
    this.category = input.category;
    this.code = input.code;
    this.name = "ApplicationError";
    this.publicMessage =
      input.publicMessage ?? "The request could not be completed.";
  }

  toPublicError(): PublicApplicationError {
    return {
      category: this.category,
      code: this.code,
      message: this.publicMessage,
    };
  }
}

export class ValidationApplicationError extends ApplicationError {
  constructor(message = "Input is invalid.", cause?: unknown) {
    super({
      category: "VALIDATION",
      cause,
      code: "VALIDATION.INVALID_INPUT",
      message,
      publicMessage: "Input is invalid.",
    });
  }
}

export class AuthenticationError extends ApplicationError {
  constructor(message = "Authentication is required.", cause?: unknown) {
    super({
      category: "AUTHENTICATION",
      cause,
      code: "AUTHENTICATION.REQUIRED",
      message,
      publicMessage: "Authentication is required.",
    });
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(
    message = "You are not allowed to perform this action.",
    cause?: unknown,
  ) {
    super({
      category: "AUTHORIZATION",
      cause,
      code: "AUTHORIZATION.FORBIDDEN",
      message,
      publicMessage: "You are not allowed to perform this action.",
    });
  }
}

export class NotFoundError extends ApplicationError {
  constructor(
    message = "The requested resource was not found.",
    cause?: unknown,
  ) {
    super({
      category: "NOT_FOUND",
      cause,
      code: "NOT_FOUND.RESOURCE",
      message,
      publicMessage: "The requested resource was not found.",
    });
  }
}

export class ConflictError extends ApplicationError {
  constructor(
    message = "The request conflicts with the current state.",
    cause?: unknown,
  ) {
    super({
      category: "CONFLICT",
      cause,
      code: "CONFLICT.STATE",
      message,
      publicMessage: "The request conflicts with the current state.",
    });
  }
}

export class BusinessRuleError extends ApplicationError {
  constructor(
    message = "A business rule prevented this action.",
    cause?: unknown,
  ) {
    super({
      category: "BUSINESS_RULE",
      cause,
      code: "BUSINESS_RULE.VIOLATION",
      message,
      publicMessage: "The request cannot be completed.",
    });
  }
}

export class ConcurrencyError extends ApplicationError {
  constructor(
    message = "The resource was changed by another process.",
    cause?: unknown,
  ) {
    super({
      category: "CONCURRENCY",
      cause,
      code: "CONCURRENCY.VERSION_MISMATCH",
      message,
      publicMessage: "The resource changed. Please retry.",
    });
  }
}

export class RateLimitError extends ApplicationError {
  constructor(message = "Too many requests.", cause?: unknown) {
    super({
      category: "RATE_LIMIT",
      cause,
      code: "RATE_LIMIT.TOO_MANY_REQUESTS",
      message,
      publicMessage: "Too many requests. Please try again later.",
    });
  }
}

export class IntegrationError extends ApplicationError {
  constructor(message = "External integration failed.", cause?: unknown) {
    super({
      category: "INTEGRATION",
      cause,
      code: "INTEGRATION.UNAVAILABLE",
      message,
      publicMessage: "A required external service is unavailable.",
    });
  }
}

export class InternalApplicationError extends ApplicationError {
  constructor(message = "Internal application error.", cause?: unknown) {
    super({
      category: "INTERNAL",
      cause,
      code: "INTERNAL.UNEXPECTED",
      message,
      publicMessage: "An unexpected error occurred.",
    });
  }
}
