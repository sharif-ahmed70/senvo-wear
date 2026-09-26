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
  PrimaryProductImageContract,
  ProductMediaContract,
  ProductVariantContract,
  SizeContract,
  VariantBarcodeContract,
} from "@senvo/contracts";
import { AuthenticationError, AuthorizationError } from "@senvo/domain";
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
  it("protects variant price updates and passes trusted context", async () => {
    const authorization = new FakeAuthorization();
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: authorization,
      catalog,
    });
    const input = {
      variantId: "10000000-0000-4000-8000-000000000010",
      sellingPriceMinor: 12550,
      expectedSellingPriceMinor: 0,
    };
    expect(
      (await handlers.updateVariantPrice.handle({ context, input })).success,
    ).toBe(true);
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "CATALOG",
    });
    expect(catalog.context?.organizationId).toBe(organizationId);
    expect(catalog.payloads).toEqual([input]);
    authorization.reject = true;
    expect(
      await handlers.updateVariantPrice.handle({ context, input }),
    ).toMatchObject({
      success: false,
      error: { code: "AUTHORIZATION.FORBIDDEN" },
    });
    expect(catalog.payloads).toHaveLength(1);
  });
  it.each([
    { sellingPriceMinor: -1 },
    { sellingPriceMinor: 12.5 },
    { organizationId },
  ])("rejects invalid price payload %j", async (invalid) => {
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      catalog,
    });
    expect(
      await handlers.updateVariantPrice.handle({
        context,
        input: {
          variantId: "10000000-0000-4000-8000-000000000010",
          sellingPriceMinor: 12550,
          expectedSellingPriceMinor: 0,
          ...invalid,
        },
      }),
    ).toMatchObject({
      success: false,
      error: { code: "VALIDATION.INVALID_INPUT" },
    });
    expect(catalog.payloads).toHaveLength(0);
  });
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

  it("rejects a client-provided storage key before the media use case", async () => {
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      catalog,
    });
    const response = await handlers.setPrimaryProductImage.handle({
      context,
      input: {
        altText: "Black shirt",
        contentBase64: "iVBORw0KGgo=",
        contentType: "image/png",
        idempotencyKey: "media-request-101",
        productId: "30000000-0000-4000-8000-000000000001",
        storageKey: "client/chosen/path.png",
      },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      requestId,
      success: false,
    });
    expect(catalog.payloads).toHaveLength(0);
  });

  it("rejects unsupported primary image MIME before the use case", async () => {
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      catalog,
    });
    const response = await handlers.setPrimaryProductImage.handle({
      context,
      input: {
        altText: "Black shirt",
        contentBase64: "R0lGODlh",
        contentType: "image/gif",
        idempotencyKey: "media-request-unsupported",
        productId: "30000000-0000-4000-8000-000000000001",
      },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(catalog.payloads).toHaveLength(0);
  });

  it("returns a safe authentication error for a primary image write", async () => {
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService: {
        authenticate: () =>
          Promise.reject(new AuthenticationError("Missing identity.")),
      },
      authorizationService: new FakeAuthorization(),
      catalog,
    });
    const response = await handlers.setPrimaryProductImage.handle({
      context: { ...context, authenticatedUser: null },
      input: {
        altText: "Black shirt",
        contentBase64: "iVBORw0KGgo=",
        contentType: "image/png",
        idempotencyKey: "media-request-unauthorized",
        productId: "30000000-0000-4000-8000-000000000001",
      },
    });
    expect(response).toEqual({
      error: {
        code: "AUTHENTICATION.REQUIRED",
        message: "Authentication is required.",
      },
      requestId,
      success: false,
    });
    expect(catalog.payloads).toHaveLength(0);
  });

  it("enforces CATALOG.UPDATE for primary image changes", async () => {
    const authorization = new FakeAuthorization();
    authorization.reject = true;
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: authorization,
      catalog: new FakeCatalog(),
    });
    const response = await handlers.setPrimaryProductImage.handle({
      context,
      input: {
        altText: "Black shirt",
        contentBase64: "iVBORw0KGgo=",
        contentType: "image/png",
        idempotencyKey: "media-request-102",
        productId: "30000000-0000-4000-8000-000000000001",
      },
    });
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "CATALOG",
    });
    expect(response).toMatchObject({
      error: { code: "AUTHORIZATION.FORBIDDEN" },
      success: false,
    });
  });

  it("passes only normalized media input and trusted context", async () => {
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      catalog,
    });
    await handlers.setPrimaryProductImage.handle({
      context,
      input: {
        altText: "Black shirt",
        contentBase64: "iVBORw0KGgo=",
        contentType: "image/png",
        idempotencyKey: "media-request-103",
        productId: "30000000-0000-4000-8000-000000000001",
      },
    });
    expect(catalog.context).toMatchObject({ organizationId, userId });
    expect(catalog.payloads.at(-1)).not.toHaveProperty("organizationId");
  });

  it("validates complete duplicate-free gallery reorder input", async () => {
    const catalog = new FakeCatalog();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: new FakeAuthorization(),
      catalog,
    });
    const linkId = "30000000-0000-4000-8000-000000000002";
    const response = await handlers.reorderProductMedia.handle({
      context,
      input: {
        linkIds: [linkId, linkId],
        productId: "30000000-0000-4000-8000-000000000001",
      },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(catalog.payloads).toHaveLength(0);
  });

  it("enforces CATALOG.UPDATE and strips trusted fields for gallery uploads", async () => {
    const catalog = new FakeCatalog();
    const authorization = new FakeAuthorization();
    const handlers = createCatalogApiHandlers({
      authenticationService,
      authorizationService: authorization,
      catalog,
    });
    const response = await handlers.addProductMedia.handle({
      context,
      input: {
        altText: "Black shirt side",
        contentBase64: "iVBORw0KGgo=",
        contentType: "image/png",
        idempotencyKey: "media-gallery-api-001",
        organizationId,
        productId: "30000000-0000-4000-8000-000000000001",
      },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(authorization.permission).toBeUndefined();
    expect(catalog.payloads).toHaveLength(0);
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
  updateVariantPrice(context: ApplicationExecutionContext, payload: unknown) {
    this.payloads.push(payload);
    return this.success(context, {} as ProductVariantContract);
  }
  createVariant(context: ApplicationExecutionContext) {
    return this.success(context, {} as ProductVariantContract);
  }
  getProduct(context: ApplicationExecutionContext) {
    return this.success(context, {} as ProductDetailsContract);
  }
  getPrimaryProductImage(context: ApplicationExecutionContext) {
    return this.success(context, null as PrimaryProductImageContract | null);
  }
  setPrimaryProductImage(
    context: ApplicationExecutionContext,
    payload: unknown,
  ) {
    this.payloads.push(payload);
    return this.success(context, {} as PrimaryProductImageContract);
  }
  removePrimaryProductImage(context: ApplicationExecutionContext) {
    return this.success(context, null);
  }
  listProductMedia(context: ApplicationExecutionContext) {
    return this.success(context, [] as ProductMediaContract[]);
  }
  addProductMedia(context: ApplicationExecutionContext, payload: unknown) {
    this.payloads.push(payload);
    return this.success(context, {} as ProductMediaContract);
  }
  setExistingPrimary(context: ApplicationExecutionContext, payload: unknown) {
    this.payloads.push(payload);
    return this.success(context, [] as ProductMediaContract[]);
  }
  reorderProductMedia(context: ApplicationExecutionContext, payload: unknown) {
    this.payloads.push(payload);
    return this.success(context, [] as ProductMediaContract[]);
  }
  updateProductMedia(context: ApplicationExecutionContext, payload: unknown) {
    this.payloads.push(payload);
    return this.success(context, {} as ProductMediaContract);
  }
  archiveProductMedia(context: ApplicationExecutionContext, payload: unknown) {
    this.payloads.push(payload);
    return this.success(context, null);
  }
  reorderCollectionProducts(
    context: ApplicationExecutionContext,
    payload: unknown,
  ) {
    this.payloads.push(payload);
    return this.success(context, null);
  }
  listCollectionProducts(context: ApplicationExecutionContext) {
    return this.success(context, [] as string[]);
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
