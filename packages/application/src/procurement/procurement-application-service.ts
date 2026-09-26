import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
  type Supplier,
  type SupplierRepository,
} from "@senvo/domain";
import {
  createSupplierServiceInputSchema,
  deactivateSupplierServiceInputSchema,
  getSupplierServiceInputSchema,
  listSuppliersServiceInputSchema,
  supplierContractSchema,
  updateSupplierServiceInputSchema,
  type CreateSupplierServiceInputContract,
  type DeactivateSupplierServiceInputContract,
  type GetSupplierServiceInputContract,
  type ListSuppliersServiceInputContract,
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
  requestIdGenerator?: () => string;
  suppliers: SupplierRepository;
};

export class ProcurementApplicationService {
  private readonly authorizationService?: ApplicationAuthorizationService;
  private readonly requestIdGenerator: () => string;
  private readonly suppliers: SupplierRepository;

  constructor(dependencies: ProcurementApplicationServiceDependencies) {
    this.authorizationService = dependencies.authorizationService;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => crypto.randomUUID());
    this.suppliers = dependencies.suppliers;
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
      message: "The request cannot be completed.",
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

export type {
  CreateSupplierServiceInputContract,
  DeactivateSupplierServiceInputContract,
  GetSupplierServiceInputContract,
  ListSuppliersServiceInputContract,
  UpdateSupplierServiceInputContract,
};
