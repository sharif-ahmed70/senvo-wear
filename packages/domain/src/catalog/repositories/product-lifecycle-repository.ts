import type { Role } from "../../identity/domain/models.js";
import type { Product, ProductVariant } from "../domain/models.js";

export type ProductLifecycleRepository = {
  findLocked(
    productId: string,
    organizationId: string,
  ): Promise<Product | null>;
  hasHistory(productId: string, organizationId: string): Promise<boolean>;
  update(
    product: Product,
    changes: Partial<
      Pick<Product, "name" | "description" | "categoryId" | "status">
    >,
  ): Promise<Product>;
  delete(product: Product): Promise<void>;

  // One variant (colour/size) of a product.
  findVariantLocked?(
    variantId: string,
    organizationId: string,
  ): Promise<ProductVariant | null>;
  variantHasHistory?(
    variantId: string,
    organizationId: string,
  ): Promise<boolean>;
  updateVariantStatus?(
    variant: ProductVariant,
    status: ProductVariant["status"],
  ): Promise<ProductVariant>;
  deleteVariant?(variant: ProductVariant): Promise<void>;
  /** The actor's active role in the organization, read from the database. */
  actorRole?(userId: string, organizationId: string): Promise<Role | null>;
};
