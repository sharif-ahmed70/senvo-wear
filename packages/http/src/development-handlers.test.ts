import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ApplicationAuthenticationService,
  type ApplicationAuthorizationService,
  type ApplicationServices,
} from "@senvo/application";
import { AuthorizationError } from "@senvo/domain";
import {
  createDevelopmentApiHandlers,
  createSenvoHttpRequestListener,
  DevelopmentAuthenticationService,
  DevelopmentHeaderRequestContextFactory,
} from "./index.js";

type SuccessResponse<T> = {
  data: T;
  requestId: string;
  success: true;
};

type FailureResponse = {
  error: { code: string; message: string };
  requestId: string;
  success: false;
};

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const productId = "10000000-0000-4000-8000-000000000010";
const variantId = "10000000-0000-4000-8000-000000000020";
const barcodeId = "10000000-0000-4000-8000-000000000030";
const locationId = "10000000-0000-4000-8000-000000000040";
const categoryId = "10000000-0000-4000-8000-000000000050";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

function createMockServices(): ApplicationServices {
  const mockProduct = {
    categoryId,
    createdAt: "2026-08-01T00:00:00.000Z",
    description: "Oxford shirt",
    id: productId,
    name: "Minimalist Oxford Shirt",
    organizationId,
    productCode: "OX-101",
    season: null,
    slug: "minimalist-oxford-shirt",
    status: "ACTIVE" as const,
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  const mockVariant = {
    color: "White",
    colorId: "10000000-0000-4000-8000-000000000060",
    createdAt: "2026-08-01T00:00:00.000Z",
    id: variantId,
    organizationId,
    originalPriceMinor: 2500,
    priceMinor: 2500,
    productId: mockProduct.id,
    size: "M",
    sizeId: "10000000-0000-4000-8000-000000000070",
    sku: "OX-WHT-M",
    status: "ACTIVE" as const,
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  const mockBarcode = {
    barcode: "8941122334455",
    createdAt: "2026-08-01T00:00:00.000Z",
    format: "EAN13" as const,
    id: barcodeId,
    organizationId,
    status: "ACTIVE" as const,
    updatedAt: "2026-08-01T00:00:00.000Z",
    variantId: mockVariant.id,
  };

  function ok<T>(data: T) {
    return Promise.resolve({ data, ok: true as const });
  }

  return {
    catalog: {
      addProductMedia: () => ok({} as never),
      archiveProductMedia: () => ok(null),
      createCategory: () => ok({} as never),
      createCollection: () => ok({} as never),
      createColor: () => ok({} as never),
      createProduct: () => ok(mockProduct),
      createSize: () => ok({} as never),
      createVariant: () => ok(mockVariant),
      createVariantBarcode: () => ok(mockBarcode),
      getPrimaryProductImage: () => ok(null),
      getProduct: () =>
        ok({
          ...mockProduct,
          categories: [],
          media: [],
          primaryImage: null,
          variants: [mockVariant],
        }),
      listCategories: () => ok([]),
      listCollectionProducts: () => ok([]),
      listCollections: () => ok([]),
      listColors: () => ok([]),
      listProductMedia: () => ok([]),
      listProducts: () => ok([mockProduct]),
      listSizes: () => ok([]),
      listVariantBarcodes: () => ok([mockBarcode]),
      listVariants: () => ok([mockVariant]),
      lookupBarcode: () =>
        ok({
          barcode: mockBarcode,
          product: mockProduct,
          variant: mockVariant,
        }),
      removePrimaryProductImage: () => ok(null),
      reorderCollectionProducts: () => ok(null),
      reorderProductMedia: () => ok([]),
      setExistingPrimary: () => ok([]),
      setPrimaryProductImage: () => ok({} as never),
      updateBarcodeStatus: () => ok(mockBarcode),
      updateCategoryStatus: () => ok({} as never),
      updateColorStatus: () => ok({} as never),
      updateProductMedia: () => ok({} as never),
      updateSizeStatus: () => ok({} as never),
    } as unknown as ApplicationServices["catalog"],
    customerAuthentication: undefined,
    disconnect: () => Promise.resolve(),
    inventory: {
      getVariantAvailability: () =>
        ok({
          locations: [],
          variant: {
            color: "White",
            id: mockVariant.id,
            productId: mockProduct.id,
            productName: mockProduct.name,
            size: "M",
            sku: mockVariant.sku,
          },
        }),
      listInventoryAvailability: () =>
        ok({
          hasMore: false,
          items: [
            {
              availableToSell: 15,
              color: "White",
              id: mockVariant.id,
              locationId,
              locationName: "Main Warehouse",
              onHand: 20,
              productId: mockProduct.id,
              productName: mockProduct.name,
              reserved: 5,
              size: "M",
              sku: mockVariant.sku,
              variantId: mockVariant.id,
            },
          ],
          nextCursor: null,
        }),
      listInventoryMovements: () =>
        ok({ hasMore: false, items: [], nextCursor: null }),
      listStockLocations: () =>
        ok({
          hasMore: false,
          items: [
            {
              code: "WH-01",
              id: locationId,
              isDefault: true,
              name: "Main Warehouse",
              organizationId,
              status: "ACTIVE" as const,
            },
          ],
          nextCursor: null,
        }),
      postMovement: () => ok({} as never),
    } as unknown as ApplicationServices["inventory"],
    onlinePayments: undefined,
    organization: {
      assignTeamMemberRole: () => ok({} as never),
      createStore: () => ok({} as never),
      createTeamMember: () => ok({} as never),
      getProfile: () =>
        ok({
          code: "SENVO",
          currencyCode: "BDT",
          id: organizationId,
          name: "SENVO Wear",
          status: "ACTIVE" as const,
        }),
      listRoles: () => ok([]),
      listStores: () => ok([]),
      listTeam: () => ok([]),
      updateProfile: () => ok({} as never),
      updateStore: () => ok({} as never),
      updateStoreStatus: () => ok({} as never),
      updateTeamMemberStatus: () => ok({} as never),
    } as unknown as ApplicationServices["organization"],
    pos: {
      closeSession: () => ok({} as never),
      collectPayment: () => ok({} as never),
      createCounter: () => ok({} as never),
      createRefund: () => ok({} as never),
      createReturn: () => ok({} as never),
      getCart: () => ok({} as never),
      getCheckout: () => ok({} as never),
      getPaymentReceipt: () => ok({} as never),
      getReceipt: () => ok({} as never),
      getRefundReceipt: () => ok({} as never),
      getRefunds: () => ok({} as never),
      getReturnReceipt: () => ok({} as never),
      getReturns: () => ok({} as never),
      listCheckouts: () => ok([]),
      listCounters: () => ok([]),
      listCurrentSessions: () => ok([]),
      listSessions: () => ok([]),
      lookupSale: () => ok({} as never),
      openSession: () => ok({} as never),
      updateCounterStatus: () => ok({} as never),
    } as unknown as ApplicationServices["pos"],
    sales: {
      cancelManagedOrder: () => ok({} as never),
      confirmManagedOrder: () => ok({} as never),
      createBooth: () => ok({} as never),
      createOrder: () => ok({} as never),
      fulfillManagedOrder: () => ok({} as never),
      getManagedOrderDetails: () => ok({} as never),
      getSalesSourceSummary: () => ok({} as never),
      listBooths: () => ok([]),
      listManagedOrders: () =>
        ok({ hasMore: false, items: [], nextCursor: null }),
      listSalesBooths: () => ok([]),
      reserveManagedOrder: () => ok({} as never),
      updateSalesBoothStatus: () => ok({} as never),
    } as unknown as ApplicationServices["sales"],
    storefront: {
      checkout: () => ok({} as never),
      getProduct: () => ok({} as never),
      listCatalog: () => ok({} as never),
      paymentNotification: () => ok({} as never),
      paymentOptions: () => ok({} as never),
      paymentStatus: () => ok({} as never),
      retryPayment: () => ok({} as never),
    } as unknown as ApplicationServices["storefront"],
    workforceAuthentication: undefined,
  };
}

async function startComposedTestServer(
  permissions: string[] = [
    "CATALOG:READ",
    "INVENTORY:READ",
    "POS:READ",
    "ORGANIZATION:READ",
  ],
) {
  const authenticationService: ApplicationAuthenticationService =
    new DevelopmentAuthenticationService("development");
  const authorizationService: ApplicationAuthorizationService = {
    authorize(context, permission) {
      const allowed = context.permissions?.some(
        (candidate) =>
          candidate.action === permission.action &&
          candidate.resource === permission.resource,
      );
      return allowed
        ? Promise.resolve()
        : Promise.reject(new AuthorizationError("Permission is required."));
    },
  };

  const services = createMockServices();
  const handlers = createDevelopmentApiHandlers({
    authenticationService,
    authorizationService,
    services,
  });

  const listener = createSenvoHttpRequestListener({
    contextFactory: new DevelopmentHeaderRequestContextFactory("development"),
    handlers,
  });

  const server = createServer(listener);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const headers = new Headers({
    accept: "application/json",
    "x-dev-organization-id": organizationId,
    "x-dev-permissions": permissions.join(","),
    "x-dev-user-id": userId,
  });

  return { baseUrl, headers };
}

describe("Development server composed API routing", () => {
  it("resolves authenticated authorized catalog products and product details", async () => {
    const { baseUrl, headers } = await startComposedTestServer();

    const listRes = await fetch(`${baseUrl}/catalog/products`, { headers });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as SuccessResponse<
      Array<{ name: string }>
    >;
    expect(listBody.success).toBe(true);
    expect(listBody.data[0]?.name).toBe("Minimalist Oxford Shirt");

    const detailRes = await fetch(`${baseUrl}/catalog/products/${productId}`, {
      headers,
    });
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as SuccessResponse<{
      name: string;
      variants: Array<{ sku: string }>;
    }>;
    expect(detailBody.data.name).toBe("Minimalist Oxford Shirt");
    expect(detailBody.data.variants[0]?.sku).toBe("OX-WHT-M");
  });

  it("enforces permission security on catalog routes when unpermitted", async () => {
    const { baseUrl, headers } = await startComposedTestServer([
      "INVENTORY:READ",
    ]);

    const res = await fetch(`${baseUrl}/catalog/products`, { headers });
    expect(res.status).toBe(403);
    const body = (await res.json()) as FailureResponse;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTHORIZATION.FORBIDDEN");
  });

  it("resolves variant barcodes and barcode lookup used by Barcode workspace", async () => {
    const { baseUrl, headers } = await startComposedTestServer();

    const barcodesRes = await fetch(
      `${baseUrl}/catalog/variants/${variantId}/barcodes`,
      { headers },
    );
    expect(barcodesRes.status).toBe(200);
    const barcodesBody = (await barcodesRes.json()) as SuccessResponse<
      Array<{ barcode: string }>
    >;
    expect(barcodesBody.data[0]?.barcode).toBe("8941122334455");

    const lookupRes = await fetch(
      `${baseUrl}/catalog/barcodes/lookup/8941122334455`,
      { headers },
    );
    expect(lookupRes.status).toBe(200);
    const lookupBody = (await lookupRes.json()) as SuccessResponse<{
      product: { name: string };
      variant: { sku: string };
    }>;
    expect(lookupBody.data.product.name).toBe("Minimalist Oxford Shirt");
    expect(lookupBody.data.variant.sku).toBe("OX-WHT-M");
  });

  it("resolves inventory availability, locations, and movements used by Inventory workspace", async () => {
    const { baseUrl, headers } = await startComposedTestServer();

    const availRes = await fetch(
      `${baseUrl}/inventory/availability?pageSize=10`,
      { headers },
    );
    expect(availRes.status).toBe(200);
    const availBody = (await availRes.json()) as SuccessResponse<{
      items: Array<{ availableToSell: number; sku: string }>;
    }>;
    expect(availBody.data.items[0]?.sku).toBe("OX-WHT-M");
    expect(availBody.data.items[0]?.availableToSell).toBe(15);

    const locRes = await fetch(`${baseUrl}/inventory/locations`, { headers });
    expect(locRes.status).toBe(200);
    const locBody = (await locRes.json()) as SuccessResponse<{
      items: Array<{ name: string }>;
    }>;
    expect(locBody.data.items[0]?.name).toBe("Main Warehouse");

    const moveRes = await fetch(`${baseUrl}/inventory/movements`, { headers });
    expect(moveRes.status).toBe(200);
    const moveBody = (await moveRes.json()) as SuccessResponse<{
      items: unknown[];
    }>;
    expect(moveBody.data.items).toEqual([]);
  });

  it("returns 404 for unknown endpoints", async () => {
    const { baseUrl, headers } = await startComposedTestServer();

    const res = await fetch(`${baseUrl}/unknown/endpoint`, { headers });
    expect(res.status).toBe(404);
    const body = (await res.json()) as FailureResponse;
    expect(body.error.code).toBe("NOT_FOUND.ROUTE");
  });
});
