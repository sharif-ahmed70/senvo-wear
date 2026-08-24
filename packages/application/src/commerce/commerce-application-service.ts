import {
  ConcurrencyError,
  type CommerceRepository,
  type PermissionAction,
  type PermissionResource,
} from "@senvo/domain";
import {
  commerceEmptyInputSchema,
  commerceIdInputSchema,
  createCustomerServiceInputSchema,
  createVendorServiceInputSchema,
  receivePurchaseServiceInputSchema,
  recordVendorPaymentServiceInputSchema,
  updateCustomerServiceInputSchema,
  updateVendorServiceInputSchema,
  type CustomerProfileContract,
  type CustomerSummaryContract,
  type PurchaseOrderSummaryContract,
  type VendorPaymentContract,
  type VendorSummaryContract,
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
import type { ApplicationTransactionManager } from "../context/transaction.js";
import {
  ApplicationServiceError,
  type ApplicationServiceResult,
} from "../errors/application-error.js";

export class CommerceApplicationService {
  constructor(
    private readonly dependencies: {
      authorizationService?: ApplicationAuthorizationService;
      clock: Clock;
      repository: CommerceRepository;
      transactionManager: ApplicationTransactionManager;
    },
  ) {}

  listCustomers(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<CustomerSummaryContract[]>(context, async (trusted) => {
      parse(commerceEmptyInputSchema, payload);
      await this.authorize(trusted, "READ", "SALES");
      return (
        await this.dependencies.repository.listCustomers(trusted.organizationId)
      ).map(mapCustomer);
    });
  }

  getCustomer(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<CustomerProfileContract>(context, async (trusted) => {
      const input = parse(commerceIdInputSchema, payload);
      await this.authorize(trusted, "READ", "SALES");
      const record = await this.dependencies.repository.findCustomer(
        trusted.organizationId,
        input.id,
      );
      if (!record)
        throw new ApplicationServiceError({
          code: "NOT_FOUND",
          message: "Customer was not found.",
        });
      return {
        ...mapCustomer(record),
        orders: record.orders.map((order) => ({
          ...order,
          createdAt: order.createdAt.toISOString(),
        })),
      };
    });
  }

  createCustomer(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<CustomerSummaryContract>(context, async (trusted) => {
      const input = parse(createCustomerServiceInputSchema, payload);
      await this.authorize(trusted, "CREATE", "SALES");
      return mapCustomer(
        await this.dependencies.repository.createCustomer({
          address: input.address ?? null,
          email: input.email ?? null,
          id: crypto.randomUUID(),
          name: input.name,
          organizationId: trusted.organizationId,
          phone: input.phone,
        }),
      );
    });
  }

  updateCustomer(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<CustomerSummaryContract>(context, async (trusted) => {
      const input = parse(updateCustomerServiceInputSchema, payload);
      await this.authorize(trusted, "UPDATE", "SALES");
      const record = await this.dependencies.repository.updateCustomer({
        address: input.address ?? null,
        email: input.email ?? null,
        expectedVersion: input.expectedVersion,
        id: input.customerId,
        name: input.name,
        organizationId: trusted.organizationId,
        phone: input.phone,
        status: input.status,
      });
      if (!record)
        throw new ConcurrencyError("Customer changed. Reload and try again.");
      return mapCustomer(record);
    });
  }

  listVendors(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<VendorSummaryContract[]>(context, async (trusted) => {
      parse(commerceEmptyInputSchema, payload);
      await this.authorize(trusted, "READ", "INVENTORY");
      return (
        await this.dependencies.repository.listVendors(trusted.organizationId)
      ).map(mapVendor);
    });
  }

  createVendor(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<VendorSummaryContract>(context, async (trusted) => {
      const input = parse(createVendorServiceInputSchema, payload);
      await this.authorize(trusted, "CREATE", "INVENTORY");
      return mapVendor(
        await this.dependencies.repository.createVendor({
          address: input.address ?? null,
          id: crypto.randomUUID(),
          location: input.location ?? null,
          name: input.name,
          organizationId: trusted.organizationId,
          phone: input.phone ?? null,
        }),
      );
    });
  }

  updateVendor(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<VendorSummaryContract>(context, async (trusted) => {
      const input = parse(updateVendorServiceInputSchema, payload);
      await this.authorize(trusted, "UPDATE", "INVENTORY");
      const record = await this.dependencies.repository.updateVendor({
        address: input.address ?? null,
        expectedVersion: input.expectedVersion,
        id: input.vendorId,
        location: input.location ?? null,
        name: input.name,
        organizationId: trusted.organizationId,
        phone: input.phone ?? null,
        status: input.status,
      });
      if (!record)
        throw new ConcurrencyError("Vendor changed. Reload and try again.");
      return mapVendor(record);
    });
  }

  listPurchases(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PurchaseOrderSummaryContract[]>(
      context,
      async (trusted) => {
        parse(commerceEmptyInputSchema, payload);
        await this.authorize(trusted, "READ", "INVENTORY");
        return (
          await this.dependencies.repository.listPurchases(
            trusted.organizationId,
          )
        ).map(mapPurchase);
      },
    );
  }

  receivePurchase(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PurchaseOrderSummaryContract>(
      context,
      async (trusted) => {
        const input = parse(receivePurchaseServiceInputSchema, payload);
        await this.authorize(trusted, "CREATE", "INVENTORY");
        const now = this.dependencies.clock.now();
        return this.dependencies.transactionManager.execute(
          trusted,
          async (transaction) => {
            if (!transaction.commerceRepository)
              throw new Error("Commerce transaction capability is required.");
            const id = crypto.randomUUID();
            const result = await transaction.commerceRepository.receivePurchase(
              {
                ...input,
                id,
                movementId: crypto.randomUUID(),
                movementNumber: `PUR-${id.replaceAll("-", "").slice(0, 20).toUpperCase()}`,
                note: input.note ?? null,
                orderedAt: now,
                organizationId: trusted.organizationId,
                paymentId: input.paidMinor ? crypto.randomUUID() : null,
                paymentMethod: input.paymentMethod ?? null,
                paymentReference: input.paymentReference ?? null,
                purchaseNumber: `PO-${id.replaceAll("-", "").slice(0, 20).toUpperCase()}`,
                receivedAt: now,
              },
            );
            if (!result.replayed)
              await transaction.auditWriter.recordWithinTransaction({
                action: "INVENTORY_MOVEMENT_POSTED",
                actor: { userId: trusted.userId },
                metadata: {
                  purchaseOrderId: result.purchase.id,
                  requestId: trusted.requestId,
                  vendorId: result.purchase.vendorId,
                },
                organizationId: trusted.organizationId,
                resource: "INVENTORY_MOVEMENT",
                resourceId: result.purchase.inventoryMovementId ?? id,
              });
            return mapPurchase(result.purchase);
          },
        );
      },
    );
  }

  recordVendorPayment(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<VendorPaymentContract>(context, async (trusted) => {
      const input = parse(recordVendorPaymentServiceInputSchema, payload);
      await this.authorize(trusted, "UPDATE", "INVENTORY");
      return mapPayment(
        (
          await this.dependencies.repository.recordVendorPayment({
            ...input,
            id: crypto.randomUUID(),
            organizationId: trusted.organizationId,
            paidAt: this.dependencies.clock.now(),
            purchaseOrderId: input.purchaseOrderId ?? null,
            reference: input.reference ?? null,
          })
        ).payment,
      );
    });
  }

  private authorize(
    context: ValidatedApplicationExecutionContext,
    action: PermissionAction,
    resource: PermissionResource,
  ) {
    return requireAuthorization(
      this.dependencies.authorizationService,
      context,
      { action, resource },
    );
  }

  private async execute<T>(
    rawContext: ApplicationExecutionContext,
    operation: (context: ValidatedApplicationExecutionContext) => Promise<T>,
  ): Promise<ApplicationServiceResult<T>> {
    const requestId = rawContext.requestId ?? crypto.randomUUID();
    try {
      return {
        data: await operation(
          validateExecutionContext({ ...rawContext, requestId }),
        ),
        ok: true,
      };
    } catch (error) {
      const normalized =
        error instanceof ApplicationServiceError
          ? error
          : new ApplicationServiceError({
              code:
                error instanceof ConcurrencyError
                  ? "CONCURRENCY_CONFLICT"
                  : "INTERNAL_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Commerce operation failed.",
            });
      return { error: normalized.toShape(requestId), ok: false };
    }
  }
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch {
    throw new ApplicationServiceError({
      code: "VALIDATION_ERROR",
      message: "Submitted commerce details are invalid.",
    });
  }
}

function mapCustomer(record: {
  address: string | null;
  dueMinor: number;
  email: string | null;
  id: string;
  name: string;
  phone: string;
  status: "ACTIVE" | "INACTIVE";
  totalPurchaseMinor: number;
  updatedAt: Date;
  version: number;
}): CustomerSummaryContract {
  return { ...record, updatedAt: record.updatedAt.toISOString() };
}

function mapVendor(record: {
  address: string | null;
  dueMinor: number;
  id: string;
  location: string | null;
  name: string;
  paidMinor: number;
  phone: string | null;
  purchaseMinor: number;
  status: "ACTIVE" | "INACTIVE";
  updatedAt: Date;
  version: number;
}): VendorSummaryContract {
  return { ...record, updatedAt: record.updatedAt.toISOString() };
}

function mapPurchase(
  record: Omit<PurchaseOrderSummaryContract, "orderedAt" | "receivedAt"> & {
    orderedAt: Date;
    receivedAt: Date | null;
  },
): PurchaseOrderSummaryContract {
  return {
    ...record,
    orderedAt: record.orderedAt.toISOString(),
    receivedAt: record.receivedAt?.toISOString() ?? null,
  };
}

function mapPayment(
  record: Omit<VendorPaymentContract, "paidAt"> & { paidAt: Date },
): VendorPaymentContract {
  return { ...record, paidAt: record.paidAt.toISOString() };
}
