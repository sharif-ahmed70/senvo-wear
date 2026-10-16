import type {
  OnlinePaymentAttempt,
  OnlinePaymentAttemptStatus,
  OnlinePaymentOrderFacts,
  OnlinePaymentProjection,
  OnlinePaymentResolutionStatus,
  PaymentReconciliation,
  ProviderPaymentObservation,
  ProviderRefund,
  ProviderRefundStatus,
  ProviderSessionRequest,
  ProviderSessionResult,
} from "../domain/online-payment-models.js";

export type OnlinePaymentRepository = {
  createAttempt(record: {
    amountMinor: number;
    createdAt: Date;
    currencyCode: "BDT";
    id: string;
    idempotencyKey: string;
    organizationId: string;
    providerTransactionId: string;
    publicToken: string;
    requestSignature: string;
    salesOrderId: string;
  }): Promise<OnlinePaymentAttempt>;
  createProviderRefund(record: {
    amountMinor: number;
    createdAt: Date;
    currencyCode: "BDT";
    id: string;
    idempotencyKey: string;
    organizationId: string;
    paymentAttemptId: string;
    providerRefundTransactionId: string;
    requestSignature: string;
    requestedByUserId: string;
    salesOrderId: string;
  }): Promise<ProviderRefund>;
  createReconciliation(record: {
    createdAt: Date;
    expectedAmountMinor: number;
    expectedCurrencyCode: "BDT";
    expectedStatus: OnlinePaymentAttemptStatus;
    id: string;
    observedAmountMinor: number | null;
    observedCurrencyCode: string | null;
    observedStatus: string;
    organizationId: string;
    outcome: "MATCHED" | "MISMATCH";
    paymentAttemptId: string;
    providerReference: string | null;
    reasonCode: string | null;
    resolvedAt: Date | null;
    resolvedByUserId: string | null;
  }): Promise<PaymentReconciliation>;
  findAttemptById(
    id: string,
    organizationId: string,
  ): Promise<OnlinePaymentAttempt | null>;
  findAttemptByIdempotencyKey(
    organizationId: string,
    salesOrderId: string,
    idempotencyKey: string,
  ): Promise<OnlinePaymentAttempt | null>;
  findAttemptByProviderTransactionId(
    providerTransactionId: string,
  ): Promise<OnlinePaymentAttempt | null>;
  findAttemptByPublicToken(
    publicToken: string,
  ): Promise<OnlinePaymentAttempt | null>;
  findLatestAttemptForOrder(
    organizationId: string,
    salesOrderId: string,
  ): Promise<OnlinePaymentAttempt | null>;
  findProviderRefundById(
    id: string,
    organizationId: string,
  ): Promise<ProviderRefund | null>;
  findProviderRefundByIdempotencyKey(
    organizationId: string,
    paymentAttemptId: string,
    idempotencyKey: string,
  ): Promise<ProviderRefund | null>;
  getOrderFacts(
    organizationId: string,
    salesOrderId: string,
  ): Promise<OnlinePaymentOrderFacts | null>;
  getProjection(
    organizationId: string,
    salesOrderId: string,
  ): Promise<OnlinePaymentProjection | null>;
  lockAttempt(id: string, organizationId: string): Promise<void>;
  lockOrderLifecycle(
    organizationId: string,
    salesOrderId: string,
  ): Promise<void>;
  recordNotification(record: {
    dedupeKey: string;
    eventType: string;
    id: string;
    organizationId: string;
    paymentAttemptId: string;
    providerTransactionId: string;
    receivedAt: Date;
    validationId: string | null;
  }): Promise<{ id: string; replayed: boolean; status: string }>;
  settleConfirmedPayment(record: {
    bankTransactionId: string;
    confirmedAt: Date;
    organizationId: string;
    paymentAttemptId: string;
    paymentBatchId: string;
    paymentLineId: string;
    requestSignature: string;
    resolutionStatus: OnlinePaymentResolutionStatus;
    validationId: string;
  }): Promise<OnlinePaymentAttempt>;
  updateAttemptSession(record: {
    expiresAt: Date | null;
    id: string;
    organizationId: string;
    redirectUrl: string;
    sessionId: string;
  }): Promise<OnlinePaymentAttempt>;
  updateAttemptStatus(record: {
    failureCode: string | null;
    id: string;
    organizationId: string;
    status: OnlinePaymentAttemptStatus;
  }): Promise<OnlinePaymentAttempt>;
  updateNotification(record: {
    errorCode: string | null;
    id: string;
    processedAt: Date;
    status: "FAILED" | "PROCESSED" | "REJECTED";
  }): Promise<void>;
  updateProviderRefund(record: {
    confirmedAt: Date | null;
    failureCode: string | null;
    id: string;
    organizationId: string;
    providerRefundReference: string | null;
    status: ProviderRefundStatus;
  }): Promise<ProviderRefund>;
  appendConfirmedProviderRefund(record: {
    confirmedAt: Date;
    organizationId: string;
    paymentRefundId: string;
    paymentRefundLineId: string;
    providerRefundId: string;
  }): Promise<ProviderRefund>;
  totalReservedRefundMinor(
    organizationId: string,
    paymentAttemptId: string,
  ): Promise<number>;
};

export type OnlinePaymentProviderAdapter = {
  readonly enabled: boolean;
  createSession(input: ProviderSessionRequest): Promise<ProviderSessionResult>;
  initiateRefund(input: {
    amountMinor: number;
    bankTransactionId: string;
    providerRefundTransactionId: string;
    reason: string;
  }): Promise<{
    providerRefundReference: string | null;
    status: ProviderRefundStatus;
  }>;
  queryRefund(providerRefundReference: string): Promise<{
    providerRefundReference: string;
    status: ProviderRefundStatus;
  }>;
  queryTransaction(
    providerTransactionId: string,
  ): Promise<ProviderPaymentObservation>;
  validateNotificationSignature(
    payload: Readonly<Record<string, string>>,
  ): boolean;
  validateTransaction(
    validationId: string,
  ): Promise<ProviderPaymentObservation>;
};
