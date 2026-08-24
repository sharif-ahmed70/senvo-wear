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
  reorderCollectionProductsServiceInputSchema,
  listCollectionProductsServiceInputSchema,
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
  updateProductServiceInputSchema,
  updateProductVariantServiceInputSchema,
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
  type PrimaryProductImageContract,
  type ProductMediaContract,
  type AddProductMediaServiceInputContract,
  type ProductMediaLinkServiceInputContract,
  type ReorderProductMediaServiceInputContract,
  type UpdateProductMediaServiceInputContract,
  type ReorderCollectionProductsServiceInputContract,
  type ListCollectionProductsServiceInputContract,
  type RemovePrimaryProductImageServiceInputContract,
  type SetPrimaryProductImageServiceInputContract,
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
import type { CatalogMediaApplicationService } from "./catalog-media-application-service.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";

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
  mediaService?: CatalogMediaApplicationService;
  organizations: OrganizationRepository;
  products: CatalogProductManagementRepository;
  productVariants: CatalogProductVariantManagementRepository;
  requestIdGenerator?: () => string;
  sizes: CatalogSizeManagementRepository;
  transactionManager?: ApplicationTransactionManager;
};

export class CatalogApplicationService {
  private readonly barcodes: BarcodeRepository;
  private readonly authorizationService?: ApplicationAuthorizationService;
  private readonly categories: CatalogCategoryManagementRepository;
  private readonly collections: CatalogCollectionManagementRepository;
  private readonly colors: CatalogColorManagementRepository;
  private readonly mediaService?: CatalogMediaApplicationService;
  private readonly organizations: OrganizationRepository;
  private readonly products: CatalogProductManagementRepository;
  private readonly productVariants: CatalogProductVariantManagementRepository;
  private readonly requestIdGenerator: () => string;
  private readonly sizes: CatalogSizeManagementRepository;
  private readonly transactionManager?: ApplicationTransactionManager;

  constructor(dependencies: CatalogApplicationServiceDependencies) {
    this.barcodes = dependencies.barcodes;
    this.authorizationService = dependencies.authorizationService;
    this.categories = dependencies.categories;
    this.collections = dependencies.collections;
    this.colors = dependencies.colors;
    this.mediaService = dependencies.mediaService;
    this.organizations = dependencies.organizations;
    this.products = dependencies.products;
    this.productVariants = dependencies.productVariants;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => crypto.randomUUID());
    this.sizes = dependencies.sizes;
    this.transactionManager = dependencies.transactionManager;
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

  updateProduct(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(updateProductServiceInputSchema, payload);
      await this.authorize(validated, "UPDATE");
      const category = await this.categories.findById(
        input.categoryId,
        validated.organizationId,
      );
      if (!category) throw new NotFoundError("Category was not found.");
      const product = await this.products.update({
        brand: input.brand?.trim() || null,
        categoryId: input.categoryId,
        description: input.description?.trim() || null,
        id: input.productId,
        name: input.name.trim(),
        organizationId: validated.organizationId,
        status: input.status,
      });
      if (!product) throw new NotFoundError("Product was not found.");
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
      const primaryImage = this.mediaService
        ? await this.mediaService.readProjection(
            validated.organizationId,
            product.id,
          )
        : null;
      const media = this.mediaService
        ? await this.mediaService.readMediaProjection(
            validated.organizationId,
            product.id,
          )
        : [];
      return productDetailsContractSchema.parse({
        collectionIds: await this.products.listCollectionIds(
          validated.organizationId,
          product.id,
        ),
        media,
        primaryImage,
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

  updateVariant(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductVariantContract>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        updateProductVariantServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "UPDATE");
      const variant = await this.productVariants.update({
        costPriceMinor: input.costPriceMinor,
        id: input.variantId,
        organizationId: validated.organizationId,
        sellingPriceMinor: input.sellingPriceMinor,
        status: input.status,
      });
      if (!variant) throw new NotFoundError("Product variant was not found.");
      return mapVariant(variant);
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

  getPrimaryProductImage(
    context: ApplicationExecutionContext,
    payload: RemovePrimaryProductImageServiceInputContract,
  ): Promise<ApplicationServiceResult<PrimaryProductImageContract | null>> {
    return this.mediaService
      ? this.mediaService.getPrimaryProductImage(context, payload)
      : Promise.resolve(mediaNotConfigured(context.requestId));
  }

  listProductMedia(
    context: ApplicationExecutionContext,
    payload: RemovePrimaryProductImageServiceInputContract,
  ): Promise<ApplicationServiceResult<ProductMediaContract[]>> {
    return this.mediaService
      ? this.mediaService.listProductMedia(context, payload)
      : Promise.resolve(mediaNotConfigured(context.requestId));
  }

  addProductMedia(
    context: ApplicationExecutionContext,
    payload: AddProductMediaServiceInputContract,
  ): Promise<ApplicationServiceResult<ProductMediaContract>> {
    return this.mediaService
      ? this.mediaService.addProductMedia(context, payload)
      : Promise.resolve(mediaNotConfigured(context.requestId));
  }

  setExistingPrimary(
    context: ApplicationExecutionContext,
    payload: ProductMediaLinkServiceInputContract,
  ): Promise<ApplicationServiceResult<ProductMediaContract[]>> {
    return this.mediaService
      ? this.mediaService.setExistingPrimary(context, payload)
      : Promise.resolve(mediaNotConfigured(context.requestId));
  }

  reorderProductMedia(
    context: ApplicationExecutionContext,
    payload: ReorderProductMediaServiceInputContract,
  ): Promise<ApplicationServiceResult<ProductMediaContract[]>> {
    return this.mediaService
      ? this.mediaService.reorderProductMedia(context, payload)
      : Promise.resolve(mediaNotConfigured(context.requestId));
  }

  updateProductMedia(
    context: ApplicationExecutionContext,
    payload: UpdateProductMediaServiceInputContract,
  ): Promise<ApplicationServiceResult<ProductMediaContract>> {
    return this.mediaService
      ? this.mediaService.updateProductMedia(context, payload)
      : Promise.resolve(mediaNotConfigured(context.requestId));
  }

  archiveProductMedia(
    context: ApplicationExecutionContext,
    payload: ProductMediaLinkServiceInputContract,
  ): Promise<ApplicationServiceResult<null>> {
    return this.mediaService
      ? this.mediaService.archiveProductMedia(context, payload)
      : Promise.resolve(mediaNotConfigured(context.requestId));
  }

  reorderCollectionProducts(
    context: ApplicationExecutionContext,
    payload: ReorderCollectionProductsServiceInputContract,
  ): Promise<ApplicationServiceResult<null>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        reorderCollectionProductsServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "UPDATE");
      if (
        !(await this.collections.findById(
          input.collectionId,
          validated.organizationId,
        ))
      )
        throw new NotFoundError("Collection was not found.");
      if (!this.transactionManager)
        throw new Error("Transaction manager is required.");
      await this.transactionManager.execute(validated, async (transaction) => {
        if (!transaction.catalogProductRepository)
          throw new Error("Transactional product repository is unavailable.");
        await transaction.catalogProductRepository.reorderCollectionProducts({
          ...input,
          organizationId: validated.organizationId,
        });
      });
      return null;
    });
  }

  listCollectionProducts(
    context: ApplicationExecutionContext,
    payload: ListCollectionProductsServiceInputContract,
  ): Promise<ApplicationServiceResult<string[]>> {
    return this.execute(context, async (validated) => {
      const input = parsePayload(
        listCollectionProductsServiceInputSchema,
        payload,
      );
      await this.authorize(validated, "READ");
      if (
        !(await this.collections.findById(
          input.collectionId,
          validated.organizationId,
        ))
      )
        throw new NotFoundError("Collection was not found.");
      return this.products.listCollectionProductOrder(
        validated.organizationId,
        input.collectionId,
      );
    });
  }

  setPrimaryProductImage(
    context: ApplicationExecutionContext,
    payload: SetPrimaryProductImageServiceInputContract,
  ): Promise<ApplicationServiceResult<PrimaryProductImageContract>> {
    return this.mediaService
      ? this.mediaService.setPrimaryProductImage(context, payload)
      : Promise.resolve(mediaNotConfigured(context.requestId));
  }

  removePrimaryProductImage(
    context: ApplicationExecutionContext,
    payload: RemovePrimaryProductImageServiceInputContract,
  ): Promise<ApplicationServiceResult<null>> {
    return this.mediaService
      ? this.mediaService.removePrimaryProductImage(context, payload)
      : Promise.resolve(mediaNotConfigured(context.requestId));
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

function mediaNotConfigured(requestId: string = crypto.randomUUID()) {
  return {
    error: new ApplicationServiceError({
      code: "INTERNAL_ERROR",
      message: "Product media is not configured.",
    }).toShape(requestId),
    ok: false as const,
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
  RemovePrimaryProductImageServiceInputContract,
  SetPrimaryProductImageServiceInputContract,
};
