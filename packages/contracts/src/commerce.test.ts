import { describe, expect, it } from "vitest";
import {
  createCustomerServiceInputSchema,
  createVendorServiceInputSchema,
  receivePurchaseServiceInputSchema,
} from "./commerce.js";

const ids = {
  location: "10000000-0000-4000-8000-000000000001",
  variant: "10000000-0000-4000-8000-000000000002",
  vendor: "10000000-0000-4000-8000-000000000003",
};

describe("operational commerce contracts", () => {
  it("accepts customer and vendor details without trusted organization fields", () => {
    expect(
      createCustomerServiceInputSchema.safeParse({
        email: "buyer@example.com",
        name: "Buyer",
        phone: "01700000000",
      }).success,
    ).toBe(true);
    expect(
      createVendorServiceInputSchema.safeParse({
        name: "Dhaka Supplier",
        phone: "01800000000",
      }).success,
    ).toBe(true);
  });

  it("rejects browser-supplied organization identity", () => {
    expect(
      createCustomerServiceInputSchema.safeParse({
        name: "Buyer",
        organizationId: ids.vendor,
        phone: "01700000000",
      }).success,
    ).toBe(false);
  });

  it("enforces purchase totals, payment method, and unique variants", () => {
    const purchase = {
      destinationLocationId: ids.location,
      idempotencyKey: "purchase-attempt-001",
      lines: [
        {
          productVariantId: ids.variant,
          quantity: 2,
          unitCostMinor: 1000,
        },
      ],
      paidMinor: 500,
      vendorId: ids.vendor,
    };
    expect(receivePurchaseServiceInputSchema.safeParse(purchase).success).toBe(
      false,
    );
    expect(
      receivePurchaseServiceInputSchema.safeParse({
        ...purchase,
        lines: [...purchase.lines, ...purchase.lines],
        paymentMethod: "CASH",
      }).success,
    ).toBe(false);
    expect(
      receivePurchaseServiceInputSchema.safeParse({
        ...purchase,
        paidMinor: 2500,
        paymentMethod: "CASH",
      }).success,
    ).toBe(false);
    expect(
      receivePurchaseServiceInputSchema.safeParse({
        ...purchase,
        paymentMethod: "CASH",
      }).success,
    ).toBe(true);
  });
});
