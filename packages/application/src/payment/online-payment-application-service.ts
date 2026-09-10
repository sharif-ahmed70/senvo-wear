import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ApplicationError,
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  SalesOrderReservationExpiredError,
  ValidationApplicationError,
  confirmSalesOrder,
  type OnlinePaymentAttempt,
  type OnlinePaymentProviderAdapter,
  type OnlinePaymentRepository,
  type ProviderPaymentObservation,
  type ProviderRefund,
} from "@senvo/domain";
import {
  onlinePaymentAdminInputSchema,
  onlinePaymentAdminResultSchema,
  onlinePaymentReconcileInputSchema,
  onlinePaymentStatusResultSchema,
  providerNotificationInputSchema,
  providerNotificationResultSchema,
  providerRefundContractSchema,
  providerRefundInputSchema,
  providerRefundRefreshInputSchema,
  storefrontPaymentOptionsResultSchema,
  storefrontPaymentRetryInputSchema,
  storefrontPaymentStatusInputSchema,
  type OnlinePaymentAdminResultContract,
  type ProviderNotificationResultContract,
  type ProviderRefundContract,
  type StorefrontPaymentOptionsResultContract,
  type StorefrontPaymentStatusResultContract,
} from "@senvo/contracts";
import {
  requireAuthentication,
  type ApplicationAuthenticationService,
} from "../context/authentication.js";
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
  type ApplicationServiceResult,
} from "../errors/application-error.js";

export type OnlinePaymentApplicationServiceDependencies = {
  authenticationService?: ApplicationAuthenticationService;
  authorizationService?: ApplicationAuthorizationService;
  clock?: Clock;
  provider: OnlinePaymentProviderAdapter;
  repository: OnlinePaymentRepository;
  requestIdGenerator?: () => string;
  transactionManager: ApplicationTransactionManager;
};

export class OnlinePaymentApplicationService {
  private readonly authenticationService?: ApplicationAuthenticationService;
  private readonly authorizationService?: ApplicationAuthorizationService;
  private readonly clock: Clock;
  private readonly provider: OnlinePaymentProviderAdapter;
  private readonly repository: OnlinePaymentRepository;
  private readonly requestIdGenerator: () => string;
  private readonly transactionManager: ApplicationTransactionManager;

  constructor(dependencies: OnlinePaymentApplicationServiceDependencies) {
    this.authenticationService = dependencies.authenticationService;
    this.authorizationService = dependencies.authorizationService;
    this.clock = dependencies.clock ?? systemClock;
    this.provider = dependencies.provider;
    this.repository = dependencies.repository;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => `req_${randomUUID()}`);
    this.transactionManager = dependencies.transactionManager;
  }

  options(
    requestId: string,
  ): Promise<ApplicationServiceResult<StorefrontPaymentOptionsResultContract>> {
    return this.executePublic(requestId, () =>
      Promise.resolve(
        storefrontPaymentOptionsResultSchema.parse({
          methods: this.provider.enabled
            ? ["CASH_ON_DELIVERY", "ONLINE_PAYMENT"]
            : ["CASH_ON_DELIVERY"],
        }),
      ),
    );
  }

  async initiateForCheckout(input: {
    idempotencyKey: string;
    organizationId: string;
    requestId: string;
    salesOrderId: string;
  }): Promise<OnlinePaymentAttempt> {
    if (!this.provider.enabled)
      throw new BusinessRuleError("Online payment is unavailable.");
    const facts = await this.repository.getOrderFacts(
      input.organizationId,
      input.salesOrderId,
    );
    if (!facts) throw new NotFoundError("Online-payment order was not found.");
    if (facts.salesOrderStatus !== "RESERVED") {
      throw new BusinessRuleError(
        "This order cannot start a new payment attempt.",
      );
    }
    const idempotencyKey = normalizeKey(input.idempotencyKey);
    const requestSignature = signature({
      amountMinor: facts.totalMinor,
      currencyCode: facts.currencyCode,
      salesOrderId: facts.salesOrderId,
    });
    const replay = await this.repository.findAttemptByIdempotencyKey(
      input.organizationId,
      facts.salesOrderId,
      idempotencyKey,
    );
    if (replay) {
      if (replay.requestSignature !== requestSignature) {
        throw new ConflictError(
          "Payment idempotency key was reused with different details.",
        );
      }
      return this.recoverOrReturn(replay, facts);
    }
    const latest = await this.repository.findLatestAttemptForOrder(
      input.organizationId,
      input.salesOrderId,
    );
    if (latest && !isTerminal(latest.status))
      return this.recoverOrReturn(latest, facts);
    if (latest?.status === "SUCCEEDED") return latest;
    const id = randomUUID();
    const attempt = await this.repository.createAttempt({
      amountMinor: facts.totalMinor,
      createdAt: this.clock.now(),
      currencyCode: facts.currencyCode,
      id,
      idempotencyKey,
      organizationId: input.organizationId,
      providerTransactionId: `SW${id.replaceAll("-", "").slice(0, 28).toUpperCase()}`,
      publicToken: randomBytes(32).toString("base64url"),
      requestSignature,
      salesOrderId: input.salesOrderId,
    });
    return this.createProviderSession(attempt, facts);
  }

  status(
    requestId: string,
    payload: unknown,
  ): Promise<ApplicationServiceResult<StorefrontPaymentStatusResultContract>> {
    return this.executePublic(requestId, async () => {
      const input = storefrontPaymentStatusInputSchema.parse(payload);
      const attempt = await this.repository.findAttemptByPublicToken(
        input.publicToken,
      );
      if (!attempt) throw new NotFoundError("Payment status was not found.");
      return this.publicStatus(attempt);
    });
  }

  retry(
    requestId: string,
    payload: unknown,
  ): Promise<ApplicationServiceResult<StorefrontPaymentStatusResultContract>> {
    return this.executePublic(requestId, async () => {
      const input = storefrontPaymentRetryInputSchema.parse(payload);
      const previous = await this.repository.findAttemptByPublicToken(
        input.publicToken,
      );
      if (!previous) throw new NotFoundError("Payment status was not found.");
      if (
        previous.status === "SUCCEEDED" ||
        previous.status === "SESSION_READY"
      ) {
        return this.publicStatus(previous);
      }
      if (previous.status === "CREATED" || previous.status === "PENDING") {
        const facts = await this.repository.getOrderFacts(
          previous.organizationId,
          previous.salesOrderId,
        );
        if (!facts) throw new NotFoundError("Payment status was not found.");
        return this.publicStatus(await this.recoverOrReturn(previous, facts));
      }
      const attempt = await this.initiateForCheckout({
        idempotencyKey: input.idempotencyKey,
        organizationId: previous.organizationId,
        requestId,
        salesOrderId: previous.salesOrderId,
      });
      return this.publicStatus(attempt);
    });
  }

  notification(
    requestId: string,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProviderNotificationResultContract>> {
    return this.executePublic(requestId, async () => {
      const input = providerNotificationInputSchema.parse(payload);
      if (!this.provider.validateNotificationSignature(input)) {
        return providerNotificationResultSchema.parse({
          accepted: false,
          replayed: false,
        });
      }
      const providerTransactionId = requiredProviderField(
        input.tran_id,
        "tran_id",
        64,
      );
      const attempt = await this.repository.findAttemptByProviderTransactionId(
        providerTransactionId,
      );
      if (!attempt) {
        return providerNotificationResultSchema.parse({
          accepted: false,
          replayed: false,
        });
      }
      const eventType = requiredProviderField(
        input.status,
        "status",
        40,
      ).toUpperCase();
      const validationId = optionalProviderField(input.val_id, 120);
      const dedupeKey = signature(
        Object.fromEntries(
          Object.entries(input).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      );
      const event = await this.repository.recordNotification({
        dedupeKey,
        eventType,
        id: randomUUID(),
        organizationId: attempt.organizationId,
        paymentAttemptId: attempt.id,
        providerTransactionId,
        receivedAt: this.clock.now(),
        validationId,
      });
      if (event.replayed && event.status === "PROCESSED") {
        return providerNotificationResultSchema.parse({
          accepted: true,
          replayed: true,
        });
      }
      let observation: ProviderPaymentObservation;
      if (eventType === "VALID" || eventType === "VALIDATED") {
        if (!validationId) {
          await this.repository.updateNotification({
            errorCode: "MISSING_VALIDATION_ID",
            id: event.id,
            processedAt: this.clock.now(),
            status: "REJECTED",
          });
          return providerNotificationResultSchema.parse({
            accepted: false,
            replayed: event.replayed,
          });
        }
        observation = await this.provider.validateTransaction(validationId);
      } else {
        observation = notificationObservation(
          input,
          providerTransactionId,
          eventType,
        );
      }
      const accepted = await this.applyObservation(
        attempt,
        observation,
        event.id,
        null,
      );
      return providerNotificationResultSchema.parse({
        accepted,
        replayed: event.replayed,
      });
    });
  }

  getAdmin(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<OnlinePaymentAdminResultContract>> {
    return this.executeProtected(context, "READ", async (validated) => {
      const input = onlinePaymentAdminInputSchema.parse(payload);
      const projection = await this.repository.getProjection(
        validated.organizationId,
        input.salesOrderId,
      );
      if (!projection) throw new NotFoundError("Online payment was not found.");
      return adminProjection(projection);
    });
  }

  reconcile(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<OnlinePaymentAdminResultContract>> {
    return this.executeProtected(context, "APPROVE", async (validated) => {
      const input = onlinePaymentReconcileInputSchema.parse(payload);
      const attempt = await this.repository.findAttemptById(
        input.paymentAttemptId,
        validated.organizationId,
      );
      if (!attempt) throw new NotFoundError("Online payment was not found.");
      const observation = await this.provider.queryTransaction(
        attempt.providerTransactionId,
      );
      await this.applyObservation(attempt, observation, null, validated);
      const projection = await this.repository.getProjection(
        validated.organizationId,
        attempt.salesOrderId,
      );
      if (!projection) throw new NotFoundError("Online payment was not found.");
      return adminProjection(projection);
    });
  }

  refund(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProviderRefundContract>> {
    return this.executeProtected(context, "APPROVE", async (validated) => {
      const input = providerRefundInputSchema.parse(payload);
      const idempotencyKey = normalizeKey(input.idempotencyKey);
      const requestSignature = signature({
        amountMinor: input.amountMinor,
        paymentAttemptId: input.paymentAttemptId,
        reason: input.reason,
      });
      const prepared = await this.transactionManager.execute(
        validated,
        async (transaction) => {
          const repository = transaction.onlinePaymentRepository;
          if (!repository) {
            throw new Error(
              "Online payment transaction capabilities are unavailable.",
            );
          }
          await repository.lockAttempt(
            input.paymentAttemptId,
            validated.organizationId,
          );
          const attempt = await repository.findAttemptById(
            input.paymentAttemptId,
            validated.organizationId,
          );
          if (
            !attempt ||
            attempt.status !== "SUCCEEDED" ||
            !attempt.bankTransactionId
          ) {
            throw new BusinessRuleError(
              "Only a confirmed provider payment can be refunded.",
            );
          }
          const facts = await repository.getOrderFacts(
            validated.organizationId,
            attempt.salesOrderId,
          );
          if (!facts) throw new NotFoundError("Sales order was not found.");
          if (
            facts.salesOrderStatus !== "CANCELLED" &&
            attempt.resolutionStatus !== "REFUND_REQUIRED"
          ) {
            throw new BusinessRuleError(
              "Provider refund requires a cancelled order or refund-required payment exception.",
            );
          }
          const replay = await repository.findProviderRefundByIdempotencyKey(
            validated.organizationId,
            attempt.id,
            idempotencyKey,
          );
          if (replay) {
            if (replay.requestSignature !== requestSignature) {
              throw new ConflictError(
                "Refund idempotency key was reused with different details.",
              );
            }
            return {
              bankTransactionId: attempt.bankTransactionId,
              refund: replay,
            };
          }
          const reserved = await repository.totalReservedRefundMinor(
            validated.organizationId,
            attempt.id,
          );
          if (input.amountMinor > attempt.amountMinor - reserved) {
            throw new BusinessRuleError(
              "Refund exceeds the remaining confirmed payment.",
            );
          }
          const id = randomUUID();
          return {
            bankTransactionId: attempt.bankTransactionId,
            refund: await repository.createProviderRefund({
              amountMinor: input.amountMinor,
              createdAt: this.clock.now(),
              currencyCode: "BDT",
              id,
              idempotencyKey,
              organizationId: validated.organizationId,
              paymentAttemptId: attempt.id,
              providerRefundTransactionId: `RF${id.replaceAll("-", "").slice(0, 28).toUpperCase()}`,
              requestSignature,
              requestedByUserId: validated.userId ?? "",
              salesOrderId: attempt.salesOrderId,
            }),
          };
        },
      );
      const { bankTransactionId } = prepared;
      let { refund } = prepared;
      if (refund.status !== "CREATED") {
        return providerRefundContractSchema.parse(mapRefund(refund));
      }
      const providerResult = await this.provider.initiateRefund({
        amountMinor: refund.amountMinor,
        bankTransactionId,
        providerRefundTransactionId: refund.providerRefundTransactionId,
        reason: input.reason,
      });
      refund = await this.repository.updateProviderRefund({
        confirmedAt: null,
        failureCode:
          providerResult.status === "FAILED" ? "PROVIDER_REFUND_FAILED" : null,
        id: refund.id,
        organizationId: refund.organizationId,
        providerRefundReference: providerResult.providerRefundReference,
        status: providerResult.status,
      });
      if (refund.status === "CONFIRMED")
        refund = await this.confirmRefund(validated, refund);
      return providerRefundContractSchema.parse(mapRefund(refund));
    });
  }

  refreshRefund(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProviderRefundContract>> {
    return this.executeProtected(context, "APPROVE", async (validated) => {
      const input = providerRefundRefreshInputSchema.parse(payload);
      let refund = await this.repository.findProviderRefundById(
        input.providerRefundId,
        validated.organizationId,
      );
      if (!refund) throw new NotFoundError("Provider refund was not found.");
      if (refund.status === "CONFIRMED")
        return providerRefundContractSchema.parse(mapRefund(refund));
      if (!refund.providerRefundReference) {
        throw new BusinessRuleError("Provider refund has no query reference.");
      }
      const observation = await this.provider.queryRefund(
        refund.providerRefundReference,
      );
      refund = await this.repository.updateProviderRefund({
        confirmedAt: null,
        failureCode:
          observation.status === "FAILED" ? "PROVIDER_REFUND_FAILED" : null,
        id: refund.id,
        organizationId: refund.organizationId,
        providerRefundReference: observation.providerRefundReference,
        status: observation.status,
      });
      if (refund.status === "CONFIRMED")
        refund = await this.confirmRefund(validated, refund);
      return providerRefundContractSchema.parse(mapRefund(refund));
    });
  }

  private async recoverOrReturn(
    attempt: OnlinePaymentAttempt,
    facts: NonNullable<
      Awaited<ReturnType<OnlinePaymentRepository["getOrderFacts"]>>
    >,
  ): Promise<OnlinePaymentAttempt> {
    if (attempt.status !== "CREATED" && attempt.status !== "PENDING")
      return attempt;
    try {
      const observation = await this.provider.queryTransaction(
        attempt.providerTransactionId,
      );
      if (observation.status !== "UNKNOWN") {
        await this.applyObservation(attempt, observation, null, null);
        if (observation.status !== "PENDING") {
          return (
            (await this.repository.findAttemptById(
              attempt.id,
              attempt.organizationId,
            )) ?? attempt
          );
        }
      }
    } catch {
      // Recovery continues with the same provider transaction identifier.
    }
    return this.createProviderSession(attempt, facts);
  }

  private async createProviderSession(
    attempt: OnlinePaymentAttempt,
    facts: NonNullable<
      Awaited<ReturnType<OnlinePaymentRepository["getOrderFacts"]>>
    >,
  ): Promise<OnlinePaymentAttempt> {
    try {
      const session = await this.provider.createSession({
        amountMinor: facts.totalMinor,
        currencyCode: facts.currencyCode,
        customer: {
          email: facts.customerEmail,
          name: facts.customerName,
          phone: facts.customerPhone,
        },
        orderNumber: facts.orderNumber,
        providerTransactionId: attempt.providerTransactionId,
      });
      return this.repository.updateAttemptSession({
        expiresAt: session.expiresAt,
        id: attempt.id,
        organizationId: attempt.organizationId,
        redirectUrl: session.redirectUrl,
        sessionId: session.sessionId,
      });
    } catch (error) {
      const uncertain =
        typeof error === "object" &&
        error !== null &&
        "outcomeUncertain" in error &&
        error.outcomeUncertain === true;
      await this.repository.updateAttemptStatus({
        failureCode: providerErrorCode(error),
        id: attempt.id,
        organizationId: attempt.organizationId,
        status: uncertain ? "PENDING" : "FAILED",
      });
      throw new ApplicationServiceError({
        code: "BUSINESS_RULE_VIOLATION",
        message: uncertain
          ? "Payment preparation is still being checked. Retry safely."
          : "Online payment could not be prepared. Retry safely.",
        retryable: true,
      });
    }
  }

  private async applyObservation(
    originalAttempt: OnlinePaymentAttempt,
    observation: ProviderPaymentObservation,
    notificationId: string | null,
    actor: ValidatedApplicationExecutionContext | null,
  ): Promise<boolean> {
    const context =
      actor ??
      validateExecutionContext({
        actorType: "ANONYMOUS",
        authenticationState: "ANONYMOUS",
        organizationId: originalAttempt.organizationId,
        permissions: null,
        requestId: this.requestIdGenerator(),
        source: "STOREFRONT",
        userId: null,
      });
    return this.transactionManager.execute(context, async (transaction) => {
      const repository = transaction.onlinePaymentRepository;
      const sales = transaction.salesOrderLifecycleRepository;
      if (!repository || !sales) {
        throw new Error(
          "Online payment transaction capabilities are unavailable.",
        );
      }
      await repository.lockAttempt(
        originalAttempt.id,
        originalAttempt.organizationId,
      );
      const attempt = await repository.findAttemptById(
        originalAttempt.id,
        originalAttempt.organizationId,
      );
      if (!attempt) throw new NotFoundError("Payment attempt was not found.");
      if (attempt.status === "SUCCEEDED") {
        if (notificationId) {
          await repository.updateNotification({
            errorCode: null,
            id: notificationId,
            processedAt: this.clock.now(),
            status: "PROCESSED",
          });
        }
        return true;
      }
      const mismatch = observationMismatch(attempt, observation);
      if (mismatch) {
        await repository.createReconciliation({
          ...reconciliationRecord(
            attempt,
            observation,
            mismatch,
            this.clock.now(),
          ),
          id: randomUUID(),
          organizationId: attempt.organizationId,
          paymentAttemptId: attempt.id,
          resolvedAt: null,
          resolvedByUserId: null,
        });
        if (notificationId) {
          await repository.updateNotification({
            errorCode: mismatch,
            id: notificationId,
            processedAt: this.clock.now(),
            status: "REJECTED",
          });
        }
        return false;
      }
      if (observation.status !== "SUCCEEDED") {
        const status =
          observation.status === "UNKNOWN" ? "PENDING" : observation.status;
        await repository.updateAttemptStatus({
          failureCode: status === "FAILED" ? "PROVIDER_PAYMENT_FAILED" : null,
          id: attempt.id,
          organizationId: attempt.organizationId,
          status,
        });
        if (notificationId) {
          await repository.updateNotification({
            errorCode: null,
            id: notificationId,
            processedAt: this.clock.now(),
            status: "PROCESSED",
          });
        }
        return true;
      }
      await repository.lockOrderLifecycle(
        attempt.organizationId,
        attempt.salesOrderId,
      );
      const facts = await repository.getOrderFacts(
        attempt.organizationId,
        attempt.salesOrderId,
      );
      if (!facts)
        throw new NotFoundError("Online-payment order was not found.");
      const now = this.clock.now();
      const reservationAvailable =
        facts.reservationStatus === "ACTIVE" &&
        (!facts.reservationExpiresAt || facts.reservationExpiresAt > now);
      let resolutionStatus: OnlinePaymentAttempt["resolutionStatus"] =
        observation.riskLevel === 1 ? "REVIEW_REQUIRED" : "NORMAL";
      let operationalReason: string | null =
        observation.riskLevel === 1 ? "PROVIDER_RISK_REVIEW" : null;
      if (facts.salesOrderStatus === "RESERVED" && reservationAvailable) {
        try {
          await confirmSalesOrder(sales, {
            expectedVersion: facts.salesOrderVersion,
            organizationId: attempt.organizationId,
            salesOrderId: attempt.salesOrderId,
          });
        } catch (error) {
          if (!(error instanceof SalesOrderReservationExpiredError)) {
            throw error;
          }

          resolutionStatus = "REFUND_REQUIRED";
          operationalReason = "LATE_SUCCESS_RESERVATION_UNAVAILABLE";
        }
      } else if (
        facts.salesOrderStatus !== "CONFIRMED" &&
        facts.salesOrderStatus !== "FULFILLED"
      ) {
        resolutionStatus = "REFUND_REQUIRED";
        operationalReason = "LATE_SUCCESS_RESERVATION_UNAVAILABLE";
      }
      const confirmed = await repository.settleConfirmedPayment({
        bankTransactionId: observation.bankTransactionId ?? "",
        confirmedAt: now,
        organizationId: attempt.organizationId,
        paymentAttemptId: attempt.id,
        paymentBatchId: randomUUID(),
        paymentLineId: randomUUID(),
        requestSignature: signature({
          amountMinor: attempt.amountMinor,
          bankTransactionId: observation.bankTransactionId,
          provider: attempt.provider,
          providerTransactionId: attempt.providerTransactionId,
        }),
        resolutionStatus,
        validationId: observation.validationId ?? attempt.validationId ?? "",
      });
      await repository.createReconciliation({
        ...reconciliationRecord(attempt, observation, operationalReason, now),
        id: randomUUID(),
        organizationId: attempt.organizationId,
        paymentAttemptId: attempt.id,
        resolvedAt: actor ? now : null,
        resolvedByUserId: actor?.userId ?? null,
      });
      if (notificationId) {
        await repository.updateNotification({
          errorCode: null,
          id: notificationId,
          processedAt: now,
          status: "PROCESSED",
        });
      }
      await transaction.auditWriter.recordWithinTransaction({
        action: "ONLINE_PAYMENT_CONFIRMED",
        actor: { userId: context.userId },
        metadata: {
          amountMinor: confirmed.amountMinor,
          provider: confirmed.provider,
          requestId: context.requestId,
          resolutionStatus: confirmed.resolutionStatus,
        },
        organizationId: confirmed.organizationId,
        resource: "ONLINE_PAYMENT_ATTEMPT",
        resourceId: confirmed.id,
      });
      return true;
    });
  }

  private async confirmRefund(
    context: ValidatedApplicationExecutionContext,
    refund: ProviderRefund,
  ): Promise<ProviderRefund> {
    return this.transactionManager.execute(context, async (transaction) => {
      const repository = transaction.onlinePaymentRepository;
      if (!repository)
        throw new Error(
          "Online payment transaction capabilities are unavailable.",
        );
      await repository.lockAttempt(
        refund.paymentAttemptId,
        refund.organizationId,
      );
      const confirmedAt = this.clock.now();
      const confirmed = await repository.appendConfirmedProviderRefund({
        confirmedAt,
        organizationId: refund.organizationId,
        paymentRefundId: randomUUID(),
        paymentRefundLineId: randomUUID(),
        providerRefundId: refund.id,
      });
      await transaction.auditWriter.recordWithinTransaction({
        action: "ONLINE_PAYMENT_REFUND_CONFIRMED",
        actor: { userId: context.userId },
        metadata: {
          amountMinor: confirmed.amountMinor,
          requestId: context.requestId,
          status: confirmed.status,
        },
        organizationId: confirmed.organizationId,
        resource: "PROVIDER_REFUND",
        resourceId: confirmed.id,
      });
      return confirmed;
    });
  }

  private async publicStatus(
    attempt: OnlinePaymentAttempt,
  ): Promise<StorefrontPaymentStatusResultContract> {
    const facts = await this.repository.getOrderFacts(
      attempt.organizationId,
      attempt.salesOrderId,
    );
    if (!facts) throw new NotFoundError("Payment status was not found.");
    return onlinePaymentStatusResultSchema.parse({
      amountMinor: attempt.amountMinor,
      currencyCode: attempt.currencyCode,
      orderNumber: facts.orderNumber,
      payment: paymentShape(attempt),
    });
  }

  private executePublic<T>(
    requestId: string,
    action: () => Promise<T>,
  ): Promise<ApplicationServiceResult<T>> {
    return this.execute(requestId || this.requestIdGenerator(), action);
  }

  private executeProtected<T>(
    rawContext: ApplicationExecutionContext,
    permission: "APPROVE" | "READ",
    action: (context: ValidatedApplicationExecutionContext) => Promise<T>,
  ): Promise<ApplicationServiceResult<T>> {
    const requestId = rawContext.requestId || this.requestIdGenerator();
    return this.execute(requestId, async () => {
      const context = validateExecutionContext({ ...rawContext, requestId });
      await requireAuthentication(this.authenticationService, {
        requestId,
        userId: context.userId,
      });
      await requireAuthorization(this.authorizationService, context, {
        action: permission,
        resource: "PAYMENT",
      });
      return action(context);
    });
  }

  private async execute<T>(
    requestId: string,
    action: () => Promise<T>,
  ): Promise<ApplicationServiceResult<T>> {
    try {
      return { data: await action(), ok: true };
    } catch (error) {
      return { error: normalizeError(error).toShape(requestId), ok: false };
    }
  }
}

function paymentShape(attempt: OnlinePaymentAttempt) {
  return {
    publicToken: attempt.publicToken,
    redirectUrl: attempt.redirectUrl,
    resolutionStatus: attempt.resolutionStatus,
    status: attempt.status,
  };
}

type OnlinePaymentProjectionInput = NonNullable<
  Awaited<ReturnType<OnlinePaymentRepository["getProjection"]>>
>;

function adminProjection(
  projection: OnlinePaymentProjectionInput,
): OnlinePaymentAdminResultContract {
  return onlinePaymentAdminResultSchema.parse({
    attempt: {
      amountMinor: projection.attempt.amountMinor,
      bankTransactionId: projection.attempt.bankTransactionId,
      currencyCode: projection.attempt.currencyCode,
      failureCode: projection.attempt.failureCode,
      id: projection.attempt.id,
      provider: projection.attempt.provider,
      providerTransactionId: projection.attempt.providerTransactionId,
      resolutionStatus: projection.attempt.resolutionStatus,
      status: projection.attempt.status,
    },
    reconciliations: projection.reconciliations.map((item) => ({
      createdAt: item.createdAt.toISOString(),
      expectedAmountMinor: item.expectedAmountMinor,
      expectedStatus: item.expectedStatus,
      id: item.id,
      observedAmountMinor: item.observedAmountMinor,
      observedStatus: item.observedStatus,
      outcome: item.outcome,
      reasonCode: item.reasonCode,
    })),
    refunds: projection.refunds.map(mapRefund),
  });
}

function mapRefund(refund: ProviderRefund) {
  return {
    amountMinor: refund.amountMinor,
    confirmedAt: refund.confirmedAt?.toISOString() ?? null,
    failureCode: refund.failureCode,
    id: refund.id,
    providerRefundReference: refund.providerRefundReference,
    status: refund.status,
  };
}

function notificationObservation(
  input: Record<string, string>,
  providerTransactionId: string,
  eventType: string,
): ProviderPaymentObservation {
  return {
    amountMinor: null,
    bankTransactionId: null,
    currencyCode: null,
    providerStatus: eventType,
    providerTransactionId,
    riskLevel: null,
    status:
      eventType === "FAILED"
        ? "FAILED"
        : eventType === "CANCELLED"
          ? "CANCELLED"
          : eventType === "EXPIRED"
            ? "EXPIRED"
            : "PENDING",
    validationId: optionalProviderField(input.val_id, 120),
  };
}

function observationMismatch(
  attempt: OnlinePaymentAttempt,
  observation: ProviderPaymentObservation,
): string | null {
  if (observation.providerTransactionId !== attempt.providerTransactionId) {
    return "PROVIDER_TRANSACTION_MISMATCH";
  }
  if (observation.status !== "SUCCEEDED") return null;
  if (observation.amountMinor !== attempt.amountMinor) return "AMOUNT_MISMATCH";
  if (observation.currencyCode !== attempt.currencyCode)
    return "CURRENCY_MISMATCH";
  if (!observation.bankTransactionId) return "BANK_REFERENCE_MISSING";
  if (!observation.validationId) return "VALIDATION_REFERENCE_MISSING";
  return null;
}

function reconciliationRecord(
  attempt: OnlinePaymentAttempt,
  observation: ProviderPaymentObservation,
  reasonCode: string | null,
  createdAt: Date,
) {
  return {
    createdAt,
    expectedAmountMinor: attempt.amountMinor,
    expectedCurrencyCode: attempt.currencyCode,
    expectedStatus: attempt.status,
    observedAmountMinor: observation.amountMinor,
    observedCurrencyCode: observation.currencyCode,
    observedStatus: observation.providerStatus,
    outcome: reasonCode ? ("MISMATCH" as const) : ("MATCHED" as const),
    providerReference: observation.bankTransactionId,
    reasonCode,
  };
}

function isTerminal(status: OnlinePaymentAttempt["status"]): boolean {
  return ["CANCELLED", "EXPIRED", "FAILED", "SUCCEEDED"].includes(status);
}

function normalizeKey(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:-]{7,63}$/u.test(normalized)) {
    throw new ValidationApplicationError("idempotencyKey is invalid.");
  }
  return normalized;
}

function signature(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function providerErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 80);
  }
  return "PROVIDER_ERROR";
}

function requiredProviderField(
  value: string | undefined,
  field: string,
  maximum: number,
): string {
  const normalized = optionalProviderField(value, maximum);
  if (!normalized) throw new ValidationApplicationError(`${field} is invalid.`);
  return normalized;
}

function optionalProviderField(
  value: string | undefined,
  maximum: number,
): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function normalizeError(error: unknown): ApplicationServiceError {
  if (error instanceof ApplicationServiceError) return error;
  if (
    error instanceof ValidationApplicationError ||
    (error instanceof Error && error.name === "ZodError")
  ) {
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
      message: error.publicMessage,
    });
  }
  if (error instanceof NotFoundError) {
    return new ApplicationServiceError({
      code: "NOT_FOUND",
      message: error.publicMessage,
    });
  }
  if (error instanceof ConflictError) {
    return new ApplicationServiceError({
      code: error.message.toLowerCase().includes("idempotency")
        ? "IDEMPOTENCY_CONFLICT"
        : "CONFLICT",
      message: "This request was already used with different details.",
    });
  }
  if (error instanceof BusinessRuleError) {
    return new ApplicationServiceError({
      code: "BUSINESS_RULE_VIOLATION",
      message: error.publicMessage,
    });
  }
  if (error instanceof ApplicationError) {
    return new ApplicationServiceError({
      code: "INTERNAL_ERROR",
      message: "The request could not be completed.",
    });
  }
  return new ApplicationServiceError({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    retryable: true,
  });
}
