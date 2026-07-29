import type {
  ApiErrorCode,
  ApiFailure,
  ApiResponse,
  CategoryContract,
  CollectionContract,
  CreateCategoryServiceInputContract,
  CreateCollectionServiceInputContract,
  CreateProductServiceInputContract,
  CreateProductVariantServiceInputContract,
  ProductContract,
  ProductDetailsContract,
  ProductVariantContract,
  PublicErrorDetails,
  UpdateCategoryStatusServiceInputContract,
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
