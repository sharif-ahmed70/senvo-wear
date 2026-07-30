import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  createCategoryServiceInputSchema,
  createCollectionServiceInputSchema,
  createColorServiceInputSchema,
  createSalesOrderServiceInputSchema,
  createProductServiceInputSchema,
  createProductVariantServiceInputSchema,
  createSizeServiceInputSchema,
  getProductServiceInputSchema,
  listCatalogItemsServiceInputSchema,
  listProductVariantsServiceInputSchema,
  postInventoryMovementServiceInputSchema,
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
  type CreateSalesOrderServiceInputContract,
  type InventoryMovementContract,
  type GetProductServiceInputContract,
  type ListCatalogItemsServiceInputContract,
  type ListProductVariantsServiceInputContract,
  type PostInventoryMovementServiceInputContract,
  type ProductContract,
  type ProductDetailsContract,
  type ProductVariantContract,
  type SalesOrderServiceContract,
  type SizeContract,
  type UpdateCategoryStatusServiceInputContract,
  type UpdateColorStatusServiceInputContract,
  type UpdateSizeStatusServiceInputContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

type SecurityDependencies = {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
};

export type SalesOrderCreationApplication = {
  createOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>>;
};

export type InventoryMovementPostingApplication = {
  postMovement(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<InventoryMovementContract>>;
};

export type CatalogManagementApplication = {
  createCategory(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CategoryContract>>;
  createCollection(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CollectionContract>>;
  createColor(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ColorContract>>;
  createSize(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SizeContract>>;
  createProduct(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductContract>>;
  createVariant(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductVariantContract>>;
  getProduct(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductDetailsContract>>;
  listCategories(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CategoryContract[]>>;
  listCollections(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CollectionContract[]>>;
  listColors(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ColorContract[]>>;
  listProducts(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductContract[]>>;
  listSizes(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SizeContract[]>>;
  listVariants(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductVariantContract[]>>;
  updateCategoryStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CategoryContract>>;
  updateColorStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ColorContract>>;
  updateSizeStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SizeContract>>;
};

export type CatalogApiHandlers = {
  createCategory: ApiHandler<CategoryContract>;
  createCollection: ApiHandler<CollectionContract>;
  createColor: ApiHandler<ColorContract>;
  createProduct: ApiHandler<ProductContract>;
  createVariant: ApiHandler<ProductVariantContract>;
  createSize: ApiHandler<SizeContract>;
  getProduct: ApiHandler<ProductDetailsContract>;
  listCategories: ApiHandler<CategoryContract[]>;
  listCollections: ApiHandler<CollectionContract[]>;
  listColors: ApiHandler<ColorContract[]>;
  listProducts: ApiHandler<ProductContract[]>;
  listSizes: ApiHandler<SizeContract[]>;
  listVariants: ApiHandler<ProductVariantContract[]>;
  updateCategoryStatus: ApiHandler<CategoryContract>;
  updateColorStatus: ApiHandler<ColorContract>;
  updateSizeStatus: ApiHandler<SizeContract>;
};

export function createCatalogApiHandlers(
  dependencies: SecurityDependencies & {
    catalog: CatalogManagementApplication;
  },
): CatalogApiHandlers {
  const protectedHandler = <TInput, TOutput>(options: {
    action: "CREATE" | "READ" | "UPDATE";
    execute: (
      context: ApplicationExecutionContext,
      input: TInput,
    ) => Promise<ApplicationServiceResult<TOutput>>;
    inputSchema: Parameters<
      typeof createProtectedApiHandler<TInput, TOutput>
    >[0]["inputSchema"];
  }) =>
    createProtectedApiHandler<TInput, TOutput>({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: options.execute,
      inputSchema: options.inputSchema,
      permission: { action: options.action, resource: "CATALOG" },
    });

  return {
    createCategory: protectedHandler<
      CreateCategoryServiceInputContract,
      CategoryContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.catalog.createCategory(context, input),
      inputSchema: createCategoryServiceInputSchema,
    }),
    createCollection: protectedHandler<
      CreateCollectionServiceInputContract,
      CollectionContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.catalog.createCollection(context, input),
      inputSchema: createCollectionServiceInputSchema,
    }),
    createColor: protectedHandler<
      CreateColorServiceInputContract,
      ColorContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.catalog.createColor(context, input),
      inputSchema: createColorServiceInputSchema,
    }),
    createProduct: protectedHandler<
      CreateProductServiceInputContract,
      ProductContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.catalog.createProduct(context, input),
      inputSchema: createProductServiceInputSchema,
    }),
    createSize: protectedHandler<CreateSizeServiceInputContract, SizeContract>({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.catalog.createSize(context, input),
      inputSchema: createSizeServiceInputSchema,
    }),
    createVariant: protectedHandler<
      CreateProductVariantServiceInputContract,
      ProductVariantContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.catalog.createVariant(context, input),
      inputSchema: createProductVariantServiceInputSchema,
    }),
    getProduct: protectedHandler<
      GetProductServiceInputContract,
      ProductDetailsContract
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.getProduct(context, input),
      inputSchema: getProductServiceInputSchema,
    }),
    listCategories: protectedHandler<
      ListCatalogItemsServiceInputContract,
      CategoryContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.listCategories(context, input),
      inputSchema: listCatalogItemsServiceInputSchema,
    }),
    listCollections: protectedHandler<
      ListCatalogItemsServiceInputContract,
      CollectionContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.listCollections(context, input),
      inputSchema: listCatalogItemsServiceInputSchema,
    }),
    listColors: protectedHandler<
      ListCatalogItemsServiceInputContract,
      ColorContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.listColors(context, input),
      inputSchema: listCatalogItemsServiceInputSchema,
    }),
    listProducts: protectedHandler<
      ListCatalogItemsServiceInputContract,
      ProductContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.listProducts(context, input),
      inputSchema: listCatalogItemsServiceInputSchema,
    }),
    listSizes: protectedHandler<
      ListCatalogItemsServiceInputContract,
      SizeContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.listSizes(context, input),
      inputSchema: listCatalogItemsServiceInputSchema,
    }),
    listVariants: protectedHandler<
      ListProductVariantsServiceInputContract,
      ProductVariantContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.listVariants(context, input),
      inputSchema: listProductVariantsServiceInputSchema,
    }),
    updateCategoryStatus: protectedHandler<
      UpdateCategoryStatusServiceInputContract,
      CategoryContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.updateCategoryStatus(context, input),
      inputSchema: updateCategoryStatusServiceInputSchema,
    }),
    updateColorStatus: protectedHandler<
      UpdateColorStatusServiceInputContract,
      ColorContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.updateColorStatus(context, input),
      inputSchema: updateColorStatusServiceInputSchema,
    }),
    updateSizeStatus: protectedHandler<
      UpdateSizeStatusServiceInputContract,
      SizeContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.updateSizeStatus(context, input),
      inputSchema: updateSizeStatusServiceInputSchema,
    }),
  };
}

export function createSalesOrderApiHandler(
  dependencies: SecurityDependencies & {
    sales: SalesOrderCreationApplication;
  },
): ApiHandler<SalesOrderServiceContract> {
  return createProtectedApiHandler<
    CreateSalesOrderServiceInputContract,
    SalesOrderServiceContract
  >({
    authenticationService: dependencies.authenticationService,
    authorizationService: dependencies.authorizationService,
    execute: (context, input) => dependencies.sales.createOrder(context, input),
    inputSchema: createSalesOrderServiceInputSchema,
    permission: { action: "CREATE", resource: "SALES_ORDER" },
  });
}

export function createPostInventoryMovementApiHandler(
  dependencies: SecurityDependencies & {
    inventory: InventoryMovementPostingApplication;
  },
): ApiHandler<InventoryMovementContract> {
  return createProtectedApiHandler<
    PostInventoryMovementServiceInputContract,
    InventoryMovementContract
  >({
    authenticationService: dependencies.authenticationService,
    authorizationService: dependencies.authorizationService,
    execute: (context, input) =>
      dependencies.inventory.postMovement(context, input),
    inputSchema: postInventoryMovementServiceInputSchema,
    permission: { action: "UPDATE", resource: "INVENTORY" },
  });
}
