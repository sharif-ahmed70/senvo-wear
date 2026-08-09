import type {
  StorefrontCatalog,
  StorefrontCheckoutFacts,
  StorefrontCommerceProfile,
  StorefrontProduct,
} from "./models.js";

export type StorefrontRepository = {
  createCommerceProfile(input: {
    id: string;
    organizationId: string;
    paymentPreference: "CASH_ON_DELIVERY";
    requestSignature: string;
    salesOrderId: string;
    source: "STOREFRONT";
  }): Promise<StorefrontCommerceProfile>;
  findCheckoutByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<{
    currencyCode: string;
    orderId: string;
    orderNumber: string;
    paymentPreference: "CASH_ON_DELIVERY";
    requestSignature: string;
    status: string;
    totalMinor: number;
  } | null>;
  getProductBySlug(
    organizationId: string,
    slug: string,
  ): Promise<StorefrontProduct | null>;
  listCatalog(input: {
    category?: string;
    color?: string;
    collection?: string;
    organizationId: string;
    page?: number;
    pageSize?: number;
    search?: string;
    size?: string;
  }): Promise<StorefrontCatalog>;
  loadCheckoutFacts(
    organizationId: string,
    productVariantIds: readonly string[],
  ): Promise<StorefrontCheckoutFacts>;
  lockCheckoutAttempt(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<void>;
  resolveActiveOrganizationByCode(
    code: string,
  ): Promise<{ id: string; name: string } | null>;
};
