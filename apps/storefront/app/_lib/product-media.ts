import type { StorefrontProduct } from "./storefront-api";

export function mediaForVariant(
  media: NonNullable<StorefrontProduct["media"]>,
  variantId: string,
) {
  const variantMedia = media.filter(
    (image) => image.productVariantId === variantId,
  );
  const productMedia = media.filter(
    (image) => image.role === "PRIMARY" || image.productVariantId === null,
  );
  const source = variantMedia.length > 0 ? variantMedia : productMedia;
  return source.filter(
    (image, index) =>
      source.findIndex((candidate) => candidate.assetId === image.assetId) ===
      index,
  );
}
