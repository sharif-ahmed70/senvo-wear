import {
  ApplicationError,
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  NotFoundError,
  ValidationApplicationError,
  postInventoryMovement,
  type InventoryMovementRepository,
} from "@senvo/domain";
import {
  inventoryMovementContractSchema,
  postInventoryMovementServiceInputSchema,
  type InventoryMovementContract,
  type PostInventoryMovementServiceInputContract,
} from "@senvo/contracts";
import type { Logger, LogMetadata } from "@senvo/logger";
import {
  requireAuthorization,
  type ApplicationAuthorizationService,
} from "../context/authorization.js";
import type { Clock } from "../context/clock.js";
import { systemClock } from "../context/clock.js";
import {
  validateExecutionContext,
  type ApplicationExecutionContext,
  type ValidatedApplicationExecutionContext,
} from "../context/execution-context.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import {
  ApplicationServiceError,
  ValidationApplicationServiceError,
  type ApplicationServiceErrorShape,
  type ApplicationServiceResult,
} from "../errors/application-error.js";
import { mapInventoryMovement } from "./mappers.js";

type RequestIdGenerator = () => string;

type SafeParseIssue = {
  message: string;
  path: PropertyKey[];
};

type SafeParseSchema<T> = {
  safeParse(
    input: unknown,
  ):
    | { data: T; success: true }
    | { error: { issues: SafeParseIssue[] }; success: false };
};

export type InventoryApplicationServiceDependencies = {
  authorizationService?: ApplicationAuthorizationService;
  clock?: Clock;
  inventoryMovementRepository: InventoryMovementRepository;
  logger?: Logger;
  requestIdGenerator?: RequestIdGenerator;
  transactionManager: ApplicationTransactionManager;
};

export class InventoryApplicationService {
  private readonly authorizationService?: ApplicationAuthorizationService;
  private readonly clock: Clock;
  private readonly inventoryMovementRepository: InventoryMovementRepository;
  private readonly logger: Logger;
  private readonly requestIdGenerator: RequestIdGenerator;
  private readonly transactionManager: ApplicationTransactionManager;

  constructor(dependencies: InventoryApplicationServiceDependencies) {
    this.authorizationService = dependencies.authorizationService;
    this.clock = dependencies.clock ?? systemClock;
    this.inventoryMovementRepository = dependencies.inventoryMovementRepository;
    this.logger = dependencies.logger ?? nullLogger;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? defaultRequestIdGenerator;
    this.transactionManager = dependencies.transactionManager;
  }

  postMovement(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<InventoryMovementContract>> {
    return this.execute(
      "inventory.postMovement",
      context,
      async (validated) => {
        const input = parsePayload(
          postInventoryMovementServiceInputSchema,
          payload,
        );
        return this.transactionManager.execute(
          validated,
          async (transactionContext) => {
            const applicationContext = transactionContext.applicationContext;
            await requireAuthorization(
              this.authorizationService,
              applicationContext,
              {
                action: "UPDATE",
                resource: "INVENTORY",
              },
            );
            const movement = await postInventoryMovement(
              transactionContext.inventoryMovementRepository,
              {
                ...input,
                organizationId: applicationContext.organizationId,
              },
            );
            await transactionContext.auditWriter.recordWithinTransaction({
              action: "INVENTORY_MOVEMENT_POSTED",
              actor: { userId: applicationContext.userId },
              metadata: { requestId: applicationContext.requestId },
              organizationId: applicationContext.organizationId,
              resource: "INVENTORY_MOVEMENT",
              resourceId: movement.id,
            });
            return inventoryMovementContractSchema.parse(
              mapInventoryMovement(movement),
            );
          },
        );
      },
    );
  }

  private async execute<T>(
    operation: string,
    rawContext: ApplicationExecutionContext,
    action: (context: ValidatedApplicationExecutionContext) => Promise<T>,
  ): Promise<ApplicationServiceResult<T>> {
    const contextWithRequestId = ensureRequestId(
      rawContext,
      this.requestIdGenerator,
    );
    const startedAt = this.clock.now();
    try {
      const context = validateExecutionContext(contextWithRequestId);
      const data = await action(context);
      this.logger.info(
        "Application service operation completed.",
        safeMetadata(operation, context, startedAt, this.clock.now(), {
          result: "success",
        }),
        { requestId: context.requestId },
      );
      return { data, ok: true };
    } catch (error) {
      const applicationError = normalizeError(error);
      this.logger.warn(
        "Application service operation rejected.",
        safeMetadata(
          operation,
          contextWithRequestId,
          startedAt,
          this.clock.now(),
          {
            errorCode: applicationError.code,
            result: "error",
          },
        ),
        { requestId: contextWithRequestId.requestId },
      );
      return {
        error: applicationError.toShape(contextWithRequestId.requestId),
        ok: false,
      };
    }
  }
}

function parsePayload<T>(schema: SafeParseSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }
  const issue = parsed.error.issues.at(0);
  const path = issue?.path.join(".") ?? "payload";
  throw new ValidationApplicationServiceError(
    issue ? `${path}: ${issue.message}` : "Input is invalid.",
  );
}

function normalizeError(error: unknown): ApplicationServiceError {
  if (error instanceof ApplicationServiceError) {
    return error;
  }
  if (error instanceof ValidationApplicationError) {
    return new ApplicationServiceError({
      code: "VALIDATION_ERROR",
      message: "Input is invalid.",
    });
  }
  if (error instanceof AuthorizationError) {
    return new ApplicationServiceError({
      code: "FORBIDDEN",
      message: "You are not allowed to perform this action.",
    });
  }
  if (error instanceof NotFoundError) {
    return new ApplicationServiceError({
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    });
  }
  if (error instanceof ConcurrencyError) {
    return new ApplicationServiceError({
      code: "CONCURRENCY_CONFLICT",
      message: "The resource changed. Please retry.",
      retryable: true,
    });
  }
  if (error instanceof ConflictError) {
    return new ApplicationServiceError({
      code: "CONFLICT",
      message: "The request conflicts with the current state.",
    });
  }
  if (error instanceof BusinessRuleError) {
    return new ApplicationServiceError({
      code: "BUSINESS_RULE_VIOLATION",
      message: "The request cannot be completed.",
    });
  }
  if (error instanceof ApplicationError) {
    return new ApplicationServiceError({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    });
  }
  return new ApplicationServiceError({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  });
}

function ensureRequestId(
  context: ApplicationExecutionContext,
  requestIdGenerator: RequestIdGenerator,
): ApplicationExecutionContext & { requestId: string } {
  return {
    ...context,
    requestId: context.requestId || requestIdGenerator(),
  };
}

function safeMetadata(
  operation: string,
  context: ApplicationExecutionContext | ValidatedApplicationExecutionContext,
  startedAt: Date,
  finishedAt: Date,
  extra: LogMetadata,
): LogMetadata {
  return {
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    operation,
    organizationId: context.organizationId,
    requestId: context.requestId,
    role: context.role ?? null,
    source: context.source ?? "INTERNAL",
    userId: context.userId ?? null,
    ...extra,
  };
}

function defaultRequestIdGenerator(): string {
  return `req_${crypto.randomUUID()}`;
}

const nullLogger: Logger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

export type {
  ApplicationServiceErrorShape,
  ApplicationServiceResult,
  PostInventoryMovementServiceInputContract,
};
