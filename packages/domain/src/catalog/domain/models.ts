import type {
  CatalogStatus,
  OrganizationStatus,
  ProductStatus,
  ProductVariantStatus,
} from "./value-objects.js";

export type Organization = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  code: string;
  countryCode: string;
  createdAt: Date;
  district: string | null;
  email: string | null;
  id: string;
  name: string;
  phone: string | null;
  postalCode: string | null;
  status: OrganizationStatus;
  timezone: string;
  updatedAt: Date;
  version: number;
};

export type Category = {
  createdAt: Date;
  description: string | null;
  id: string;
  name: string;
  organizationId: string;
  parentId: string | null;
  slug: string;
  sortOrder: number;
  status: CatalogStatus;
  updatedAt: Date;
};

export type Collection = {
  createdAt: Date;
  description: string | null;
  id: string;
  name: string;
  organizationId: string;
  slug: string;
  status: CatalogStatus;
  updatedAt: Date;
};

export type Color = {
  code: string;
  createdAt: Date;
  hexValue: string | null;
  id: string;
  name: string;
  normalizedName: string;
  organizationId: string;
  status: CatalogStatus;
  updatedAt: Date;
};

export type Size = {
  code: string;
  createdAt: Date;
  id: string;
  name: string;
  organizationId: string;
  sortOrder: number;
  status: CatalogStatus;
  updatedAt: Date;
};

export type Product = {
  categoryId: string;
  createdAt: Date;
  description: string | null;
  id: string;
  name: string;
  organizationId: string;
  productCode: string;
  slug: string;
  status: ProductStatus;
  updatedAt: Date;
};

export type ProductVariant = {
  sellingPriceMinor: number;
  colorId: string;
  createdAt: Date;
  id: string;
  organizationId: string;
  productId: string;
  sizeId: string;
  sku: string;
  status: ProductVariantStatus;
  updatedAt: Date;
};

export type BarcodeType = "EAN13" | "CODE128" | "UPC" | "INTERNAL";
export type BarcodeStatus = "ACTIVE" | "INACTIVE";

export type VariantBarcode = {
  createdAt: Date;
  id: string;
  organizationId: string;
  productVariantId: string;
  status: BarcodeStatus;
  type: BarcodeType;
  updatedAt: Date;
  value: string;
};

export type BarcodeLookupResult = {
  barcode: VariantBarcode;
  color: string;
  productName: string;
  size: string;
  sku: string;
  sellingPriceMinor: number;
  variantId: string;
  variantStatus: ProductVariantStatus;
};
