CREATE TYPE "MediaType" AS ENUM ('IMAGE');
CREATE TYPE "MediaAssetStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "CatalogMediaRole" AS ENUM ('PRIMARY', 'GALLERY');
CREATE TYPE "CatalogMediaLinkStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "media_type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "content_type" VARCHAR(100) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "alt_text" VARCHAR(240) NOT NULL,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "idempotency_key" VARCHAR(120) NOT NULL,
    "request_signature" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_media_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "role" "CatalogMediaRole" NOT NULL DEFAULT 'PRIMARY',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogMediaLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "catalog_media_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_assets_id_organization_id_key" ON "media_assets"("id", "organization_id");
CREATE UNIQUE INDEX "media_assets_organization_id_storage_key_key" ON "media_assets"("organization_id", "storage_key");
CREATE UNIQUE INDEX "media_assets_organization_id_idempotency_key_key" ON "media_assets"("organization_id", "idempotency_key");
CREATE INDEX "media_assets_organization_id_status_created_at_id_idx" ON "media_assets"("organization_id", "status", "created_at", "id");
CREATE UNIQUE INDEX "catalog_media_links_id_organization_id_key" ON "catalog_media_links"("id", "organization_id");
CREATE UNIQUE INDEX "catalog_media_links_media_asset_id_key" ON "catalog_media_links"("media_asset_id");
CREATE UNIQUE INDEX "catalog_media_links_one_active_primary_per_product" ON "catalog_media_links"("product_id") WHERE "role" = 'PRIMARY' AND "status" = 'ACTIVE';
CREATE INDEX "catalog_media_links_organization_id_product_id_role_status_idx" ON "catalog_media_links"("organization_id", "product_id", "role", "status");
CREATE INDEX "catalog_media_links_organization_id_media_asset_id_idx" ON "catalog_media_links"("organization_id", "media_asset_id");

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_media_links" ADD CONSTRAINT "catalog_media_links_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_media_links" ADD CONSTRAINT "catalog_media_links_media_asset_id_organization_id_fkey"
FOREIGN KEY ("media_asset_id", "organization_id") REFERENCES "media_assets"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_media_links" ADD CONSTRAINT "catalog_media_links_product_id_organization_id_fkey"
FOREIGN KEY ("product_id", "organization_id") REFERENCES "products"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
