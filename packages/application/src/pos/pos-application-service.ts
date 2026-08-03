import {
  ApplicationError,
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  NotFoundError,
  ValidationApplicationError,
  addPosCartItem,
  changeSalesCounterStatus,
  closeSalesSession,
  createSalesCounter,
  listSalesCounters,
  listSalesSessions,
  lookupPosSale,
  openSalesSession,
  removePosCartItem,
  updatePosCartItem,
  type BarcodeRepository,
  type BranchRepository,
  type InventoryReadRepository,
  type OrganizationMembershipRepository,
  type PosCartLine,
  type PosRepository,
  type SalesCounter,
  type SalesSession,
  type SalesSourceRepository,
  type UserRepository,
} from "@senvo/domain";
import {
  addPosCartItemServiceInputSchema,
  closeSalesSessionServiceInputSchema,
  createSalesCounterServiceInputSchema,
  lookupPosSaleServiceInputSchema,
  openSalesSessionServiceInputSchema,
  posCartLineContractSchema,
  posEmptyInputSchema,
  posSaleLookupContractSchema,
  removePosCartItemServiceInputSchema,
  salesCounterContractSchema,
  salesSessionContractSchema,
  updatePosCartItemServiceInputSchema,
  updateSalesCounterStatusServiceInputSchema,
  type PosCartLineContract,
  type PosSaleLookupContract,
  type SalesCounterContract,
  type SalesSessionContract,
} from "@senvo/contracts";
import {
  requireAuthorization,
  type ApplicationAuthorizationService,
} from "../context/authorization.js";
import type { Clock } from "../context/clock.js";
import {
  validateExecutionContext,
  type ApplicationExecutionContext,
  type ValidatedApplicationExecutionContext,
} from "../context/execution-context.js";
import {
  ApplicationServiceError,
  ValidationApplicationServiceError,
  type ApplicationServiceResult,
} from "../errors/application-error.js";

type SafeParseSchema<T> = {
  safeParse(input: unknown):
    | { data: T; success: true }
    | {
        error: { issues: Array<{ message: string; path: PropertyKey[] }> };
        success: false;
      };
};

export type PosApplicationServiceDependencies = {
  authorizationService?: ApplicationAuthorizationService;
  barcodes: BarcodeRepository;
  branches: BranchRepository;
  clock: Clock;
  inventory: InventoryReadRepository;
  memberships: OrganizationMembershipRepository;
  pos: PosRepository;
  requestIdGenerator?: () => string;
  salesSources: SalesSourceRepository;
  users: UserRepository;
};

export class PosApplicationService {
  private readonly requestIdGenerator: () => string;
  constructor(
    private readonly dependencies: PosApplicationServiceDependencies,
  ) {
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => crypto.randomUUID());
  }

  listCounters(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesCounterContract[]>(context, async (trusted) => {
      parsePayload(posEmptyInputSchema, payload);
      await this.authorize(trusted, "READ");
      return (
        await listSalesCounters(this.dependencies.pos, trusted.organizationId)
      ).map(mapCounter);
    });
  }
  createCounter(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesCounterContract>(context, async (trusted) => {
      const input = parsePayload(createSalesCounterServiceInputSchema, payload);
      await this.authorize(trusted, "CREATE");
      return mapCounter(
        await createSalesCounter(
          {
            branches: this.dependencies.branches,
            pos: this.dependencies.pos,
            salesSources: this.dependencies.salesSources,
          },
          { ...input, organizationId: trusted.organizationId },
        ),
      );
    });
  }
  updateCounterStatus(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesCounterContract>(context, async (trusted) => {
      const input = parsePayload(
        updateSalesCounterStatusServiceInputSchema,
        payload,
      );
      await this.authorize(trusted, "UPDATE");
      return mapCounter(
        await changeSalesCounterStatus(this.dependencies.pos, {
          ...input,
          organizationId: trusted.organizationId,
        }),
      );
    });
  }
  listSessions(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesSessionContract[]>(context, async (trusted) => {
      parsePayload(posEmptyInputSchema, payload);
      await this.authorize(trusted, "READ");
      return (
        await listSalesSessions(this.dependencies.pos, trusted.organizationId)
      ).map(mapSession);
    });
  }
  openSession(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesSessionContract>(context, async (trusted) => {
      const input = parsePayload(openSalesSessionServiceInputSchema, payload);
      await this.authorize(trusted, "CREATE");
      if (!trusted.userId)
        throw new AuthorizationError(
          "A user is required to open a sales session.",
        );
      return mapSession(
        await openSalesSession(
          {
            memberships: this.dependencies.memberships,
            pos: this.dependencies.pos,
            users: this.dependencies.users,
          },
          {
            ...input,
            openedAt: this.dependencies.clock.now(),
            organizationId: trusted.organizationId,
            userId: trusted.userId,
          },
        ),
      );
    });
  }
  closeSession(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesSessionContract>(context, async (trusted) => {
      const input = parsePayload(closeSalesSessionServiceInputSchema, payload);
      await this.authorize(trusted, "UPDATE");
      return mapSession(
        await closeSalesSession(this.dependencies.pos, {
          ...input,
          closedAt: this.dependencies.clock.now(),
          organizationId: trusted.organizationId,
        }),
      );
    });
  }
  lookupSale(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosSaleLookupContract>(context, async (trusted) => {
      const input = parsePayload(lookupPosSaleServiceInputSchema, payload);
      await this.authorize(trusted, "READ");
      return posSaleLookupContractSchema.parse(
        await lookupPosSale(
          {
            barcodes: this.dependencies.barcodes,
            inventory: this.dependencies.inventory,
          },
          { ...input, organizationId: trusted.organizationId },
        ),
      );
    });
  }
  addCartItem(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCartLineContract>(context, async (trusted) => {
      const input = parsePayload(addPosCartItemServiceInputSchema, payload);
      await this.authorize(trusted, "CREATE");
      return mapLine(
        await addPosCartItem(
          {
            inventory: this.dependencies.inventory,
            pos: this.dependencies.pos,
          },
          {
            ...input,
            organizationId: trusted.organizationId,
          },
        ),
      );
    });
  }
  updateCartItem(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCartLineContract>(context, async (trusted) => {
      const input = parsePayload(updatePosCartItemServiceInputSchema, payload);
      await this.authorize(trusted, "UPDATE");
      return mapLine(
        await updatePosCartItem(this.dependencies.pos, {
          ...input,
          organizationId: trusted.organizationId,
        }),
      );
    });
  }
  removeCartItem(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<null>(context, async (trusted) => {
      const input = parsePayload(removePosCartItemServiceInputSchema, payload);
      await this.authorize(trusted, "UPDATE");
      await removePosCartItem(this.dependencies.pos, {
        ...input,
        organizationId: trusted.organizationId,
      });
      return null;
    });
  }

  private authorize(
    context: ValidatedApplicationExecutionContext,
    action: "CREATE" | "READ" | "UPDATE",
  ) {
    return requireAuthorization(
      this.dependencies.authorizationService,
      context,
      { action, resource: "POS" },
    );
  }
  private async execute<T>(
    rawContext: ApplicationExecutionContext,
    action: (context: ValidatedApplicationExecutionContext) => Promise<T>,
  ): Promise<ApplicationServiceResult<T>> {
    const context = {
      ...rawContext,
      requestId: rawContext.requestId || this.requestIdGenerator(),
    };
    try {
      return {
        data: await action(validateExecutionContext(context)),
        ok: true,
      };
    } catch (error) {
      return {
        error: normalizeError(error).toShape(context.requestId),
        ok: false,
      };
    }
  }
}

function mapCounter(record: SalesCounter): SalesCounterContract {
  return salesCounterContractSchema.parse({
    boothId: record.boothId,
    branchId: record.branchId,
    code: record.code,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    name: record.name,
    status: record.status,
    type: record.type,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  });
}
function mapSession(record: SalesSession): SalesSessionContract {
  return salesSessionContractSchema.parse({
    cartId: record.cartId,
    closedAt: record.closedAt?.toISOString() ?? null,
    counterId: record.counterId,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    openedAt: record.openedAt.toISOString(),
    openedByUserId: record.openedByUserId,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  });
}
function mapLine(record: PosCartLine): PosCartLineContract {
  return posCartLineContractSchema.parse({
    cartId: record.cartId,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    lineSubtotalMinor: record.lineSubtotalMinor,
    productVariantId: record.productVariantId,
    quantity: record.quantity,
    unitPriceMinor: record.unitPriceMinor,
    updatedAt: record.updatedAt.toISOString(),
  });
}
function parsePayload<T>(schema: SafeParseSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues.at(0);
  throw new ValidationApplicationServiceError(
    issue
      ? `${issue.path.join(".") || "payload"}: ${issue.message}`
      : "Input is invalid.",
  );
}
function normalizeError(error: unknown): ApplicationServiceError {
  if (error instanceof ApplicationServiceError) return error;
  if (error instanceof ValidationApplicationError)
    return new ApplicationServiceError({
      code: "VALIDATION_ERROR",
      message: "Input is invalid.",
    });
  if (error instanceof AuthorizationError)
    return new ApplicationServiceError({
      code: "FORBIDDEN",
      message: "You are not allowed to perform this action.",
    });
  if (error instanceof NotFoundError)
    return new ApplicationServiceError({
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    });
  if (error instanceof ConcurrencyError)
    return new ApplicationServiceError({
      code: "CONCURRENCY_CONFLICT",
      message: "The information changed. Please reload.",
      retryable: true,
    });
  if (error instanceof ConflictError)
    return new ApplicationServiceError({
      code: "CONFLICT",
      message: "The request conflicts with the current information.",
    });
  if (error instanceof BusinessRuleError)
    return new ApplicationServiceError({
      code: "BUSINESS_RULE_VIOLATION",
      message: "The request cannot be completed.",
    });
  return new ApplicationServiceError({
    code:
      error instanceof ApplicationError ? "INTERNAL_ERROR" : "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  });
}
