import { NotFoundError } from "../../errors.js";
import type { Category } from "../domain/models.js";
import {
  assertCategoryParentDoesNotCreateCycle,
  assertCategoryParentIsNotSelf,
} from "../domain/value-objects.js";
import type { CatalogCategoryManagementRepository } from "../repositories/catalog-repositories.js";

export type ChangeCategoryParentInput = {
  categoryId: string;
  organizationId: string;
  parentId: string | null;
};

export async function changeCategoryParent(
  repositories: { categories: CatalogCategoryManagementRepository },
  input: ChangeCategoryParentInput,
): Promise<Category> {
  const category = await repositories.categories.findById(
    input.categoryId,
    input.organizationId,
  );
  if (!category) {
    throw new NotFoundError("Category was not found.");
  }
  assertCategoryParentIsNotSelf(category.id, input.parentId);

  if (input.parentId) {
    // Walk up from the new parent; finding the category itself means a cycle.
    const ancestorIds: string[] = [];
    let currentId: string | null = input.parentId;
    while (currentId && !ancestorIds.includes(currentId)) {
      const current: Category | null = await repositories.categories.findById(
        currentId,
        input.organizationId,
      );
      if (!current) {
        throw new NotFoundError("Parent category was not found.");
      }
      ancestorIds.push(current.id);
      currentId = current.parentId;
    }
    assertCategoryParentDoesNotCreateCycle(category.id, ancestorIds);
  }

  const updated = await repositories.categories.updateParent({
    id: category.id,
    organizationId: input.organizationId,
    parentId: input.parentId,
  });
  if (!updated) {
    throw new NotFoundError("Category was not found.");
  }
  return updated;
}
