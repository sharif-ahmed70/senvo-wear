import {
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  StockIntakeIdempotencyConflictError,
  ValidationApplicationError,
  recordStockIntake,
  type PermissionKey,
  type RecordStockIntakeInput,
} from "@senvo/domain";
import {
  createStockIntakeServiceInputSchema,
  stockIntakeContractSchema,
  type CreateStockIntakeServiceInputContract,
  type StockIntakeContract,
} from "@senvo/contracts";
import {
  requireAuthorization,
  type ApplicationAuthorizationService,
} from "../context/authorization.js";
import {
  validateExecutionContext,
  type ApplicationExecutionContext,
  type ValidatedApplicationExecutionContext,
} from "../context/execution-context.js";
import type {
  ApplicationTransactionContext,
  ApplicationTransactionManager,
} from "../context/transaction.js";
import {
  ApplicationServiceError,
  ValidationApplicationServiceError,
  type ApplicationServiceResult,
} from "../errors/application-error.js";

export const stockIntakeRequiredPermissions: readonly PermissionKey[] = [
  { action: "CREATE", resource: "CATALOG" },
  { action: "UPDATE", resource: "CATALOG" },
  { action: "CREATE", resource: "INVENTORY" },
  { action: "UPDATE", resource: "INVENTORY" },
  { action: "CREATE", resource: "PROCUREMENT" },
];

export type StockIntakeApplicationServiceDependencies = {
  authorizationService?: ApplicationAuthorizationService;
  generateBarcodeValue?: () => string;
  requestIdGenerator?: () => string;
  transactionManager: ApplicationTransactionManager;
};

export class StockIntakeApplicationService {
  private readonly authorizationService?: ApplicationAuthorizationService;
  private readonly generateBarcodeValue?: () => string;
  private readonly requestIdGenerator: () => string;
  private readonly transactionManager: ApplicationTransactionManager;

  constructor(dependencies: StockIntakeApplicationServiceDependencies) {
    this.authorizationService = dependencies.authorizationService;
    this.generateBarcodeValue = dependencies.generateBarcodeValue;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => crypto.randomUUID());
    this.transactionManager = dependencies.transactionManager;
  }

  recordStockIntake(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<StockIntakeContract>> {
    return this.execute(context, async (validated) => {
      const parsed = createStockIntakeServiceInputSchema.safeParse(payload);
      if (!parsed.success) {
        const issue = parsed.error.issues.at(0);
        throw new ValidationApplicationServiceError(
          issue
            ? `${issue.path.join(".") || "payload"}: ${issue.message}`
            : "Input is invalid.",
        );
      }
      for (const permission of stockIntakeRequiredPermissions) {
        await requireAuthorization(
          this.authorizationService,
          validated,
          permission,
        );
      }

      const input = toDomainInput(validated, parsed.data);
      const outcome = await this.transactionManager.execute(
        validated,
        async (transaction) =>
          recordStockIntake(
            {
              ...requireTransactionRepositories(transaction),
              generateBarcodeValue: this.generateBarcodeValue,
            },
            input,
          ),
      );

      return stockIntakeContractSchema.parse({
        ...outcome.result,
        replayed: outcome.replayed,
      });
    });
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

function toDomainInput(
  context: ValidatedApplicationExecutionContext,
  input: CreateStockIntakeServiceInputContract,
): RecordStockIntakeInput {
  return {
    actorUserId: context.userId,
    idempotencyKey: input.idempotencyKey,
    lines: input.lines,
    organizationId: context.organizationId,
    payment: input.payment ?? null,
    product: input.product,
    purchase: {
      destinationLocationId: input.purchase.destinationLocationId,
      memoNumber: input.purchase.memoNumber ?? null,
      note: input.purchase.note ?? null,
      purchaseDate: input.purchase.purchaseDate
        ? parsePurchaseDate(input.purchase.purchaseDate)
        : null,
    },
    supplier: input.supplier,
    transportCostMinor: input.transportCostMinor ?? 0,
    transportPaidToSupplier: input.transportPaidToSupplier ?? false,
  };
}

function parsePurchaseDate(value: string): Date {
  return new Date(
    /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00.000Z` : value,
  );
}

function requireTransactionRepositories(
  transaction: ApplicationTransactionContext,
) {
  const {
    barcodeRepository,
    catalogProductRepository,
    categoryRepository,
    colorRepository,
    costRepository,
    organizationRepository,
    productVariantRepository,
    purchaseRepository,
    sizeRepository,
    stockIntakeRepository,
    supplierLedgerRepository,
    supplierPaymentRepository,
    supplierRepository,
  } = transaction;
  if (
    !barcodeRepository ||
    !catalogProductRepository ||
    !categoryRepository ||
    !colorRepository ||
    !costRepository ||
    !organizationRepository ||
    !productVariantRepository ||
    !purchaseRepository ||
    !sizeRepository ||
    !stockIntakeRepository ||
    !supplierLedgerRepository ||
    !supplierPaymentRepository ||
    !supplierRepository
  ) {
    throw new ApplicationServiceError({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    });
  }
  return {
    auditWriter: transaction.auditWriter,
    barcodes: barcodeRepository,
    categories: categoryRepository,
    colors: colorRepository,
    costs: costRepository,
    inventoryMovements: transaction.inventoryMovementRepository,
    organizations: organizationRepository,
    products: catalogProductRepository,
    productVariants: productVariantRepository,
    purchases: purchaseRepository,
    sizes: sizeRepository,
    stockIntakes: stockIntakeRepository,
    supplierLedger: supplierLedgerRepository,
    supplierPayments: supplierPaymentRepository,
    suppliers: supplierRepository,
  };
}

// Domain messages raised by the stock intake workflow are written for staff
// and carry no secrets, so validation, conflict and business-rule messages are
// passed through to help the operator correct the delivery entry.
function normalizeError(error: unknown): ApplicationServiceError {
  if (error instanceof ApplicationServiceError) return error;
  if (error instanceof ValidationApplicationError)
    return new ApplicationServiceError({
      code: "VALIDATION_ERROR",
      message: error.message || "Input is invalid.",
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
      message: error.message || "The requested resource was not found.",
    });
  if (error instanceof StockIntakeIdempotencyConflictError)
    return new ApplicationServiceError({
      code: "IDEMPOTENCY_CONFLICT",
      message: "This request was already used with different details.",
    });
  if (error instanceof ConcurrencyError)
    return new ApplicationServiceError({
      code: "CONCURRENCY_CONFLICT",
      message: "The information changed. Please reload and try again.",
      retryable: true,
    });
  if (error instanceof ConflictError)
    return new ApplicationServiceError({
      code: "CONFLICT",
      message:
        error.message || "The request conflicts with the current information.",
      retryable: error.message.includes("uniqueness constraint"),
    });
  if (error instanceof BusinessRuleError)
    return new ApplicationServiceError({
      code: "BUSINESS_RULE_VIOLATION",
      message: error.message || "The request cannot be completed.",
    });
  return new ApplicationServiceError({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  });
}

export type { CreateStockIntakeServiceInputContract, StockIntakeContract };
