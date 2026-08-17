export type StorefrontVariant = {
  availability: "IN_STOCK" | "OUT_OF_STOCK";
  color: { code: string; hexValue: string; name: string };
  id: string;
  sellingPriceMinor: number;
  size: { code: string; name: string; sortOrder: number };
  sku: string;
};
export type StorefrontProduct = {
  category: { code: string; id: string; name: string };
  collection: { code: string; id: string; name: string } | null;
  description: string | null;
  id: string;
  name: string;
  media?: {
    altText: string;
    assetId: string;
    byteSize: number;
    contentType: string;
    linkId: string;
    productVariantId: string | null;
    role: "PRIMARY" | "GALLERY";
    sortOrder: number;
    url: string;
  }[];
  primaryImage: {
    altText: string;
    assetId: string;
    byteSize: number;
    contentType: string;
    url: string;
  } | null;
  productCode: string;
  slug: string;
  variants: StorefrontVariant[];
};
export type StorefrontCatalog = {
  categories: { code: string; id: string; name: string }[];
  collections: { code: string; id: string; name: string }[];
  hasMore: boolean;
  page: number;
  pageSize: number;
  products: StorefrontProduct[];
};
export type CheckoutResult = {
  currencyCode: "BDT";
  orderId: string;
  orderNumber: string;
  paymentPreference: "CASH_ON_DELIVERY";
  status: "RESERVED";
  totalMinor: number;
};
type ApiResponse<T> =
  | { data: T; requestId: string; success: true }
  | {
      error: { code: string; message: string };
      requestId: string;
      success: false;
    };
export function storefrontApiBaseUrl(
  configured = process.env.NEXT_PUBLIC_SENVO_API_URL,
): string {
  const value = configured?.trim();
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_SENVO_API_URL is required for Storefront API requests.",
    );
  }
  return value.replace(/\/$/u, "");
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${storefrontApiBaseUrl()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.success)
    throw new StorefrontApiError(
      body.error.code,
      body.error.message,
      body.requestId,
    );
  return body.data;
}
export class StorefrontApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId: string,
  ) {
    super(message);
    this.name = "StorefrontApiError";
  }
}
export const storefrontApi = {
  catalog(
    filters: {
      category?: string;
      collection?: string;
      pageSize?: string;
      search?: string;
      page?: string;
    } = {},
  ) {
    const query = new URLSearchParams(
      Object.entries(filters).filter((entry): entry is [string, string] =>
        Boolean(entry[1]),
      ),
    );
    return request<StorefrontCatalog>(
      `/storefront/catalog?${query.toString()}`,
    );
  },
  async fullCatalog() {
    const first = await this.catalog({ page: "1", pageSize: "48" });
    const products = [...first.products];
    let page = first.page;
    let hasMore = first.hasMore;
    while (hasMore) {
      page += 1;
      const next = await this.catalog({
        page: String(page),
        pageSize: "48",
      });
      products.push(...next.products);
      hasMore = next.hasMore;
    }
    return { ...first, hasMore: false, products };
  },
  checkout(input: unknown) {
    return request<CheckoutResult>("/storefront/checkouts", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  product(slug: string) {
    return request<StorefrontProduct>(
      `/storefront/products/${encodeURIComponent(slug)}`,
    );
  },
};
export function taka(minor: number): string {
  return new Intl.NumberFormat("en-BD", {
    currency: "BDT",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(minor / 100);
}
