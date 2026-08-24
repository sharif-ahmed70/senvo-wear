import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  createCategoryServiceInputSchema,
  createVariantBarcodeServiceInputSchema,
  createCollectionServiceInputSchema,
  createColorServiceInputSchema,
  createSalesOrderServiceInputSchema,
  createProductServiceInputSchema,
  createProductVariantServiceInputSchema,
  createSizeServiceInputSchema,
  getProductServiceInputSchema,
  addProductMediaServiceInputSchema,
  productMediaLinkServiceInputSchema,
  reorderProductMediaServiceInputSchema,
  updateProductMediaServiceInputSchema,
  reorderCollectionProductsServiceInputSchema,
  listCollectionProductsServiceInputSchema,
  removePrimaryProductImageServiceInputSchema,
  setPrimaryProductImageServiceInputSchema,
  getVariantAvailabilityServiceInputSchema,
  listInventoryAvailabilityServiceInputSchema,
  listInventoryMovementsServiceInputSchema,
  listStockLocationsServiceInputSchema,
  salesOrderManagementActionInputSchema,
  salesOrderManagementDetailsInputSchema,
  salesOrderManagementListInputSchema,
  listCatalogItemsServiceInputSchema,
  listProductVariantsServiceInputSchema,
  listVariantBarcodesServiceInputSchema,
  lookupBarcodeServiceInputSchema,
  postInventoryMovementServiceInputSchema,
  updateCategoryStatusServiceInputSchema,
  updateBarcodeStatusServiceInputSchema,
  updateColorStatusServiceInputSchema,
  updateSizeStatusServiceInputSchema,
  type CategoryContract,
  type BarcodeLookupContract,
  type CollectionContract,
  type ColorContract,
  type CreateCategoryServiceInputContract,
  type CreateVariantBarcodeServiceInputContract,
  type CreateCollectionServiceInputContract,
  type CreateColorServiceInputContract,
  type CreateProductServiceInputContract,
  type CreateProductVariantServiceInputContract,
  type CreateSizeServiceInputContract,
  type CreateSalesOrderServiceInputContract,
  type InventoryMovementContract,
  type InventoryAvailabilityReadContract,
  type InventoryMovementHistoryContract,
  type InventoryReadPageContract,
  type GetVariantAvailabilityServiceInputContract,
  type GetProductServiceInputContract,
  type ListCatalogItemsServiceInputContract,
  type ListProductVariantsServiceInputContract,
  type ListVariantBarcodesServiceInputContract,
  type LookupBarcodeServiceInputContract,
  type ListInventoryAvailabilityServiceInputContract,
  type ListInventoryMovementsServiceInputContract,
  type ListStockLocationsServiceInputContract,
  type PostInventoryMovementServiceInputContract,
  type ProductContract,
  type ProductDetailsContract,
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
  type ProductVariantContract,
  type SalesOrderServiceContract,
  type SalesOrderDetailsReadContract,
  type SalesOrderListReadPageContract,
  type SalesOrderManagementActionInputContract,
  type SalesOrderManagementDetailsInputContract,
  type SalesOrderManagementListInputContract,
  type SizeContract,
  type StockLocationReadContract,
  type UpdateCategoryStatusServiceInputContract,
  type UpdateBarcodeStatusServiceInputContract,
  type VariantBarcodeContract,
  type UpdateColorStatusServiceInputContract,
  type UpdateSizeStatusServiceInputContract,
  updateProductServiceInputSchema,
  updateProductVariantServiceInputSchema,
  type UpdateProductServiceInputContract,
  type UpdateProductVariantServiceInputContract,
  type VariantInventoryAvailabilityContract,
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

export type SalesOrderManagementApplication = {
  cancelManagedOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>>;
  confirmManagedOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>>;
  fulfillManagedOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>>;
  getManagedOrderDetails(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderDetailsReadContract>>;
  listManagedOrders(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderListReadPageContract>>;
  reserveManagedOrder(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<SalesOrderServiceContract>>;
};

export type SalesOrderManagementApiHandlers = {
  cancel: ApiHandler<SalesOrderServiceContract>;
  confirm: ApiHandler<SalesOrderServiceContract>;
  fulfill: ApiHandler<SalesOrderServiceContract>;
  getDetails: ApiHandler<SalesOrderDetailsReadContract>;
  list: ApiHandler<SalesOrderListReadPageContract>;
  reserve: ApiHandler<SalesOrderServiceContract>;
};

export type InventoryMovementPostingApplication = {
  postMovement(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<InventoryMovementContract>>;
};

export type InventoryReadApplication = {
  getVariantAvailability(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<VariantInventoryAvailabilityContract>>;
  listInventoryAvailability(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<
    ApplicationServiceResult<
      InventoryReadPageContract<InventoryAvailabilityReadContract>
    >
  >;
  listInventoryMovements(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<
    ApplicationServiceResult<
      InventoryReadPageContract<InventoryMovementHistoryContract>
    >
  >;
  listStockLocations(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<
    ApplicationServiceResult<
      InventoryReadPageContract<StockLocationReadContract>
    >
  >;
};

export type InventoryReadApiHandlers = {
  getVariantAvailability: ApiHandler<VariantInventoryAvailabilityContract>;
  listAvailability: ApiHandler<
    InventoryReadPageContract<InventoryAvailabilityReadContract>
  >;
  listLocations: ApiHandler<
    InventoryReadPageContract<StockLocationReadContract>
  >;
  listMovements: ApiHandler<
    InventoryReadPageContract<InventoryMovementHistoryContract>
  >;
};

export type CatalogManagementApplication = {
  createVariantBarcode(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<VariantBarcodeContract>>;
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
  getPrimaryProductImage(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PrimaryProductImageContract | null>>;
  listProductMedia(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductMediaContract[]>>;
  addProductMedia(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductMediaContract>>;
  setExistingPrimary(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductMediaContract[]>>;
  reorderProductMedia(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductMediaContract[]>>;
  updateProductMedia(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductMediaContract>>;
  archiveProductMedia(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<null>>;
  reorderCollectionProducts(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<null>>;
  listCollectionProducts(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<string[]>>;
  setPrimaryProductImage(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PrimaryProductImageContract>>;
  removePrimaryProductImage(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<null>>;
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
  listVariantBarcodes(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<VariantBarcodeContract[]>>;
  lookupBarcode(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<BarcodeLookupContract>>;
  updateBarcodeStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<VariantBarcodeContract>>;
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
  updateProduct(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductContract>>;
  updateVariant(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<ProductVariantContract>>;
};

export type CatalogApiHandlers = {
  addProductMedia: ApiHandler<ProductMediaContract>;
  archiveProductMedia: ApiHandler<null>;
  createVariantBarcode: ApiHandler<VariantBarcodeContract>;
  createCategory: ApiHandler<CategoryContract>;
  createCollection: ApiHandler<CollectionContract>;
  createColor: ApiHandler<ColorContract>;
  createProduct: ApiHandler<ProductContract>;
  createVariant: ApiHandler<ProductVariantContract>;
  createSize: ApiHandler<SizeContract>;
  getProduct: ApiHandler<ProductDetailsContract>;
  getPrimaryProductImage: ApiHandler<PrimaryProductImageContract | null>;
  listProductMedia: ApiHandler<ProductMediaContract[]>;
  reorderProductMedia: ApiHandler<ProductMediaContract[]>;
  reorderCollectionProducts: ApiHandler<null>;
  setExistingPrimary: ApiHandler<ProductMediaContract[]>;
  setPrimaryProductImage: ApiHandler<PrimaryProductImageContract>;
  removePrimaryProductImage: ApiHandler<null>;
  listCategories: ApiHandler<CategoryContract[]>;
  listCollections: ApiHandler<CollectionContract[]>;
  listCollectionProducts: ApiHandler<string[]>;
  listColors: ApiHandler<ColorContract[]>;
  listProducts: ApiHandler<ProductContract[]>;
  listSizes: ApiHandler<SizeContract[]>;
  listVariants: ApiHandler<ProductVariantContract[]>;
  listVariantBarcodes: ApiHandler<VariantBarcodeContract[]>;
  lookupBarcode: ApiHandler<BarcodeLookupContract>;
  updateBarcodeStatus: ApiHandler<VariantBarcodeContract>;
  updateCategoryStatus: ApiHandler<CategoryContract>;
  updateColorStatus: ApiHandler<ColorContract>;
  updateSizeStatus: ApiHandler<SizeContract>;
  updateProductMedia: ApiHandler<ProductMediaContract>;
  updateProduct: ApiHandler<ProductContract>;
  updateVariant: ApiHandler<ProductVariantContract>;
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
    addProductMedia: protectedHandler<
      AddProductMediaServiceInputContract,
      ProductMediaContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.addProductMedia(context, input),
      inputSchema: addProductMediaServiceInputSchema,
    }),
    archiveProductMedia: protectedHandler<
      ProductMediaLinkServiceInputContract,
      null
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.archiveProductMedia(context, input),
      inputSchema: productMediaLinkServiceInputSchema,
    }),
    createVariantBarcode: protectedHandler<
      CreateVariantBarcodeServiceInputContract,
      VariantBarcodeContract
    >({
      action: "CREATE",
      execute: (context, input) =>
        dependencies.catalog.createVariantBarcode(context, input),
      inputSchema: createVariantBarcodeServiceInputSchema,
    }),
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
    getPrimaryProductImage: protectedHandler<
      RemovePrimaryProductImageServiceInputContract,
      PrimaryProductImageContract | null
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.getPrimaryProductImage(context, input),
      inputSchema: removePrimaryProductImageServiceInputSchema,
    }),
    listProductMedia: protectedHandler<
      RemovePrimaryProductImageServiceInputContract,
      ProductMediaContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.listProductMedia(context, input),
      inputSchema: removePrimaryProductImageServiceInputSchema,
    }),
    reorderProductMedia: protectedHandler<
      ReorderProductMediaServiceInputContract,
      ProductMediaContract[]
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.reorderProductMedia(context, input),
      inputSchema: reorderProductMediaServiceInputSchema,
    }),
    reorderCollectionProducts: protectedHandler<
      ReorderCollectionProductsServiceInputContract,
      null
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.reorderCollectionProducts(context, input),
      inputSchema: reorderCollectionProductsServiceInputSchema,
    }),
    setExistingPrimary: protectedHandler<
      ProductMediaLinkServiceInputContract,
      ProductMediaContract[]
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.setExistingPrimary(context, input),
      inputSchema: productMediaLinkServiceInputSchema,
    }),
    setPrimaryProductImage: protectedHandler<
      SetPrimaryProductImageServiceInputContract,
      PrimaryProductImageContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.setPrimaryProductImage(context, input),
      inputSchema: setPrimaryProductImageServiceInputSchema,
    }),
    removePrimaryProductImage: protectedHandler<
      RemovePrimaryProductImageServiceInputContract,
      null
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.removePrimaryProductImage(context, input),
      inputSchema: removePrimaryProductImageServiceInputSchema,
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
    listCollectionProducts: protectedHandler<
      ListCollectionProductsServiceInputContract,
      string[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.listCollectionProducts(context, input),
      inputSchema: listCollectionProductsServiceInputSchema,
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
    listVariantBarcodes: protectedHandler<
      ListVariantBarcodesServiceInputContract,
      VariantBarcodeContract[]
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.listVariantBarcodes(context, input),
      inputSchema: listVariantBarcodesServiceInputSchema,
    }),
    lookupBarcode: protectedHandler<
      LookupBarcodeServiceInputContract,
      BarcodeLookupContract
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.catalog.lookupBarcode(context, input),
      inputSchema: lookupBarcodeServiceInputSchema,
    }),
    updateBarcodeStatus: protectedHandler<
      UpdateBarcodeStatusServiceInputContract,
      VariantBarcodeContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.updateBarcodeStatus(context, input),
      inputSchema: updateBarcodeStatusServiceInputSchema,
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
    updateProductMedia: protectedHandler<
      UpdateProductMediaServiceInputContract,
      ProductMediaContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.updateProductMedia(context, input),
      inputSchema: updateProductMediaServiceInputSchema,
    }),
    updateProduct: protectedHandler<
      UpdateProductServiceInputContract,
      ProductContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.updateProduct(context, input),
      inputSchema: updateProductServiceInputSchema,
    }),
    updateVariant: protectedHandler<
      UpdateProductVariantServiceInputContract,
      ProductVariantContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.catalog.updateVariant(context, input),
      inputSchema: updateProductVariantServiceInputSchema,
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
    permission: { action: "CREATE", resource: "SALES" },
  });
}

export function createSalesOrderManagementApiHandlers(
  dependencies: SecurityDependencies & {
    sales: SalesOrderManagementApplication;
  },
): SalesOrderManagementApiHandlers {
  const handler = <TInput, TOutput>(options: {
    action: "READ" | "UPDATE";
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
      permission: { action: options.action, resource: "SALES_ORDER" },
    });

  const action = (
    execute: (
      context: ApplicationExecutionContext,
      input: SalesOrderManagementActionInputContract,
    ) => Promise<ApplicationServiceResult<SalesOrderServiceContract>>,
  ) =>
    handler<SalesOrderManagementActionInputContract, SalesOrderServiceContract>(
      {
        action: "UPDATE",
        execute,
        inputSchema: salesOrderManagementActionInputSchema,
      },
    );

  return {
    cancel: action((context, input) =>
      dependencies.sales.cancelManagedOrder(context, input),
    ),
    confirm: action((context, input) =>
      dependencies.sales.confirmManagedOrder(context, input),
    ),
    fulfill: action((context, input) =>
      dependencies.sales.fulfillManagedOrder(context, input),
    ),
    getDetails: handler<
      SalesOrderManagementDetailsInputContract,
      SalesOrderDetailsReadContract
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.sales.getManagedOrderDetails(context, input),
      inputSchema: salesOrderManagementDetailsInputSchema,
    }),
    list: handler<
      SalesOrderManagementListInputContract,
      SalesOrderListReadPageContract
    >({
      action: "READ",
      execute: (context, input) =>
        dependencies.sales.listManagedOrders(context, input),
      inputSchema: salesOrderManagementListInputSchema,
    }),
    reserve: action((context, input) =>
      dependencies.sales.reserveManagedOrder(context, input),
    ),
  };
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

export function createInventoryReadApiHandlers(
  dependencies: SecurityDependencies & {
    inventory: InventoryReadApplication;
  },
): InventoryReadApiHandlers {
  const protectedReadHandler = <TInput, TOutput>(options: {
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
      permission: { action: "READ", resource: "INVENTORY" },
    });

  return {
    getVariantAvailability: protectedReadHandler<
      GetVariantAvailabilityServiceInputContract,
      VariantInventoryAvailabilityContract
    >({
      execute: (context, input) =>
        dependencies.inventory.getVariantAvailability(context, input),
      inputSchema: getVariantAvailabilityServiceInputSchema,
    }),
    listAvailability: protectedReadHandler<
      ListInventoryAvailabilityServiceInputContract,
      InventoryReadPageContract<InventoryAvailabilityReadContract>
    >({
      execute: (context, input) =>
        dependencies.inventory.listInventoryAvailability(context, input),
      inputSchema: listInventoryAvailabilityServiceInputSchema,
    }),
    listLocations: protectedReadHandler<
      ListStockLocationsServiceInputContract,
      InventoryReadPageContract<StockLocationReadContract>
    >({
      execute: (context, input) =>
        dependencies.inventory.listStockLocations(context, input),
      inputSchema: listStockLocationsServiceInputSchema,
    }),
    listMovements: protectedReadHandler<
      ListInventoryMovementsServiceInputContract,
      InventoryReadPageContract<InventoryMovementHistoryContract>
    >({
      execute: (context, input) =>
        dependencies.inventory.listInventoryMovements(context, input),
      inputSchema: listInventoryMovementsServiceInputSchema,
    }),
  };
}
