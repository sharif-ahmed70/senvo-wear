import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
  confirmPurchaseOrder,
  createPurchaseDraftRecord,
  getPurchaseById,
  listPurchaseRecords,
  type CostRepository,
  type Purchase,
  type PurchaseRepository,
  type PurchaseWithLines,
  type Supplier,
  type SupplierRepository,
} from "@senvo/domain";
import {
  confirmPurchaseServiceInputSchema,
  createPurchaseDraftServiceInputSchema,
  createSupplierServiceInputSchema,
  deactivateSupplierServiceInputSchema,
  getPurchaseServiceInputSchema,
  getSupplierServiceInputSchema,
  listPurchasesServiceInputSchema,
  listSuppliersServiceInputSchema,
  purchaseContractSchema,
  supplierContractSchema,
  updateSupplierServiceInputSchema,
  type ConfirmPurchaseServiceInputContract,
  type CreatePurchaseDraftLineServiceInputContract,
  type CreatePurchaseDraftServiceInputContract,
  type CreateSupplierServiceInputContract,
  type DeactivateSupplierServiceInputContract,
  type GetPurchaseServiceInputContract,
  type GetSupplierServiceInputContract,
  type ListPurchasesServiceInputContract,
  type ListSuppliersServiceInputContract,
  type PurchaseContract,
  type SupplierContract,
  type UpdateSupplierServiceInputContract,
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
import type { ApplicationTransactionManager } from "../context/transaction.js";
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

export type ProcurementApplicationServiceDependencies = {
  authorizationService?: ApplicationAuthorizationService;
  costRepository?: CostRepository;
  purchases?: PurchaseRepository;
  requestIdGenerator?: () => string;
  suppliers: SupplierRepository;
  transactionManager?: ApplicationTransactionManager;
};

export class ProcurementApplicationService {
  private readonly authorizationService?: ApplicationAuthorizationService;
  private readonly costRepository?: CostRepository;
  private readonly purchases?: PurchaseRepository;
  private readonly requestIdGenerator: () => string;
  private readonly suppliers: SupplierRepository;
  private readonly transactionManager?: ApplicationTransactionManager;

  constructor(dependencies: ProcurementApplicationServiceDependencies) {
    this.authorizationService = dependencies.authorizationService;
    this.costRepository = dependencies.costRepository;
    this.purchases = dependencies.purchases;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => crypto.randomUUID());
    this.suppliers = dependencies.suppliers;
    this.transactionManager = dependencies.transactionManager;
  }

  createSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(createSupplierServiceInputSchema, payload);
      await this.authorize(validated, "CREATE");

      const created = await this.suppliers.create({
        address: input.address,
        code: input.code,
        contactPerson: input.contactPerson,
        email: input.email,
        name: input.name,
        notes: input.notes,
        organizationId: validated.organizationId,
        phone: input.phone,
      });

      return mapSupplier(created);
    });
  }

  getSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(getSupplierServiceInputSchema, payload);
      await this.authorize(validated, "READ");

      const supplier = await this.suppliers.findById(
        input.supplierId,
        validated.organizationId,
      );
      if (!supplier) {
        throw new NotFoundError("Supplier not found.");
      }

      return mapSupplier(supplier);
    });
  }

  listSuppliers(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract[]>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(listSuppliersServiceInputSchema, payload);
      await this.authorize(validated, "READ");

      const records = await this.suppliers.list({
        organizationId: validated.organizationId,
        search: input.search ?? undefined,
        status: input.status,
      });

      return records.map(mapSupplier);
    });
  }

  updateSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(updateSupplierServiceInputSchema, payload);
      await this.authorize(validated, "UPDATE");

      const updated = await this.suppliers.update({
        address: input.address,
        code: input.code,
        contactPerson: input.contactPerson,
        email: input.email,
        id: input.supplierId,
        name: input.name,
        notes: input.notes,
        organizationId: validated.organizationId,
        phone: input.phone,
        status: input.status,
      });

      if (!updated) {
        throw new NotFoundError("Supplier not found.");
      }

      return mapSupplier(updated);
    });
  }

  deactivateSupplier(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SupplierContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(deactivateSupplierServiceInputSchema, payload);
      await this.authorize(validated, "UPDATE");

      const deactivated = await this.suppliers.deactivate(
        input.supplierId,
        validated.organizationId,
      );

      if (!deactivated) {
        throw new NotFoundError("Supplier not found.");
      }

      return mapSupplier(deactivated);
    });
  }

  createPurchaseDraft(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PurchaseContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        createPurchaseDraftServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "CREATE");

      const runCreation = async (purchaseRepo: PurchaseRepository) => {
        const created = await createPurchaseDraftRecord(purchaseRepo, {
          destinationLocationId: input.destinationLocationId,
          expectedDeliveryDate: input.expectedDeliveryDate
            ? new Date(input.expectedDeliveryDate)
            : null,
          idempotencyKey: input.idempotencyKey,
          lines: input.lines,
          notes: input.notes,
          organizationId: validated.organizationId,
          purchaseDate: input.purchaseDate
            ? new Date(input.purchaseDate)
            : undefined,
          purchaseNumber: input.purchaseNumber,
          supplierId: input.supplierId,
        });

        return mapPurchase(created);
      };

      if (this.transactionManager) {
        return this.transactionManager.execute(validated, async (tx) => {
          const purchaseRepo = tx.purchaseRepository ?? this.purchases;
          if (!purchaseRepo) {
            throw new BusinessRuleError("Purchase repository is required.");
          }
          return runCreation(purchaseRepo);
        });
      }

      if (!this.purchases) {
        throw new BusinessRuleError("Purchase repository is required.");
      }

      return runCreation(this.purchases);
    });
  }

  getPurchase(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PurchaseContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(getPurchaseServiceInputSchema, payload);
      await this.authorize(validated, "READ");

      if (!this.purchases) {
        throw new BusinessRuleError("Purchase repository is required.");
      }

      const purchase = await getPurchaseById(this.purchases, {
        organizationId: validated.organizationId,
        purchaseId: input.purchaseId,
      });

      return mapPurchase(purchase);
    });
  }

  listPurchases(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PurchaseContract[]>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(listPurchasesServiceInputSchema, payload);
      await this.authorize(validated, "READ");

      if (!this.purchases) {
        throw new BusinessRuleError("Purchase repository is required.");
      }

      const records = await listPurchaseRecords(this.purchases, {
        destinationLocationId: input.destinationLocationId,
        limit: input.limit,
        offset: input.offset,
        organizationId: validated.organizationId,
        status: input.status,
        supplierId: input.supplierId,
      });

      return records.map(mapPurchase);
    });
  }

  confirmPurchase(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PurchaseContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(confirmPurchaseServiceInputSchema, payload);
      await this.authorize(validated, "UPDATE");

      if (!this.transactionManager) {
        throw new BusinessRuleError(
          "Transaction manager is required for purchase confirmation.",
          "TRANSACTION_MANAGER_REQUIRED",
        );
      }

      return this.transactionManager.execute(validated, async (tx) => {
        const purchaseRepo = tx.purchaseRepository ?? this.purchases;
        const costRepo = tx.costRepository ?? this.costRepository;

        if (!purchaseRepo || !costRepo) {
          throw new BusinessRuleError(
            "Transactional repositories are required for purchase confirmation.",
            "TRANSACTIONAL_REPOSITORIES_MISSING",
          );
        }

        const confirmed = await confirmPurchaseOrder(
          {
            costRepository: costRepo,
            inventoryMovementRepository: tx.inventoryMovementRepository,
            purchaseRepository: purchaseRepo,
          },
          {
            idempotencyKey: input.idempotencyKey,
            organizationId: validated.organizationId,
            purchaseId: input.purchaseId,
          },
        );

        return mapPurchase(confirmed);
      });
    });
  }

  private async authorize(
    context: ValidatedApplicationExecutionContext,
    action: "CREATE" | "READ" | "UPDATE",
  ): Promise<void> {
    await requireAuthorization(this.authorizationService, context, {
      action,
      resource: "PROCUREMENT",
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

function parsePayload<T>(schema: SafeParseSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }
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
  if (error instanceof ConflictError)
    return new ApplicationServiceError({
      code: "CONFLICT",
      message: error.message || "The request conflicts with the current state.",
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

function mapSupplier(record: Supplier): SupplierContract {
  return supplierContractSchema.parse({
    address: record.address ?? null,
    code: record.code,
    contactPerson: record.contactPerson ?? null,
    createdAt: record.createdAt.toISOString(),
    email: record.email ?? null,
    id: record.id,
    name: record.name,
    notes: record.notes ?? null,
    organizationId: record.organizationId,
    phone: record.phone ?? null,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
  });
}

function mapPurchase(record: Purchase | PurchaseWithLines): PurchaseContract {
  const hasLines = "lines" in record && Array.isArray(record.lines);
  return purchaseContractSchema.parse({
    createdAt: record.createdAt.toISOString(),
    destinationLocationId: record.destinationLocationId,
    expectedDeliveryDate: record.expectedDeliveryDate?.toISOString() ?? null,
    id: record.id,
    idempotencyKey: record.idempotencyKey ?? null,
    lines: hasLines
      ? (record as PurchaseWithLines).lines.map((line) => ({
          id: line.id,
          lineNumber: line.lineNumber,
          notes: line.notes ?? null,
          productName: line.productName,
          productVariantId: line.productVariantId,
          purchaseId: line.purchaseId,
          quantity: line.quantity,
          sku: line.sku,
          totalCostMinor: line.totalCostMinor.toString(),
          unitCostMinor: line.unitCostMinor,
          variantName: line.variantName ?? null,
        }))
      : undefined,
    notes: record.notes ?? null,
    organizationId: record.organizationId,
    purchaseDate: record.purchaseDate.toISOString(),
    purchaseNumber: record.purchaseNumber,
    receiptMovementId: record.receiptMovementId ?? null,
    status: record.status,
    supplierId: record.supplierId,
    totalCostMinor: record.totalCostMinor.toString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export type {
  ConfirmPurchaseServiceInputContract,
  CreatePurchaseDraftLineServiceInputContract,
  CreatePurchaseDraftServiceInputContract,
  CreateSupplierServiceInputContract,
  DeactivateSupplierServiceInputContract,
  GetPurchaseServiceInputContract,
  GetSupplierServiceInputContract,
  ListPurchasesServiceInputContract,
  ListSuppliersServiceInputContract,
  PurchaseContract,
  SupplierContract,
  UpdateSupplierServiceInputContract,
};
