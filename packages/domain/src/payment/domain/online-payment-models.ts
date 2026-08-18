export type OnlinePaymentProvider = "SSLCOMMERZ";

export type OnlinePaymentAttemptStatus =
  | "CREATED"
  | "SESSION_READY"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export type OnlinePaymentResolutionStatus =
  "NORMAL" | "REVIEW_REQUIRED" | "REFUND_REQUIRED";

export type OnlinePaymentAttempt = {
  amountMinor: number;
  bankTransactionId: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  currencyCode: "BDT";
  expiresAt: Date | null;
  failureCode: string | null;
  id: string;
  idempotencyKey: string;
  organizationId: string;
  provider: OnlinePaymentProvider;
  providerSessionId: string | null;
  providerTransactionId: string;
  publicToken: string;
  redirectUrl: string | null;
  requestSignature: string;
  resolutionStatus: OnlinePaymentResolutionStatus;
  salesOrderId: string;
  status: OnlinePaymentAttemptStatus;
  updatedAt: Date;
  validationId: string | null;
  version: number;
};

export type ProviderPaymentObservation = {
  amountMinor: number | null;
  bankTransactionId: string | null;
  currencyCode: string | null;
  providerStatus: string;
  providerTransactionId: string;
  riskLevel: number | null;
  status:
    "CANCELLED" | "EXPIRED" | "FAILED" | "PENDING" | "SUCCEEDED" | "UNKNOWN";
  validationId: string | null;
};

export type ProviderSessionRequest = {
  amountMinor: number;
  currencyCode: "BDT";
  customer: {
    email: string | null;
    name: string;
    phone: string;
  };
  orderNumber: string;
  providerTransactionId: string;
};

export type ProviderSessionResult = {
  expiresAt: Date | null;
  redirectUrl: string;
  sessionId: string;
};

export type ProviderRefundStatus =
  "CREATED" | "PENDING" | "CONFIRMED" | "FAILED" | "CANCELLED";

export type ProviderRefund = {
  amountMinor: number;
  confirmedAt: Date | null;
  createdAt: Date;
  currencyCode: "BDT";
  failureCode: string | null;
  id: string;
  idempotencyKey: string;
  organizationId: string;
  paymentAttemptId: string;
  providerRefundReference: string | null;
  providerRefundTransactionId: string;
  requestSignature: string;
  requestedByUserId: string;
  salesOrderId: string;
  status: ProviderRefundStatus;
  updatedAt: Date;
};

export type PaymentReconciliation = {
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
};

export type OnlinePaymentOrderFacts = {
  currencyCode: "BDT";
  customerEmail: string | null;
  customerName: string;
  customerPhone: string;
  orderNumber: string;
  paymentPreference: "ONLINE_PAYMENT";
  reservationExpiresAt: Date | null;
  reservationStatus: "ACTIVE" | "CONFIRMED" | "EXPIRED" | "RELEASED";
  salesOrderId: string;
  salesOrderStatus: "RESERVED" | "CONFIRMED" | "CANCELLED" | "FULFILLED";
  salesOrderVersion: number;
  totalMinor: number;
};

export type OnlinePaymentProjection = {
  attempt: OnlinePaymentAttempt;
  reconciliations: PaymentReconciliation[];
  refunds: ProviderRefund[];
};
