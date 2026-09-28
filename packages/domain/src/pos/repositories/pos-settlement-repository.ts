import type { PosRegisterSettlement, SalesSession } from "../domain/models.js";
import type { PaymentMethodType } from "../domain/reconciliation-rules.js";

export type SessionPaymentLineData = {
  amountMinor: number;
  method: PaymentMethodType;
};

export type SessionCollectionLineData = {
  amountMinor: number;
  method: PaymentMethodType;
};

export type SessionRefundLineData = {
  amountMinor: number;
  method: PaymentMethodType;
};

export type SessionReconciliationSource = {
  collections: SessionCollectionLineData[];
  counter: { id: string; name: string };
  payments: SessionPaymentLineData[];
  refunds: SessionRefundLineData[];
  salesCount: number;
  session: SalesSession;
};

export type PosSettlementRepository = {
  findSessionReconciliationSource(
    sessionId: string,
    organizationId: string,
  ): Promise<SessionReconciliationSource | null>;
  findSettlementBySessionId(
    sessionId: string,
    organizationId: string,
  ): Promise<PosRegisterSettlement | null>;
  saveSettlementAndCloseSession(params: {
    expectedVersion: number;
    session: SalesSession;
    settlement: PosRegisterSettlement;
  }): Promise<{ session: SalesSession; settlement: PosRegisterSettlement } | null>;
};
