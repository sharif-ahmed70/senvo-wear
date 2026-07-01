import type {
  CatalogStatus,
  OrganizationStatus,
  ProductStatus,
  ProductVariantStatus,
} from "./value-objects.js";

export type Organization = {
  code: string;
  createdAt: Date;
  id: string;
  name: string;
  status: OrganizationStatus;
  updatedAt: Date;
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
