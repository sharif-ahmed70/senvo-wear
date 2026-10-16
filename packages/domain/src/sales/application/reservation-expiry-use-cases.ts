import { BusinessRuleError } from "../../errors.js";

export type DueStorefrontReservationCandidate = {
  commerceSource: string | null;
  consumedByMovementId: string | null;
  expiresAt: Date | null;
  orderId: string;
  orderStatus: string;
  organizationId: string;
  reservationId: string;
  reservationStatus: string;
};

export function isStorefrontReservationDue(
  candidate: DueStorefrontReservationCandidate,
  cutoff: Date,
): boolean {
  if (candidate.commerceSource !== "STOREFRONT") {
    return false;
  }
  if (candidate.orderStatus !== "RESERVED") {
    return false;
  }
  if (candidate.reservationStatus !== "ACTIVE") {
    return false;
  }
  if (candidate.consumedByMovementId !== null) {
    return false;
  }
  if (!candidate.expiresAt) {
    return false;
  }
  return candidate.expiresAt.getTime() <= cutoff.getTime();
}

export function assertValidReservationCutoff(cutoff: Date): Date {
  if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) {
    throw new BusinessRuleError(
      "Reservation expiry cutoff must be a valid date.",
    );
  }
  return cutoff;
}

export const STOREFRONT_ONLINE_PAYMENT_RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const STOREFRONT_COD_RESERVATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type LegacyReservationExclusionReason =
  | "PAYMENT_EXPOSED"
  | "PAYMENT_BATCH_EXPOSED"
  | "NOT_STOREFRONT"
  | "TERMINAL_ORDER"
  | "NOT_ACTIVE"
  | "ALREADY_HAS_EXPIRY"
  | "INTEGRITY_MISMATCH"
  | "INVALID_RESERVED_AT";

export type CalculateHistoricalReservationExpiryInput = {
  paymentPreference: string | null | undefined;
  referenceTime?: Date;
  reservedAt: Date | null | undefined;
};

export type CalculateHistoricalReservationExpiryResult = {
  calculatedExpiresAt: Date;
  isDue: boolean;
  ttlMs: number;
};

export function calculateHistoricalReservationExpiry(
  input: CalculateHistoricalReservationExpiryInput,
): CalculateHistoricalReservationExpiryResult {
  if (
    !input.reservedAt ||
    !(input.reservedAt instanceof Date) ||
    Number.isNaN(input.reservedAt.getTime())
  ) {
    throw new BusinessRuleError(
      "Reserved timestamp is required and must be a valid date.",
    );
  }
  if (
    input.referenceTime &&
    input.reservedAt.getTime() > input.referenceTime.getTime()
  ) {
    throw new BusinessRuleError(
      "Reserved timestamp cannot be after reference cutoff time.",
    );
  }
  let ttlMs: number;
  if (input.paymentPreference === "ONLINE_PAYMENT") {
    ttlMs = STOREFRONT_ONLINE_PAYMENT_RESERVATION_TTL_MS;
  } else if (input.paymentPreference === "CASH_ON_DELIVERY") {
    ttlMs = STOREFRONT_COD_RESERVATION_TTL_MS;
  } else {
    throw new BusinessRuleError(
      `Unsupported payment preference for storefront reservation normalization: ${input.paymentPreference}`,
    );
  }
  const calculatedExpiresAt = new Date(input.reservedAt.getTime() + ttlMs);
  const isDue = input.referenceTime
    ? calculatedExpiresAt.getTime() <= input.referenceTime.getTime()
    : false;
  return {
    calculatedExpiresAt,
    isDue,
    ttlMs,
  };
}
