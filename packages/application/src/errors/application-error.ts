export type ApplicationServiceErrorCode =
  | "BUSINESS_RULE_VIOLATION"
  | "CONCURRENCY_CONFLICT"
  | "CONFLICT"
  | "FORBIDDEN"
  | "IDEMPOTENCY_CONFLICT"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR";

export type ApplicationServiceErrorShape = {
  code: ApplicationServiceErrorCode;
  details?: Record<string, string | number | boolean | null>;
  message: string;
  requestId: string;
  retryable: boolean;
};

export class ApplicationServiceError extends Error {
  readonly code: ApplicationServiceErrorCode;
  readonly details?: Record<string, string | number | boolean | null>;
  readonly retryable: boolean;

  constructor(input: {
    code: ApplicationServiceErrorCode;
    details?: Record<string, string | number | boolean | null>;
    message: string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "ApplicationServiceError";
    this.code = input.code;
    this.details = input.details;
    this.retryable = input.retryable ?? false;
  }

  toShape(requestId: string): ApplicationServiceErrorShape {
    return {
      code: this.code,
      details: this.details,
      message: this.message,
      requestId,
      retryable: this.retryable,
    };
  }
}

export class ValidationApplicationServiceError extends ApplicationServiceError {
  constructor(message = "Input is invalid.") {
    super({ code: "VALIDATION_ERROR", message });
  }
}

export type ApplicationServiceResult<T> =
  { data: T; ok: true } | { error: ApplicationServiceErrorShape; ok: false };
