export type MediaAssetStatus = "ACTIVE" | "ARCHIVED";
export type CatalogMediaLinkStatus = "ACTIVE" | "ARCHIVED";
export type CatalogMediaRole = "PRIMARY" | "GALLERY";

export type MediaAsset = {
  altText: string;
  byteSize: number;
  contentType: string;
  createdAt: Date;
  id: string;
  idempotencyKey: string;
  mediaType: "IMAGE";
  organizationId: string;
  requestSignature: string;
  status: MediaAssetStatus;
  storageKey: string;
  updatedAt: Date;
  version: number;
};

export type CatalogMediaLink = {
  createdAt: Date;
  id: string;
  mediaAssetId: string;
  organizationId: string;
  productId: string;
  role: CatalogMediaRole;
  sortOrder: number;
  status: CatalogMediaLinkStatus;
  updatedAt: Date;
};

export type PrimaryProductMedia = {
  asset: MediaAsset;
  link: CatalogMediaLink;
};
