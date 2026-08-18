import {
  BusinessRuleError,
  NotFoundError,
  type StorefrontCatalog,
  type StorefrontProduct,
  type StorefrontRepository,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type StorefrontPrismaClient = Pick<
  PrismaClient,
  | "$executeRaw"
  | "$queryRaw"
  | "inventoryAllocationPolicy"
  | "organization"
  | "product"
  | "productCollection"
  | "salesOrderCommerceProfile"
>;

type AvailabilityRow = { product_variant_id: string };

const productInclude = {
  category: true,
  collections: {
    include: { collection: true },
    orderBy: { createdAt: "asc" },
    where: { collection: { status: "ACTIVE" } },
  },
  variants: {
    include: { color: true, size: true },
    orderBy: [{ size: { sortOrder: "asc" } }, { sku: "asc" }],
    where: { status: "ACTIVE" },
  },
} satisfies Prisma.ProductInclude;
type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

export class PrismaStorefrontRepository implements StorefrontRepository {
  constructor(private readonly prisma: StorefrontPrismaClient) {}

  async resolveActiveOrganizationByCode(code: string) {
    return this.prisma.organization.findFirst({
      select: { id: true, name: true },
      where: { code, status: "ACTIVE" },
    });
  }

  async listCatalog(input: {
    category?: string;
    color?: string;
    collection?: string;
    organizationId: string;
    page?: number;
    pageSize?: number;
    search?: string;
    size?: string;
  }): Promise<StorefrontCatalog> {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 24;
    const collectionOrder = input.collection
      ? await this.prisma.productCollection.findMany({
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
            { productId: "asc" },
          ],
          select: { productId: true },
          where: {
            collection: { slug: input.collection, status: "ACTIVE" },
            organizationId: input.organizationId,
          },
        })
      : [];
    const collectionRank = new Map(
      collectionOrder.map((item, index) => [item.productId, index]),
    );
    const [products, categories, collections] = await Promise.all([
      this.prisma.product.findMany({
        include: productInclude,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: input.collection ? undefined : (page - 1) * pageSize,
        take: input.collection ? undefined : pageSize + 1,
        where: {
          category: input.category
            ? { slug: input.category, status: "ACTIVE" }
            : { status: "ACTIVE" },
          id: input.collection
            ? { in: collectionOrder.map((item) => item.productId) }
            : undefined,
          OR: input.search
            ? [
                { name: { contains: input.search, mode: "insensitive" } },
                {
                  productCode: { contains: input.search, mode: "insensitive" },
                },
              ]
            : undefined,
          organizationId: input.organizationId,
          status: "ACTIVE",
          variants:
            input.color || input.size
              ? {
                  some: {
                    color: input.color
                      ? { code: input.color.toUpperCase() }
                      : undefined,
                    size: input.size
                      ? { code: input.size.toUpperCase() }
                      : undefined,
                    status: "ACTIVE",
                  },
                }
              : undefined,
        },
      }),
      this.prisma.product.findMany({
        distinct: ["categoryId"],
        include: { category: true },
        where: {
          category: { status: "ACTIVE" },
          organizationId: input.organizationId,
          status: "ACTIVE",
        },
      }),
      this.prisma.product.findMany({
        include: { collections: { include: { collection: true } } },
        where: { organizationId: input.organizationId, status: "ACTIVE" },
      }),
    ]);
    const orderedProducts = input.collection
      ? products
          .sort(
            (left, right) =>
              (collectionRank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
              (collectionRank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
          )
          .slice((page - 1) * pageSize, page * pageSize + 1)
      : products;
    const available = await this.availableVariantIds(input.organizationId);
    const collectionMap = new Map<
      string,
      { code: string; id: string; name: string }
    >();
    for (const product of collections) {
      for (const link of product.collections) {
        if (link.collection.status === "ACTIVE") {
          collectionMap.set(link.collection.id, {
            code: link.collection.slug,
            id: link.collection.id,
            name: link.collection.name,
          });
        }
      }
    }
    return {
      categories: categories.map(({ category }) => ({
        code: category.slug,
        id: category.id,
        name: category.name,
      })),
      collections: [...collectionMap.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
      hasMore: orderedProducts.length > pageSize,
      page,
      pageSize,
      products: orderedProducts
        .slice(0, pageSize)
        .map((product) => mapProduct(product as never, available)),
    };
  }

  async getProductBySlug(
    organizationId: string,
    slug: string,
  ): Promise<StorefrontProduct | null> {
    const product = await this.prisma.product.findFirst({
      include: productInclude,
      where: {
        category: { status: "ACTIVE" },
        organizationId,
        slug,
        status: "ACTIVE",
      },
    });
    if (!product) return null;
    const available = await this.availableVariantIds(organizationId);
    return mapProduct(product, available);
  }

  async loadCheckoutFacts(
    organizationId: string,
    productVariantIds: readonly string[],
  ) {
    const [policy, product] = await Promise.all([
      this.prisma.inventoryAllocationPolicy.findFirst({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        where: { organizationId, status: "ACTIVE" },
      }),
      this.prisma.product.findMany({
        include: {
          variants: {
            where: { id: { in: [...productVariantIds] }, status: "ACTIVE" },
          },
        },
        where: {
          organizationId,
          status: "ACTIVE",
          variants: {
            some: { id: { in: [...productVariantIds] }, status: "ACTIVE" },
          },
        },
      }),
    ]);
    if (!policy)
      throw new BusinessRuleError(
        "Storefront inventory allocation is not configured.",
      );
    const variants = product.flatMap((item) =>
      item.variants.map((variant) => ({
        id: variant.id,
        productName: item.name,
        sellingPriceMinor: variant.sellingPriceMinor,
      })),
    );
    if (variants.length !== new Set(productVariantIds).size) {
      throw new NotFoundError("One or more products are no longer available.");
    }
    return { allocationPolicyId: policy.id, variants };
  }

  async findCheckoutByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ) {
    const profile = await this.prisma.salesOrderCommerceProfile.findFirst({
      include: { salesOrder: true },
      where: { organizationId, salesOrder: { idempotencyKey } },
    });
    if (!profile) return null;
    return {
      currencyCode: profile.salesOrder.currencyCode,
      orderId: profile.salesOrderId,
      orderNumber: profile.salesOrder.orderNumber,
      paymentPreference: profile.paymentPreference,
      requestSignature: profile.requestSignature,
      status: profile.salesOrder.status,
      totalMinor: profile.salesOrder.totalMinor,
    };
  }

  async lockCheckoutAttempt(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.prisma
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${idempotencyKey}`}, 0))`;
  }

  async createCommerceProfile(input: {
    id: string;
    organizationId: string;
    paymentPreference: "CASH_ON_DELIVERY" | "ONLINE_PAYMENT";
    requestSignature: string;
    salesOrderId: string;
    source: "STOREFRONT";
  }) {
    return this.prisma.salesOrderCommerceProfile.create({
      data: input,
      select: {
        paymentPreference: true,
        requestSignature: true,
        salesOrderId: true,
        source: true,
      },
    });
  }

  private async availableVariantIds(
    organizationId: string,
  ): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<AvailabilityRow[]>`
      WITH on_hand AS (
        SELECT line.product_variant_id, movement.destination_location_id AS location_id, SUM(line.quantity)::bigint AS quantity
        FROM inventory_movement_lines line
        JOIN inventory_movements movement ON movement.id = line.movement_id AND movement.organization_id = line.organization_id
        WHERE line.organization_id = ${organizationId}::uuid AND movement.status = 'POSTED' AND movement.destination_location_id IS NOT NULL
        GROUP BY line.product_variant_id, movement.destination_location_id
        UNION ALL
        SELECT line.product_variant_id, movement.source_location_id AS location_id, -SUM(line.quantity)::bigint AS quantity
        FROM inventory_movement_lines line
        JOIN inventory_movements movement ON movement.id = line.movement_id AND movement.organization_id = line.organization_id
        WHERE line.organization_id = ${organizationId}::uuid AND movement.status = 'POSTED' AND movement.source_location_id IS NOT NULL
        GROUP BY line.product_variant_id, movement.source_location_id
      ), reserved AS (
        SELECT line.product_variant_id, reservation.stock_location_id AS location_id, SUM(line.quantity)::bigint AS quantity
        FROM inventory_reservation_lines line
        JOIN inventory_reservations reservation ON reservation.id = line.reservation_id AND reservation.organization_id = line.organization_id
        WHERE line.organization_id = ${organizationId}::uuid AND reservation.status = 'ACTIVE'
        GROUP BY line.product_variant_id, reservation.stock_location_id
      )
      SELECT stock.product_variant_id
      FROM (SELECT product_variant_id, location_id, SUM(quantity)::bigint AS quantity FROM on_hand GROUP BY product_variant_id, location_id) stock
      JOIN stock_locations location ON location.id = stock.location_id AND location.organization_id = ${organizationId}::uuid
      JOIN branches branch ON branch.id = location.branch_id AND branch.organization_id = location.organization_id
      LEFT JOIN reserved ON reserved.product_variant_id = stock.product_variant_id AND reserved.location_id = stock.location_id
      WHERE location.status = 'ACTIVE' AND location.is_sellable = TRUE AND branch.status = 'ACTIVE'
      GROUP BY stock.product_variant_id
      HAVING SUM(stock.quantity - COALESCE(reserved.quantity, 0)) > 0
    `;
    return new Set(rows.map((row) => row.product_variant_id));
  }
}

function mapProduct(
  product: ProductRecord,
  available: ReadonlySet<string>,
): StorefrontProduct {
  const collection = product.collections.at(0)?.collection ?? null;
  return {
    category: {
      code: product.category.slug,
      id: product.category.id,
      name: product.category.name,
    },
    collection: collection
      ? { code: collection.slug, id: collection.id, name: collection.name }
      : null,
    description: product.description,
    id: product.id,
    name: product.name,
    media: [],
    primaryImage: null,
    productCode: product.productCode,
    slug: product.slug,
    variants: product.variants.map((variant) => ({
      availability: available.has(variant.id) ? "IN_STOCK" : "OUT_OF_STOCK",
      color: {
        code: variant.color.code,
        hexValue: variant.color.hexValue ?? "#777777",
        name: variant.color.name,
      },
      id: variant.id,
      sellingPriceMinor: variant.sellingPriceMinor,
      size: {
        code: variant.size.code,
        name: variant.size.name,
        sortOrder: variant.size.sortOrder,
      },
      sku: variant.sku,
    })),
  };
}
