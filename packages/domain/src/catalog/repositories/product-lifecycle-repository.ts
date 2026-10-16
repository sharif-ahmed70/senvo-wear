import type { Product } from "../domain/models.js";

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
};
