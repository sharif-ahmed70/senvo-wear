import {
  ApplicationError,
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
  amendDraftSalesOrder,
  cancelSalesOrder,
  confirmSalesOrder,
  changeSalesBoothStatus,
  createSalesBooth,
  createSalesOrder,
  fulfillSalesOrder,
  getSalesOrderDetails,
  getSalesOrderById,
  getSalesSourceSummary,
  listSalesBooths,
  listSalesOrders,
  listSalesOrderReadModel,
  replaceDraftSalesOrderLines,
  reserveSalesOrder,
  updateDraftSalesOrderMetadata,
  validateOrderSalesSource,
  type SalesOrderRepository,
  type SalesOrderReadRepository,
  type SalesBooth,
  type SalesSourceRepository,
} from "@senvo/domain";
import {
  amendDraftSalesOrderServiceInputSchema,
  cancelSalesOrderServiceInputSchema,
  confirmSalesOrderServiceInputSchema,
  createSalesBoothServiceInputSchema,
  createSalesOrderServiceInputSchema,
  fulfillSalesOrderServiceInputSchema,
  getSalesOrderServiceInputSchema,
  listSalesOrdersServiceInputSchema,
  replaceDraftSalesOrderLinesServiceInputSchema,
  reserveSalesOrderServiceInputSchema,
  salesOrderServiceContractSchema,
  salesOrderServicePageContractSchema,
  salesOrderDetailsReadContractSchema,
  salesOrderListReadPageContractSchema,
  salesOrderManagementActionInputSchema,
  salesOrderManagementDetailsInputSchema,
  salesOrderManagementListInputSchema,
  salesBoothContractSchema,
  salesSourceEmptyInputSchema,
  salesSourceSummaryContractSchema,
  updateSalesBoothStatusServiceInputSchema,
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
  type SalesOrderDetailsReadContract,
  type SalesOrderListReadPageContract,
  type SalesBoothContract,
  type SalesSourceSummaryContract,
  type UpdateDraftSalesOrderMetadataServiceInputContract,
} from "@senvo/contracts";
import type { Logger, LogMetadata } from "@senvo/logger";
import type { Clock } from "../context/clock.js";
import {
  requireAuthentication,
  type ApplicationAuthenticationService,
} from "../context/authentication.js";
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
import type { ApplicationTransactionManager } from "../context/transaction.js";
import {
  ApplicationServiceError,
  ValidationApplicationServiceError,
  type ApplicationServiceErrorShape,
  type ApplicationServiceResult,
} from "../errors/application-error.js";
import { mapSalesOrder, mapSalesOrderPage } from "./mappers.js";
import {
  mapSalesOrderDetailsRead,
  mapSalesOrderReadPage,
} from "./read-mappers.js";

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
  authenticationService?: ApplicationAuthenticationService;
  authorizationService?: ApplicationAuthorizationService;
  clock?: Clock;
  logger?: Logger;
  requestIdGenerator?: RequestIdGenerator;
  salesOrderRepository: SalesOrderRepository;
  salesOrderReadRepository?: SalesOrderReadRepository;
  salesSourceRepository?: SalesSourceRepository;
  transactionManager: ApplicationTransactionManager;
};

export class SalesApplicationService {
  private readonly authenticationService?: ApplicationAuthenticationService;
  private readonly clock: Clock;
  private readonly authorizationService?: ApplicationAuthorizationService;
  private readonly logger: Logger;
  private readonly requestIdGenerator: RequestIdGenerator;
  private readonly salesOrderRepository: SalesOrderRepository;
  private readonly salesOrderReadRepository?: SalesOrderReadRepository;
  private readonly salesSourceRepository?: SalesSourceRepository;
  private readonly transactionManager: ApplicationTransactionManager;

  constructor(dependencies: SalesApplicationServiceDependencies) {
    this.authenticationService = dependencies.authenticationService;
    this.authorizationService = dependencies.authorizationService;
    this.clock = dependencies.clock ?? systemClock;
    this.logger = dependencies.logger ?? nullLogger;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? defaultRequestIdGenerator;
    this.salesOrderRepository = dependencies.salesOrderRepository;
    this.salesOrderReadRepository = dependencies.salesOrderReadRepository;
    this.salesSourceRepository = dependencies.salesSourceRepository;
    this.transactionManager = dependencies.transactionManager;
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
        await requireAuthentication(this.authenticationService, {
          requestId: validatedContext.requestId,
          userId: validatedContext.userId,
        });
        const boothId =
          input.channel === "EVENT_BOOTH"
            ? await validateOrderSalesSource(this.requireSourceRepository(), {
                boothId: input.boothId,
                organizationId: validatedContext.organizationId,
                salesChannel: input.channel,
              })
            : null;
        return this.transactionManager.execute(
          validatedContext,
          async (transactionContext) => {
            const applicationContext = transactionContext.applicationContext;
            await requireAuthorization(
              this.authorizationService,
              applicationContext,
              {
                action: "CREATE",
                resource: "SALES",
              },
            );
            const order = await createSalesOrder(
              transactionContext.salesOrderRepository,
              {
                ...input,
                boothId,
                organizationId: applicationContext.organizationId,
              },
            );
            await transactionContext.auditWriter.recordWithinTransaction({
              action: "SALES_ORDER_CREATED",
              actor: { userId: applicationContext.userId },
              metadata: { requestId: applicationContext.requestId },
              organizationId: applicationContext.organizationId,
              resource: "SALES_ORDER",
              resourceId: order.id,
            });
            return salesOrderServiceContractSchema.parse(mapSalesOrder(order));
          },
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

  listManagedOrders(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderListReadPageContract>> {
    return this.execute(
      "sales.listManagedOrders",
      context,
      async (validated) => {
        const input = parsePayload(
          salesOrderManagementListInputSchema,
          payload,
        );
        await this.authorizeManagedOperation(validated, "READ");
        const page = await listSalesOrderReadModel(
          this.requireReadRepository(),
          {
            ...input,
            organizationId: validated.organizationId,
          },
        );
        return salesOrderListReadPageContractSchema.parse(
          mapSalesOrderReadPage(page),
        );
      },
    );
  }

  listSalesBooths(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesBoothContract[]>> {
    return this.execute("sales.listBooths", context, async (validated) => {
      parsePayload(salesSourceEmptyInputSchema, payload);
      await this.authorizeSalesSource(validated, "READ");
      const booths = await listSalesBooths(
        this.requireSourceRepository(),
        validated.organizationId,
      );
      return booths.map((booth) =>
        salesBoothContractSchema.parse(mapSalesBooth(booth)),
      );
    });
  }

  createSalesBooth(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesBoothContract>> {
    return this.execute("sales.createBooth", context, async (validated) => {
      const input = parsePayload(createSalesBoothServiceInputSchema, payload);
      await this.authorizeSalesSource(validated, "CREATE");
      if (!validated.userId) {
        throw new AuthenticationError("Authenticated user is required.");
      }
      const booth = await createSalesBooth(this.requireSourceRepository(), {
        ...input,
        organizationId: validated.organizationId,
        responsibleStaffId: validated.userId,
      });
      return salesBoothContractSchema.parse(mapSalesBooth(booth));
    });
  }

  updateSalesBoothStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesBoothContract>> {
    return this.execute(
      "sales.updateBoothStatus",
      context,
      async (validated) => {
        const input = parsePayload(
          updateSalesBoothStatusServiceInputSchema,
          payload,
        );
        await this.authorizeSalesSource(validated, "UPDATE");
        const booth = await changeSalesBoothStatus(
          this.requireSourceRepository(),
          { ...input, organizationId: validated.organizationId },
        );
        return salesBoothContractSchema.parse(mapSalesBooth(booth));
      },
    );
  }

  getSalesSourceSummary(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesSourceSummaryContract>> {
    return this.execute(
      "sales.getSourceSummary",
      context,
      async (validated) => {
        parsePayload(salesSourceEmptyInputSchema, payload);
        await this.authorizeSalesSource(validated, "READ");
        const summary = await getSalesSourceSummary(
          this.requireSourceRepository(),
          validated.organizationId,
        );
        return salesSourceSummaryContractSchema.parse({
          ...summary,
          booths: summary.booths.map((item) => ({
            ...item,
            booth: mapSalesBooth(item.booth),
          })),
        });
      },
    );
  }

  getManagedOrderDetails(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderDetailsReadContract>> {
    return this.execute(
      "sales.getManagedOrderDetails",
      context,
      async (validated) => {
        const input = parsePayload(
          salesOrderManagementDetailsInputSchema,
          payload,
        );
        await this.authorizeManagedOperation(validated, "READ");
        const order = await getSalesOrderDetails(this.requireReadRepository(), {
          organizationId: validated.organizationId,
          salesOrderId: input.salesOrderId,
        });
        return salesOrderDetailsReadContractSchema.parse(
          mapSalesOrderDetailsRead(order),
        );
      },
    );
  }

  reserveManagedOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.executeManagedAction(
      "reserve",
      context,
      payload,
      (input, org) =>
        reserveSalesOrder(this.salesOrderRepository, {
          expectedVersion: input.expectedVersion,
          organizationId: org,
          reservationIdempotencyKey: managedKey(
            input.salesOrderId,
            "reserve",
            input.expectedVersion,
          ),
          reservationNumber: `RSV-${input.salesOrderId}-${input.expectedVersion}`,
          salesOrderId: input.salesOrderId,
        }),
    );
  }

  confirmManagedOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.executeManagedAction(
      "confirm",
      context,
      payload,
      (input, org) =>
        confirmSalesOrder(this.salesOrderRepository, {
          ...input,
          organizationId: org,
        }),
    );
  }

  cancelManagedOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.executeManagedAction("cancel", context, payload, (input, org) =>
      cancelSalesOrder(this.salesOrderRepository, {
        ...input,
        organizationId: org,
      }),
    );
  }

  fulfillManagedOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.executeManagedAction(
      "fulfill",
      context,
      payload,
      (input, org) =>
        fulfillSalesOrder(this.salesOrderRepository, {
          consumptionIdempotencyKey: managedKey(
            input.salesOrderId,
            "fulfill",
            input.expectedVersion,
          ),
          expectedVersion: input.expectedVersion,
          movementNumber: `FUL-${input.salesOrderId}-${input.expectedVersion}`,
          occurredAt: this.clock.now(),
          organizationId: org,
          salesOrderId: input.salesOrderId,
        }),
    );
  }

  private executeManagedAction(
    action: string,
    context: ApplicationExecutionContext,
    payload: unknown,
    operation: (
      input: { expectedVersion: number; salesOrderId: string },
      organizationId: string,
    ) => Promise<Parameters<typeof mapSalesOrder>[0]>,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>> {
    return this.execute(
      `sales.${action}ManagedOrder`,
      context,
      async (validated) => {
        const input = parsePayload(
          salesOrderManagementActionInputSchema,
          payload,
        );
        await this.authorizeManagedOperation(validated, "UPDATE");
        const order = await operation(input, validated.organizationId);
        return salesOrderServiceContractSchema.parse(mapSalesOrder(order));
      },
    );
  }

  private async authorizeManagedOperation(
    context: ValidatedApplicationExecutionContext,
    action: "READ" | "UPDATE",
  ): Promise<void> {
    await requireAuthentication(this.authenticationService, {
      requestId: context.requestId,
      userId: context.userId,
    });
    await requireAuthorization(this.authorizationService, context, {
      action,
      resource: "SALES_ORDER",
    });
  }

  private async authorizeSalesSource(
    context: ValidatedApplicationExecutionContext,
    action: "CREATE" | "READ" | "UPDATE",
  ): Promise<void> {
    await requireAuthentication(this.authenticationService, {
      requestId: context.requestId,
      userId: context.userId,
    });
    await requireAuthorization(this.authorizationService, context, {
      action,
      resource: "SALES",
    });
  }

  private requireSourceRepository(): SalesSourceRepository {
    if (!this.salesSourceRepository) {
      throw new Error("Sales source repository is required.");
    }
    return this.salesSourceRepository;
  }

  private requireReadRepository(): SalesOrderReadRepository {
    if (!this.salesOrderReadRepository) {
      throw new Error("Sales order read repository is required.");
    }
    return this.salesOrderReadRepository;
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

function managedKey(
  salesOrderId: string,
  action: "fulfill" | "reserve",
  version: number,
): string {
  return `sales:${salesOrderId}:${action}:${version}`;
}

function mapSalesBooth(booth: SalesBooth): SalesBoothContract {
  return {
    createdAt: booth.createdAt.toISOString(),
    endDate: booth.endDate.toISOString().slice(0, 10),
    id: booth.id,
    location: booth.location,
    name: booth.name,
    responsibleStaffName: booth.responsibleStaffName,
    startDate: booth.startDate.toISOString().slice(0, 10),
    status: booth.status,
    updatedAt: booth.updatedAt.toISOString(),
    version: booth.version,
  };
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
  if (error instanceof AuthenticationError) {
    return new ApplicationServiceError({
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
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
