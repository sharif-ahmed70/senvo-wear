import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { createCatalogApiHandlers } from "@senvo/api";
import { CatalogApplicationService } from "@senvo/application";
import {
  AuthorizationError,
  roleAllowsPermission,
  type Product,
  type ProductLifecycleRepository,
  type Role,
} from "@senvo/domain";
import { createApiSuccess } from "@senvo/contracts";
import {
  createSenvoHttpServer,
  DevelopmentAuthenticationService,
  DevelopmentHeaderRequestContextFactory,
} from "./index.js";

it("serves lifecycle routes with stale 409, role 403, immutable identifiers and tenant isolation", async () => {
  const organizationId = "10000000-0000-4000-8000-000000000001";
  const productId = "10000000-0000-4000-8000-000000000002";
  let role: Role = "OWNER";
  let product: Product = {
    id: productId,
    organizationId,
    categoryId: productId,
    name: "Original",
    slug: "fixed",
    productCode: "FIXED",
    description: null,
    status: "ACTIVE",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const authorizationService = {
    authorize: (
      _context: unknown,
      permission: Parameters<typeof roleAllowsPermission>[1],
    ) =>
      roleAllowsPermission(role, permission)
        ? Promise.resolve()
        : Promise.reject(new AuthorizationError("Denied")),
  };
  const service = new CatalogApplicationService({
    authorizationService,
    transactionManager: {
      execute: (ctx, operation) =>
        operation({
          applicationContext: ctx,
          productLifecycleRepository: {
            findLocked: (id, org) =>
              Promise.resolve(
                id === productId && org === organizationId ? product : null,
              ),
            hasHistory: () => Promise.resolve(false),
            update: (record, changes) => {
              product = {
                ...record,
                ...changes,
                updatedAt: new Date(record.updatedAt.getTime() + 1),
              };
              return Promise.resolve(product);
            },
            delete: () => Promise.resolve(),
          } satisfies ProductLifecycleRepository,
          auditWriter: { recordWithinTransaction: () => Promise.resolve() },
        } as unknown as Parameters<typeof operation>[0]),
    },
  } as ConstructorParameters<typeof CatalogApplicationService>[0]);
  const fallback = {
    handle: () => Promise.resolve(createApiSuccess(null, "test-lifecycle")),
  };
  const server = createSenvoHttpServer({
    contextFactory: new DevelopmentHeaderRequestContextFactory("test"),
    handlers: {
      createSalesOrder: fallback,
      postInventoryMovement: fallback,
      catalog: createCatalogApiHandlers({
        catalog: service,
        authorizationService,
        authenticationService: new DevelopmentAuthenticationService("test"),
      }),
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/catalog/products/${productId}`;
  const headers = {
    "content-type": "application/json",
    "x-dev-organization-id": organizationId,
    "x-dev-user-id": productId,
    "x-dev-permissions": "CATALOG:UPDATE,CATALOG:READ,CATALOG:DELETE",
  };
  const input = {
    expectedUpdatedAt: new Date(0).toISOString(),
    name: "Edited",
  };
  try {
    expect(
      (
        await fetch(url, {
          method: "PATCH",
          headers,
          body: JSON.stringify(input),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(url, {
          method: "PATCH",
          headers,
          body: JSON.stringify(input),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await fetch(url, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ ...input, slug: "changed" }),
        })
      ).status,
    ).toBe(400);
    for (const denied of ["MANAGER", "STAFF"] as const) {
      role = denied;
      expect(
        (
          await fetch(url, {
            method: "DELETE",
            headers,
            body: JSON.stringify({
              expectedUpdatedAt: product.updatedAt.toISOString(),
            }),
          })
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await fetch(`${url}/archive`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            expectedUpdatedAt: product.updatedAt.toISOString(),
          }),
        })
      ).status,
    ).toBe(403);
    role = "OWNER";
    expect(
      (
        await fetch(`${url}/deletable`, {
          headers: { ...headers, "x-dev-organization-id": productId },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${url}/archive`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            expectedUpdatedAt: product.updatedAt.toISOString(),
          }),
        })
      ).status,
    ).toBe(200);
    expect(product.status).toBe("ARCHIVED");
    expect(
      (
        await fetch(`${url}/restore`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            expectedUpdatedAt: product.updatedAt.toISOString(),
          }),
        })
      ).status,
    ).toBe(200);
    expect(product.status).toBe("ACTIVE");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
