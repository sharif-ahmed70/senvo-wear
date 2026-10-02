import type { AuditMetadata } from "../../audit/domain/models.js";
import type {
  Category,
  ProductVariant,
  Size,
} from "../../catalog/domain/models.js";

/**
 * Organization-scoped lookups needed by the stock intake workflow that the
 * existing catalog and procurement repositories do not expose.
 */
export type StockIntakeRepository = {
  /** Serializes concurrent intakes that share an idempotency key. */
  acquireIdempotencyLock(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<void>;
  /** Case-insensitive category name match under `parentId` (null = top level). */
  findCategoryByName(
    organizationId: string,
    parentId: string | null,
    name: string,
  ): Promise<Category | null>;
  findMaxSizeSortOrder(organizationId: string): Promise<number | null>;
  /** Case-insensitive match on size name or size code. */
  findSizeByNameOrCode(
    organizationId: string,
    value: string,
  ): Promise<Size | null>;
  findStockIntakeAuditMetadata(
    organizationId: string,
    purchaseId: string,
  ): Promise<AuditMetadata | null>;
  findVariantByCombination(
    organizationId: string,
    productId: string,
    colorId: string,
    sizeId: string,
  ): Promise<ProductVariant | null>;
  findVariantById(
    organizationId: string,
    variantId: string,
  ): Promise<ProductVariant | null>;
  isActiveStockLocation(
    organizationId: string,
    stockLocationId: string,
  ): Promise<boolean>;
  listProductCodesWithPrefix(
    organizationId: string,
    prefix: string,
  ): Promise<string[]>;
  listSupplierCodesWithPrefix(
    organizationId: string,
    prefix: string,
  ): Promise<string[]>;
};
