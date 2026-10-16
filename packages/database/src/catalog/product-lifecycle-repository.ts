import {
  ConflictError,
  type Product,
  type ProductLifecycleRepository,
} from "@senvo/domain";
import type { Prisma } from "../../generated/prisma/client.js";

export const PRODUCT_HISTORY = "This product has history. Archive it instead.";

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
        where: {
          productId,
          organizationId,
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
        },
      })) > 0
    );
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
