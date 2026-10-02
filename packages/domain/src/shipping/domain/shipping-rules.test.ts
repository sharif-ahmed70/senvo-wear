import { describe, expect, it } from "vitest";
import { BusinessRuleError, ConflictError } from "../../errors.js";
import type { CourierConsignment } from "./models.js";
import {
  assertNoActiveShipment,
  assertOrderCanBeDispatched,
  assertValidShipmentTransition,
  canTransitionShipmentStatus,
  normalizeCodAmount,
} from "./shipping-rules.js";

describe("shipping rules and state machine", () => {
  describe("canTransitionShipmentStatus & assertValidShipmentTransition", () => {
    it("allows valid forward transitions", () => {
      expect(canTransitionShipmentStatus("DRAFT", "BOOKED")).toBe(true);
      expect(canTransitionShipmentStatus("BOOKED", "PICKED_UP")).toBe(true);
      expect(canTransitionShipmentStatus("BOOKED", "IN_TRANSIT")).toBe(true);
      expect(canTransitionShipmentStatus("PICKED_UP", "IN_TRANSIT")).toBe(true);
      expect(canTransitionShipmentStatus("IN_TRANSIT", "DELIVERED")).toBe(true);
      expect(
        canTransitionShipmentStatus("IN_TRANSIT", "RETURNED_TO_ORIGIN"),
      ).toBe(true);
      expect(canTransitionShipmentStatus("BOOKED", "CANCELLED")).toBe(true);
      expect(canTransitionShipmentStatus("IN_TRANSIT", "CANCELLED")).toBe(true);

      expect(() =>
        assertValidShipmentTransition("IN_TRANSIT", "DELIVERED"),
      ).not.toThrow();
    });

    it("treats same-status transitions as valid idempotent no-ops", () => {
      expect(canTransitionShipmentStatus("BOOKED", "BOOKED")).toBe(true);
      expect(canTransitionShipmentStatus("DELIVERED", "DELIVERED")).toBe(true);
      expect(canTransitionShipmentStatus("CANCELLED", "CANCELLED")).toBe(true);
      expect(() =>
        assertValidShipmentTransition("DELIVERED", "DELIVERED"),
      ).not.toThrow();
    });

    it("prevents delivered shipment from moving back to transit or other states", () => {
      expect(canTransitionShipmentStatus("DELIVERED", "IN_TRANSIT")).toBe(
        false,
      );
      expect(canTransitionShipmentStatus("DELIVERED", "CANCELLED")).toBe(false);
      expect(
        canTransitionShipmentStatus("DELIVERED", "RETURNED_TO_ORIGIN"),
      ).toBe(false);

      expect(() =>
        assertValidShipmentTransition("DELIVERED", "IN_TRANSIT"),
      ).toThrow(ConflictError);
      expect(() =>
        assertValidShipmentTransition("DELIVERED", "IN_TRANSIT"),
      ).toThrow(/Delivered shipment cannot be modified/);
    });

    it("prevents cancelled shipment from being dispatched or modified", () => {
      expect(canTransitionShipmentStatus("CANCELLED", "BOOKED")).toBe(false);
      expect(canTransitionShipmentStatus("CANCELLED", "IN_TRANSIT")).toBe(
        false,
      );

      expect(() =>
        assertValidShipmentTransition("CANCELLED", "BOOKED"),
      ).toThrow(ConflictError);
      expect(() =>
        assertValidShipmentTransition("CANCELLED", "BOOKED"),
      ).toThrow(/Cancelled shipment cannot be dispatched/);
    });

    it("prevents returned-to-origin shipment from being modified or moved to active states", () => {
      expect(
        canTransitionShipmentStatus("RETURNED_TO_ORIGIN", "DELIVERED"),
      ).toBe(false);
      expect(() =>
        assertValidShipmentTransition("RETURNED_TO_ORIGIN", "DELIVERED"),
      ).toThrow(ConflictError);
      expect(() =>
        assertValidShipmentTransition("RETURNED_TO_ORIGIN", "DELIVERED"),
      ).toThrow(/already returned to origin/);
    });

    it("rejects illegal skips like DRAFT directly to DELIVERED", () => {
      expect(canTransitionShipmentStatus("DRAFT", "DELIVERED")).toBe(false);
      expect(() => assertValidShipmentTransition("DRAFT", "DELIVERED")).toThrow(
        BusinessRuleError,
      );
    });
  });

  describe("assertOrderCanBeDispatched", () => {
    const validOrder = {
      customerPhone: "+8801700000000",
      deliveryAddressLine1: "House 10, Road 4, Sector 3, Uttara",
      id: "ord-1",
      orderNumber: "ORD-2026-0001",
      status: "CONFIRMED",
    };

    it("allows confirmed and fulfilled orders to be dispatched", () => {
      expect(() => assertOrderCanBeDispatched(validOrder)).not.toThrow();
      expect(() =>
        assertOrderCanBeDispatched({ ...validOrder, status: "FULFILLED" }),
      ).not.toThrow();
    });

    it("rejects cancelled orders", () => {
      expect(() =>
        assertOrderCanBeDispatched({ ...validOrder, status: "CANCELLED" }),
      ).toThrow(BusinessRuleError);
      expect(() =>
        assertOrderCanBeDispatched({
          ...validOrder,
          cancelledAt: new Date(),
        }),
      ).toThrow(/cancelled/);
    });

    it("rejects draft orders", () => {
      expect(() =>
        assertOrderCanBeDispatched({ ...validOrder, status: "DRAFT" }),
      ).toThrow(BusinessRuleError);
      expect(() =>
        assertOrderCanBeDispatched({ ...validOrder, status: "DRAFT" }),
      ).toThrow(/draft/);
    });

    it("rejects orders missing delivery address", () => {
      expect(() =>
        assertOrderCanBeDispatched({
          ...validOrder,
          deliveryAddressLine1: "",
        }),
      ).toThrow(BusinessRuleError);
      expect(() =>
        assertOrderCanBeDispatched({
          ...validOrder,
          deliveryAddressLine1: null,
        }),
      ).toThrow(/without a delivery address/);
    });

    it("rejects orders missing customer phone number", () => {
      expect(() =>
        assertOrderCanBeDispatched({
          ...validOrder,
          customerPhone: "   ",
        }),
      ).toThrow(BusinessRuleError);
      expect(() =>
        assertOrderCanBeDispatched({
          ...validOrder,
          customerPhone: null,
        }),
      ).toThrow(/phone number/);
    });
  });

  describe("assertNoActiveShipment", () => {
    const baseConsignment: CourierConsignment = {
      cancelledAt: null,
      codAmountMinor: 100000n,
      consignmentNumber: "CNS-001",
      courierProvider: "STEADFAST",
      createdAt: new Date(),
      deliveredAt: null,
      deliveryAddressLine1: "Uttara",
      deliveryAddressLine2: null,
      deliveryCity: "Dhaka",
      deliveryDistrict: "Dhaka",
      deliveryFeeMinor: 6000n,
      deliveryPostalCode: "1230",
      dispatchedAt: null,
      id: "cns-1",
      itemWeightGram: null,
      note: null,
      organizationId: "org-1",
      recipientEmail: null,
      recipientName: "Test",
      recipientPhone: "+8801700000000",
      returnedAt: null,
      salesOrderId: "ord-1",
      status: "BOOKED",
      trackingCode: "ST-123",
      trackingUrl: null,
      updatedAt: new Date(),
      version: 1,
    };

    it("rejects if there is an active shipment in BOOKED, IN_TRANSIT, or DELIVERED", () => {
      expect(() =>
        assertNoActiveShipment([baseConsignment], "ORD-001"),
      ).toThrow(ConflictError);
      expect(() =>
        assertNoActiveShipment([baseConsignment], "ORD-001"),
      ).toThrow(/already exists/);

      expect(() =>
        assertNoActiveShipment(
          [{ ...baseConsignment, status: "IN_TRANSIT" }],
          "ORD-001",
        ),
      ).toThrow(ConflictError);

      expect(() =>
        assertNoActiveShipment(
          [{ ...baseConsignment, status: "DELIVERED" }],
          "ORD-001",
        ),
      ).toThrow(ConflictError);
    });

    it("allows dispatch if previous consignment was CANCELLED", () => {
      expect(() =>
        assertNoActiveShipment(
          [{ ...baseConsignment, status: "CANCELLED" }],
          "ORD-001",
        ),
      ).not.toThrow();
    });

    it("allows dispatch if previous consignment was RETURNED_TO_ORIGIN", () => {
      expect(() =>
        assertNoActiveShipment(
          [{ ...baseConsignment, status: "RETURNED_TO_ORIGIN" }],
          "ORD-001",
        ),
      ).not.toThrow();
    });
  });

  describe("normalizeCodAmount", () => {
    it("handles BigInt, number, string, null, and undefined", () => {
      expect(normalizeCodAmount(120000)).toBe(120000n);
      expect(normalizeCodAmount("250000")).toBe(250000n);
      expect(normalizeCodAmount(5000n)).toBe(5000n);
      expect(normalizeCodAmount(null)).toBe(0n);
      expect(normalizeCodAmount(undefined)).toBe(0n);
    });

    it("rejects negative amounts", () => {
      expect(() => normalizeCodAmount(-500)).toThrow(BusinessRuleError);
      expect(() => normalizeCodAmount("-1")).toThrow(BusinessRuleError);
    });
  });
});
