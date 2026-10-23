import {
  ConflictError,
  type Product,
  type ProductLifecycleRepository,
  type ProductVariant,
} from "@senvo/domain";
import type { Prisma } from "../../generated/prisma/client.js";

export const PRODUCT_HISTORY = "This product has history. Archive it instead.";
export const VARIANT_HISTORY =
  "This option has stock or sales history. Archive it instead.";

// Every historical relation on ProductVariant (see hasHistory).
const variantHistoryWhere = {
  OR: [
    { inventoryMovementLines: { some: {} } },
    { inventoryReservationLines: { some: {} } },
    { salesOrderLines: { some: {} } },
    { posCartLines: { some: {} } },
    { posSaleReturnLines: { some: {} } },
    { purchaseLines: { some: {} } },
    { costState: { isNot: null } },
    { costEntries: { some: {} } },
    { saleCostSnapshots: { some: {} } },
  ],
} satisfies Prisma.ProductVariantWhereInput;

/** Must be used within the application transaction, including its audit write. */
export class PrismaProductLifecycleRepository implements ProductLifecycleRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async findLocked(productId: string, organizationId: string) {
    await this.tx
      .$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
    return this.tx.product.findFirst({
      where: { id: productId, organizationId },
    });
  }

  async hasHistory(productId: string, organizationId: string) {
    // These are every historical relation on ProductVariant. Stock intake creates
    // purchase/movement lines; checkout retains both cart and sales-order lines.
    // Inventory balances are derived from movements; costState is also retained.
    return (
      (await this.tx.productVariant.count({
        where: { productId, organizationId, ...variantHistoryWhere },
      })) > 0
    );
  }

  async findVariantLocked(variantId: string, organizationId: string) {
    await this.tx
      .$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
    return this.tx.productVariant.findFirst({
      where: { id: variantId, organizationId },
    });
  }

  async variantHasHistory(variantId: string, organizationId: string) {
    return (
      (await this.tx.productVariant.count({
        where: { id: variantId, organizationId, ...variantHistoryWhere },
      })) > 0
    );
  }

  async updateVariantStatus(
    variant: ProductVariant,
    status: ProductVariant["status"],
  ) {
    return this.tx.productVariant.update({
      where: { id: variant.id, organizationId: variant.organizationId },
      data: {
        status,
        updatedAt: new Date(
          Math.max(Date.now(), variant.updatedAt.getTime() + 1),
        ),
      },
    });
  }

  async deleteVariant(variant: ProductVariant) {
    const { id: productVariantId, organizationId } = variant;
    if (await this.variantHasHistory(productVariantId, organizationId))
      throw new ConflictError(VARIANT_HISTORY);
    const siblings = await this.tx.productVariant.count({
      where: { productId: variant.productId, organizationId },
    });
    if (siblings <= 1)
      throw new ConflictError(
        "This is the product's only option. Archive or delete the product instead.",
      );
    try {
      await this.tx.catalogMediaLink.deleteMany({
        where: { productVariantId, organizationId },
      });
      await this.tx.variantBarcode.deleteMany({
        where: { productVariantId, organizationId },
      });
      await this.tx.productVariant.delete({
        where: { id: productVariantId, organizationId },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2003"
      )
        throw new ConflictError(VARIANT_HISTORY, error);
      throw error;
    }
  }

  async actorRole(userId: string, organizationId: string) {
    const membership = await this.tx.organizationMembership.findFirst({
      where: { userId, organizationId, status: "ACTIVE" },
      select: { role: true },
    });
    return membership?.role ?? null;
  }

  async update(
    product: Product,
    changes: Partial<
      Pick<Product, "name" | "description" | "categoryId" | "status">
    >,
  ) {
    // Monotonic millisecond token, including rapid writes on the same clock tick.
    return this.tx.product.update({
      where: { id: product.id, organizationId: product.organizationId },
      data: {
        ...changes,
        updatedAt: new Date(
          Math.max(Date.now(), product.updatedAt.getTime() + 1),
        ),
      },
    });
  }

  async delete(product: Product) {
    const organizationId = product.organizationId;
    const productId = product.id;
    // Lock variants too: concurrent historical FK inserts must complete before
    // this check or fail after deletion. FK failures roll back the entire unit.
    await this.tx
      .$queryRaw`SELECT id FROM product_variants WHERE product_id = ${productId}::uuid AND organization_id = ${organizationId}::uuid ORDER BY id FOR UPDATE`;
    if (await this.hasHistory(productId, organizationId))
      throw new ConflictError(PRODUCT_HISTORY);
    try {
      await this.tx.catalogMediaLink.deleteMany({
        where: { productId, organizationId },
      });
      await this.tx.variantBarcode.deleteMany({
        where: { organizationId, productVariant: { productId } },
      });
      await this.tx.productCollection.deleteMany({
        where: { productId, organizationId },
      });
      await this.tx.productVariant.deleteMany({
        where: { productId, organizationId },
      });
      await this.tx.product.delete({
        where: { id: productId, organizationId },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2003"
      )
        throw new ConflictError(PRODUCT_HISTORY, error);
      throw error;
    }
  }
}
