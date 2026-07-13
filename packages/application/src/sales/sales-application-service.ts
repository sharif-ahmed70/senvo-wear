import {
  ApplicationError,
  AuthorizationError,
  BusinessRuleError,
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
  amendDraftSalesOrder,
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  fulfillSalesOrder,
  getSalesOrderById,
  listSalesOrders,
  replaceDraftSalesOrderLines,
  reserveSalesOrder,
  updateDraftSalesOrderMetadata,
  type SalesOrderRepository,
} from "@senvo/domain";
import {
  amendDraftSalesOrderServiceInputSchema,
  cancelSalesOrderServiceInputSchema,
  confirmSalesOrderServiceInputSchema,
  createSalesOrderServiceInputSchema,
  fulfillSalesOrderServiceInputSchema,
  getSalesOrderServiceInputSchema,
  listSalesOrdersServiceInputSchema,
  replaceDraftSalesOrderLinesServiceInputSchema,
  reserveSalesOrderServiceInputSchema,
  salesOrderServiceContractSchema,
  salesOrderServicePageContractSchema,
  updateDraftSalesOrderMetadataServiceInputSchema,
  type AmendDraftSalesOrderServiceInputContract,
  type CancelSalesOrderServiceInputContract,
  type ConfirmSalesOrderServiceInputContract,
  type CreateSalesOrderServiceInputContract,
  type FulfillSalesOrderServiceInputContract,
  type GetSalesOrderServiceInputContract,
  type ListSalesOrdersServiceInputContract,
  type ReplaceDraftSalesOrderLinesServiceInputContract,
  type ReserveSalesOrderServiceInputContract,
  type SalesOrderServiceContract,
  type SalesOrderServicePageContract,
  type UpdateDraftSalesOrderMetadataServiceInputContract,
} from "@senvo/contracts";
import type { Logger, LogMetadata } from "@senvo/logger";
import type { Clock } from "../context/clock.js";
import {
  requireAuthorization,
  type ApplicationAuthorizationService,
} from "../context/authorization.js";
import { systemClock } from "../context/clock.js";
import {
  validateExecutionContext,
  type ApplicationExecutionContext,
  type ValidatedApplicationExecutionContext,
} from "../context/execution-context.js";
import {
  ApplicationServiceError,
  ValidationApplicationServiceError,
  type ApplicationServiceErrorShape,
  type ApplicationServiceResult,
} from "../errors/application-error.js";
import { mapSalesOrder, mapSalesOrderPage } from "./mappers.js";

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

export type SalesApplicationServiceDependencies = {
  authorizationService?: ApplicationAuthorizationService;
  clock?: Clock;
  logger?: Logger;
  requestIdGenerator?: RequestIdGenerator;
  salesOrderRepository: SalesOrderRepository;
};

export class SalesApplicationService {
  private readonly clock: Clock;
  private readonly authorizationService?: ApplicationAuthorizationService;
  private readonly logger: Logger;
  private readonly requestIdGenerator: RequestIdGenerator;
  private readonly salesOrderRepository: SalesOrderRepository;

  constructor(dependencies: SalesApplicationServiceDependencies) {
    this.authorizationService = dependencies.authorizationService;
    this.clock = dependencies.clock ?? systemClock;
    this.logger = dependencies.logger ?? nullLogger;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? defaultRequestIdGenerator;
    this.salesOrderRepository = dependencies.salesOrderRepository;
  }

  createOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.execute(
      "sales.createOrder",
      context,
      async (validatedContext) => {
        const input = parsePayload(createSalesOrderServiceInputSchema, payload);
        await requireAuthorization(
          this.authorizationService,
          validatedContext,
          {
            action: "CREATE",
            resource: "SALES_ORDER",
          },
        );
        return createSalesOrder(this.salesOrderRepository, {
          ...input,
          organizationId: validatedContext.organizationId,
        }).then((order) =>
          salesOrderServiceContractSchema.parse(mapSalesOrder(order)),
        );
      },
    );
  }

  amendDraftOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.execute(
      "sales.amendDraftOrder",
      context,
      (validatedContext) => {
        const input = parsePayload(
          amendDraftSalesOrderServiceInputSchema,
          payload,
        );
        return amendDraftSalesOrder(this.salesOrderRepository, {
          ...input,
          organizationId: validatedContext.organizationId,
        }).then((order) =>
          salesOrderServiceContractSchema.parse(mapSalesOrder(order)),
        );
      },
    );
  }

  updateDraftOrderMetadata(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.execute(
      "sales.updateDraftOrderMetadata",
      context,
      (validatedContext) => {
        const input = parsePayload(
          updateDraftSalesOrderMetadataServiceInputSchema,
          payload,
        );
        return updateDraftSalesOrderMetadata(this.salesOrderRepository, {
          ...input,
          organizationId: validatedContext.organizationId,
        }).then((order) =>
          salesOrderServiceContractSchema.parse(mapSalesOrder(order)),
        );
      },
    );
  }

  replaceDraftOrderLines(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.execute(
      "sales.replaceDraftOrderLines",
      context,
      (validatedContext) => {
        const input = parsePayload(
          replaceDraftSalesOrderLinesServiceInputSchema,
          payload,
        );
        return replaceDraftSalesOrderLines(this.salesOrderRepository, {
          ...input,
          organizationId: validatedContext.organizationId,
        }).then((order) =>
          salesOrderServiceContractSchema.parse(mapSalesOrder(order)),
        );
      },
    );
  }

  reserveOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.execute("sales.reserveOrder", context, (validatedContext) => {
      const input = parsePayload(reserveSalesOrderServiceInputSchema, payload);
      return reserveSalesOrder(this.salesOrderRepository, {
        ...input,
        organizationId: validatedContext.organizationId,
      }).then((order) =>
        salesOrderServiceContractSchema.parse(mapSalesOrder(order)),
      );
    });
  }

  confirmOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.execute("sales.confirmOrder", context, (validatedContext) => {
      const input = parsePayload(confirmSalesOrderServiceInputSchema, payload);
      return confirmSalesOrder(this.salesOrderRepository, {
        ...input,
        organizationId: validatedContext.organizationId,
      }).then((order) =>
        salesOrderServiceContractSchema.parse(mapSalesOrder(order)),
      );
    });
  }

  cancelOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.execute("sales.cancelOrder", context, (validatedContext) => {
      const input = parsePayload(cancelSalesOrderServiceInputSchema, payload);
      return cancelSalesOrder(this.salesOrderRepository, {
        ...input,
        organizationId: validatedContext.organizationId,
      }).then((order) =>
        salesOrderServiceContractSchema.parse(mapSalesOrder(order)),
      );
    });
  }

  fulfillOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.execute("sales.fulfillOrder", context, (validatedContext) => {
      const input = parsePayload(fulfillSalesOrderServiceInputSchema, payload);
      return fulfillSalesOrder(this.salesOrderRepository, {
        ...input,
        organizationId: validatedContext.organizationId,
      }).then((order) =>
        salesOrderServiceContractSchema.parse(mapSalesOrder(order)),
      );
    });
  }

  getOrderById(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.execute("sales.getOrderById", context, (validatedContext) => {
      const input = parsePayload(getSalesOrderServiceInputSchema, payload);
      return getSalesOrderById(this.salesOrderRepository, {
        ...input,
        organizationId: validatedContext.organizationId,
      }).then((order) =>
        salesOrderServiceContractSchema.parse(mapSalesOrder(order)),
      );
    });
  }

  listOrders(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServicePageContract>> {
    return this.execute("sales.listOrders", context, (validatedContext) => {
      const input = parsePayload(listSalesOrdersServiceInputSchema, payload);
      return listSalesOrders(this.salesOrderRepository, {
        ...input,
        organizationId: validatedContext.organizationId,
      }).then((page) =>
        salesOrderServicePageContractSchema.parse(mapSalesOrderPage(page)),
      );
    });
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
    let context: ValidatedApplicationExecutionContext;
    try {
      context = validateExecutionContext(contextWithRequestId);
      const data = await action(context);
      this.logSuccess(operation, context, startedAt);
      return { data, ok: true };
    } catch (error) {
      const requestId = contextWithRequestId.requestId;
      const applicationError = normalizeError(error);
      this.logFailure(
        operation,
        contextWithRequestId,
        startedAt,
        applicationError,
        error,
      );
      return { error: applicationError.toShape(requestId), ok: false };
    }
  }

  private logSuccess(
    operation: string,
    context: ValidatedApplicationExecutionContext,
    startedAt: Date,
  ): void {
    this.logger.info(
      "Application service operation completed.",
      safeMetadata(operation, context, startedAt, this.clock.now(), {
        result: "success",
      }),
      { requestId: context.requestId },
    );
  }

  private logFailure(
    operation: string,
    context: ApplicationExecutionContext,
    startedAt: Date,
    applicationError: ApplicationServiceError,
    originalError: unknown,
  ): void {
    const metadata = safeMetadata(
      operation,
      context,
      startedAt,
      this.clock.now(),
      {
        errorCode: applicationError.code,
        result: "error",
      },
    );
    if (applicationError.code === "INTERNAL_ERROR") {
      this.logger.error(
        "Application service operation failed.",
        {
          ...metadata,
          errorName: getErrorName(originalError),
        },
        { requestId: context.requestId },
      );
      return;
    }
    this.logger.warn("Application service operation rejected.", metadata, {
      requestId: context.requestId,
    });
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
      code: isIdempotencyConflict(error) ? "IDEMPOTENCY_CONFLICT" : "CONFLICT",
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

function isIdempotencyConflict(error: ConflictError): boolean {
  return error.message.toLowerCase().includes("idempotency");
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
    actorType: context.actorType ?? "ANONYMOUS",
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

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
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
  AmendDraftSalesOrderServiceInputContract,
  CancelSalesOrderServiceInputContract,
  ConfirmSalesOrderServiceInputContract,
  CreateSalesOrderServiceInputContract,
  FulfillSalesOrderServiceInputContract,
  GetSalesOrderServiceInputContract,
  ListSalesOrdersServiceInputContract,
  ReplaceDraftSalesOrderLinesServiceInputContract,
  ReserveSalesOrderServiceInputContract,
  UpdateDraftSalesOrderMetadataServiceInputContract,
  ApplicationServiceErrorShape,
  ApplicationServiceResult,
};
