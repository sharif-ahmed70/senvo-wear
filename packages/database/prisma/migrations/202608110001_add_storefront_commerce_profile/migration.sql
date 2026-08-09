CREATE TYPE "CommerceOrderSource" AS ENUM ('STOREFRONT');
CREATE TYPE "CommercePaymentPreference" AS ENUM ('CASH_ON_DELIVERY');

CREATE TABLE "sales_order_commerce_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "source" "CommerceOrderSource" NOT NULL DEFAULT 'STOREFRONT',
    "payment_preference" "CommercePaymentPreference" NOT NULL,
    "request_signature" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_order_commerce_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_order_commerce_profiles_id_organization_id_key"
ON "sales_order_commerce_profiles"("id", "organization_id");
CREATE UNIQUE INDEX "sales_order_commerce_profiles_sales_order_id_organization_i_key"
ON "sales_order_commerce_profiles"("sales_order_id", "organization_id");
CREATE INDEX "sales_order_commerce_profiles_organization_id_source_create_idx"
ON "sales_order_commerce_profiles"("organization_id", "source", "created_at", "id");

ALTER TABLE "sales_order_commerce_profiles"
ADD CONSTRAINT "sales_order_commerce_profiles_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_commerce_profiles"
ADD CONSTRAINT "sales_order_commerce_profiles_sales_order_id_organization__fkey"
FOREIGN KEY ("sales_order_id", "organization_id") REFERENCES "sales_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
