import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type {
  PurchaseContract,
  SupplierContract,
  SupplierPaymentContract,
  SupplierLedgerEntryContract,
  SupplierBalanceSummaryContract,
} from "@senvo/contracts";
import { AuthenticationError, AuthorizationError } from "@senvo/domain";
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

  it("rejects unauthenticated requests on all purchase operations", async () => {
    const application = new FakeProcurement();
    const authentication = new FakeAuthentication();
    authentication.error = new AuthenticationError("Authentication required.");

    const purchaseHandlers = handlers(
      application,
      new FakeAuthorization(),
      authentication,
    );

    const draftRes = await purchaseHandlers.createPurchaseDraft.handle({
      context: { ...context, authenticatedUser: null },
      input: validDraftInput(),
    });
    expect(draftRes).toMatchObject({
      error: { code: "AUTHENTICATION.REQUIRED" },
      success: false,
    });

    const getRes = await purchaseHandlers.getPurchase.handle({
      context: { ...context, authenticatedUser: null },
      input: { purchaseId },
    });
    expect(getRes).toMatchObject({
      error: { code: "AUTHENTICATION.REQUIRED" },
      success: false,
    });

    const listRes = await purchaseHandlers.listPurchases.handle({
      context: { ...context, authenticatedUser: null },
      input: {},
    });
    expect(listRes).toMatchObject({
      error: { code: "AUTHENTICATION.REQUIRED" },
      success: false,
    });

    const confirmRes = await purchaseHandlers.confirmPurchase.handle({
      context: { ...context, authenticatedUser: null },
      input: { purchaseId },
    });
    expect(confirmRes).toMatchObject({
      error: { code: "AUTHENTICATION.REQUIRED" },
      success: false,
    });

    expect(application.context).toBeUndefined();
  });

  it("rejects requests missing required permissions with AUTHORIZATION.FORBIDDEN", async () => {
    const application = new FakeProcurement();
    const authorization = new FakeAuthorization();
    authorization.error = new AuthorizationError("Permission denied.");

    const purchaseHandlers = handlers(application, authorization);

    const draftRes = await purchaseHandlers.createPurchaseDraft.handle({
      context,
      input: validDraftInput(),
    });
    expect(draftRes).toMatchObject({
      error: { code: "AUTHORIZATION.FORBIDDEN" },
      success: false,
    });

    const getRes = await purchaseHandlers.getPurchase.handle({
      context,
      input: { purchaseId },
    });
    expect(getRes).toMatchObject({
      error: { code: "AUTHORIZATION.FORBIDDEN" },
      success: false,
    });

    const listRes = await purchaseHandlers.listPurchases.handle({
      context,
      input: {},
    });
    expect(listRes).toMatchObject({
      error: { code: "AUTHORIZATION.FORBIDDEN" },
      success: false,
    });

    const confirmRes = await purchaseHandlers.confirmPurchase.handle({
      context,
      input: { purchaseId },
    });
    expect(confirmRes).toMatchObject({
      error: { code: "AUTHORIZATION.FORBIDDEN" },
      success: false,
    });

    expect(application.context).toBeUndefined();
  });

  it("strictly rejects injected organizationId in purchase payloads", async () => {
    const application = new FakeProcurement();
    const purchaseHandlers = handlers(application);
    const spoofedOrg = "99999999-9999-4999-a999-999999999999";

    const draftRes = await purchaseHandlers.createPurchaseDraft.handle({
      context,
      input: {
        ...validDraftInput(),
        organizationId: spoofedOrg,
      },
    });
    expect(draftRes).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });

    const getRes = await purchaseHandlers.getPurchase.handle({
      context,
      input: {
        organizationId: spoofedOrg,
        purchaseId,
      },
    });
    expect(getRes).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });

    const listRes = await purchaseHandlers.listPurchases.handle({
      context,
      input: {
        organizationId: spoofedOrg,
      },
    });
    expect(listRes).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });

    const confirmRes = await purchaseHandlers.confirmPurchase.handle({
      context,
      input: {
        organizationId: spoofedOrg,
        purchaseId,
      },
    });
    expect(confirmRes).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });

    expect(application.context).toBeUndefined();
  });

  it("rejects invalid UUIDs and invalid input values", async () => {
    const application = new FakeProcurement();
    const purchaseHandlers = handlers(application);

    const getRes = await purchaseHandlers.getPurchase.handle({
      context,
      input: { purchaseId: "not-a-uuid" },
    });
    expect(getRes).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });

    const confirmRes = await purchaseHandlers.confirmPurchase.handle({
      context,
      input: { purchaseId: "not-a-uuid" },
    });
    expect(confirmRes).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });

    const invalidDraft = await purchaseHandlers.createPurchaseDraft.handle({
      context,
      input: {
        destinationLocationId,
        lines: [
          {
            lineNumber: 1,
            productName: "Signature Tee",
            productVariantId: variantId,
            quantity: -5,
            sku: "SKU-1",
            unitCostMinor: -100,
          },
        ],
        supplierId,
      },
    });
    expect(invalidDraft).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });

    expect(application.context).toBeUndefined();
  });

  it("maps application not found error to NOT_FOUND.RESOURCE", async () => {
    const application = new FakeProcurement();
    application.getPurchaseResult = {
      error: {
        code: "NOT_FOUND",
        message: "Purchase not found.",
        requestId: context.requestId,
        retryable: false,
      },
      ok: false,
    };

    const response = await handlers(application).getPurchase.handle({
      context,
      input: { purchaseId },
    });

    expect(response).toMatchObject({
      error: {
        code: "NOT_FOUND.RESOURCE",
        message: "Purchase not found.",
      },
      success: false,
    });
  });

  it("maps application state conflicts and business rule violations to 409 codes", async () => {
    const application = new FakeProcurement();
    application.confirmPurchaseResult = {
      error: {
        code: "CONFLICT",
        message: "Cannot confirm a purchase that is already posted.",
        requestId: context.requestId,
        retryable: false,
      },
      ok: false,
    };

    const conflictRes = await handlers(application).confirmPurchase.handle({
      context,
      input: { purchaseId },
    });

    expect(conflictRes).toMatchObject({
      error: {
        code: "CONFLICT.STATE",
        message: "Cannot confirm a purchase that is already posted.",
      },
      success: false,
    });

    application.confirmPurchaseResult = {
      error: {
        code: "BUSINESS_RULE_VIOLATION",
        message: "Cannot confirm a cancelled purchase.",
        requestId: context.requestId,
        retryable: false,
      },
      ok: false,
    };

    const ruleRes = await handlers(application).confirmPurchase.handle({
      context,
      input: { purchaseId },
    });

    expect(ruleRes).toMatchObject({
      error: {
        code: "BUSINESS_RULE.VIOLATION",
        message: "Cannot confirm a cancelled purchase.",
      },
      success: false,
    });
  });

  describe("supplier payment and ledger handlers", () => {
    it("uses PROCUREMENT.CREATE for recordSupplierPayment", async () => {
      const application = new FakeProcurement();
      const authorization = new FakeAuthorization();

      const response = await handlers(
        application,
        authorization,
      ).recordSupplierPayment.handle({
        context,
        input: {
          amountMinor: "500000",
          notes: "Advance payment",
          paymentMethod: "BANK_TRANSFER",
          reference: "REF-001",
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
        amountMinor: "500000",
        paymentMethod: "BANK_TRANSFER",
        supplierId,
      });
    });

    it("rejects invalid input on recordSupplierPayment", async () => {
      const application = new FakeProcurement();
      const response = await handlers(application).recordSupplierPayment.handle(
        {
          context,
          input: {
            amountMinor: "-500", // invalid
            paymentMethod: "INVALID_METHOD" as any,
            supplierId: "not-a-uuid",
          },
        },
      );

      expect(response).toMatchObject({
        error: { code: "VALIDATION.INVALID_INPUT" },
        success: false,
      });
      expect(application.context).toBeUndefined();
    });

    it("uses PROCUREMENT.READ for getSupplierBalance, listSupplierLedger, and listSupplierPayments", async () => {
      const application = new FakeProcurement();
      const authorization = new FakeAuthorization();

      const balanceRes = await handlers(
        application,
        authorization,
      ).getSupplierBalance.handle({
        context,
        input: { supplierId },
      });
      expect(balanceRes).toMatchObject({ success: true });
      expect(authorization.permission).toEqual({
        action: "READ",
        resource: "PROCUREMENT",
      });

      const ledgerRes = await handlers(
        application,
        authorization,
      ).listSupplierLedger.handle({
        context,
        input: { limit: 10, offset: 0, supplierId },
      });
      expect(ledgerRes).toMatchObject({ success: true });
      expect(authorization.permission).toEqual({
        action: "READ",
        resource: "PROCUREMENT",
      });

      const paymentsRes = await handlers(
        application,
        authorization,
      ).listSupplierPayments.handle({
        context,
        input: { limit: 10, offset: 0, supplierId },
      });
      expect(paymentsRes).toMatchObject({ success: true });
      expect(authorization.permission).toEqual({
        action: "READ",
        resource: "PROCUREMENT",
      });
    });
  });
});

function validDraftInput() {
  return {
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
  };
}

class FakeAuthentication implements ApplicationAuthenticationService {
  error?: Error;
  authenticate(
    request: Parameters<ApplicationAuthenticationService["authenticate"]>[0],
  ) {
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve({
      authenticatedUserId: request.userId ?? userId,
      provider: "PASSWORD" as const,
      requestId: request.requestId,
    });
  }
}

function handlers(
  procurement: FakeProcurement,
  authorizationService = new FakeAuthorization(),
  authService: ApplicationAuthenticationService = new FakeAuthentication(),
) {
  return createProcurementApiHandlers({
    authenticationService: authService,
    authorizationService,
    procurement,
  });
}

class FakeAuthorization implements ApplicationAuthorizationService {
  error?: Error;
  permission?: { action: string; resource: string };
  authorize(
    _context: ApplicationExecutionContext,
    permission: { action: string; resource: string },
  ) {
    if (this.error) {
      return Promise.reject(this.error);
    }
    this.permission = permission;
    return Promise.resolve();
  }
}

class FakeProcurement implements ProcurementApplication {
  context?: ApplicationExecutionContext;
  lastPayload?: unknown;
  getPurchaseResult?: ApplicationServiceResult<PurchaseContract>;
  confirmPurchaseResult?: ApplicationServiceResult<PurchaseContract>;

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
    if (this.getPurchaseResult) {
      this.context = context;
      this.lastPayload = payload;
      return Promise.resolve(this.getPurchaseResult);
    }
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
    if (this.confirmPurchaseResult) {
      this.context = context;
      this.lastPayload = payload;
      return Promise.resolve(this.confirmPurchaseResult);
    }
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

  recordSupplierPayment(
    context: ApplicationExecutionContext,
    payload?: unknown,
  ) {
    return this.result(
      context,
      {
        amountMinor: "500000",
        id: "33333333-3333-4333-8333-333333333333",
        paymentMethod: "CASH",
        supplierId,
      } as unknown as SupplierPaymentContract,
      payload,
    );
  }

  recordSupplierAdjustment(
    context: ApplicationExecutionContext,
    payload?: unknown,
  ) {
    return this.result(
      context,
      {
        amountMinor: "100000",
        balanceAfterMinor: "1400000",
        direction: "DEBIT",
        entryType: "RETURN_CREDIT",
        id: "77777777-7777-4777-8777-777777777777",
        organizationId,
        supplierId,
      } as unknown as SupplierLedgerEntryContract,
      payload,
    );
  }

  getSupplierBalance(context: ApplicationExecutionContext, payload?: unknown) {
    return this.result(
      context,
      {
        organizationId,
        outstandingBalanceMinor: "1500000",
        supplierId,
        totalAdjustedMinor: "0",
        totalBilledMinor: "2000000",
        totalPaidMinor: "500000",
      } as unknown as SupplierBalanceSummaryContract,
      payload,
    );
  }

  listSupplierLedger(context: ApplicationExecutionContext, payload?: unknown) {
    return this.result(
      context,
      [
        {
          amountMinor: "500000",
          balanceAfterMinor: "1500000",
          direction: "DEBIT",
          entryType: "PAYMENT",
          id: "66666666-6666-4666-8666-666666666666",
          organizationId,
          supplierId,
        } as unknown as SupplierLedgerEntryContract,
      ],
      payload,
    );
  }

  listSupplierPayments(
    context: ApplicationExecutionContext,
    payload?: unknown,
  ) {
    return this.result(
      context,
      [
        {
          amountMinor: "500000",
          id: "33333333-3333-4333-8333-333333333333",
          paymentMethod: "CASH",
          supplierId,
        } as unknown as SupplierPaymentContract,
      ],
      payload,
    );
  }
}
