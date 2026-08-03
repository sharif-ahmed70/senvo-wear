import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type {
  BarcodeLookupContract,
  CategoryContract,
  CollectionContract,
  ColorContract,
  ProductContract,
  ProductDetailsContract,
  ProductVariantContract,
  SizeContract,
  VariantBarcodeContract,
} from "@senvo/contracts";
import { AuthorizationError } from "@senvo/domain";
import { describe, expect, it } from "vitest";
import {
  createCatalogApiHandlers,
  type ApiRequestContext,
  type CatalogManagementApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const requestId = "req_catalog_gateway_1";
const context: ApiRequestContext = {
  authenticatedUser: { userId },
  organizationId,
  permissions: [{ action: "READ", resource: "CATALOG" }],
  requestId,
};

describe("catalog API handlers", () => {
  it("enforces barcode permissions and rejects trusted-field injection", async () => {
    const authorization = new FakeAuthorization();
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: authorization,
      catalog,
    });

    const created = await handlers.createVariantBarcode.handle({
      context,
      input: {
        type: "INTERNAL",
        value: "  sku-black-l  ",
        variantId: "10000000-0000-4000-8000-000000000010",
      },
    });
    expect(created.success).toBe(true);
    expect(authorization.permission).toEqual({
      action: "CREATE",
      resource: "CATALOG",
    });

    const rejected = await handlers.createVariantBarcode.handle({
      context,
      input: {
        organizationId,
        permissions: [],
        type: "INTERNAL",
        value: "SKU-BLACK-L",
        variantId: "10000000-0000-4000-8000-000000000010",
      },
    });
    expect(rejected).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
  });

  it("validates barcode lookup input before calling the application", async () => {
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      catalog,
    });
    const response = await handlers.lookupBarcode.handle({
      context,
      input: { value: "" },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(catalog.payloads).toEqual([]);
  });
  it("enforces CATALOG.READ and passes trusted organization context", async () => {
    const authorization = new FakeAuthorization();
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: authorization,
      catalog,
    });

    const response = await handlers.listProducts.handle({
      context,
      input: {},
    });

    expect(response).toMatchObject({ data: [], requestId, success: true });
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "CATALOG",
    });
    expect(catalog.context).toMatchObject({ organizationId, userId });
  });

  it("rejects organizationId injection before calling the application", async () => {
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      catalog,
    });

    const response = await handlers.createCategory.handle({
      context,
      input: {
        name: "Shirts",
        organizationId: "20000000-0000-4000-8000-000000000001",
        slug: "shirts",
      },
    });

    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(catalog.context).toBeUndefined();
  });

  it("returns a safe forbidden response", async () => {
    const authorization = new FakeAuthorization();
    authorization.reject = true;
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: authorization,
      catalog: new FakeCatalog(),
    });

    const response = await handlers.listCategories.handle({
      context,
      input: {},
    });

    expect(response).toEqual({
      error: {
        code: "AUTHORIZATION.FORBIDDEN",
        message: "You are not allowed to perform this action.",
      },
      requestId,
      success: false,
    });
  });

  it("validates color hex values before calling the application", async () => {
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      catalog,
    });

    const response = await handlers.createColor.handle({
      context,
      input: { code: "navy", hexValue: "navy", name: "Navy" },
    });

    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(catalog.context).toBeUndefined();
  });

  it("requires color hex values before calling the application", async () => {
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      catalog,
    });

    const response = await handlers.createColor.handle({
      context,
      input: { code: "navy", name: "Navy" },
    });

    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(catalog.context).toBeUndefined();
  });

  it("accepts valid color and size creation inputs", async () => {
    const authorization = new FakeAuthorization();
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: authorization,
      catalog,
    });

    const colorResponse = await handlers.createColor.handle({
      context,
      input: { code: "navy", hexValue: "#000080", name: "Navy" },
    });
    const sizeResponse = await handlers.createSize.handle({
      context,
      input: { code: "xl", name: "Extra Large", sortOrder: 40 },
    });

    expect(colorResponse.success).toBe(true);
    expect(sizeResponse.success).toBe(true);
    expect(authorization.permission).toEqual({
      action: "CREATE",
      resource: "CATALOG",
    });
    expect(catalog.payloads).toEqual([
      { code: "navy", hexValue: "#000080", name: "Navy" },
      { code: "xl", name: "Extra Large", sortOrder: 40 },
    ]);
    expect(catalog.context).toMatchObject({ organizationId, userId });
  });

  it("rejects invalid size sort order before calling the application", async () => {
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      catalog,
    });

    const response = await handlers.createSize.handle({
      context,
      input: { code: "xl", name: "Extra Large", sortOrder: -1 },
    });

    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(catalog.context).toBeUndefined();
  });

  it("maps duplicate attribute conflicts to a safe API failure", async () => {
    const catalog = new FakeCatalog();
    catalog.rejectColorAsDuplicate = true;
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      catalog,
    });

    const response = await handlers.createColor.handle({
      context,
      input: { code: "BLACK", hexValue: "#000000", name: "Black" },
    });

    expect(response).toEqual({
      error: {
        code: "CONFLICT.STATE",
        message: "Color code already exists.",
      },
      requestId,
      success: false,
    });
  });

  it("uses CATALOG.UPDATE for organization-scoped size status changes", async () => {
    const authorization = new FakeAuthorization();
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: authorization,
      catalog,
    });

    const response = await handlers.updateSizeStatus.handle({
      context,
      input: {
        sizeId: "30000000-0000-4000-8000-000000000001",
        status: "INACTIVE",
      },
    });

    expect(response.success).toBe(true);
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "CATALOG",
    });
    expect(catalog.context).toMatchObject({ organizationId, userId });
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
  reject = false;

  authorize(
    _context: ApplicationExecutionContext,
    permission: { action: string; resource: string },
  ) {
    this.permission = permission;
    if (this.reject) {
      return Promise.reject(new AuthorizationError("Denied."));
    }
    return Promise.resolve();
  }
}

class FakeCatalog implements CatalogManagementApplication {
  context?: ApplicationExecutionContext;
  payloads: unknown[] = [];
  rejectColorAsDuplicate = false;

  private success<T>(context: ApplicationExecutionContext, data: T) {
    this.context = context;
    return Promise.resolve<ApplicationServiceResult<T>>({ data, ok: true });
  }

  createCategory(context: ApplicationExecutionContext) {
    return this.success(context, {} as CategoryContract);
  }
  createVariantBarcode(context: ApplicationExecutionContext, payload: unknown) {
    this.payloads.push(payload);
    return this.success(context, {} as VariantBarcodeContract);
  }
  createCollection(context: ApplicationExecutionContext) {
    return this.success(context, {} as CollectionContract);
  }
  createColor(context: ApplicationExecutionContext, payload: unknown) {
    this.context = context;
    this.payloads.push(payload);
    if (this.rejectColorAsDuplicate) {
      return Promise.resolve<ApplicationServiceResult<ColorContract>>({
        error: {
          code: "CONFLICT",
          message: "Color code already exists.",
          requestId,
          retryable: false,
        },
        ok: false,
      });
    }
    return this.success(context, {} as ColorContract);
  }
  createSize(context: ApplicationExecutionContext, payload: unknown) {
    this.payloads.push(payload);
    return this.success(context, {} as SizeContract);
  }
  createProduct(context: ApplicationExecutionContext) {
    return this.success(context, {} as ProductContract);
  }
  createVariant(context: ApplicationExecutionContext) {
    return this.success(context, {} as ProductVariantContract);
  }
  getProduct(context: ApplicationExecutionContext) {
    return this.success(context, {} as ProductDetailsContract);
  }
  listCategories(context: ApplicationExecutionContext) {
    return this.success(context, [] as CategoryContract[]);
  }
  listCollections(context: ApplicationExecutionContext) {
    return this.success(context, [] as CollectionContract[]);
  }
  listColors(context: ApplicationExecutionContext) {
    return this.success(context, [] as ColorContract[]);
  }
  listProducts(context: ApplicationExecutionContext) {
    return this.success(context, [] as ProductContract[]);
  }
  listSizes(context: ApplicationExecutionContext) {
    return this.success(context, [] as SizeContract[]);
  }
  listVariants(context: ApplicationExecutionContext) {
    return this.success(context, [] as ProductVariantContract[]);
  }
  listVariantBarcodes(context: ApplicationExecutionContext, payload: unknown) {
    this.payloads.push(payload);
    return this.success(context, [] as VariantBarcodeContract[]);
  }
  lookupBarcode(context: ApplicationExecutionContext, payload: unknown) {
    this.payloads.push(payload);
    return this.success(context, {} as BarcodeLookupContract);
  }
  updateBarcodeStatus(context: ApplicationExecutionContext, payload: unknown) {
    this.payloads.push(payload);
    return this.success(context, {} as VariantBarcodeContract);
  }
  updateCategoryStatus(context: ApplicationExecutionContext) {
    return this.success(context, {} as CategoryContract);
  }
  updateColorStatus(context: ApplicationExecutionContext) {
    return this.success(context, {} as ColorContract);
  }
  updateSizeStatus(context: ApplicationExecutionContext) {
    return this.success(context, {} as SizeContract);
  }
}
