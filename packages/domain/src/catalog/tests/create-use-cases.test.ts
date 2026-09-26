/* eslint-disable @typescript-eslint/require-await -- In-memory test repositories mirror async production repository contracts. */
import { describe, expect, it } from "vitest";
import {
  createCategory,
  createColor,
  createOrganization,
  createProduct,
  createProductVariant,
  createSize,
} from "../application/create-use-cases.js";
import type {
  Category,
  Collection,
  Color,
  Organization,
  Product,
  ProductVariant,
  Size,
} from "../domain/models.js";
import type {
  CategoryRepository,
  CollectionRepository,
  ColorRepository,
  CreateCategoryRecord,
  CreateCollectionRecord,
  CreateColorRecord,
  CreateOrganizationRecord,
  CreateProductRecord,
  CreateProductVariantRecord,
  CreateSizeRecord,
  OrganizationRepository,
  ProductRepository,
  ProductVariantRepository,
  SizeRepository,
} from "../repositories/catalog-repositories.js";

describe("catalog create use cases", () => {
  it("rejects duplicate organization codes", async () => {
    const repositories = createInMemoryRepositories();
    await createOrganization(repositories.organizations, {
      code: "SENVO",
      name: "SENVO Wear",
    });

    await expect(
      createOrganization(repositories.organizations, {
        code: "senvo",
        name: "Another SENVO",
      }),
    ).rejects.toThrow("already exists");
  });

  it("rejects cross-organization category parents", async () => {
    const repositories = createInMemoryRepositories();
    const first = await createOrganization(repositories.organizations, {
      code: "ORG-A",
      name: "Org A",
    });
    const second = await createOrganization(repositories.organizations, {
      code: "ORG-B",
      name: "Org B",
    });
    const parent = await createCategory(repositories, {
      name: "Men",
      organizationId: first.id,
      slug: "men",
    });

    await expect(
      createCategory(repositories, {
        name: "Shirts",
        organizationId: second.id,
        parentId: parent.id,
        slug: "shirts",
      }),
    ).rejects.toThrow("same organization");
  });

  it("rejects duplicate color names after normalization", async () => {
    const repositories = createInMemoryRepositories();
    const organization = await createOrganization(repositories.organizations, {
      code: "SENVO",
      name: "SENVO Wear",
    });

    await createColor(repositories, {
      code: "BLACK",
      hexValue: "#000000",
      name: "Black",
      organizationId: organization.id,
    });

    await expect(
      createColor(repositories, {
        code: "BLACK-ALT",
        hexValue: "#111111",
        name: " black ",
        organizationId: organization.id,
      }),
    ).rejects.toThrow("Color name already exists");
  });

  it("requires a color hex value", async () => {
    const repositories = createInMemoryRepositories();
    const organization = await createOrganization(repositories.organizations, {
      code: "SENVO",
      name: "SENVO Wear",
    });

    await expect(
      createColor(repositories, {
        code: "BLACK",
        hexValue: "",
        name: "Black",
        organizationId: organization.id,
      }),
    ).rejects.toThrow("hexValue is required");
  });

  it("rejects cross-organization product category references", async () => {
    const repositories = createInMemoryRepositories();
    const first = await createOrganization(repositories.organizations, {
      code: "ORG-A",
      name: "Org A",
    });
    const second = await createOrganization(repositories.organizations, {
      code: "ORG-B",
      name: "Org B",
    });
    const category = await createCategory(repositories, {
      name: "Shirts",
      organizationId: first.id,
      slug: "shirts",
    });

    await expect(
      createProduct(repositories, {
        categoryId: category.id,
        name: "Oxford Shirt",
        organizationId: second.id,
        productCode: "OXFORD",
        slug: "oxford-shirt",
      }),
    ).rejects.toThrow("same organization");
  });

  it("rejects duplicate variant color-size combinations and duplicate SKUs", async () => {
    const repositories = createInMemoryRepositories();
    const organization = await createOrganization(repositories.organizations, {
      code: "SENVO",
      name: "SENVO Wear",
    });
    const category = await createCategory(repositories, {
      name: "Shirts",
      organizationId: organization.id,
      slug: "shirts",
    });
    const product = await createProduct(repositories, {
      categoryId: category.id,
      name: "Oxford Shirt",
      organizationId: organization.id,
      productCode: "OXFORD",
      slug: "oxford-shirt",
    });
    const color = await createColor(repositories, {
      code: "BLACK",
      hexValue: "#000000",
      name: "Black",
      organizationId: organization.id,
    });
    const size = await createSize(repositories, {
      code: "L",
      name: "L",
      organizationId: organization.id,
      sortOrder: 30,
    });

    const pricedVariant = await createProductVariant(repositories, {
      sellingPriceMinor: 12550,
      colorId: color.id,
      organizationId: organization.id,
      productId: product.id,
      sizeId: size.id,
      sku: "OXFORD-BLK-L",
    });

    expect(pricedVariant.sellingPriceMinor).toBe(12550);

    await expect(
      createProductVariant(repositories, {
        colorId: color.id,
        organizationId: organization.id,
        productId: product.id,
        sizeId: size.id,
        sku: "OXFORD-BLK-L-2",
      }),
    ).rejects.toThrow("combination");

    const otherSize = await createSize(repositories, {
      code: "XL",
      name: "XL",
      organizationId: organization.id,
      sortOrder: 40,
    });
    await expect(
      createProductVariant(repositories, {
        colorId: color.id,
        organizationId: organization.id,
        productId: product.id,
        sizeId: otherSize.id,
        sku: "OXFORD-BLK-L",
      }),
    ).rejects.toThrow("SKU already exists");
  });
});

function createInMemoryRepositories(): {
  categories: CategoryRepository;
  collections: CollectionRepository;
  colors: ColorRepository;
  organizations: OrganizationRepository;
  products: ProductRepository;
  productVariants: ProductVariantRepository;
  sizes: SizeRepository;
} {
  const now = () => new Date("2026-07-01T00:00:00.000Z");
  const organizations: Organization[] = [];
  const categories: Category[] = [];
  const collections: Collection[] = [];
  const colors: Color[] = [];
  const sizes: Size[] = [];
  const products: Product[] = [];
  const productVariants: ProductVariant[] = [];
  let nextId = 1;
  const id = (prefix: string) => `${prefix}_${nextId++}`;

  return {
    categories: {
      create: async (record: CreateCategoryRecord) => {
        const category = {
          ...record,
          createdAt: now(),
          id: id("cat"),
          updatedAt: now(),
        };
        categories.push(category);
        return category;
      },
      findById: async (categoryId: string) =>
        categories.find((category) => category.id === categoryId) ?? null,
      findBySlug: async (organizationId: string, slug: string) =>
        categories.find(
          (category) =>
            category.organizationId === organizationId &&
            category.slug === slug,
        ) ?? null,
    },
    collections: {
      create: async (record: CreateCollectionRecord) => {
        const collection = {
          ...record,
          createdAt: now(),
          id: id("col"),
          updatedAt: now(),
        };
        collections.push(collection);
        return collection;
      },
      findBySlug: async (organizationId: string, slug: string) =>
        collections.find(
          (collection) =>
            collection.organizationId === organizationId &&
            collection.slug === slug,
        ) ?? null,
    },
    colors: {
      create: async (record: CreateColorRecord) => {
        const color = {
          ...record,
          createdAt: now(),
          id: id("color"),
          updatedAt: now(),
        };
        colors.push(color);
        return color;
      },
      findByCode: async (organizationId: string, code: string) =>
        colors.find(
          (color) =>
            color.organizationId === organizationId && color.code === code,
        ) ?? null,
      findById: async (colorId: string) =>
        colors.find((color) => color.id === colorId) ?? null,
      findByNormalizedName: async (
        organizationId: string,
        normalizedName: string,
      ) =>
        colors.find(
          (color) =>
            color.organizationId === organizationId &&
            color.normalizedName === normalizedName,
        ) ?? null,
    },
    organizations: {
      create: async (record: CreateOrganizationRecord) => {
        const organization = {
          ...record,
          addressLine1: null,
          addressLine2: null,
          city: null,
          countryCode: "BD",
          createdAt: now(),
          district: null,
          email: null,
          id: id("org"),
          phone: null,
          postalCode: null,
          timezone: "Asia/Dhaka",
          updatedAt: now(),
          version: 1,
        };
        organizations.push(organization);
        return organization;
      },
      findByCode: async (code: string) =>
        organizations.find((organization) => organization.code === code) ??
        null,
      findById: async (organizationId: string) =>
        organizations.find(
          (organization) => organization.id === organizationId,
        ) ?? null,
    },
    products: {
      create: async (record: CreateProductRecord) => {
        const product = {
          ...record,
          createdAt: now(),
          id: id("product"),
          updatedAt: now(),
        };
        products.push(product);
        return product;
      },
      findByCode: async (organizationId: string, productCode: string) =>
        products.find(
          (product) =>
            product.organizationId === organizationId &&
            product.productCode === productCode,
        ) ?? null,
      findById: async (productId: string) =>
        products.find((product) => product.id === productId) ?? null,
      findBySlug: async (organizationId: string, slug: string) =>
        products.find(
          (product) =>
            product.organizationId === organizationId && product.slug === slug,
        ) ?? null,
    },
    productVariants: {
      create: async (record: CreateProductVariantRecord) => {
        const variant = {
          ...record,
          sellingPriceMinor: record.sellingPriceMinor ?? 0,
          createdAt: now(),
          id: id("variant"),
          updatedAt: now(),
        };
        productVariants.push(variant);
        return variant;
      },
      existsBySku: async (organizationId: string, sku: string) =>
        productVariants.some(
          (variant) =>
            variant.organizationId === organizationId && variant.sku === sku,
        ),
      existsVariantCombination: async (
        productId: string,
        colorId: string,
        sizeId: string,
      ) =>
        productVariants.some(
          (variant) =>
            variant.productId === productId &&
            variant.colorId === colorId &&
            variant.sizeId === sizeId,
        ),
    },
    sizes: {
      create: async (record: CreateSizeRecord) => {
        const size = {
          ...record,
          createdAt: now(),
          id: id("size"),
          updatedAt: now(),
        };
        sizes.push(size);
        return size;
      },
      findByCode: async (organizationId: string, code: string) =>
        sizes.find(
          (size) =>
            size.organizationId === organizationId && size.code === code,
        ) ?? null,
      findById: async (sizeId: string) =>
        sizes.find((size) => size.id === sizeId) ?? null,
    },
  };
}
