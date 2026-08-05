import {
  ApplicationError,
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  NotFoundError,
  ValidationApplicationError,
  addPosCartItem,
  checkoutCart as completePosCheckout,
  changeSalesCounterStatus,
  closeSalesSession,
  createSalesCounter,
  listSalesCounters,
  listSalesSessions,
  getCheckoutStatus,
  getPosCart,
  listCheckoutHistory,
  getSalesReceipt,
  lookupPosSale,
  openSalesSession,
  removePosCartItem,
  updatePosCartItem,
  type BarcodeRepository,
  type BranchRepository,
  type InventoryReadRepository,
  type OrganizationMembershipRepository,
  type PosCartLine,
  type PosCartDetails,
  type PosCheckout,
  type PosCheckoutRepository,
  type PosRepository,
  type ReceiptRepository,
  type SalesReceipt,
  type SalesCounter,
  type SalesSession,
  type SalesSourceRepository,
  type UserRepository,
} from "@senvo/domain";
import {
  addPosCartItemServiceInputSchema,
  checkoutPosCartServiceInputSchema,
  closeSalesSessionServiceInputSchema,
  createSalesCounterServiceInputSchema,
  lookupPosSaleServiceInputSchema,
  getPosCheckoutServiceInputSchema,
  getPosCartServiceInputSchema,
  openSalesSessionServiceInputSchema,
  posCartLineContractSchema,
  posCartDetailsContractSchema,
  posCheckoutContractSchema,
  salesReceiptContractSchema,
  posEmptyInputSchema,
  posSaleLookupContractSchema,
  removePosCartItemServiceInputSchema,
  salesCounterContractSchema,
  salesSessionContractSchema,
  updatePosCartItemServiceInputSchema,
  updateSalesCounterStatusServiceInputSchema,
  type PosCartLineContract,
  type PosCartDetailsContract,
  type PosCheckoutContract,
  type PosSaleLookupContract,
  type SalesReceiptContract,
  type SalesCounterContract,
  type SalesSessionContract,
} from "@senvo/contracts";
import {
  requireAuthentication,
  type ApplicationAuthenticationService,
} from "../context/authentication.js";
import {
  requireAuthorization,
  type ApplicationAuthorizationService,
} from "../context/authorization.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
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
  authenticationService?: ApplicationAuthenticationService;
  authorizationService?: ApplicationAuthorizationService;
  barcodes: BarcodeRepository;
  branches: BranchRepository;
  clock: Clock;
  checkouts: PosCheckoutRepository;
  inventory: InventoryReadRepository;
  memberships: OrganizationMembershipRepository;
  pos: PosRepository;
  receipts: ReceiptRepository;
  requestIdGenerator?: () => string;
  salesSources: SalesSourceRepository;
  transactionManager: ApplicationTransactionManager;
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
  getCart(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCartDetailsContract>(context, async (trusted) => {
      const input = parsePayload(getPosCartServiceInputSchema, payload);
      await this.authorize(trusted, "READ");
      return mapCartDetails(
        await getPosCart(this.dependencies.pos, {
          ...input,
          organizationId: trusted.organizationId,
        }),
      );
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

  checkoutCart(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCheckoutContract>(context, async (trusted) => {
      const input = parsePayload(checkoutPosCartServiceInputSchema, payload);
      await requireAuthentication(this.dependencies.authenticationService, {
        requestId: trusted.requestId,
        userId: trusted.userId,
      });
      if (!trusted.userId)
        throw new AuthenticationError("Authenticated user is required.");
      const staffId = trusted.userId;
      return this.dependencies.transactionManager.execute(
        trusted,
        async (transaction) => {
          await requireAuthorization(
            this.dependencies.authorizationService,
            transaction.applicationContext,
            { action: "UPDATE", resource: "POS" },
          );
          await requireAuthorization(
            this.dependencies.authorizationService,
            transaction.applicationContext,
            { action: "CREATE", resource: "SALES" },
          );
          await requireAuthorization(
            this.dependencies.authorizationService,
            transaction.applicationContext,
            { action: "CREATE", resource: "PAYMENT" },
          );
          if (
            !transaction.posCheckoutRepository ||
            !transaction.posCheckoutSalesOrderRepository ||
            !transaction.paymentRepository ||
            !transaction.receiptRepository
          ) {
            throw new Error("POS checkout transaction capability is required.");
          }
          const result = await completePosCheckout(
            {
              checkouts: transaction.posCheckoutRepository,
              payments: transaction.paymentRepository,
              receipts: transaction.receiptRepository,
              salesOrders: transaction.posCheckoutSalesOrderRepository,
            },
            {
              ...input,
              checkoutId: crypto.randomUUID(),
              completedAt: this.dependencies.clock.now(),
              organizationId: trusted.organizationId,
              paymentBatchId: crypto.randomUUID(),
              receiptId: crypto.randomUUID(),
              staffId,
              approveOutstanding: () =>
                requireAuthorization(
                  this.dependencies.authorizationService,
                  transaction.applicationContext,
                  { action: "APPROVE", resource: "PAYMENT" },
                ),
            },
          );
          if (!result.replayed) {
            await transaction.auditWriter.recordWithinTransaction({
              action: "POS_CHECKOUT_COMPLETED",
              actor: { userId: staffId },
              metadata: {
                cartId: result.checkout.cartId,
                requestId: trusted.requestId,
                salesOrderId: result.checkout.salesOrderId,
              },
              organizationId: trusted.organizationId,
              resource: "POS_CHECKOUT",
              resourceId: result.checkout.id,
            });
            await transaction.auditWriter.recordWithinTransaction({
              action: "POS_PAYMENT_RECORDED",
              actor: { userId: staffId },
              metadata: {
                checkoutId: result.checkout.id,
                lineCount: input.payments.length,
                outstandingMinor: result.checkout.outstandingMinor ?? 0,
                paidMinor: result.checkout.paidMinor ?? 0,
                paymentStatus: result.checkout.paymentStatus,
                requestId: trusted.requestId,
                salesOrderId: result.checkout.salesOrderId,
              },
              organizationId: trusted.organizationId,
              resource: "PAYMENT",
              resourceId: result.checkout.paymentBatchId ?? result.checkout.id,
            });
            await transaction.auditWriter.recordWithinTransaction({
              action: "SALES_RECEIPT_ISSUED",
              actor: { userId: staffId },
              metadata: {
                checkoutId: result.checkout.id,
                outstandingMinor: result.checkout.outstandingMinor ?? 0,
                paidMinor: result.checkout.paidMinor ?? 0,
                paymentStatus: result.checkout.paymentStatus,
                requestId: trusted.requestId,
                salesOrderId: result.checkout.salesOrderId,
              },
              organizationId: trusted.organizationId,
              resource: "SALES_RECEIPT",
              resourceId: result.checkout.receiptId ?? result.checkout.id,
            });
          }
          return mapCheckout(result.checkout);
        },
      );
    });
  }

  getCheckout(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCheckoutContract>(context, async (trusted) => {
      const input = parsePayload(getPosCheckoutServiceInputSchema, payload);
      await this.authorize(trusted, "READ");
      return mapCheckout(
        await getCheckoutStatus(this.dependencies.checkouts, {
          ...input,
          organizationId: trusted.organizationId,
        }),
      );
    });
  }

  listCheckouts(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCheckoutContract[]>(context, async (trusted) => {
      parsePayload(posEmptyInputSchema, payload);
      await this.authorize(trusted, "READ");
      return (
        await listCheckoutHistory(
          this.dependencies.checkouts,
          trusted.organizationId,
        )
      ).map(mapCheckout);
    });
  }

  getReceipt(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesReceiptContract>(context, async (trusted) => {
      const input = parsePayload(getPosCheckoutServiceInputSchema, payload);
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        { action: "READ", resource: "RECEIPT" },
      );
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        { action: "READ", resource: "PAYMENT" },
      );
      return mapReceipt(
        await getSalesReceipt(this.dependencies.receipts, {
          ...input,
          organizationId: trusted.organizationId,
        }),
      );
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
function mapCartDetails(record: PosCartDetails): PosCartDetailsContract {
  return posCartDetailsContractSchema.parse({
    checkoutId: record.checkoutId,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    lines: record.lines.map((line) => ({
      ...mapLine(line),
      color: line.color,
      productName: line.productName,
      size: line.size,
      sku: line.sku,
    })),
    salesSessionId: record.salesSessionId,
    sessionStatus: record.sessionStatus,
    updatedAt: record.updatedAt.toISOString(),
  });
}
function mapCheckout(record: PosCheckout): PosCheckoutContract {
  return posCheckoutContractSchema.parse({
    cartId: record.cartId,
    completedAt: record.completedAt.toISOString(),
    counterId: record.counterId,
    counterName: record.counterName,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    orderNumber: record.orderNumber,
    outstandingMinor: record.outstandingMinor,
    paidMinor: record.paidMinor,
    paymentStatus: record.paymentStatus,
    receiptId: record.receiptId,
    receiptNumber: record.receiptNumber,
    salesOrderId: record.salesOrderId,
    salesSessionId: record.salesSessionId,
    staffName: record.staffName,
    status: record.status,
    subtotalMinor: record.subtotalMinor,
    totalMinor: record.totalMinor,
    updatedAt: record.updatedAt.toISOString(),
  });
}
function mapReceipt(record: SalesReceipt): SalesReceiptContract {
  return salesReceiptContractSchema.parse({
    ...record,
    issuedAt: record.issuedAt.toISOString(),
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
  if (error instanceof AuthenticationError)
    return new ApplicationServiceError({
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
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
