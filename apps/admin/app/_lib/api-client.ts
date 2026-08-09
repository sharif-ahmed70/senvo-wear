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
  CreateSizeServiceInputContract,
  GetVariantAvailabilityServiceInputContract,
  InventoryAvailabilityReadContract,
  InventoryMovementHistoryContract,
  InventoryReadPageContract,
  ListInventoryAvailabilityServiceInputContract,
  ListInventoryMovementsServiceInputContract,
  ListStockLocationsServiceInputContract,
  ProductContract,
  ProductDetailsContract,
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
  CloseSalesSessionServiceInputContract,
  AddPosCartItemServiceInputContract,
  UpdatePosCartItemServiceInputContract,
  RemovePosCartItemServiceInputContract,
} from "@senvo/contracts";

export type AdminApiClientOptions = {
  baseUrl?: string;
  createRequestId?: () => string;
  fetcher?: typeof fetch;
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

export class AdminApiClient {
  private readonly baseUrl: string;
  private readonly createRequestId: () => string;
  private readonly fetcher: typeof fetch;

  constructor(options: AdminApiClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/u, "") ?? "";
    this.createRequestId =
      options.createRequestId ?? (() => crypto.randomUUID());
    this.fetcher = options.fetcher ?? fetch;
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

    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
        headers,
        method: request.method ?? "GET",
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
