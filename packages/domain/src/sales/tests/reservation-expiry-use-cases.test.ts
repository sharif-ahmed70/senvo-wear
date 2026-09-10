import { describe, expect, it } from "vitest";
import {
  assertValidReservationCutoff,
  calculateHistoricalReservationExpiry,
  isStorefrontReservationDue,
  type DueStorefrontReservationCandidate,
} from "../application/reservation-expiry-use-cases.js";
import { BusinessRuleError } from "../../errors.js";

describe("reservation-expiry-use-cases", () => {
  const cutoff = new Date("2026-09-07T12:00:00.000Z");

  const baseCandidate: DueStorefrontReservationCandidate = {
    commerceSource: "STOREFRONT",
    consumedByMovementId: null,
    expiresAt: new Date("2026-09-07T11:59:59.000Z"),
    orderId: "11111111-1111-4111-8111-111111111111",
    orderStatus: "RESERVED",
    organizationId: "22222222-2222-4222-8222-222222222222",
    reservationId: "33333333-3333-4333-8333-333333333333",
    reservationStatus: "ACTIVE",
  };

  it("identifies a due storefront reservation candidate when expiresAt <= cutoff", () => {
    expect(isStorefrontReservationDue(baseCandidate, cutoff)).toBe(true);

    const exactMatch = {
      ...baseCandidate,
      expiresAt: new Date("2026-09-07T12:00:00.000Z"),
    };
    expect(isStorefrontReservationDue(exactMatch, cutoff)).toBe(true);
  });

  it("does not identify candidate if expiresAt is after cutoff", () => {
    const futureCandidate = {
      ...baseCandidate,
      expiresAt: new Date("2026-09-07T12:00:01.000Z"),
    };
    expect(isStorefrontReservationDue(futureCandidate, cutoff)).toBe(false);
  });

  it("does not identify candidate if expiresAt is null", () => {
    const nullExpiry = {
      ...baseCandidate,
      expiresAt: null,
    };
    expect(isStorefrontReservationDue(nullExpiry, cutoff)).toBe(false);
  });

  it("does not identify non-STOREFRONT orders", () => {
    const posCandidate = {
      ...baseCandidate,
      commerceSource: "POS",
    };
    expect(isStorefrontReservationDue(posCandidate, cutoff)).toBe(false);

    const nullSource = {
      ...baseCandidate,
      commerceSource: null,
    };
    expect(isStorefrontReservationDue(nullSource, cutoff)).toBe(false);
  });

  it("does not identify non-RESERVED sales orders", () => {
    const confirmedOrder = {
      ...baseCandidate,
      orderStatus: "CONFIRMED",
    };
    expect(isStorefrontReservationDue(confirmedOrder, cutoff)).toBe(false);

    const cancelledOrder = {
      ...baseCandidate,
      orderStatus: "CANCELLED",
    };
    expect(isStorefrontReservationDue(cancelledOrder, cutoff)).toBe(false);
  });

  it("does not identify non-ACTIVE reservations", () => {
    const releasedReservation = {
      ...baseCandidate,
      reservationStatus: "RELEASED",
    };
    expect(isStorefrontReservationDue(releasedReservation, cutoff)).toBe(false);

    const expiredReservation = {
      ...baseCandidate,
      reservationStatus: "EXPIRED",
    };
    expect(isStorefrontReservationDue(expiredReservation, cutoff)).toBe(false);
  });

  it("does not identify consumed reservations", () => {
    const consumed = {
      ...baseCandidate,
      consumedByMovementId: "44444444-4444-4444-8444-444444444444",
    };
    expect(isStorefrontReservationDue(consumed, cutoff)).toBe(false);
  });

  it("validates cutoff date format", () => {
    expect(assertValidReservationCutoff(cutoff)).toBe(cutoff);
    expect(() => assertValidReservationCutoff(new Date("invalid"))).toThrow(
      BusinessRuleError,
    );
  });

  describe("calculateHistoricalReservationExpiry", () => {
    const reservedAt = new Date("2026-09-07T10:00:00.000Z");

    it("calculates ONLINE_PAYMENT expiry as reservedAt + 30 minutes", () => {
      const result = calculateHistoricalReservationExpiry({
        paymentPreference: "ONLINE_PAYMENT",
        referenceTime: new Date("2026-09-07T10:15:00.000Z"),
        reservedAt,
      });

      expect(result.calculatedExpiresAt).toEqual(
        new Date("2026-09-07T10:30:00.000Z"),
      );
      expect(result.ttlMs).toBe(30 * 60 * 1000);
      expect(result.isDue).toBe(false);
    });

    it("calculates CASH_ON_DELIVERY expiry as reservedAt + 24 hours", () => {
      const result = calculateHistoricalReservationExpiry({
        paymentPreference: "CASH_ON_DELIVERY",
        referenceTime: new Date("2026-09-07T12:00:00.000Z"),
        reservedAt,
      });

      expect(result.calculatedExpiresAt).toEqual(
        new Date("2026-09-08T10:00:00.000Z"),
      );
      expect(result.ttlMs).toBe(24 * 60 * 60 * 1000);
      expect(result.isDue).toBe(false);
    });

    it("identifies overdue holds when calculatedExpiresAt <= referenceTime", () => {
      const result = calculateHistoricalReservationExpiry({
        paymentPreference: "ONLINE_PAYMENT",
        referenceTime: new Date("2026-09-07T11:00:00.000Z"),
        reservedAt,
      });

      expect(result.calculatedExpiresAt).toEqual(
        new Date("2026-09-07T10:30:00.000Z"),
      );
      expect(result.isDue).toBe(true);
    });

    it("rejects missing, null, or invalid reservedAt", () => {
      expect(() =>
        calculateHistoricalReservationExpiry({
          paymentPreference: "ONLINE_PAYMENT",
          reservedAt: null,
        }),
      ).toThrow(BusinessRuleError);

      expect(() =>
        calculateHistoricalReservationExpiry({
          paymentPreference: "ONLINE_PAYMENT",
          reservedAt: new Date("invalid"),
        }),
      ).toThrow(BusinessRuleError);
    });

    it("rejects future reservedAt relative to reference cutoff", () => {
      expect(() =>
        calculateHistoricalReservationExpiry({
          paymentPreference: "ONLINE_PAYMENT",
          referenceTime: new Date("2026-09-07T09:00:00.000Z"),
          reservedAt,
        }),
      ).toThrow(BusinessRuleError);
    });

    it("rejects unsupported payment preferences", () => {
      expect(() =>
        calculateHistoricalReservationExpiry({
          paymentPreference: "CREDIT_CARD",
          reservedAt,
        }),
      ).toThrow(BusinessRuleError);

      expect(() =>
        calculateHistoricalReservationExpiry({
          paymentPreference: null,
          reservedAt,
        }),
      ).toThrow(BusinessRuleError);
    });
  });
});
