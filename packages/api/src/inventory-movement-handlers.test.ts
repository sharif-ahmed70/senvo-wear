import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type { InventoryMovementContract } from "@senvo/contracts";
import { AuthorizationError } from "@senvo/domain";
import { describe, expect, it } from "vitest";
import {
  createInventoryMovementDraftApiHandler,
  createPostInventoryMovementApiHandler,
  type ApiRequestContext,
  type InventoryMovementDraftCreationApplication,
  type InventoryMovementPostingApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const locationId = "10000000-0000-4000-8000-000000000003";
const variantId = "10000000-0000-4000-8000-000000000004";
const movementId = "10000000-0000-4000-8000-000000000005";
const requestId = "req_inventory_movement_1";

const context: ApiRequestContext = {
  authenticatedUser: { userId },
  organizationId,
  permissions: [
    { action: "CREATE", resource: "INVENTORY" },
    { action: "UPDATE", resource: "INVENTORY" },
  ],
  requestId,
};

describe("inventory movement API handlers", () => {
  it.each(["OPENING", "ISSUE", "TRANSFER", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"])(
    "rejects %s without calling the application",
    async (type) => {
      const inventory = new FakeMovementApplication();
      const handler = createInventoryMovementDraftApiHandler({
        authenticationService,
        authorizationService: new FakeAuthorization(),
        inventory,
      });
      expect(
        await handler.handle({
          context,
          input: {
            destinationLocationId: locationId,
            idempotencyKey: "receipt-scope-1",
            lines: [{ productVariantId: variantId, quantity: 5 }],
            movementNumber: "REC-SCOPE",
            occurredAt: "2026-07-03T00:00:00.000Z",
            type,
          },
        }),
      ).toMatchObject({ success: false });
      expect(inventory.context).toBeUndefined();
    },
  );

  it.each(["CREATE", "UPDATE"])(
    "preserves %s authorization denial",
    async (action) => {
      const inventory = new FakeMovementApplication();
      const authorizationService: ApplicationAuthorizationService = {
        authorize: () => Promise.reject(new AuthorizationError("Denied")),
      };
      const dependencies = {
        authenticationService,
        authorizationService,
        inventory,
      };
      const handler =
        action === "CREATE"
          ? createInventoryMovementDraftApiHandler(dependencies)
          : createPostInventoryMovementApiHandler(dependencies);
      const input =
        action === "CREATE"
          ? {
              destinationLocationId: locationId,
              idempotencyKey: "receipt-denied-1",
              lines: [{ productVariantId: variantId, quantity: 5 }],
              movementNumber: "REC-DENIED",
              occurredAt: "2026-07-03T00:00:00.000Z",
              type: "RECEIPT",
            }
          : { movementId };
      expect(await handler.handle({ context, input })).toMatchObject({
        success: false,
      });
      expect(inventory.context).toBeUndefined();
    },
  );

  it("creates movement draft with INVENTORY.CREATE and passes trusted context", async () => {
    const authorization = new FakeAuthorization();
    const inventory = new FakeMovementApplication();
    const handler = createInventoryMovementDraftApiHandler({
      authenticationService,
      authorizationService: authorization,
      inventory,
    });

    const payload = {
      destinationLocationId: locationId,
      idempotencyKey: "admin-receive:123",
      lines: [{ productVariantId: variantId, quantity: 25 }],
      movementNumber: "REC-2001",
      note: "Stock receipt",
      occurredAt: "2026-07-03T00:00:00.000Z",
      referenceId: "REC-123",
      referenceType: "ADMIN_RECEIPT",
      sourceLocationId: null,
      type: "RECEIPT" as const,
    };

    const response = await handler.handle({ context, input: payload });

    expect(response).toMatchObject({
      data: { id: movementId, status: "DRAFT" },
      requestId,
      success: true,
    });
    expect(authorization.permission).toEqual({
      action: "CREATE",
      resource: "INVENTORY",
    });
    expect(inventory.context).toMatchObject({ organizationId, userId });
    expect(inventory.payload).toEqual(payload);
  });

  it("rejects organizationId injection in movement draft payload", async () => {
    const inventory = new FakeMovementApplication();
    const handler = createInventoryMovementDraftApiHandler({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      inventory,
    });

    const response = await handler.handle({
      context,
      input: {
        destinationLocationId: locationId,
        idempotencyKey: "admin-receive:123",
        lines: [{ productVariantId: variantId, quantity: 25 }],
        movementNumber: "REC-2001",
        occurredAt: "2026-07-03T00:00:00.000Z",
        organizationId: "99999999-9999-4999-8999-999999999999",
        type: "RECEIPT",
      },
    });

    expect(response.success).toBe(false);
    expect(inventory.context).toBeUndefined();
  });

  it("posts inventory movement with INVENTORY.UPDATE and passes trusted context", async () => {
    const authorization = new FakeAuthorization();
    const inventory = new FakeMovementApplication();
    const handler = createPostInventoryMovementApiHandler({
      authenticationService,
      authorizationService: authorization,
      inventory,
    });

    const response = await handler.handle({
      context,
      input: { movementId },
    });

    expect(response).toMatchObject({
      data: { id: movementId, status: "POSTED" },
      requestId,
      success: true,
    });
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "INVENTORY",
    });
    expect(inventory.context).toMatchObject({ organizationId, userId });
    expect(inventory.payload).toEqual({ movementId });
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

class FakeAuthorization implements ApplicationAuthorizationService {
  permission?: { action: string; resource: string };

  authorize(
    _: unknown,
    permission: { action: string; resource: string },
  ): Promise<void> {
    this.permission = permission;
    return Promise.resolve();
  }
}

class FakeMovementApplication
  implements
    InventoryMovementDraftCreationApplication,
    InventoryMovementPostingApplication
{
  context?: ApplicationExecutionContext;
  payload?: unknown;

  createMovementDraft(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<InventoryMovementContract>> {
    this.context = context;
    this.payload = payload;
    return Promise.resolve({
      data: {
        id: movementId,
        movementNumber: "REC-2001",
        status: "DRAFT",
      } as InventoryMovementContract,
      ok: true,
    });
  }

  postMovement(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<InventoryMovementContract>> {
    this.context = context;
    this.payload = payload;
    return Promise.resolve({
      data: {
        id: movementId,
        movementNumber: "REC-2001",
        status: "POSTED",
      } as InventoryMovementContract,
      ok: true,
    });
  }
}
