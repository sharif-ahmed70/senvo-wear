import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type { SupplierContract } from "@senvo/contracts";
import { describe, expect, it } from "vitest";
import {
  createProcurementApiHandlers,
  type ApiRequestContext,
  type ProcurementApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const supplierId = "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa";

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

  private result<T>(context: ApplicationExecutionContext, data: T) {
    this.context = context;
    return Promise.resolve<ApplicationServiceResult<T>>({ data, ok: true });
  }

  createSupplier(context: ApplicationExecutionContext) {
    return this.result(context, { id: supplierId } as SupplierContract);
  }

  deactivateSupplier(context: ApplicationExecutionContext) {
    return this.result(context, {
      id: supplierId,
      status: "INACTIVE",
    } as SupplierContract);
  }

  getSupplier(context: ApplicationExecutionContext) {
    return this.result(context, { id: supplierId } as SupplierContract);
  }

  listSuppliers(context: ApplicationExecutionContext) {
    return this.result(context, [{ id: supplierId }] as SupplierContract[]);
  }

  updateSupplier(context: ApplicationExecutionContext) {
    return this.result(context, { id: supplierId } as SupplierContract);
  }
}
