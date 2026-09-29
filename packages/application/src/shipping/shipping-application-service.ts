import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
  dispatchSalesOrder,
  getConsignmentById,
  getShipmentsByOrderId,
  updateShipmentStatus,
  type CourierConsignmentRepository,
  type SalesOrderRepository,
} from "@senvo/domain";
import {
  dispatchSalesOrderServiceInputSchema,
  getConsignmentByIdServiceInputSchema,
  getShipmentsByOrderIdServiceInputSchema,
  updateShipmentStatusServiceInputSchema,
  type CourierConsignmentContract,
} from "@senvo/contracts";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import { requireAuthorization } from "../context/authorization.js";
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
import { mapCourierConsignment } from "./mappers.js";

type SafeParseSchema<T> = {
  safeParse(input: unknown):
    | { data: T; success: true }
    | {
        error: { issues: Array<{ message: string; path: PropertyKey[] }> };
        success: false;
      };
};

import type { AuditWriter } from "@senvo/domain";

export type ShippingAuditWriter = Pick<AuditWriter, "recordWithinTransaction">;

export type ShippingApplicationServiceDependencies = {
  auditWriter?: ShippingAuditWriter;
  authorizationService?: ApplicationAuthorizationService;
  consignments: CourierConsignmentRepository;
  requestIdGenerator?: () => string;
  salesOrders: Pick<SalesOrderRepository, "findById">;
  transactionManager?: ApplicationTransactionManager;
};

export class ShippingApplicationService {
  private readonly auditWriter?: ShippingAuditWriter;
  private readonly authorizationService?: ApplicationAuthorizationService;
  private readonly consignments: CourierConsignmentRepository;
  private readonly requestIdGenerator: () => string;
  private readonly salesOrders: Pick<SalesOrderRepository, "findById">;
  private readonly transactionManager?: ApplicationTransactionManager;

  constructor(dependencies: ShippingApplicationServiceDependencies) {
    this.auditWriter = dependencies.auditWriter;
    this.authorizationService = dependencies.authorizationService;
    this.consignments = dependencies.consignments;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => crypto.randomUUID());
    this.salesOrders = dependencies.salesOrders;
    this.transactionManager = dependencies.transactionManager;
  }

  async dispatchSalesOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CourierConsignmentContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(dispatchSalesOrderServiceInputSchema, payload);
      await this.authorize(validated, "UPDATE");

      const executeDispatch = async (
        consignmentRepo: CourierConsignmentRepository,
        auditWriter?: ShippingAuditWriter,
      ) => {
        const { consignment } = await dispatchSalesOrder(
          {
            consignmentRepository: consignmentRepo,
            salesOrderRepository: this.salesOrders,
          },
          {
            ...input,
            organizationId: validated.organizationId,
          },
        );

        if (auditWriter) {
          await auditWriter.recordWithinTransaction({
            action: "ORDER_DISPATCHED",
            actor: { userId: validated.userId },
            metadata: {
              codAmountMinor: consignment.codAmountMinor.toString(),
              consignmentNumber: consignment.consignmentNumber,
              courierProvider: consignment.courierProvider,
              requestId: validated.requestId,
              salesOrderId: consignment.salesOrderId,
              status: consignment.status,
              trackingCode: consignment.trackingCode,
            },
            organizationId: validated.organizationId,
            resource: "COURIER_CONSIGNMENT",
            resourceId: consignment.id,
          });
        }

        return mapCourierConsignment(consignment);
      };

      if (this.transactionManager) {
        return this.transactionManager.execute(
          validated,
          async (tx) => {
            const auditWriter = tx.auditWriter ?? this.auditWriter;
            return executeDispatch(this.consignments, auditWriter);
          },
        );
      }

      return executeDispatch(this.consignments, this.auditWriter);
    });
  }

  async updateShipmentStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CourierConsignmentContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        updateShipmentStatusServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "UPDATE");

      const existing = await this.consignments.findById(
        input.consignmentId,
        validated.organizationId,
      );

      if (!existing) {
        throw new NotFoundError(
          `Courier consignment ${input.consignmentId} was not found.`,
        );
      }

      const previousStatus = existing.status;
      const isStatusChanged = existing.status !== input.status;

      const executeUpdate = async (
        consignmentRepo: CourierConsignmentRepository,
        auditWriter?: ShippingAuditWriter,
      ) => {
        const { consignment } = await updateShipmentStatus(
          { consignmentRepository: consignmentRepo },
          {
            consignmentId: input.consignmentId,
            expectedVersion: input.expectedVersion,
            note: input.note,
            organizationId: validated.organizationId,
            status: input.status,
            trackingCode: input.trackingCode,
            trackingUrl: input.trackingUrl,
          },
        );

        if (isStatusChanged && auditWriter) {
          await auditWriter.recordWithinTransaction({
            action: "SHIPMENT_STATUS_UPDATED",
            actor: { userId: validated.userId },
            metadata: {
              consignmentNumber: consignment.consignmentNumber,
              newStatus: consignment.status,
              previousStatus,
              requestId: validated.requestId,
              salesOrderId: consignment.salesOrderId,
              trackingCode: consignment.trackingCode,
            },
            organizationId: validated.organizationId,
            resource: "COURIER_CONSIGNMENT",
            resourceId: consignment.id,
          });
        }

        return mapCourierConsignment(consignment);
      };

      if (this.transactionManager) {
        return this.transactionManager.execute(
          validated,
          async (tx) => {
            const auditWriter = tx.auditWriter ?? this.auditWriter;
            return executeUpdate(this.consignments, auditWriter);
          },
        );
      }

      return executeUpdate(this.consignments, this.auditWriter);
    });
  }

  async getShipmentByOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CourierConsignmentContract[]>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        getShipmentsByOrderIdServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "READ");

      const shipments = await getShipmentsByOrderId(
        { consignmentRepository: this.consignments },
        {
          organizationId: validated.organizationId,
          salesOrderId: input.salesOrderId,
        },
      );

      return shipments.map(mapCourierConsignment);
    });
  }

  async getConsignment(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CourierConsignmentContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        getConsignmentByIdServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "READ");

      const consignment = await getConsignmentById(
        { consignmentRepository: this.consignments },
        {
          consignmentId: input.consignmentId,
          organizationId: validated.organizationId,
        },
      );

      return mapCourierConsignment(consignment);
    });
  }

  private async authorize(
    context: ValidatedApplicationExecutionContext,
    action: "READ" | "UPDATE",
  ): Promise<void> {
    if (!this.authorizationService) return;
    await requireAuthorization(this.authorizationService, context, {
      action,
      resource: "SALES_ORDER",
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
