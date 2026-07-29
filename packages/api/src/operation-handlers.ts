import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  createCategoryServiceInputSchema,
  createCollectionServiceInputSchema,
  createSalesOrderServiceInputSchema,
  createProductServiceInputSchema,
  createProductVariantServiceInputSchema,
  getProductServiceInputSchema,
  listCatalogItemsServiceInputSchema,
  listProductVariantsServiceInputSchema,
  postInventoryMovementServiceInputSchema,
  updateCategoryStatusServiceInputSchema,
  type CategoryContract,
  type CollectionContract,
  type CreateCategoryServiceInputContract,
  type CreateCollectionServiceInputContract,
  type CreateProductServiceInputContract,
  type CreateProductVariantServiceInputContract,
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
  type UpdateCategoryStatusServiceInputContract,
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
  listProducts(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductContract[]>>;
  listVariants(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductVariantContract[]>>;
  updateCategoryStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<CategoryContract>>;
};

export type CatalogApiHandlers = {
  createCategory: ApiHandler<CategoryContract>;
  createCollection: ApiHandler<CollectionContract>;
  createProduct: ApiHandler<ProductContract>;
  createVariant: ApiHandler<ProductVariantContract>;
  getProduct: ApiHandler<ProductDetailsContract>;
  listCategories: ApiHandler<CategoryContract[]>;
  listCollections: ApiHandler<CollectionContract[]>;
  listProducts: ApiHandler<ProductContract[]>;
  listVariants: ApiHandler<ProductVariantContract[]>;
  updateCategoryStatus: ApiHandler<CategoryContract>;
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
    createProduct: protectedHandler<
      CreateProductServiceInputContract,
      ProductContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.catalog.createProduct(context, input),
      inputSchema: createProductServiceInputSchema,
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
    listProducts: protectedHandler<
      ListCatalogItemsServiceInputContract,
      ProductContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.listProducts(context, input),
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
