import type {
  ApiErrorCode,
  BarcodeLookupContract,
  ApiFailure,
  ApiResponse,
  CategoryContract,
  CollectionContract,
  ColorContract,
  AssignTeamMemberRoleServiceInputContract,
  CreateStoreServiceInputContract,
  CreateTeamMemberServiceInputContract,
  CreateCategoryServiceInputContract,
  CreateVariantBarcodeServiceInputContract,
  CreateCollectionServiceInputContract,
  CreateColorServiceInputContract,
  CreateProductServiceInputContract,
  CreateProductVariantServiceInputContract,
  UpdateVariantPriceServiceInputContract,
  CreateSizeServiceInputContract,
  GetVariantAvailabilityServiceInputContract,
  InventoryAvailabilityReadContract,
  InventoryMovementContract,
  InventoryMovementHistoryContract,
  InventoryReadPageContract,
  CreateInventoryMovementServiceInputContract,
  PostInventoryMovementServiceInputContract,
  ListInventoryAvailabilityServiceInputContract,
  ListInventoryMovementsServiceInputContract,
  ListStockLocationsServiceInputContract,
  ProductContract,
  ProductDetailsContract,
  PrimaryProductImageContract,
  ProductMediaContract,
  AddProductMediaServiceInputContract,
  ReorderProductMediaServiceInputContract,
  UpdateProductMediaServiceInputContract,
  SetPrimaryProductImageServiceInputContract,
  ProductVariantContract,
  OrganizationProfileContract,
  PublicErrorDetails,
  SizeContract,
  RoleVisibilityContract,
  SalesOrderDetailsReadContract,
  SalesOrderListReadPageContract,
  SalesOrderManagementActionInputContract,
  SalesOrderManagementListInputContract,
  SalesBoothContract,
  SalesSourceSummaryContract,
  CreateSalesBoothServiceInputContract,
  StockLocationReadContract,
  ConfirmPurchaseServiceInputContract,
  CreatePurchaseDraftServiceInputContract,
  ListPurchasesServiceInputContract,
  PurchaseContract,
  CreateSupplierServiceInputContract,
  CreateSupplierPaymentServiceInputContract,
  CreateSupplierAdjustmentServiceInputContract,
  ListSupplierPaymentsServiceInputContract,
  ListSuppliersServiceInputContract,
  SupplierBalanceSummaryContract,
  SupplierContract,
  SupplierLedgerEntryContract,
  SupplierPaymentContract,
  UpdateSupplierServiceInputContract,
  StoreManagementContract,
  TeamMemberContract,
  UpdateCategoryStatusServiceInputContract,
  UpdateBarcodeStatusServiceInputContract,
  UpdateColorStatusServiceInputContract,
  UpdateSizeStatusServiceInputContract,
  UpdateOrganizationProfileServiceInputContract,
  UpdateStoreServiceInputContract,
  UpdateStoreStatusServiceInputContract,
  UpdateTeamMemberStatusServiceInputContract,
  UpdateSalesBoothStatusServiceInputContract,
  VariantInventoryAvailabilityContract,
  VariantBarcodeContract,
  SalesCounterContract,
  SalesSessionContract,
  PosCheckoutContract,
  PosCartDetailsContract,
  PosCartLineContract,
  PosSaleLookupContract,
  SalesReceiptContract,
  CheckoutPosCartServiceInputContract,
  CollectPosPaymentServiceInputContract,
  CollectPosPaymentResultContract,
  PaymentAccountContract,
  PaymentCollectionReceiptContract,
  CreatePaymentRefundServiceInputContract,
  PaymentRefundAccountContract,
  PaymentRefundReceiptContract,
  PaymentRefundResultContract,
  CreatePosReturnServiceInputContract,
  PosReturnAccountContract,
  PosReturnReceiptContract,
  PosReturnResultContract,
  CreateSalesCounterServiceInputContract,
  UpdateSalesCounterStatusServiceInputContract,
  OpenSalesSessionServiceInputContract,
  OnlinePaymentAdminResultContract,
  ProviderRefundContract,
  CloseSalesSessionServiceInputContract,
  CloseSalesSessionWithSettlementServiceInputContract,
  PosSessionReconciliationSummaryContract,
  PosRegisterSettlementContract,
  AddPosCartItemServiceInputContract,
  UpdatePosCartItemServiceInputContract,
  RemovePosCartItemServiceInputContract,
} from "@senvo/contracts";

export type AdminApiClientOptions = {
  baseUrl?: string;
  createRequestId?: () => string;
  credentials?: RequestCredentials;
  fetcher?: typeof fetch;
  /** Custom CSRF token resolver (defaults to reading from stored credentials or cookie). */
  getCsrfToken?: () => string | null | undefined;
  /** Custom session token resolver (defaults to reading from stored credentials). */
  getSessionToken?: () => string | null | undefined;
  /** When set, every request automatically includes Authorization: Bearer <sessionToken>. */
  sessionToken?: string;
};

export type AdminApiRequest = {
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  requestId?: string;
  signal?: AbortSignal;
};

export type AdminApiResult<T> = {
  data: T;
  requestId: string;
};

export class AdminApiError extends Error {
  readonly category: string;
  readonly code: ApiErrorCode;
  readonly details?: PublicErrorDetails;
  readonly fieldErrors?: Record<string, string[]>;
  readonly requestId: string;
  readonly status: number;

  constructor(input: {
    code: ApiErrorCode;
    details?: PublicErrorDetails;
    fieldErrors?: Record<string, string[]>;
    message: string;
    requestId: string;
    status: number;
  }) {
    super(input.message);
    this.name = "AdminApiError";
    this.category = input.code.split(".", 1)[0] ?? "INTERNAL";
    this.code = input.code;
    this.details = input.details;
    this.fieldErrors = input.fieldErrors;
    this.requestId = input.requestId;
    this.status = input.status;
  }
}

function defaultGetSessionToken(): string | undefined {
  try {
    const session =
      typeof globalThis !== "undefined" && globalThis.sessionStorage
        ? globalThis.sessionStorage.getItem("senvo.admin.session")
        : typeof window !== "undefined" && window.sessionStorage
          ? window.sessionStorage.getItem("senvo.admin.session")
          : null;
    const local =
      typeof globalThis !== "undefined" && globalThis.localStorage
        ? globalThis.localStorage.getItem("senvo.admin.session")
        : typeof window !== "undefined" && window.localStorage
          ? window.localStorage.getItem("senvo.admin.session")
          : null;
    const raw = session ?? local;
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { sessionToken?: unknown };
    return typeof parsed?.sessionToken === "string"
      ? parsed.sessionToken
      : undefined;
  } catch {
    return undefined;
  }
}

function defaultGetCsrfToken(): string | undefined {
  try {
    const session =
      typeof globalThis !== "undefined" && globalThis.sessionStorage
        ? globalThis.sessionStorage.getItem("senvo.admin.session")
        : typeof window !== "undefined" && window.sessionStorage
          ? window.sessionStorage.getItem("senvo.admin.session")
          : null;
    const local =
      typeof globalThis !== "undefined" && globalThis.localStorage
        ? globalThis.localStorage.getItem("senvo.admin.session")
        : typeof window !== "undefined" && window.localStorage
          ? window.localStorage.getItem("senvo.admin.session")
          : null;
    const raw = session ?? local;
    if (raw) {
      const parsed = JSON.parse(raw) as { csrfToken?: unknown };
      if (typeof parsed?.csrfToken === "string" && parsed.csrfToken) {
        return parsed.csrfToken;
      }
    }
  } catch {
    // ignore
  }
  if (typeof document !== "undefined") {
    const match = /(?:^|;\s*)senvo_workforce_csrf=([^;]*)/u.exec(
      document.cookie,
    );
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return undefined;
}

export class AdminApiClient {
  private readonly baseUrl: string;
  private readonly createRequestId: () => string;
  private readonly credentials: RequestCredentials;
  private readonly fetcher: typeof fetch;
  private readonly getCsrfToken: (() => string | null | undefined) | undefined;
  private readonly getSessionToken:
    (() => string | null | undefined) | undefined;
  private readonly sessionToken: string | undefined;

  constructor(options: AdminApiClientOptions = {}) {
    this.baseUrl =
      options.baseUrl?.replace(/\/$/u, "") ??
      process.env.NEXT_PUBLIC_SENVO_API_URL?.replace(/\/$/u, "") ??
      "";
    this.createRequestId =
      options.createRequestId ?? (() => crypto.randomUUID());
    this.credentials = options.credentials ?? "include";
    this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
    this.getCsrfToken =
      options.getCsrfToken !== undefined
        ? options.getCsrfToken
        : defaultGetCsrfToken;
    this.getSessionToken =
      options.getSessionToken ??
      (options.sessionToken !== undefined ? undefined : defaultGetSessionToken);
    this.sessionToken = options.sessionToken;
  }

  /**
   * Return a new AdminApiClient instance that automatically attaches
   * Authorization: Bearer <token> on every request.
   */
  withSession(sessionToken: string): AdminApiClient {
    return new AdminApiClient({
      baseUrl: this.baseUrl,
      createRequestId: this.createRequestId,
      credentials: this.credentials,
      fetcher: this.fetcher,
      getCsrfToken: this.getCsrfToken,
      sessionToken,
    });
  }

  async request<T>(
    path: `/${string}`,
    request: AdminApiRequest = {},
  ): Promise<AdminApiResult<T>> {
    const requestId = request.requestId ?? this.createRequestId();
    const headers = new Headers(request.headers);
    headers.set("accept", "application/json");
    headers.set("x-request-id", requestId);
    if (request.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    const method = request.method ?? "GET";
    const effectiveToken =
      this.sessionToken ?? this.getSessionToken?.() ?? undefined;
    if (effectiveToken && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${effectiveToken}`);
    }
    if (method !== "GET" && !headers.has("x-csrf-token")) {
      const csrf = this.getCsrfToken?.();
      if (csrf) {
        headers.set("x-csrf-token", csrf);
      }
    }

    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
        credentials: this.credentials,
        headers,
        method,
        signal: request.signal,
      });
    } catch {
      throw createClientError({
        code: "INTEGRATION.NETWORK_FAILURE",
        message: "The admin service could not be reached.",
        requestId,
        status: 0,
      });
    }

    const responseRequestId = response.headers.get("x-request-id") ?? requestId;
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw createClientError({
        code: "INTERNAL.INVALID_RESPONSE",
        message: "The admin service returned an invalid response.",
        requestId: responseRequestId,
        status: response.status,
      });
    }

    if (!isApiResponse<T>(payload)) {
      throw createClientError({
        code: "INTERNAL.INVALID_RESPONSE",
        message: "The admin service returned an invalid response.",
        requestId: responseRequestId,
        status: response.status,
      });
    }
    if (!payload.success) {
      throw errorFromFailure(payload, response.status);
    }
    if (!response.ok) {
      throw createClientError({
        code: "INTERNAL.INVALID_RESPONSE",
        message: "The admin service returned an invalid response.",
        requestId: payload.requestId,
        status: response.status,
      });
    }
    return { data: payload.data, requestId: payload.requestId };
  }

  listCategories(request?: AdminApiRequest) {
    return this.request<CategoryContract[]>("/catalog/categories", request);
  }

  createCategory(
    input: CreateCategoryServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<CategoryContract>("/catalog/categories", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  updateCategoryStatus(
    input: UpdateCategoryStatusServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<CategoryContract>(
      `/catalog/categories/${input.categoryId}/status`,
      { ...request, body: input, method: "PATCH" },
    );
  }

  listCollections(request?: AdminApiRequest) {
    return this.request<CollectionContract[]>("/catalog/collections", request);
  }

  createCollection(
    input: CreateCollectionServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<CollectionContract>("/catalog/collections", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  listColors(request?: AdminApiRequest) {
    return this.request<ColorContract[]>("/catalog/colors", request);
  }

  createColor(
    input: CreateColorServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<ColorContract>("/catalog/colors", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  updateColorStatus(
    input: UpdateColorStatusServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<ColorContract>(
      `/catalog/colors/${input.colorId}/status`,
      { ...request, body: input, method: "PATCH" },
    );
  }

  listSizes(request?: AdminApiRequest) {
    return this.request<SizeContract[]>("/catalog/sizes", request);
  }

  createSize(input: CreateSizeServiceInputContract, request?: AdminApiRequest) {
    return this.request<SizeContract>("/catalog/sizes", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  updateSizeStatus(
    input: UpdateSizeStatusServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<SizeContract>(`/catalog/sizes/${input.sizeId}/status`, {
      ...request,
      body: input,
      method: "PATCH",
    });
  }

  listProducts(request?: AdminApiRequest) {
    return this.request<ProductContract[]>("/catalog/products", request);
  }

  createProduct(
    input: CreateProductServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<ProductContract>("/catalog/products", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  getProduct(productId: string, request?: AdminApiRequest) {
    return this.request<ProductDetailsContract>(
      `/catalog/products/${productId}`,
      request,
    );
  }

  setPrimaryProductImage(
    input: SetPrimaryProductImageServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { productId, ...body } = input;
    return this.request<PrimaryProductImageContract>(
      `/catalog/products/${productId}/primary-image`,
      { ...request, body, method: "PUT" },
    );
  }

  removePrimaryProductImage(productId: string, request?: AdminApiRequest) {
    return this.request<null>(`/catalog/products/${productId}/primary-image`, {
      ...request,
      method: "DELETE",
    });
  }

  listProductMedia(productId: string, request?: AdminApiRequest) {
    return this.request<ProductMediaContract[]>(
      `/catalog/products/${productId}/media`,
      request,
    );
  }

  addProductMedia(
    input: AddProductMediaServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { productId, ...body } = input;
    return this.request<ProductMediaContract>(
      `/catalog/products/${productId}/media`,
      { ...request, body, method: "POST" },
    );
  }

  reorderProductMedia(
    input: ReorderProductMediaServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { productId, ...body } = input;
    return this.request<ProductMediaContract[]>(
      `/catalog/products/${productId}/media/reorder`,
      { ...request, body, method: "PATCH" },
    );
  }

  setProductMediaPrimary(
    productId: string,
    linkId: string,
    request?: AdminApiRequest,
  ) {
    return this.request<ProductMediaContract[]>(
      `/catalog/products/${productId}/media/${linkId}/primary`,
      { ...request, method: "PATCH" },
    );
  }

  updateProductMedia(
    input: UpdateProductMediaServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { linkId, productId, ...body } = input;
    return this.request<ProductMediaContract>(
      `/catalog/products/${productId}/media/${linkId}`,
      { ...request, body, method: "PATCH" },
    );
  }

  archiveProductMedia(
    productId: string,
    linkId: string,
    request?: AdminApiRequest,
  ) {
    return this.request<null>(
      `/catalog/products/${productId}/media/${linkId}`,
      { ...request, method: "DELETE" },
    );
  }

  listCollectionProducts(collectionId: string, request?: AdminApiRequest) {
    return this.request<string[]>(
      `/catalog/collections/${collectionId}/products`,
      request,
    );
  }

  reorderCollectionProducts(
    collectionId: string,
    productIds: readonly string[],
    request?: AdminApiRequest,
  ) {
    return this.request<null>(
      `/catalog/collections/${collectionId}/products/reorder`,
      { ...request, body: { productIds }, method: "PATCH" },
    );
  }

  updateVariantPrice(
    input: UpdateVariantPriceServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { variantId, ...body } = input;
    return this.request<ProductVariantContract>(
      `/catalog/variants/${variantId}/price`,
      { ...request, body, method: "PATCH" },
    );
  }

  listVariants(productId: string, request?: AdminApiRequest) {
    return this.request<ProductVariantContract[]>(
      `/catalog/products/${productId}/variants`,
      request,
    );
  }

  createVariant(
    input: CreateProductVariantServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<ProductVariantContract>(
      `/catalog/products/${input.productId}/variants`,
      { ...request, body: input, method: "POST" },
    );
  }

  listVariantBarcodes(variantId: string, request?: AdminApiRequest) {
    return this.request<VariantBarcodeContract[]>(
      `/catalog/variants/${variantId}/barcodes`,
      request,
    );
  }

  createVariantBarcode(
    input: CreateVariantBarcodeServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { variantId, ...body } = input;
    return this.request<VariantBarcodeContract>(
      `/catalog/variants/${variantId}/barcodes`,
      { ...request, body, method: "POST" },
    );
  }

  updateBarcodeStatus(
    input: UpdateBarcodeStatusServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { barcodeId, ...body } = input;
    return this.request<VariantBarcodeContract>(
      `/catalog/barcodes/${barcodeId}/status`,
      { ...request, body, method: "PATCH" },
    );
  }

  lookupBarcode(value: string, request?: AdminApiRequest) {
    return this.request<BarcodeLookupContract>(
      `/catalog/barcodes/lookup/${encodeURIComponent(value)}`,
      request,
    );
  }

  listInventoryAvailability(
    input: ListInventoryAvailabilityServiceInputContract = {},
    request?: AdminApiRequest,
  ) {
    return this.request<
      InventoryReadPageContract<InventoryAvailabilityReadContract>
    >(`/inventory/availability${queryString(input)}`, request);
  }

  listSuppliers(
    input: ListSuppliersServiceInputContract = {},
    request?: AdminApiRequest,
  ) {
    return this.request<SupplierContract[]>(
      `/procurement/suppliers${queryString(input)}`,
      request,
    );
  }

  getSupplier(supplierId: string, request?: AdminApiRequest) {
    return this.request<SupplierContract>(
      `/procurement/suppliers/${supplierId}`,
      request,
    );
  }

  createSupplier(
    input: CreateSupplierServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<SupplierContract>("/procurement/suppliers", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  updateSupplier(
    input: UpdateSupplierServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { supplierId, ...body } = input;
    return this.request<SupplierContract>(
      `/procurement/suppliers/${supplierId}`,
      {
        ...request,
        body,
        method: "PATCH",
      },
    );
  }

  deactivateSupplier(supplierId: string, request?: AdminApiRequest) {
    return this.request<SupplierContract>(
      `/procurement/suppliers/${supplierId}/deactivate`,
      {
        ...request,
        method: "POST",
      },
    );
  }

  getSupplierBalance(supplierId: string, request?: AdminApiRequest) {
    return this.request<SupplierBalanceSummaryContract>(
      `/procurement/suppliers/${supplierId}/balance`,
      request,
    );
  }

  getSupplierLedger(
    supplierId: string,
    input: { limit?: number; offset?: number } = {},
    request?: AdminApiRequest,
  ) {
    return this.request<SupplierLedgerEntryContract[]>(
      `/procurement/suppliers/${supplierId}/ledger${queryString(input)}`,
      request,
    );
  }

  listSupplierPayments(
    input: ListSupplierPaymentsServiceInputContract = {},
    request?: AdminApiRequest,
  ) {
    return this.request<SupplierPaymentContract[]>(
      `/procurement/payments${queryString(input)}`,
      request,
    );
  }

  recordSupplierPayment(
    input: CreateSupplierPaymentServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<SupplierPaymentContract>("/procurement/payments", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  recordSupplierAdjustment(
    input: CreateSupplierAdjustmentServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { supplierId, ...body } = input;
    return this.request<SupplierLedgerEntryContract>(
      `/procurement/suppliers/${supplierId}/adjustments`,
      {
        ...request,
        body,
        method: "POST",
      },
    );
  }

  listPurchases(
    input: ListPurchasesServiceInputContract = {},
    request?: AdminApiRequest,
  ) {
    return this.request<PurchaseContract[]>(
      `/procurement/purchases${queryString(input)}`,
      request,
    );
  }

  getPurchase(purchaseId: string, request?: AdminApiRequest) {
    return this.request<PurchaseContract>(
      `/procurement/purchases/${purchaseId}`,
      request,
    );
  }

  createPurchaseDraft(
    input: CreatePurchaseDraftServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<PurchaseContract>("/procurement/purchases", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  confirmPurchase(
    input: ConfirmPurchaseServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { purchaseId, ...body } = input;
    return this.request<PurchaseContract>(
      `/procurement/purchases/${purchaseId}/confirm`,
      {
        ...request,
        body,
        method: "POST",
      },
    );
  }

  listStockLocations(
    input: ListStockLocationsServiceInputContract = {},
    request?: AdminApiRequest,
  ) {
    return this.request<InventoryReadPageContract<StockLocationReadContract>>(
      `/inventory/locations${queryString(input)}`,
      request,
    );
  }

  listInventoryMovements(
    input: ListInventoryMovementsServiceInputContract = {},
    request?: AdminApiRequest,
  ) {
    return this.request<
      InventoryReadPageContract<InventoryMovementHistoryContract>
    >(`/inventory/movements${queryString(input)}`, request);
  }

  createInventoryMovementDraft(
    input: CreateInventoryMovementServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<InventoryMovementContract>(
      "/inventory/movement-drafts",
      {
        ...request,
        body: input,
        method: "POST",
      },
    );
  }

  postInventoryMovement(
    input: PostInventoryMovementServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<InventoryMovementContract>("/inventory/movements", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  getVariantAvailability(
    input: GetVariantAvailabilityServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<VariantInventoryAvailabilityContract>(
      `/inventory/variants/${input.variantId}/availability`,
      request,
    );
  }

  listSalesOrders(
    input: SalesOrderManagementListInputContract = {},
    request?: AdminApiRequest,
  ) {
    return this.request<SalesOrderListReadPageContract>(
      `/sales/orders${queryString(input)}`,
      request,
    );
  }

  listSalesBooths(request?: AdminApiRequest) {
    return this.request<SalesBoothContract[]>("/sales/booths", request);
  }

  createSalesBooth(
    input: CreateSalesBoothServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<SalesBoothContract>("/sales/booths", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  updateSalesBoothStatus(
    input: UpdateSalesBoothStatusServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { boothId, ...body } = input;
    return this.request<SalesBoothContract>(`/sales/booths/${boothId}/status`, {
      ...request,
      body,
      method: "PATCH",
    });
  }

  getSalesSourceSummary(request?: AdminApiRequest) {
    return this.request<SalesSourceSummaryContract>(
      "/sales/sources/summary",
      request,
    );
  }

  getSalesOrder(salesOrderId: string, request?: AdminApiRequest) {
    return this.request<SalesOrderDetailsReadContract>(
      `/sales/orders/${salesOrderId}`,
      request,
    );
  }

  getOnlinePayment(salesOrderId: string, request?: AdminApiRequest) {
    return this.request<OnlinePaymentAdminResultContract>(
      `/sales-orders/${salesOrderId}/payment`,
      request,
    );
  }

  reconcileOnlinePayment(paymentAttemptId: string, request?: AdminApiRequest) {
    return this.request<OnlinePaymentAdminResultContract>(
      `/payments/attempts/${paymentAttemptId}/reconcile`,
      { ...request, body: {}, method: "POST" },
    );
  }

  createProviderRefund(
    input: {
      amountMinor: number;
      idempotencyKey: string;
      paymentAttemptId: string;
      reason: string;
    },
    request?: AdminApiRequest,
  ) {
    const { paymentAttemptId, ...body } = input;
    return this.request<ProviderRefundContract>(
      `/payments/attempts/${paymentAttemptId}/refunds`,
      { ...request, body, method: "POST" },
    );
  }

  refreshProviderRefund(providerRefundId: string, request?: AdminApiRequest) {
    return this.request<ProviderRefundContract>(
      `/payments/refunds/${providerRefundId}/refresh`,
      { ...request, body: {}, method: "POST" },
    );
  }

  reserveSalesOrder(
    input: SalesOrderManagementActionInputContract,
    request?: AdminApiRequest,
  ) {
    return this.salesOrderAction("reserve", input, request);
  }

  confirmSalesOrder(
    input: SalesOrderManagementActionInputContract,
    request?: AdminApiRequest,
  ) {
    return this.salesOrderAction("confirm", input, request);
  }

  fulfillSalesOrder(
    input: SalesOrderManagementActionInputContract,
    request?: AdminApiRequest,
  ) {
    return this.salesOrderAction("fulfill", input, request);
  }

  cancelSalesOrder(
    input: SalesOrderManagementActionInputContract,
    request?: AdminApiRequest,
  ) {
    return this.salesOrderAction("cancel", input, request);
  }

  getOrganizationProfile(request?: AdminApiRequest) {
    return this.request<OrganizationProfileContract>("/organization", request);
  }

  updateOrganizationProfile(
    input: UpdateOrganizationProfileServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<OrganizationProfileContract>("/organization", {
      ...request,
      body: input,
      method: "PATCH",
    });
  }

  listStores(request?: AdminApiRequest) {
    return this.request<StoreManagementContract[]>(
      "/organization/stores",
      request,
    );
  }

  createStore(
    input: CreateStoreServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<StoreManagementContract>("/organization/stores", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  updateStore(
    input: UpdateStoreServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { storeId, ...body } = input;
    return this.request<StoreManagementContract>(
      `/organization/stores/${storeId}`,
      {
        ...request,
        body,
        method: "PATCH",
      },
    );
  }

  updateStoreStatus(
    input: UpdateStoreStatusServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { storeId, ...body } = input;
    return this.request<StoreManagementContract>(
      `/organization/stores/${storeId}/status`,
      { ...request, body, method: "PATCH" },
    );
  }

  listTeam(request?: AdminApiRequest) {
    return this.request<TeamMemberContract[]>("/organization/team", request);
  }

  createTeamMember(
    input: CreateTeamMemberServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<TeamMemberContract>("/organization/team", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  updateTeamMemberStatus(
    input: UpdateTeamMemberStatusServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { teamMemberId, ...body } = input;
    return this.request<TeamMemberContract>(
      `/organization/team/${teamMemberId}/status`,
      { ...request, body, method: "PATCH" },
    );
  }

  assignTeamMemberRole(
    input: AssignTeamMemberRoleServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { teamMemberId, ...body } = input;
    return this.request<TeamMemberContract>(
      `/organization/team/${teamMemberId}/role`,
      { ...request, body, method: "PATCH" },
    );
  }

  listRoles(request?: AdminApiRequest) {
    return this.request<RoleVisibilityContract[]>(
      "/organization/roles",
      request,
    );
  }

  listSalesCounters(request?: AdminApiRequest) {
    return this.request<SalesCounterContract[]>("/pos/counters", request);
  }

  createSalesCounter(
    input: CreateSalesCounterServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<SalesCounterContract>("/pos/counters", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  updateSalesCounterStatus(
    input: UpdateSalesCounterStatusServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { counterId, ...body } = input;
    return this.request<SalesCounterContract>(
      `/pos/counters/${counterId}/status`,
      { ...request, body, method: "PATCH" },
    );
  }

  listSalesSessions(request?: AdminApiRequest) {
    return this.request<SalesSessionContract[]>("/pos/sessions", request);
  }

  listCurrentSalesSessions(request?: AdminApiRequest) {
    return this.request<SalesSessionContract[]>(
      "/pos/sessions/current",
      request,
    );
  }

  openSalesSession(
    input: OpenSalesSessionServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<SalesSessionContract>("/pos/sessions/open", {
      ...request,
      body: input,
      method: "POST",
    });
  }

  closeSalesSession(
    input: CloseSalesSessionServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { sessionId, ...body } = input;
    return this.request<SalesSessionContract>(
      `/pos/sessions/${sessionId}/close`,
      { ...request, body, method: "POST" },
    );
  }

  getSessionReconciliationSummary(
    sessionId: string,
    request?: AdminApiRequest,
  ) {
    return this.request<PosSessionReconciliationSummaryContract>(
      `/pos/sessions/${sessionId}/reconciliation`,
      request,
    );
  }

  closeSessionWithSettlement(
    input: CloseSalesSessionWithSettlementServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { sessionId, ...body } = input;
    return this.request<PosRegisterSettlementContract>(
      `/pos/sessions/${sessionId}/settlement`,
      { ...request, body, method: "POST" },
    );
  }

  lookupPosSale(value: string, request?: AdminApiRequest) {
    return this.request<PosSaleLookupContract>(
      `/pos/barcode/${encodeURIComponent(value.trim())}`,
      request,
    );
  }

  getPosCart(cartId: string, request?: AdminApiRequest) {
    return this.request<PosCartDetailsContract>(
      `/pos/carts/${cartId}`,
      request,
    );
  }

  addPosCartItem(
    input: AddPosCartItemServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { cartId, ...body } = input;
    return this.request<PosCartLineContract>(`/pos/carts/${cartId}/items`, {
      ...request,
      body,
      method: "POST",
    });
  }

  updatePosCartItem(
    input: UpdatePosCartItemServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { cartId, itemId, ...body } = input;
    return this.request<PosCartLineContract>(
      `/pos/carts/${cartId}/items/${itemId}`,
      { ...request, body, method: "PATCH" },
    );
  }

  removePosCartItem(
    input: RemovePosCartItemServiceInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request<null>(
      `/pos/carts/${input.cartId}/items/${input.itemId}`,
      { ...request, method: "DELETE" },
    );
  }

  checkoutPosCart(
    input: CheckoutPosCartServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { cartId, ...body } = input;
    return this.request<PosCheckoutContract>(`/pos/carts/${cartId}/checkout`, {
      ...request,
      body,
      method: "POST",
    });
  }

  getPosCheckout(checkoutId: string, request?: AdminApiRequest) {
    return this.request<PosCheckoutContract>(
      `/pos/checkouts/${checkoutId}`,
      request,
    );
  }

  getPosReceipt(checkoutId: string, request?: AdminApiRequest) {
    return this.request<SalesReceiptContract>(
      `/pos/checkouts/${checkoutId}/receipt`,
      request,
    );
  }

  getPosPaymentAccount(checkoutId: string, request?: AdminApiRequest) {
    return this.request<PaymentAccountContract>(
      `/pos/checkouts/${checkoutId}/payments`,
      request,
    );
  }

  collectPosPayment(
    input: CollectPosPaymentServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { checkoutId, ...body } = input;
    return this.request<CollectPosPaymentResultContract>(
      `/pos/checkouts/${checkoutId}/payment-collections`,
      { ...request, body, method: "POST" },
    );
  }

  getPaymentCollectionReceipt(collectionId: string, request?: AdminApiRequest) {
    return this.request<PaymentCollectionReceiptContract>(
      `/pos/payment-collections/${collectionId}/receipt`,
      request,
    );
  }

  getPosRefunds(checkoutId: string, request?: AdminApiRequest) {
    return this.request<PaymentRefundAccountContract>(
      `/pos/checkouts/${checkoutId}/refunds`,
      request,
    );
  }

  createPosRefund(
    input: CreatePaymentRefundServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { checkoutId, ...body } = input;
    return this.request<PaymentRefundResultContract>(
      `/pos/checkouts/${checkoutId}/refunds`,
      { ...request, body, method: "POST" },
    );
  }

  getPosRefundReceipt(refundId: string, request?: AdminApiRequest) {
    return this.request<PaymentRefundReceiptContract>(
      `/pos/refunds/${refundId}/receipt`,
      request,
    );
  }

  getPosReturns(checkoutId: string, request?: AdminApiRequest) {
    return this.request<PosReturnAccountContract>(
      `/pos/checkouts/${checkoutId}/returns`,
      request,
    );
  }

  createPosReturn(
    input: CreatePosReturnServiceInputContract,
    request?: AdminApiRequest,
  ) {
    const { checkoutId, ...body } = input;
    return this.request<PosReturnResultContract>(
      `/pos/checkouts/${checkoutId}/returns`,
      { ...request, body, method: "POST" },
    );
  }

  getPosReturnReceipt(returnId: string, request?: AdminApiRequest) {
    return this.request<PosReturnReceiptContract>(
      `/pos/returns/${returnId}/receipt`,
      request,
    );
  }

  listPosCheckouts(request?: AdminApiRequest) {
    return this.request<PosCheckoutContract[]>("/pos/checkouts", request);
  }

  private salesOrderAction(
    action: "cancel" | "confirm" | "fulfill" | "reserve",
    input: SalesOrderManagementActionInputContract,
    request?: AdminApiRequest,
  ) {
    return this.request(`/sales/orders/${input.salesOrderId}/${action}`, {
      ...request,
      body: { expectedVersion: input.expectedVersion },
      method: "POST",
    });
  }
}

function queryString(input: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.requestId !== "string") {
    return false;
  }
  if (candidate.success === true) {
    return "data" in candidate;
  }
  if (candidate.success !== false || !candidate.error) {
    return false;
  }
  const error = candidate.error as Record<string, unknown>;
  return (
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    /^[A-Z_]+\.[A-Z0-9_]+$/u.test(error.code)
  );
}

function errorFromFailure(failure: ApiFailure, status: number): AdminApiError {
  return new AdminApiError({
    code: failure.error.code,
    details: failure.error.details,
    fieldErrors: failure.error.fieldErrors,
    message: failure.error.message,
    requestId: failure.requestId,
    status,
  });
}

function createClientError(input: {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  status: number;
}): AdminApiError {
  return new AdminApiError(input);
}
