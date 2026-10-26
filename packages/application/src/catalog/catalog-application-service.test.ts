import {
  ConflictError,
  defaultRolePermissions,
  type Product,
  type ProductLifecycleRepository,
} from "@senvo/domain";
import type { ApplicationTransactionContext } from "../context/transaction.js";
import {
  AuthorizationError,
  type CatalogProductVariantManagementRepository,
  type ProductVariant,
} from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import { colorContractSchema } from "@senvo/contracts";
import type {
  CatalogColorManagementRepository,
  CatalogListFilter,
  Color,
} from "@senvo/domain";
import type { ApplicationExecutionContext } from "../context/execution-context.js";
import { CatalogApplicationService } from "./catalog-application-service.js";

const organizationId = "11111111-1111-4111-8111-111111111111";

const context: ApplicationExecutionContext = {
  actorId: "77777777-7777-4777-8777-777777777777",
  actorType: "INTERNAL",
  authenticationState: "AUTHENTICATED",
  organizationId,
  role: "ADMIN",
  requestId: "req_catalog_test_1",
  source: "ADMIN",
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

class InMemoryColorRepository implements CatalogColorManagementRepository {
  public receivedFilter: CatalogListFilter | null = null;
  public records: Color[] = [];

  list(filter: CatalogListFilter): Promise<Color[]> {
    this.receivedFilter = filter;
    return Promise.resolve(this.records);
  }

  create(): Promise<Color> {
    throw new Error("create is not implemented in stub");
  }

  findByCode(): Promise<Color | null> {
    throw new Error("findByCode is not implemented in stub");
  }

  findById(): Promise<Color | null> {
    throw new Error("findById is not implemented in stub");
  }

  findByNormalizedName(): Promise<Color | null> {
    throw new Error("findByNormalizedName is not implemented in stub");
  }

  updateStatus(): Promise<Color | null> {
    throw new Error("updateStatus is not implemented in stub");
  }
}

function createFailFastStub<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      throw new Error(`Unexpected call to ${name}.${String(prop)}`);
    },
  });
}

function createService(colorsRepo: CatalogColorManagementRepository) {
  return new CatalogApplicationService({
    barcodes: createFailFastStub("barcodes"),
    categories: createFailFastStub("categories"),
    collections: createFailFastStub("collections"),
    colors: colorsRepo,
    organizations: createFailFastStub("organizations"),
    products: createFailFastStub("products"),
    productVariants: createFailFastStub("productVariants"),
    sizes: createFailFastStub("sizes"),
  });
}

describe("CatalogApplicationService colors", () => {
  it("persisted color with hex #112233", async () => {
    const colorRepo = new InMemoryColorRepository();
    const service = createService(colorRepo);

    const fixtureRecord: Color = {
      code: "CLR-HEX",
      createdAt: new Date("2026-09-15T12:00:00.000Z"),
      hexValue: "#112233",
      id: "10000000-0000-4000-8000-000000000001",
      name: "Test Color Hex",
      normalizedName: "test color",
      organizationId,
      status: "ACTIVE",
      updatedAt: new Date("2026-09-15T12:30:00.000Z"),
    };

    colorRepo.records = [fixtureRecord];
    const fixtureSnapshot = JSON.stringify(fixtureRecord);

    const result = await service.listColors(context, {});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected listColors to succeed");

    expect(result.data).toHaveLength(1);
    const color = result.data[0];
    expect(color).toBeDefined();
    if (!color) throw new Error("Expected color to be defined");

    const parsed = colorContractSchema.parse(color);

    const publicKeys = Object.keys(color).sort();
    const expectedKeys = [
      "code",
      "createdAt",
      "hexValue",
      "id",
      "name",
      "organizationId",
      "status",
      "updatedAt",
    ].sort();
    expect(publicKeys).toEqual(expectedKeys);

    expect(color).not.toHaveProperty("normalizedName");
    expect("normalizedName" in (color as Record<string, unknown>)).toBe(false);

    expect(parsed.hexValue).toBe("#112233");
    expect(typeof parsed.createdAt).toBe("string");
    expect(new Date(parsed.createdAt).toISOString()).toBe(parsed.createdAt);
    expect(typeof parsed.updatedAt).toBe("string");
    expect(new Date(parsed.updatedAt).toISOString()).toBe(parsed.updatedAt);

    expect(colorRepo.receivedFilter?.organizationId).toBe(organizationId);
    expect(JSON.stringify(fixtureRecord)).toBe(fixtureSnapshot);
    expect(fixtureRecord.normalizedName).toBe("test color");
  });

  it("persisted color with hexValue null", async () => {
    const colorRepo = new InMemoryColorRepository();
    const service = createService(colorRepo);

    const fixtureRecord: Color = {
      code: "CLR-NULL",
      createdAt: new Date("2026-09-15T12:00:00.000Z"),
      hexValue: null,
      id: "10000000-0000-4000-8000-000000000002",
      name: "Test Color Null Hex",
      normalizedName: "test color",
      organizationId,
      status: "ACTIVE",
      updatedAt: new Date("2026-09-15T12:30:00.000Z"),
    };

    colorRepo.records = [fixtureRecord];
    const fixtureSnapshot = JSON.stringify(fixtureRecord);

    const result = await service.listColors(context, {});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected listColors to succeed");

    expect(result.data).toHaveLength(1);
    const color = result.data[0];
    expect(color).toBeDefined();
    if (!color) throw new Error("Expected color to be defined");

    const parsed = colorContractSchema.parse(color);

    const publicKeys = Object.keys(color).sort();
    const expectedKeys = [
      "code",
      "createdAt",
      "hexValue",
      "id",
      "name",
      "organizationId",
      "status",
      "updatedAt",
    ].sort();
    expect(publicKeys).toEqual(expectedKeys);

    expect(color).not.toHaveProperty("normalizedName");
    expect("normalizedName" in (color as Record<string, unknown>)).toBe(false);

    expect(parsed.hexValue).toBeNull();
    expect(typeof parsed.createdAt).toBe("string");
    expect(new Date(parsed.createdAt).toISOString()).toBe(parsed.createdAt);
    expect(typeof parsed.updatedAt).toBe("string");
    expect(new Date(parsed.updatedAt).toISOString()).toBe(parsed.updatedAt);

    expect(colorRepo.receivedFilter?.organizationId).toBe(organizationId);
    expect(JSON.stringify(fixtureRecord)).toBe(fixtureSnapshot);
    expect(fixtureRecord.normalizedName).toBe("test color");
  });

  it("empty repository list", async () => {
    const colorRepo = new InMemoryColorRepository();
    const service = createService(colorRepo);

    colorRepo.records = [];

    const result = await service.listColors(context, {});

    expect(result).toEqual({ ok: true, data: [] });
    expect(colorRepo.receivedFilter?.organizationId).toBe(organizationId);
  });
});

describe("CatalogApplicationService variant pricing", () => {
  const variantId = "10000000-0000-4000-8000-000000000001";
  const input = {
    variantId,
    sellingPriceMinor: 12550,
    expectedSellingPriceMinor: 0,
  };
  function setup(deny = false) {
    const record: ProductVariant = {
      id: variantId,
      organizationId,
      productId: variantId,
      colorId: variantId,
      sizeId: variantId,
      sku: "PRICE-SKU",
      sellingPriceMinor: 12550,
      status: "ACTIVE",
      createdAt: new Date("2026-09-26T00:00:00Z"),
      updatedAt: new Date("2026-09-26T00:00:00Z"),
    };
    const updatePrice = vi.fn().mockResolvedValue(record);
    const authorize = vi
      .fn()
      .mockImplementation(() =>
        deny
          ? Promise.reject(new AuthorizationError("Denied"))
          : Promise.resolve(),
      );
    const service = new CatalogApplicationService({
      authorizationService: { authorize },
      barcodes: createFailFastStub("barcodes"),
      categories: createFailFastStub("categories"),
      collections: createFailFastStub("collections"),
      colors: createFailFastStub("colors"),
      organizations: createFailFastStub("organizations"),
      products: createFailFastStub("products"),
      sizes: createFailFastStub("sizes"),
      productVariants: {
        updatePrice,
      } as unknown as CatalogProductVariantManagementRepository,
    });
    return { service, updatePrice, authorize };
  }
  it("authorizes UPDATE and maps the saved price using the authenticated organization", async () => {
    const { service, updatePrice, authorize } = setup();
    const result = await service.updateVariantPrice(context, input);
    expect(result).toMatchObject({
      ok: true,
      data: { sellingPriceMinor: 12550 },
    });
    expect(updatePrice).toHaveBeenCalledWith({ ...input, organizationId });
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      { action: "UPDATE", resource: "CATALOG" },
    );
  });
  it("rejects authorization failure before persistence", async () => {
    const { service, updatePrice } = setup(true);
    expect((await service.updateVariantPrice(context, input)).ok).toBe(false);
    expect(updatePrice).not.toHaveBeenCalled();
  });
  it("rejects a client organization override", async () => {
    const { service, updatePrice } = setup();
    expect(
      (
        await service.updateVariantPrice(context, {
          ...input,
          organizationId: variantId,
        })
      ).ok,
    ).toBe(false);
    expect(updatePrice).not.toHaveBeenCalled();
  });
  it("keeps other organizations scoped and returns a conflict on a failed comparison", async () => {
    const { service, updatePrice } = setup();
    updatePrice.mockResolvedValue(null);
    const result = await service.updateVariantPrice(
      { ...context, organizationId: variantId },
      input,
    );
    expect(updatePrice).toHaveBeenCalledWith({
      ...input,
      organizationId: variantId,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});

describe("CatalogApplicationService barcode lookup", () => {
  it("returns only contract fields when the repository adds POS-only data", async () => {
    const variantId = "20000000-0000-4000-8000-000000000002";
    const lookupActive = vi.fn().mockResolvedValue({
      barcode: {
        createdAt: new Date("2026-10-23T00:00:00Z"),
        id: "30000000-0000-4000-8000-000000000003",
        organizationId,
        productVariantId: variantId,
        status: "ACTIVE",
        type: "CODE128",
        updatedAt: new Date("2026-10-23T00:00:00Z"),
        value: "290922352796",
      },
      color: "Blue",
      productName: "US-Polo Shirt",
      // Selling price and variant status are for POS; the strict catalog
      // contract rejected them, so every scan failed with a 500.
      sellingPriceMinor: 40000,
      size: "XL",
      sku: "SHI-0001-BLUE-XL",
      variantId,
      variantStatus: "ACTIVE",
    });
    const service = new CatalogApplicationService({
      authorizationService: { authorize: () => Promise.resolve() },
      barcodes: { lookupActive } as never,
      categories: createFailFastStub("categories"),
      collections: createFailFastStub("collections"),
      colors: createFailFastStub("colors"),
      organizations: createFailFastStub("organizations"),
      products: createFailFastStub("products"),
      productVariants: createFailFastStub("productVariants"),
      sizes: createFailFastStub("sizes"),
    });

    const result = await service.lookupBarcode(context, {
      value: "290922352796",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        barcode: expect.objectContaining({ value: "290922352796" }) as unknown,
        color: "Blue",
        productName: "US-Polo Shirt",
        size: "XL",
        sku: "SHI-0001-BLUE-XL",
        variantId,
      },
    });
    expect(lookupActive).toHaveBeenCalledWith(organizationId, "290922352796");
  });
});

describe("product lifecycle", () => {
  const productId = "11111111-1111-4111-8111-111111111112";
  function setup(history = false) {
    let product: Product | null = {
      id: productId,
      organizationId,
      categoryId: productId,
      name: "Original",
      description: null,
      productCode: "FIXED",
      slug: "fixed",
      status: "ACTIVE",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const audit = vi.fn().mockResolvedValue(undefined);
    const repo: ProductLifecycleRepository = {
      findLocked: (id, org) =>
        Promise.resolve(
          product?.id === id && product.organizationId === org ? product : null,
        ),
      hasHistory: () => Promise.resolve(history),
      update: (record, changes) => {
        product = {
          ...record,
          ...changes,
          updatedAt: new Date(record.updatedAt.getTime() + 1),
        };
        return Promise.resolve(product);
      },
      delete: () => {
        if (history)
          return Promise.reject(
            new ConflictError("This product has history. Archive it instead."),
          );
        product = null;
        return Promise.resolve();
      },
    };
    const service = new CatalogApplicationService({
      barcodes: createFailFastStub("barcodes"),
      categories: createFailFastStub("categories"),
      collections: createFailFastStub("collections"),
      colors: createFailFastStub("colors"),
      organizations: createFailFastStub("organizations"),
      products: createFailFastStub("products"),
      productVariants: createFailFastStub("variants"),
      sizes: createFailFastStub("sizes"),
      authorizationService: {
        authorize: (ctx, permission) =>
          defaultRolePermissions.some(
            (grant) =>
              grant.role === ctx.role &&
              grant.resource === permission.resource &&
              grant.action === permission.action,
          )
            ? Promise.resolve()
            : Promise.reject(new AuthorizationError("Denied")),
      },
      transactionManager: {
        execute: (ctx, operation) =>
          operation({
            applicationContext: ctx,
            productLifecycleRepository: repo,
            auditWriter: { recordWithinTransaction: audit },
          } as unknown as ApplicationTransactionContext),
      },
    });
    return { service, audit, read: () => product };
  }
  const input = { productId, expectedUpdatedAt: new Date(0).toISOString() };
  it("edits only permitted metadata and rejects a stale edit", async () => {
    const { service, audit, read } = setup();
    expect(
      await service.editProduct(context, {
        ...input,
        name: "Updated",
        description: "Text",
      }),
    ).toMatchObject({
      ok: true,
      data: { name: "Updated", slug: "fixed", productCode: "FIXED" },
    });
    expect(
      await service.editProduct(context, { ...input, name: "Stale" }),
    ).toMatchObject({ ok: false, error: { code: "CONCURRENCY_CONFLICT" } });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PRODUCT_UPDATED",
        resourceId: productId,
      }),
    );
    expect(read()?.name).toBe("Updated");
  });
  it("rejects editing immutable fields", async () => {
    expect(
      await setup().service.editProduct(context, {
        ...input,
        name: "x",
        slug: "new",
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
  it("archives and restores with a fresh token", async () => {
    const { service, read } = setup();
    expect(await service.archiveProduct(context, input)).toMatchObject({
      ok: true,
      data: { status: "ARCHIVED" },
    });
    expect(
      await service.restoreProduct(context, {
        ...input,
        expectedUpdatedAt: read()!.updatedAt.toISOString(),
      }),
    ).toMatchObject({ ok: true, data: { status: "ACTIVE" } });
  });
  it("blocks history and deletes a clean product with audit", async () => {
    expect(
      await setup(true).service.deleteProduct(context, input),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "This product has history. Archive it instead.",
      },
    });
    const { service, read, audit } = setup();
    expect(await service.deleteProduct(context, input)).toEqual({
      ok: true,
      data: null,
    });
    expect(read()).toBeNull();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PRODUCT_DELETED" }),
    );
  });
  it.each(["MANAGER", "STAFF"] as const)("denies %s deletion", async (role) => {
    expect(
      await setup().service.deleteProduct({ ...context, role }, input),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
  it("denies STAFF edits/archive and isolates other tenants", async () => {
    const { service, audit } = setup();
    expect(
      await service.archiveProduct({ ...context, role: "STAFF" }, input),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(
      await service.editProduct(
        { ...context, role: "STAFF" },
        { ...input, name: "x" },
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const other = { ...context, organizationId: productId };
    expect(await service.deleteProduct(other, input)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(
      await service.getProductDeletable(other, { productId }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("product option (variant) lifecycle", () => {
  const variantId = "11111111-1111-4111-8111-111111111113";
  function setup(actorRole: "OWNER" | "ADMIN" = "OWNER", history = false) {
    let variant: ProductVariant | null = {
      colorId: variantId,
      createdAt: new Date(0),
      id: variantId,
      organizationId,
      productId: variantId,
      sellingPriceMinor: 1000,
      sizeId: variantId,
      sku: "TEE-BLK-M",
      status: "ACTIVE",
      updatedAt: new Date(0),
    };
    const audit = vi.fn().mockResolvedValue(undefined);
    const repo = {
      findVariantLocked: (id: string, org: string) =>
        Promise.resolve(
          variant?.id === id && variant.organizationId === org ? variant : null,
        ),
      updateVariantStatus: (
        record: ProductVariant,
        status: ProductVariant["status"],
      ) => {
        variant = {
          ...record,
          status,
          updatedAt: new Date(record.updatedAt.getTime() + 1),
        };
        return Promise.resolve(variant);
      },
      deleteVariant: () => {
        if (history)
          return Promise.reject(
            new ConflictError(
              "This option has stock or sales history. Archive it instead.",
            ),
          );
        variant = null;
        return Promise.resolve();
      },
      actorRole: () => Promise.resolve(actorRole),
    } as unknown as ProductLifecycleRepository;
    const service = new CatalogApplicationService({
      barcodes: createFailFastStub("barcodes"),
      categories: createFailFastStub("categories"),
      collections: createFailFastStub("collections"),
      colors: createFailFastStub("colors"),
      organizations: createFailFastStub("organizations"),
      products: createFailFastStub("products"),
      productVariants: createFailFastStub("variants"),
      sizes: createFailFastStub("sizes"),
      authorizationService: {
        authorize: (ctx, permission) =>
          defaultRolePermissions.some(
            (grant) =>
              grant.role === ctx.role &&
              grant.resource === permission.resource &&
              grant.action === permission.action,
          )
            ? Promise.resolve()
            : Promise.reject(new AuthorizationError("Denied")),
      },
      transactionManager: {
        execute: (ctx, operation) =>
          operation({
            applicationContext: ctx,
            productLifecycleRepository: repo,
            auditWriter: { recordWithinTransaction: audit },
          } as unknown as ApplicationTransactionContext),
      },
    });
    return { service, audit, read: () => variant };
  }
  const input = { variantId, expectedUpdatedAt: new Date(0).toISOString() };

  it("archives and restores one option with an audit entry", async () => {
    const { service, audit, read } = setup();
    expect(await service.archiveVariant(context, input)).toMatchObject({
      ok: true,
      data: { status: "ARCHIVED", sku: "TEE-BLK-M" },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PRODUCT_VARIANT_ARCHIVED",
        resource: "PRODUCT_VARIANT",
        resourceId: variantId,
      }),
    );
    expect(
      await service.restoreVariant(context, {
        ...input,
        expectedUpdatedAt: read()!.updatedAt.toISOString(),
      }),
    ).toMatchObject({ ok: true, data: { status: "ACTIVE" } });
  });

  it("rejects a stale archive and denies STAFF", async () => {
    const { service } = setup();
    await service.archiveVariant(context, input);
    expect(await service.archiveVariant(context, input)).toMatchObject({
      ok: false,
      error: { code: "CONCURRENCY_CONFLICT" },
    });
    expect(
      await setup().service.archiveVariant(
        { ...context, role: "STAFF" },
        input,
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("lets only the owner delete, and only without history", async () => {
    const admin = setup("ADMIN");
    expect(await admin.service.deleteVariant(context, input)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(admin.read()).not.toBeNull();

    expect(
      await setup("OWNER", true).service.deleteVariant(context, input),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    const owner = setup("OWNER");
    expect(await owner.service.deleteVariant(context, input)).toEqual({
      ok: true,
      data: null,
    });
    expect(owner.read()).toBeNull();
    expect(owner.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PRODUCT_VARIANT_DELETED" }),
    );
  });
});
