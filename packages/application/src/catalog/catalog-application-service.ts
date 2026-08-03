import {
  ApplicationError,
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  NotFoundError,
  ValidationApplicationError,
  createCategory,
  createVariantBarcode,
  createCollection,
  createColor,
  createProduct,
  createProductVariant,
  createSize,
  listVariantBarcodes,
  lookupVariantByBarcode,
  updateBarcodeStatus,
  type BarcodeRepository,
  type BarcodeLookupResult,
  type Category,
  type CatalogCategoryManagementRepository,
  type CatalogCollectionManagementRepository,
  type CatalogColorManagementRepository,
  type CatalogProductManagementRepository,
  type CatalogProductVariantManagementRepository,
  type CatalogSizeManagementRepository,
  type Collection,
  type Color,
  type OrganizationRepository,
  type Product,
  type ProductVariant,
  type Size,
  type VariantBarcode,
} from "@senvo/domain";
import {
  categoryContractSchema,
  barcodeLookupContractSchema,
  collectionContractSchema,
  colorContractSchema,
  createCategoryServiceInputSchema,
  createVariantBarcodeServiceInputSchema,
  createCollectionServiceInputSchema,
  createColorServiceInputSchema,
  createProductServiceInputSchema,
  createProductVariantServiceInputSchema,
  createSizeServiceInputSchema,
  getProductServiceInputSchema,
  listCatalogItemsServiceInputSchema,
  listProductVariantsServiceInputSchema,
  listVariantBarcodesServiceInputSchema,
  lookupBarcodeServiceInputSchema,
  productContractSchema,
  productDetailsContractSchema,
  productVariantContractSchema,
  sizeContractSchema,
  updateBarcodeStatusServiceInputSchema,
  variantBarcodeContractSchema,
  type BarcodeLookupContract,
  updateCategoryStatusServiceInputSchema,
  updateColorStatusServiceInputSchema,
  updateSizeStatusServiceInputSchema,
  type CategoryContract,
  type CollectionContract,
  type ColorContract,
  type CreateCategoryServiceInputContract,
  type CreateCollectionServiceInputContract,
  type CreateColorServiceInputContract,
  type CreateProductServiceInputContract,
  type CreateProductVariantServiceInputContract,
  type CreateSizeServiceInputContract,
  type GetProductServiceInputContract,
  type ListCatalogItemsServiceInputContract,
  type ListProductVariantsServiceInputContract,
  type ProductContract,
  type ProductDetailsContract,
  type ProductVariantContract,
  type SizeContract,
  type VariantBarcodeContract,
  type UpdateCategoryStatusServiceInputContract,
  type UpdateColorStatusServiceInputContract,
  type UpdateSizeStatusServiceInputContract,
} from "@senvo/contracts";
import {
  requireAuthorization,
  type ApplicationAuthorizationService,
} from "../context/authorization.js";
import {
  validateExecutionContext,
  type ApplicationExecutionContext,
  type ValidatedApplicationExecutionContext,
} from "../context/execution-context.js";
import {
  ApplicationServiceError,
  ValidationApplicationServiceError,
  type ApplicationServiceResult,
} from "../errors/application-error.js";

type SafeParseSchema<T> = {
  safeParse(input: unknown):
    | { data: T; success: true }
    | {
        error: { issues: Array<{ message: string; path: PropertyKey[] }> };
        success: false;
      };
};

export type CatalogApplicationServiceDependencies = {
  authorizationService?: ApplicationAuthorizationService;
  barcodes: BarcodeRepository;
  categories: CatalogCategoryManagementRepository;
  collections: CatalogCollectionManagementRepository;
  colors: CatalogColorManagementRepository;
  organizations: OrganizationRepository;
  products: CatalogProductManagementRepository;
  productVariants: CatalogProductVariantManagementRepository;
  requestIdGenerator?: () => string;
  sizes: CatalogSizeManagementRepository;
};

export class CatalogApplicationService {
  private readonly barcodes: BarcodeRepository;
  private readonly authorizationService?: ApplicationAuthorizationService;
  private readonly categories: CatalogCategoryManagementRepository;
  private readonly collections: CatalogCollectionManagementRepository;
  private readonly colors: CatalogColorManagementRepository;
  private readonly organizations: OrganizationRepository;
  private readonly products: CatalogProductManagementRepository;
  private readonly productVariants: CatalogProductVariantManagementRepository;
  private readonly requestIdGenerator: () => string;
  private readonly sizes: CatalogSizeManagementRepository;

  constructor(dependencies: CatalogApplicationServiceDependencies) {
    this.barcodes = dependencies.barcodes;
    this.authorizationService = dependencies.authorizationService;
    this.categories = dependencies.categories;
    this.collections = dependencies.collections;
    this.colors = dependencies.colors;
    this.organizations = dependencies.organizations;
    this.products = dependencies.products;
    this.productVariants = dependencies.productVariants;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => crypto.randomUUID());
    this.sizes = dependencies.sizes;
  }

  listCategories(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CategoryContract[]>> {
    return this.execute(context, async (validated) => {
      parsePayload(listCatalogItemsServiceInputSchema, payload);
      await this.authorize(validated, "READ");
      const records = await this.categories.list({
        organizationId: validated.organizationId,
      });
      return records.map(mapCategory);
    });
  }

  createCategory(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CategoryContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(createCategoryServiceInputSchema, payload);
      await this.authorize(validated, "CREATE");
      return mapCategory(
        await createCategory(
          {
            categories: this.categories,
            organizations: this.organizations,
          },
          { ...input, organizationId: validated.organizationId },
        ),
      );
    });
  }

  updateCategoryStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CategoryContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        updateCategoryStatusServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "UPDATE");
      const category = await this.categories.updateStatus({
        id: input.categoryId,
        organizationId: validated.organizationId,
        status: input.status,
      });
      if (!category) {
        throw new NotFoundError("Category was not found.");
      }
      return mapCategory(category);
    });
  }

  listCollections(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CollectionContract[]>> {
    return this.execute(context, async (validated) => {
      parsePayload(listCatalogItemsServiceInputSchema, payload);
      await this.authorize(validated, "READ");
      const records = await this.collections.list({
        organizationId: validated.organizationId,
      });
      return records.map(mapCollection);
    });
  }

  createCollection(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CollectionContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(createCollectionServiceInputSchema, payload);
      await this.authorize(validated, "CREATE");
      return mapCollection(
        await createCollection(
          {
            collections: this.collections,
            organizations: this.organizations,
          },
          { ...input, organizationId: validated.organizationId },
        ),
      );
    });
  }

  listColors(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ColorContract[]>> {
    return this.execute(context, async (validated) => {
      parsePayload(listCatalogItemsServiceInputSchema, payload);
      await this.authorize(validated, "READ");
      const records = await this.colors.list({
        organizationId: validated.organizationId,
      });
      return records.map(mapColor);
    });
  }

  createColor(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ColorContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(createColorServiceInputSchema, payload);
      await this.authorize(validated, "CREATE");
      return mapColor(
        await createColor(
          {
            colors: this.colors,
            organizations: this.organizations,
          },
          { ...input, organizationId: validated.organizationId },
        ),
      );
    });
  }

  updateColorStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ColorContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(updateColorStatusServiceInputSchema, payload);
      await this.authorize(validated, "UPDATE");
      const color = await this.colors.updateStatus({
        id: input.colorId,
        organizationId: validated.organizationId,
        status: input.status,
      });
      if (!color) {
        throw new NotFoundError("Color was not found.");
      }
      return mapColor(color);
    });
  }

  listSizes(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SizeContract[]>> {
    return this.execute(context, async (validated) => {
      parsePayload(listCatalogItemsServiceInputSchema, payload);
      await this.authorize(validated, "READ");
      const records = await this.sizes.list({
        organizationId: validated.organizationId,
      });
      return records.map(mapSize);
    });
  }

  createSize(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SizeContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(createSizeServiceInputSchema, payload);
      await this.authorize(validated, "CREATE");
      return mapSize(
        await createSize(
          {
            organizations: this.organizations,
            sizes: this.sizes,
          },
          { ...input, organizationId: validated.organizationId },
        ),
      );
    });
  }

  updateSizeStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SizeContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(updateSizeStatusServiceInputSchema, payload);
      await this.authorize(validated, "UPDATE");
      const size = await this.sizes.updateStatus({
        id: input.sizeId,
        organizationId: validated.organizationId,
        status: input.status,
      });
      if (!size) {
        throw new NotFoundError("Size was not found.");
      }
      return mapSize(size);
    });
  }

  listProducts(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductContract[]>> {
    return this.execute(context, async (validated) => {
      parsePayload(listCatalogItemsServiceInputSchema, payload);
      await this.authorize(validated, "READ");
      const records = await this.products.list({
        organizationId: validated.organizationId,
      });
      return records.map(mapProduct);
    });
  }

  createProduct(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductContract>> {
    return this.execute(context, async (validated) => {
      const { collectionId, ...input } = parsePayload(
        createProductServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "CREATE");
      if (
        collectionId &&
        !(await this.collections.findById(
          collectionId,
          validated.organizationId,
        ))
      ) {
        throw new NotFoundError("Collection was not found.");
      }
      const product = await createProduct(
        {
          categories: this.categories,
          organizations: this.organizations,
          products: this.products,
        },
        { ...input, organizationId: validated.organizationId },
      );
      if (collectionId) {
        await this.products.assignCollection({
          collectionId,
          organizationId: validated.organizationId,
          productId: product.id,
        });
      }
      return mapProduct(product);
    });
  }

  getProduct(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductDetailsContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(getProductServiceInputSchema, payload);
      await this.authorize(validated, "READ");
      const product = await this.products.findById(
        input.productId,
        validated.organizationId,
      );
      if (!product) {
        throw new NotFoundError("Product was not found.");
      }
      return productDetailsContractSchema.parse({
        collectionIds: await this.products.listCollectionIds(
          validated.organizationId,
          product.id,
        ),
        product: mapProduct(product),
        variants: (
          await this.productVariants.listByProduct(
            validated.organizationId,
            product.id,
          )
        ).map(mapVariant),
      });
    });
  }

  listVariants(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductVariantContract[]>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        listProductVariantsServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "READ");
      const product = await this.products.findById(
        input.productId,
        validated.organizationId,
      );
      if (!product) {
        throw new NotFoundError("Product was not found.");
      }
      return (
        await this.productVariants.listByProduct(
          validated.organizationId,
          product.id,
        )
      ).map(mapVariant);
    });
  }

  createVariant(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductVariantContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        createProductVariantServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "CREATE");
      return mapVariant(
        await createProductVariant(
          {
            colors: this.colors,
            products: this.products,
            productVariants: this.productVariants,
            sizes: this.sizes,
          },
          { ...input, organizationId: validated.organizationId },
        ),
      );
    });
  }

  listVariantBarcodes(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<VariantBarcodeContract[]>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        listVariantBarcodesServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "READ");
      return (
        await listVariantBarcodes(this.barcodes, {
          organizationId: validated.organizationId,
          productVariantId: input.variantId,
        })
      ).map(mapBarcode);
    });
  }

  createVariantBarcode(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<VariantBarcodeContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        createVariantBarcodeServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "CREATE");
      return mapBarcode(
        await createVariantBarcode(this.barcodes, {
          organizationId: validated.organizationId,
          productVariantId: input.variantId,
          type: input.type,
          value: input.value,
        }),
      );
    });
  }

  updateBarcodeStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<VariantBarcodeContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        updateBarcodeStatusServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "UPDATE");
      return mapBarcode(
        await updateBarcodeStatus(this.barcodes, {
          barcodeId: input.barcodeId,
          organizationId: validated.organizationId,
          status: input.status,
        }),
      );
    });
  }

  lookupBarcode(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<BarcodeLookupContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(lookupBarcodeServiceInputSchema, payload);
      await this.authorize(validated, "READ");
      return mapBarcodeLookup(
        await lookupVariantByBarcode(this.barcodes, {
          organizationId: validated.organizationId,
          value: input.value,
        }),
      );
    });
  }

  private authorize(
    context: ValidatedApplicationExecutionContext,
    action: "CREATE" | "READ" | "UPDATE",
  ): Promise<void> {
    return requireAuthorization(this.authorizationService, context, {
      action,
      resource: "CATALOG",
    });
  }

  private async execute<T>(
    rawContext: ApplicationExecutionContext,
    action: (context: ValidatedApplicationExecutionContext) => Promise<T>,
  ): Promise<ApplicationServiceResult<T>> {
    const context = {
      ...rawContext,
      requestId: rawContext.requestId || this.requestIdGenerator(),
    };
    try {
      return {
        data: await action(validateExecutionContext(context)),
        ok: true,
      };
    } catch (error) {
      return {
        error: normalizeError(error).toShape(context.requestId),
        ok: false,
      };
    }
  }
}

function parsePayload<T>(schema: SafeParseSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }
  const issue = parsed.error.issues.at(0);
  throw new ValidationApplicationServiceError(
    issue
      ? `${issue.path.join(".") || "payload"}: ${issue.message}`
      : "Input is invalid.",
  );
}

function normalizeError(error: unknown): ApplicationServiceError {
  if (error instanceof ApplicationServiceError) return error;
  if (error instanceof ValidationApplicationError)
    return new ApplicationServiceError({
      code: "VALIDATION_ERROR",
      message: "Input is invalid.",
    });
  if (error instanceof AuthorizationError)
    return new ApplicationServiceError({
      code: "FORBIDDEN",
      message: "You are not allowed to perform this action.",
    });
  if (error instanceof NotFoundError)
    return new ApplicationServiceError({
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    });
  if (error instanceof ConcurrencyError)
    return new ApplicationServiceError({
      code: "CONCURRENCY_CONFLICT",
      message: "The resource changed. Please retry.",
      retryable: true,
    });
  if (error instanceof ConflictError)
    return new ApplicationServiceError({
      code: "CONFLICT",
      message: "The request conflicts with the current state.",
    });
  if (error instanceof BusinessRuleError)
    return new ApplicationServiceError({
      code: "BUSINESS_RULE_VIOLATION",
      message: "The request cannot be completed.",
    });
  return new ApplicationServiceError({
    code:
      error instanceof ApplicationError ? "INTERNAL_ERROR" : "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  });
}

function mapCategory(record: Category): CategoryContract {
  return categoryContractSchema.parse(mapRecord(record));
}

function mapCollection(record: Collection): CollectionContract {
  return collectionContractSchema.parse(mapRecord(record));
}

function mapColor(record: Color): ColorContract {
  return colorContractSchema.parse(mapRecord(record));
}

function mapSize(record: Size): SizeContract {
  return sizeContractSchema.parse(mapRecord(record));
}

function mapProduct(record: Product): ProductContract {
  return productContractSchema.parse(mapRecord(record));
}

function mapVariant(record: ProductVariant): ProductVariantContract {
  return productVariantContractSchema.parse(mapRecord(record));
}

function mapBarcode(record: VariantBarcode): VariantBarcodeContract {
  return variantBarcodeContractSchema.parse(mapRecord(record));
}

function mapBarcodeLookup(record: BarcodeLookupResult): BarcodeLookupContract {
  return barcodeLookupContractSchema.parse({
    ...record,
    barcode: mapBarcode(record.barcode),
  });
}

function mapRecord<T extends { createdAt: Date; updatedAt: Date }>(
  record: T,
): Omit<T, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
} {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export type {
  CreateCategoryServiceInputContract,
  CreateCollectionServiceInputContract,
  CreateColorServiceInputContract,
  CreateProductServiceInputContract,
  CreateProductVariantServiceInputContract,
  CreateSizeServiceInputContract,
  GetProductServiceInputContract,
  ListCatalogItemsServiceInputContract,
  ListProductVariantsServiceInputContract,
  UpdateCategoryStatusServiceInputContract,
  UpdateColorStatusServiceInputContract,
  UpdateSizeStatusServiceInputContract,
};
