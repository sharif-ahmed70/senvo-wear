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
