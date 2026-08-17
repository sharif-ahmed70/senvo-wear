import type {
  MediaAsset,
  ProductMedia,
  PrimaryProductMedia,
} from "../domain/media-models.js";

export type CreatePrimaryProductMediaRecord = Pick<
  MediaAsset,
  | "altText"
  | "byteSize"
  | "contentType"
  | "id"
  | "idempotencyKey"
  | "mediaType"
  | "organizationId"
  | "requestSignature"
  | "storageKey"
> & { linkId: string; productId: string };

export type CreateProductMediaRecord = CreatePrimaryProductMediaRecord & {
  productVariantId: string | null;
  role: "GALLERY" | "PRIMARY";
};

export type CatalogMediaRepository = {
  add(record: CreateProductMediaRecord): Promise<ProductMedia>;
  archive(input: {
    linkId: string;
    organizationId: string;
    productId: string;
  }): Promise<ProductMedia | null>;
  archivePrimary(input: {
    organizationId: string;
    productId: string;
  }): Promise<PrimaryProductMedia | null>;
  findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<PrimaryProductMedia | null>;
  findPrimary(
    organizationId: string,
    productId: string,
  ): Promise<PrimaryProductMedia | null>;
  listArchivedStorageKeys(
    organizationId: string,
    limit: number,
  ): Promise<string[]>;
  listPrimary(
    organizationId: string,
    productIds: readonly string[],
  ): Promise<PrimaryProductMedia[]>;
  listProductMedia(
    organizationId: string,
    productId: string,
  ): Promise<ProductMedia[]>;
  reorder(input: {
    linkIds: readonly string[];
    organizationId: string;
    productId: string;
  }): Promise<ProductMedia[]>;
  setPrimary(input: {
    linkId: string;
    organizationId: string;
    productId: string;
  }): Promise<ProductMedia[]>;
  updateMetadata(input: {
    altText: string;
    linkId: string;
    organizationId: string;
    productId: string;
    productVariantId: string | null;
  }): Promise<ProductMedia | null>;
  replacePrimary(record: CreatePrimaryProductMediaRecord): Promise<{
    current: PrimaryProductMedia;
    previous: PrimaryProductMedia | null;
  }>;
};
