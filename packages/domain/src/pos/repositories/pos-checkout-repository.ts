import type { PosCheckout, PosCheckoutPreparation } from "../domain/models.js";

export type PosCheckoutRepository = {
  createCompleted(record: {
    cartId: string;
    completedAt: Date;
    counterId: string;
    id: string;
    idempotencyKey: string;
    organizationId: string;
    salesOrderId: string;
    salesSessionId: string;
    staffId: string;
    subtotalMinor: number;
    totalMinor: number;
  }): Promise<PosCheckout>;
  findById(id: string, organizationId: string): Promise<PosCheckout | null>;
  list(organizationId: string): Promise<PosCheckout[]>;
  prepare(
    cartId: string,
    organizationId: string,
  ): Promise<PosCheckoutPreparation | null>;
};
