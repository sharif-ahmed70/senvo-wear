import {
  createCategory,
  createCollection,
  createColor,
  createOrganization,
  createProduct,
  createProductVariant,
  createSize,
} from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient, PrismaBarcodeRepository } from "../index.js";
import {
  PrismaCategoryRepository,
  PrismaCollectionRepository,
  PrismaColorRepository,
  PrismaOrganizationRepository,
  PrismaProductRepository,
  PrismaProductVariantRepository,
  PrismaSizeRepository,
} from "./repositories.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("Prisma catalog repositories", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let repositories: {
    categories: PrismaCategoryRepository;
    barcodes: PrismaBarcodeRepository;
    collections: PrismaCollectionRepository;
    colors: PrismaColorRepository;
    organizations: PrismaOrganizationRepository;
    products: PrismaProductRepository;
    productVariants: PrismaProductVariantRepository;
    sizes: PrismaSizeRepository;
  };

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    repositories = {
      barcodes: new PrismaBarcodeRepository(prisma),
      categories: new PrismaCategoryRepository(prisma),
      collections: new PrismaCollectionRepository(prisma),
      colors: new PrismaColorRepository(prisma),
      organizations: new PrismaOrganizationRepository(prisma),
      products: new PrismaProductRepository(prisma),
      productVariants: new PrismaProductVariantRepository(prisma),
      sizes: new PrismaSizeRepository(prisma),
    };
  });

  beforeEach(async () => {
    await prisma.salesReceiptPayment.deleteMany();
    await prisma.salesReceiptLine.deleteMany();
    await prisma.salesReceipt.deleteMany();
    await prisma.paymentLine.deleteMany();
    await prisma.paymentBatch.deleteMany();
    await prisma.posCheckoutRecord.deleteMany();
    await prisma.posCartLine.deleteMany();
    await prisma.posCart.deleteMany();
    await prisma.salesSession.deleteMany();
    await prisma.salesCounter.deleteMany();
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrderCommerceProfile.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.inventoryReservationLine.deleteMany();
    await prisma.inventoryReservation.deleteMany();
    await prisma.inventoryMovementLine.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryAllocationPolicyLocation.deleteMany();
    await prisma.inventoryAllocationPolicy.deleteMany();
    await prisma.variantBarcode.deleteMany();
    await prisma.productCollection.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.collection.deleteMany();
    await prisma.category.deleteMany();
    await prisma.color.deleteMany();
    await prisma.size.deleteMany();
    await prisma.posCounter.deleteMany();
    await prisma.stockLocation.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.auditEntry.deleteMany();
    await prisma.userCredential.deleteMany();
    await prisma.organizationMembership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await prisma.variantBarcode.deleteMany();
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("enforces organization, taxonomy, product and variant uniqueness", async () => {
    const organization = await createOrganization(repositories.organizations, {
      code: "SENVO",
      name: "SENVO Wear",
    });
    await expect(
      createOrganization(repositories.organizations, {
        code: "SENVO",
        name: "Duplicate",
      }),
    ).rejects.toThrow("already exists");

    const category = await createCategory(repositories, {
      name: "Shirts",
      organizationId: organization.id,
      slug: "shirts",
    });
    await expect(
      createCategory(repositories, {
        name: "Other Shirts",
        organizationId: organization.id,
        slug: "shirts",
      }),
    ).rejects.toThrow("Category slug already exists");

    await createCollection(repositories, {
      name: "New Arrival",
      organizationId: organization.id,
      slug: "new-arrival",
    });
    await expect(
      createCollection(repositories, {
        name: "Another New Arrival",
        organizationId: organization.id,
        slug: "new-arrival",
      }),
    ).rejects.toThrow("Collection slug already exists");

    const color = await createColor(repositories, {
      code: "BLACK",
      hexValue: "#000000",
      name: "Black",
      organizationId: organization.id,
    });
    await expect(
      createColor(repositories, {
        code: "BLACK",
        hexValue: "#111111",
        name: "Black Duplicate",
        organizationId: organization.id,
      }),
    ).rejects.toThrow("Color code already exists");

    const size = await createSize(repositories, {
      code: "L",
      name: "L",
      organizationId: organization.id,
      sortOrder: 30,
    });
    await expect(
      createSize(repositories, {
        code: "L",
        name: "Large",
        organizationId: organization.id,
        sortOrder: 31,
      }),
    ).rejects.toThrow("Size code already exists");
    const mediumSize = await createSize(repositories, {
      code: "M",
      name: "M",
      organizationId: organization.id,
      sortOrder: 20,
    });

    const product = await createProduct(repositories, {
      categoryId: category.id,
      name: "Oxford Shirt",
      organizationId: organization.id,
      productCode: "OXFORD",
      slug: "oxford-shirt",
    });
    await expect(
      createProduct(repositories, {
        categoryId: category.id,
        name: "Oxford Shirt 2",
        organizationId: organization.id,
        productCode: "OXFORD",
        slug: "oxford-shirt-2",
      }),
    ).rejects.toThrow("Product code already exists");
    await expect(
      createProduct(repositories, {
        categoryId: category.id,
        name: "Oxford Shirt 3",
        organizationId: organization.id,
        productCode: "OXFORD-3",
        slug: "oxford-shirt",
      }),
    ).rejects.toThrow("Product slug already exists");

    await createProductVariant(repositories, {
      colorId: color.id,
      organizationId: organization.id,
      productId: product.id,
      sizeId: size.id,
      sku: "OXFORD-BLK-L",
    });
    await expect(
      createProductVariant(repositories, {
        colorId: color.id,
        organizationId: organization.id,
        productId: product.id,
        sizeId: mediumSize.id,
        sku: "OXFORD-BLK-L",
      }),
    ).rejects.toThrow("Variant SKU already exists");
    await expect(
      createProductVariant(repositories, {
        colorId: color.id,
        organizationId: organization.id,
        productId: product.id,
        sizeId: size.id,
        sku: "OXFORD-BLK-L-2",
      }),
    ).rejects.toThrow("combination");
  });

  it("rejects cross-organization product and variant references", async () => {
    const first = await createOrganization(repositories.organizations, {
      code: "ORG-A",
      name: "Org A",
    });
    const second = await createOrganization(repositories.organizations, {
      code: "ORG-B",
      name: "Org B",
    });
    const firstCategory = await createCategory(repositories, {
      name: "First Category",
      organizationId: first.id,
      slug: "first-category",
    });
    const secondCategory = await createCategory(repositories, {
      name: "Second Category",
      organizationId: second.id,
      slug: "second-category",
    });
    const product = await createProduct(repositories, {
      categoryId: firstCategory.id,
      name: "First Product",
      organizationId: first.id,
      productCode: "FIRST-PRODUCT",
      slug: "first-product",
    });
    const secondColor = await createColor(repositories, {
      code: "NAVY",
      hexValue: "#000080",
      name: "Navy",
      organizationId: second.id,
    });
    const secondSize = await createSize(repositories, {
      code: "M",
      name: "M",
      organizationId: second.id,
      sortOrder: 20,
    });

    await expect(
      createProduct(repositories, {
        categoryId: firstCategory.id,
        name: "Invalid Product",
        organizationId: second.id,
        productCode: "INVALID-PRODUCT",
        slug: "invalid-product",
      }),
    ).rejects.toThrow("same organization");

    await expect(
      createProductVariant(repositories, {
        colorId: secondColor.id,
        organizationId: first.id,
        productId: product.id,
        sizeId: secondSize.id,
        sku: "INVALID-VARIANT",
      }),
    ).rejects.toThrow("same organization");

    expect(secondCategory.organizationId).toBe(second.id);
  });

  it("enforces catalog constraints at the PostgreSQL layer", async () => {
    const base = await createBaseCatalog(prisma);

    await expectDbReject(
      prisma.organization.create({
        data: {
          code: base.organization.code,
          name: "Duplicate Org",
        },
      }),
    );
    await expectDbReject(
      prisma.category.create({
        data: {
          name: "Duplicate Category",
          organizationId: base.organization.id,
          slug: base.category.slug,
        },
      }),
    );
    await expectDbReject(
      prisma.collection.create({
        data: {
          name: "Duplicate Collection",
          organizationId: base.organization.id,
          slug: base.collection.slug,
        },
      }),
    );
    await expectDbReject(
      prisma.color.create({
        data: {
          code: base.color.code,
          name: "Duplicate Color",
          normalizedName: "DUPLICATE COLOR",
          organizationId: base.organization.id,
        },
      }),
    );
    await expectDbReject(
      prisma.size.create({
        data: {
          code: base.size.code,
          name: "Duplicate Size",
          organizationId: base.organization.id,
          sortOrder: 99,
        },
      }),
    );
    await expectDbReject(
      prisma.product.create({
        data: {
          categoryId: base.category.id,
          name: "Duplicate Product Code",
          organizationId: base.organization.id,
          productCode: base.product.productCode,
          slug: "duplicate-product-code",
        },
      }),
    );
    await expectDbReject(
      prisma.product.create({
        data: {
          categoryId: base.category.id,
          name: "Duplicate Product Slug",
          organizationId: base.organization.id,
          productCode: "DUPLICATE-SLUG",
          slug: base.product.slug,
        },
      }),
    );
    await expectDbReject(
      prisma.productVariant.create({
        data: {
          colorId: base.color.id,
          organizationId: base.organization.id,
          productId: base.product.id,
          sizeId: base.otherSize.id,
          sku: base.variant.sku,
        },
      }),
    );
    await expectDbReject(
      prisma.productVariant.create({
        data: {
          colorId: base.color.id,
          organizationId: base.organization.id,
          productId: base.product.id,
          sizeId: base.size.id,
          sku: "OXFORD-BLK-L-ALT",
        },
      }),
    );
    await expectDbReject(
      prisma.size.create({
        data: {
          code: "NEGATIVE",
          name: "Negative",
          organizationId: base.organization.id,
          sortOrder: -1,
        },
      }),
    );
    await expectDbReject(
      prisma.color.create({
        data: {
          code: "BADHEX",
          hexValue: "#gggggg",
          name: "Bad Hex",
          normalizedName: "BAD HEX",
          organizationId: base.organization.id,
        },
      }),
    );

    await prisma.productCollection.create({
      data: {
        collectionId: base.collection.id,
        organizationId: base.organization.id,
        productId: base.product.id,
      },
    });
    await expectDbReject(
      prisma.productCollection.create({
        data: {
          collectionId: base.collection.id,
          organizationId: base.organization.id,
          productId: base.product.id,
        },
      }),
    );
    await expectDbReject(
      prisma.product.delete({ where: { id: base.product.id } }),
    );
    await expectDbReject(
      prisma.collection.delete({ where: { id: base.collection.id } }),
    );
  });

  it("enforces same-organization composite foreign keys in PostgreSQL", async () => {
    const first = await createBaseCatalog(prisma, "A");
    const second = await createBaseCatalog(prisma, "B");

    await expectDbReject(
      prisma.product.create({
        data: {
          categoryId: first.category.id,
          name: "Wrong Category Organization",
          organizationId: second.organization.id,
          productCode: "WRONG-CATEGORY-ORG",
          slug: "wrong-category-org",
        },
      }),
    );
    await expectDbReject(
      prisma.productVariant.create({
        data: {
          colorId: second.color.id,
          organizationId: first.organization.id,
          productId: first.product.id,
          sizeId: second.size.id,
          sku: "WRONG-VARIANT-ORG",
        },
      }),
    );
    await expectDbReject(
      prisma.productCollection.create({
        data: {
          collectionId: second.collection.id,
          organizationId: first.organization.id,
          productId: first.product.id,
        },
      }),
    );
  });

  it("exposes the expected manually reviewed check constraints", async () => {
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'categories_sort_order_non_negative_check',
        'sizes_sort_order_non_negative_check',
        'colors_hex_value_format_check'
      )
      ORDER BY conname
    `;

    expect(constraints.map((constraint) => constraint.conname)).toEqual([
      "categories_sort_order_non_negative_check",
      "colors_hex_value_format_check",
      "sizes_sort_order_non_negative_check",
    ]);
  });

  it("keeps admin catalog reads and updates organization scoped", async () => {
    const first = await createBaseCatalog(prisma, "A");
    const second = await createBaseCatalog(prisma, "B");

    await expect(
      repositories.products.findById(first.product.id, second.organization.id),
    ).resolves.toBeNull();
    await expect(
      repositories.categories.list({
        organizationId: first.organization.id,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: first.category.id,
        organizationId: first.organization.id,
      }),
    ]);
    await expect(
      repositories.categories.updateStatus({
        id: first.category.id,
        organizationId: second.organization.id,
        status: "INACTIVE",
      }),
    ).resolves.toBeNull();
    await expect(
      repositories.categories.findById(
        first.category.id,
        first.organization.id,
      ),
    ).resolves.toMatchObject({ status: "ACTIVE" });

    await expect(
      repositories.colors.list({ organizationId: first.organization.id }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: first.color.id,
        organizationId: first.organization.id,
      }),
    ]);
    await expect(
      repositories.colors.updateStatus({
        id: first.color.id,
        organizationId: second.organization.id,
        status: "INACTIVE",
      }),
    ).resolves.toBeNull();
    await expect(
      repositories.colors.updateStatus({
        id: first.color.id,
        organizationId: first.organization.id,
        status: "INACTIVE",
      }),
    ).resolves.toMatchObject({ status: "INACTIVE" });

    await expect(
      repositories.sizes.list({ organizationId: first.organization.id }),
    ).resolves.toEqual([
      expect.objectContaining({ id: first.otherSize.id, sortOrder: 20 }),
      expect.objectContaining({ id: first.size.id, sortOrder: 30 }),
    ]);
    await expect(
      repositories.sizes.findById(first.size.id, second.organization.id),
    ).resolves.toBeNull();
    await expect(
      repositories.sizes.updateStatus({
        id: first.size.id,
        organizationId: first.organization.id,
        status: "INACTIVE",
      }),
    ).resolves.toMatchObject({ status: "INACTIVE" });
  });

  it("enforces barcode uniqueness, history, isolation, and restrictive ownership", async () => {
    const first = await createBaseCatalog(prisma, "A");
    const second = await createBaseCatalog(prisma, "B");
    const active = await repositories.barcodes.create({
      organizationId: first.organization.id,
      productVariantId: first.variant.id,
      status: "ACTIVE",
      type: "INTERNAL",
      value: "SENVO-OXFORD-A",
    });

    await expectDbReject(
      prisma.variantBarcode.create({
        data: {
          organizationId: second.organization.id,
          productVariantId: second.variant.id,
          status: "ACTIVE",
          type: "CODE128",
          value: active.value,
        },
      }),
    );
    await expectDbReject(
      prisma.variantBarcode.create({
        data: {
          organizationId: first.organization.id,
          productVariantId: first.variant.id,
          status: "ACTIVE",
          type: "CODE128",
          value: "SENVO-OXFORD-A-SECOND",
        },
      }),
    );
    await expect(
      repositories.barcodes.create({
        organizationId: first.organization.id,
        productVariantId: first.variant.id,
        status: "INACTIVE",
        type: "INTERNAL",
        value: "SENVO-OXFORD-A-HISTORY",
      }),
    ).resolves.toMatchObject({ status: "INACTIVE" });
    await expect(
      repositories.barcodes.lookupActive(second.organization.id, active.value),
    ).resolves.toBeNull();
    await expect(
      repositories.barcodes.updateStatus({
        id: active.id,
        organizationId: second.organization.id,
        status: "INACTIVE",
      }),
    ).resolves.toBeNull();
    await expect(
      repositories.barcodes.updateStatus({
        id: active.id,
        organizationId: first.organization.id,
        status: "INACTIVE",
      }),
    ).resolves.toMatchObject({ status: "INACTIVE" });
    await expect(
      repositories.barcodes.lookupActive(first.organization.id, active.value),
    ).resolves.toBeNull();
    await expectDbReject(
      prisma.productVariant.delete({ where: { id: first.variant.id } }),
    );
  });
});

async function createBaseCatalog(
  prisma: ReturnType<typeof createPrismaClient>,
  suffix = "",
) {
  const organization = await prisma.organization.create({
    data: {
      code: `SENVO${suffix}`,
      name: `SENVO Wear ${suffix}`.trim(),
    },
  });
  const category = await prisma.category.create({
    data: {
      name: `Shirts ${suffix}`.trim(),
      organizationId: organization.id,
      slug: `shirts${suffix.toLowerCase()}`,
    },
  });
  const collection = await prisma.collection.create({
    data: {
      name: `Core ${suffix}`.trim(),
      organizationId: organization.id,
      slug: `core${suffix.toLowerCase()}`,
    },
  });
  const color = await prisma.color.create({
    data: {
      code: `BLACK${suffix}`,
      hexValue: "#000000",
      name: `Black ${suffix}`.trim(),
      normalizedName: `BLACK ${suffix}`.trim(),
      organizationId: organization.id,
    },
  });
  const size = await prisma.size.create({
    data: {
      code: `L${suffix}`,
      name: `L ${suffix}`.trim(),
      organizationId: organization.id,
      sortOrder: 30,
    },
  });
  const otherSize = await prisma.size.create({
    data: {
      code: `M${suffix}`,
      name: `M ${suffix}`.trim(),
      organizationId: organization.id,
      sortOrder: 20,
    },
  });
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: `Oxford Shirt ${suffix}`.trim(),
      organizationId: organization.id,
      productCode: `OXFORD${suffix}`,
      slug: `oxford-shirt${suffix.toLowerCase()}`,
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      colorId: color.id,
      organizationId: organization.id,
      productId: product.id,
      sizeId: size.id,
      sku: `OXFORD-BLK-L${suffix}`,
    },
  });

  return {
    category,
    collection,
    color,
    organization,
    otherSize,
    product,
    size,
    variant,
  };
}

async function expectDbReject(operation: Promise<unknown>) {
  await expect(operation).rejects.toThrow();
}
