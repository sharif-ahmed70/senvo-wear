ALTER TABLE "catalog_media_links"
ADD COLUMN "product_variant_id" UUID;

ALTER TABLE "product_collections"
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "catalog_media_links"
ADD CONSTRAINT "catalog_media_links_sort_order_nonnegative_check"
CHECK ("sort_order" >= 0);

ALTER TABLE "product_collections"
ADD CONSTRAINT "product_collections_sort_order_nonnegative_check"
CHECK ("sort_order" >= 0);

CREATE UNIQUE INDEX "product_variants_id_product_org_key"
ON "product_variants"("id", "product_id", "organization_id");

ALTER TABLE "catalog_media_links"
ADD CONSTRAINT "catalog_media_links_variant_product_org_fkey"
FOREIGN KEY ("product_variant_id", "product_id", "organization_id")
REFERENCES "product_variants"("id", "product_id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "catalog_media_links_org_product_variant_status_order_idx"
ON "catalog_media_links"(
  "organization_id",
  "product_id",
  "product_variant_id",
  "status",
  "sort_order"
);

DROP INDEX "product_collections_organization_id_collection_id_idx";

CREATE INDEX "product_collections_org_collection_order_created_product_idx"
ON "product_collections"(
  "organization_id",
  "collection_id",
  "sort_order",
  "created_at",
  "product_id"
);
