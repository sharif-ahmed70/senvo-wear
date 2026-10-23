/* eslint-disable @typescript-eslint/require-await -- In-memory test repositories mirror async production repository contracts. */
import { describe, expect, it } from "vitest";
import { changeCategoryParent } from "../application/category-use-cases.js";
import type { Category } from "../domain/models.js";
import type { CatalogCategoryManagementRepository } from "../repositories/catalog-repositories.js";

const organizationId = "org-1";

function category(id: string, parentId: string | null = null): Category {
  return {
    createdAt: new Date(0),
    description: null,
    id,
    name: id,
    organizationId,
    parentId,
    slug: id,
    sortOrder: 0,
    status: "ACTIVE",
    updatedAt: new Date(0),
  };
}

function repository(records: Category[]): CatalogCategoryManagementRepository {
  const store = new Map(records.map((record) => [record.id, record]));
  return {
    create: async () => {
      throw new Error("not used");
    },
    findById: async (id, scope?: string) => {
      const record = store.get(id);
      return record && (!scope || record.organizationId === scope)
        ? record
        : null;
    },
    findBySlug: async () => null,
    list: async () => [...store.values()],
    updateParent: async ({ id, parentId }) => {
      const record = store.get(id);
      if (!record) return null;
      const updated = { ...record, parentId };
      store.set(id, updated);
      return updated;
    },
    updateStatus: async () => null,
  };
}

describe("changeCategoryParent", () => {
  it("nests a category under a main section and can move it back", async () => {
    const categories = repository([category("men"), category("panjabi")]);

    const nested = await changeCategoryParent(
      { categories },
      { categoryId: "panjabi", organizationId, parentId: "men" },
    );
    expect(nested.parentId).toBe("men");

    const topLevel = await changeCategoryParent(
      { categories },
      { categoryId: "panjabi", organizationId, parentId: null },
    );
    expect(topLevel.parentId).toBeNull();
  });

  it("rejects a category as its own parent", async () => {
    const categories = repository([category("men")]);
    await expect(
      changeCategoryParent(
        { categories },
        { categoryId: "men", organizationId, parentId: "men" },
      ),
    ).rejects.toThrow("own parent");
  });

  it("rejects moving a section under one of its own sub-categories", async () => {
    const categories = repository([
      category("men"),
      category("ethnic", "men"),
      category("panjabi", "ethnic"),
    ]);
    await expect(
      changeCategoryParent(
        { categories },
        { categoryId: "men", organizationId, parentId: "panjabi" },
      ),
    ).rejects.toThrow("cycle");
  });

  it("rejects a parent from another organization", async () => {
    const categories = repository([
      category("men"),
      { ...category("women"), organizationId: "org-2" },
    ]);
    await expect(
      changeCategoryParent(
        { categories },
        { categoryId: "men", organizationId, parentId: "women" },
      ),
    ).rejects.toThrow("Parent category was not found");
  });
});
