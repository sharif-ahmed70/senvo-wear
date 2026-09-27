import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type { PurchaseContract, SupplierContract } from "@senvo/contracts";
import { describe, expect, it } from "vitest";
import {
  createProcurementApiHandlers,
  type ApiRequestContext,
  type ProcurementApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const supplierId = "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa";
const destinationLocationId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const variantId = "cccccccc-cccc-4ccc-bccc-cccccccccccc";
const purchaseId = "dddddddd-dddd-4ddd-bddd-dddddddddddd";

const context: ApiRequestContext = {
  authenticatedUser: { userId },
  organizationId,
  permissions: [
    { action: "CREATE", resource: "PROCUREMENT" },
    { action: "READ", resource: "PROCUREMENT" },
    { action: "UPDATE", resource: "PROCUREMENT" },
  ],
  requestId: "req_procurement_123",
};

describe("procurement API handlers", () => {
  it("uses PROCUREMENT.CREATE with trusted organization context", async () => {
    const application = new FakeProcurement();
    const authorization = new FakeAuthorization();
    const response = await handlers(
      application,
      authorization,
    ).createSupplier.handle({
      context,
      input: {
        address: "Babubazar, Dhaka",
        code: "SUP-001",
        contactPerson: "Rahim Chowdhury",
        email: "rahim@supplier.test",
        name: "Babubazar Textiles",
        phone: "+8801711000000",
      },
    });

    expect(response).toMatchObject({ success: true });
    expect(authorization.permission).toEqual({
      action: "CREATE",
      resource: "PROCUREMENT",
    });
    expect(application.context).toMatchObject({ organizationId, userId });
  });

  it("rejects invalid input on createSupplier", async () => {
    const application = new FakeProcurement();
    const response = await handlers(application).createSupplier.handle({
      context,
      input: {
        code: "INVALID CODE WITH SPACES",
        name: "",
      },
    });

    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(application.context).toBeUndefined();
  });

  it("uses PROCUREMENT.READ for getSupplier and listSuppliers", async () => {
    const application = new FakeProcurement();
    const authorization = new FakeAuthorization();

    const getResponse = await handlers(
      application,
      authorization,
    ).getSupplier.handle({
      context,
      input: { supplierId },
    });
    expect(getResponse).toMatchObject({ success: true });
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "PROCUREMENT",
    });

    const listResponse = await handlers(
      application,
      authorization,
    ).listSuppliers.handle({
      context,
      input: { search: "Babubazar", status: "ACTIVE" },
    });
    expect(listResponse).toMatchObject({ success: true });
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "PROCUREMENT",
    });
  });

  it("uses PROCUREMENT.UPDATE for updateSupplier and deactivateSupplier", async () => {
    const application = new FakeProcurement();
    const authorization = new FakeAuthorization();

    const updateResponse = await handlers(
      application,
      authorization,
    ).updateSupplier.handle({
      context,
      input: {
        name: "Updated Name",
        supplierId,
      },
    });
    expect(updateResponse).toMatchObject({ success: true });
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "PROCUREMENT",
    });

    const deactivateResponse = await handlers(
      application,
      authorization,
    ).deactivateSupplier.handle({
      context,
      input: { supplierId },
    });
    expect(deactivateResponse).toMatchObject({ success: true });
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "PROCUREMENT",
    });
  });

  it("uses PROCUREMENT.CREATE for createPurchaseDraft", async () => {
    const application = new FakeProcurement();
    const authorization = new FakeAuthorization();

    const response = await handlers(
      application,
      authorization,
    ).createPurchaseDraft.handle({
      context,
      input: {
        destinationLocationId,
        lines: [
          {
            lineNumber: 1,
            productName: "Signature Heavyweight Tee",
            productVariantId: variantId,
            quantity: 50,
            sku: "SHT-BLK-XL",
            unitCostMinor: 45000,
            variantName: "Black / XL",
          },
        ],
        supplierId,
      },
    });

    expect(response).toMatchObject({ success: true });
    expect(authorization.permission).toEqual({
      action: "CREATE",
      resource: "PROCUREMENT",
    });
    expect(application.context).toMatchObject({ organizationId, userId });
    expect(application.lastPayload).toMatchObject({
      destinationLocationId,
      supplierId,
    });
  });

  it("rejects invalid input on createPurchaseDraft", async () => {
    const application = new FakeProcurement();
    const response = await handlers(application).createPurchaseDraft.handle({
      context,
      input: {
        destinationLocationId,
        lines: [
          {
            productName: "Tee",
            productVariantId: variantId,
            quantity: 0, // invalid: must be > 0
            sku: "SKU-1",
            unitCostMinor: -100, // invalid: must be >= 0
          },
        ],
        supplierId,
      },
    });

    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(application.context).toBeUndefined();
  });

  it("uses PROCUREMENT.READ for getPurchase and listPurchases", async () => {
    const application = new FakeProcurement();
    const authorization = new FakeAuthorization();

    const getResponse = await handlers(
      application,
      authorization,
    ).getPurchase.handle({
      context,
      input: { purchaseId },
    });
    expect(getResponse).toMatchObject({ success: true });
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "PROCUREMENT",
    });
    expect(application.lastPayload).toEqual({ purchaseId });

    const listResponse = await handlers(
      application,
      authorization,
    ).listPurchases.handle({
      context,
      input: { limit: 10, offset: 0, status: "DRAFT", supplierId },
    });
    expect(listResponse).toMatchObject({ success: true });
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "PROCUREMENT",
    });
    expect(application.lastPayload).toEqual({
      limit: 10,
      offset: 0,
      status: "DRAFT",
      supplierId,
    });
  });

  it("uses PROCUREMENT.UPDATE for confirmPurchase", async () => {
    const application = new FakeProcurement();
    const authorization = new FakeAuthorization();

    const response = await handlers(
      application,
      authorization,
    ).confirmPurchase.handle({
      context,
      input: {
        idempotencyKey: "idem_confirm_123",
        purchaseId,
      },
    });

    expect(response).toMatchObject({ success: true });
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "PROCUREMENT",
    });
    expect(application.context).toMatchObject({ organizationId, userId });
    expect(application.lastPayload).toEqual({
      idempotencyKey: "idem_confirm_123",
      purchaseId,
    });
  });
});

const authenticationService: ApplicationAuthenticationService = {
  authenticate: (request) =>
    Promise.resolve({
      authenticatedUserId: request.userId ?? userId,
      provider: "PASSWORD",
      requestId: request.requestId,
    }),
};

function handlers(
  procurement: FakeProcurement,
  authorizationService = new FakeAuthorization(),
) {
  return createProcurementApiHandlers({
    authenticationService,
    authorizationService,
    procurement,
  });
}

class FakeAuthorization implements ApplicationAuthorizationService {
  permission?: { action: string; resource: string };
  authorize(
    _context: ApplicationExecutionContext,
    permission: { action: string; resource: string },
  ) {
    this.permission = permission;
    return Promise.resolve();
  }
}

class FakeProcurement implements ProcurementApplication {
  context?: ApplicationExecutionContext;
  lastPayload?: unknown;

  private result<T>(
    context: ApplicationExecutionContext,
    data: T,
    payload?: unknown,
  ) {
    this.context = context;
    this.lastPayload = payload;
    return Promise.resolve<ApplicationServiceResult<T>>({ data, ok: true });
  }

  createSupplier(context: ApplicationExecutionContext, payload?: unknown) {
    return this.result(
      context,
      { id: supplierId } as SupplierContract,
      payload,
    );
  }

  deactivateSupplier(context: ApplicationExecutionContext, payload?: unknown) {
    return this.result(
      context,
      {
        id: supplierId,
        status: "INACTIVE",
      } as SupplierContract,
      payload,
    );
  }

  getSupplier(context: ApplicationExecutionContext, payload?: unknown) {
    return this.result(
      context,
      { id: supplierId } as SupplierContract,
      payload,
    );
  }

  listSuppliers(context: ApplicationExecutionContext, payload?: unknown) {
    return this.result(
      context,
      [{ id: supplierId }] as SupplierContract[],
      payload,
    );
  }

  updateSupplier(context: ApplicationExecutionContext, payload?: unknown) {
    return this.result(
      context,
      { id: supplierId } as SupplierContract,
      payload,
    );
  }

  createPurchaseDraft(context: ApplicationExecutionContext, payload?: unknown) {
    return this.result(
      context,
      {
        id: purchaseId,
        lines: [],
        organizationId,
        status: "DRAFT",
        supplierId,
      } as unknown as PurchaseContract,
      payload,
    );
  }

  getPurchase(context: ApplicationExecutionContext, payload?: unknown) {
    return this.result(
      context,
      {
        id: purchaseId,
        lines: [],
        organizationId,
        status: "DRAFT",
        supplierId,
      } as unknown as PurchaseContract,
      payload,
    );
  }

  listPurchases(context: ApplicationExecutionContext, payload?: unknown) {
    return this.result(
      context,
      [
        {
          id: purchaseId,
          lines: [],
          organizationId,
          status: "DRAFT",
          supplierId,
        } as unknown as PurchaseContract,
      ],
      payload,
    );
  }

  confirmPurchase(context: ApplicationExecutionContext, payload?: unknown) {
    return this.result(
      context,
      {
        id: purchaseId,
        lines: [],
        organizationId,
        receiptMovementId: "mov-123",
        status: "POSTED",
        supplierId,
      } as unknown as PurchaseContract,
      payload,
    );
  }
}
