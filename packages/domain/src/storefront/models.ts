export type StorefrontAvailability = "IN_STOCK" | "OUT_OF_STOCK";
export type CommerceOrderSource = "STOREFRONT";
export type CommercePaymentPreference = "CASH_ON_DELIVERY" | "ONLINE_PAYMENT";

export type StorefrontVariant = {
  availability: StorefrontAvailability;
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

export type StorefrontCheckoutFacts = {
  allocationPolicyId: string;
  variants: {
    id: string;
    productName: string;
    sellingPriceMinor: number;
  }[];
};

export type StorefrontCommerceProfile = {
  paymentPreference: CommercePaymentPreference;
  requestSignature: string;
  salesOrderId: string;
  source: CommerceOrderSource;
};
