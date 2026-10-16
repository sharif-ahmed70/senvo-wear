import type {
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type { CourierConsignmentContract } from "@senvo/contracts";
import { describe, expect, it } from "vitest";
import {
  createShippingApiHandlers,
  type ApiRequestContext,
  type ShippingApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const salesOrderId = "20000000-0000-4000-8000-000000000001";
const consignmentId = "30000000-0000-4000-8000-000000000001";

const context: ApiRequestContext = {
  authenticatedUser: { userId },
  organizationId,
  permissions: [{ action: "UPDATE", resource: "SALES_ORDER" }],
  requestId: "req_shipping_api_1",
};

const sampleConsignmentContract: CourierConsignmentContract = {
  cancelledAt: null,
  codAmountMinor: "250000",
  consignmentNumber: "CNS-TEST-001",
  courierProvider: "STEADFAST",
  createdAt: new Date().toISOString(),
  deliveredAt: null,
  deliveryAddressLine1: "House 10, Road 4",
  deliveryAddressLine2: null,
  deliveryCity: "Dhaka",
  deliveryDistrict: "Dhaka",
  deliveryFeeMinor: "6000",
  deliveryPostalCode: "1230",
  dispatchedAt: null,
  id: consignmentId,
  itemWeightGram: 500,
  note: null,
  organizationId,
  recipientEmail: null,
  recipientName: "Test Recipient",
  recipientPhone: "+8801700000000",
  returnedAt: null,
  salesOrderId,
  status: "BOOKED",
  trackingCode: "TRK-001",
  trackingUrl: null,
  updatedAt: new Date().toISOString(),
  version: 1,
};

class FakeAuthorization implements ApplicationAuthorizationService {
  permission?: { action: string; resource: string };
  error: Error | null = null;

  authorize(
    _context: ApplicationExecutionContext,
    permission: { action: string; resource: string },
  ) {
    this.permission = permission;
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve();
  }
}

class FakeShipping implements ShippingApplication {
  context?: ApplicationExecutionContext;
  lastPayload?: unknown;

  private result<T>(context: ApplicationExecutionContext, data: T) {
    this.context = context;
    return Promise.resolve<ApplicationServiceResult<T>>({ data, ok: true });
  }

  dispatchSalesOrder(context: ApplicationExecutionContext, payload: unknown) {
    this.lastPayload = payload;
    return this.result(context, sampleConsignmentContract);
  }

  getConsignment(context: ApplicationExecutionContext, payload: unknown) {
    this.lastPayload = payload;
    return this.result(context, sampleConsignmentContract);
  }

  getShipmentByOrder(context: ApplicationExecutionContext, payload: unknown) {
    this.lastPayload = payload;
    return this.result(context, [sampleConsignmentContract]);
  }

  updateShipmentStatus(context: ApplicationExecutionContext, payload: unknown) {
    this.lastPayload = payload;
    return this.result(context, {
      ...sampleConsignmentContract,
      status: "IN_TRANSIT" as const,
    });
  }
}

import type { ApplicationAuthenticationService } from "@senvo/application";

const authenticationService: ApplicationAuthenticationService = {
  authenticate: (request) =>
    Promise.resolve({
      authenticatedUserId: request.userId ?? userId,
      provider: "PASSWORD",
      requestId: request.requestId,
    }),
};

function handlers(
  shipping: ShippingApplication,
  authorization: ApplicationAuthorizationService = new FakeAuthorization(),
) {
  return createShippingApiHandlers({
    authenticationService,
    authorizationService: authorization,
    shipping,
  });
}

describe("Shipping API handlers", () => {
  it("authorizes and dispatches sales order with SALES_ORDER:UPDATE", async () => {
    const shipping = new FakeShipping();
    const authorization = new FakeAuthorization();

    const response = await handlers(shipping, authorization).dispatch.handle({
      context,
      input: {
        courierProvider: "STEADFAST",
        salesOrderId,
        trackingCode: "TRK-001",
      },
    });

    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data.id).toBe(consignmentId);
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "SALES_ORDER",
    });
    expect(shipping.context?.organizationId).toBe(organizationId);
  });

  it("rejects dispatch with invalid salesOrderId UUID", async () => {
    const shipping = new FakeShipping();
    const response = await handlers(shipping).dispatch.handle({
      context,
      input: {
        courierProvider: "STEADFAST",
        salesOrderId: "not-a-valid-uuid",
      },
    });

    expect(response.success).toBe(false);
  });

  it("authorizes and gets shipment by order ID with SALES_ORDER:READ", async () => {
    const shipping = new FakeShipping();
    const authorization = new FakeAuthorization();

    const response = await handlers(
      shipping,
      authorization,
    ).getShipmentByOrder.handle({
      context,
      input: { salesOrderId },
    });

    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data).toHaveLength(1);
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "SALES_ORDER",
    });
  });

  it("authorizes and gets consignment by ID with SALES_ORDER:READ", async () => {
    const shipping = new FakeShipping();
    const authorization = new FakeAuthorization();

    const response = await handlers(
      shipping,
      authorization,
    ).getConsignment.handle({
      context,
      input: { consignmentId },
    });

    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data.id).toBe(consignmentId);
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "SALES_ORDER",
    });
  });

  it("authorizes and updates shipment status with SALES_ORDER:UPDATE", async () => {
    const shipping = new FakeShipping();
    const authorization = new FakeAuthorization();

    const response = await handlers(
      shipping,
      authorization,
    ).updateStatus.handle({
      context,
      input: {
        consignmentId,
        note: "Handed over to rider",
        status: "IN_TRANSIT",
      },
    });

    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data.status).toBe("IN_TRANSIT");
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "SALES_ORDER",
    });
  });

  it("rejects status update with invalid status value", async () => {
    const shipping = new FakeShipping();

    const response = await handlers(shipping).updateStatus.handle({
      context,
      input: {
        consignmentId,
        status: "INVALID_STATUS" as any,
      },
    });

    expect(response.success).toBe(false);
  });
});
