import { describe, expect, it } from "vitest";
import { categoryWithDescendants, visibleCategoryTree } from "./repository.js";

const categories = [
  { id: "men", name: "Men", parentId: null, slug: "men", sortOrder: 0 },
  {
    id: "ethnic",
    name: "Ethnic",
    parentId: "men",
    slug: "ethnic",
    sortOrder: 0,
  },
  {
    id: "panjabi",
    name: "Panjabi",
    parentId: "ethnic",
    slug: "panjabi",
    sortOrder: 1,
  },
  { id: "women", name: "Women", parentId: null, slug: "women", sortOrder: 1 },
  {
    id: "kurti",
    name: "Kurti",
    parentId: "women",
    slug: "kurti",
    sortOrder: 0,
  },
];

describe("storefront category tree", () => {
  it("filters a section by itself and every nested sub-category", () => {
    expect(categoryWithDescendants(categories, "men")).toEqual([
      "men",
      "ethnic",
      "panjabi",
    ]);
    expect(categoryWithDescendants(categories, "panjabi")).toEqual(["panjabi"]);
    expect(categoryWithDescendants(categories, "missing")).toEqual([]);
  });

  it("shows stocked categories with their parent sections only", () => {
    expect(visibleCategoryTree(categories, ["panjabi"])).toEqual([
      { code: "men", id: "men", name: "Men", parentId: null, sortOrder: 0 },
      {
        code: "ethnic",
        id: "ethnic",
        name: "Ethnic",
        parentId: "men",
        sortOrder: 0,
      },
      {
        code: "panjabi",
        id: "panjabi",
        name: "Panjabi",
        parentId: "ethnic",
        sortOrder: 1,
      },
    ]);
  });
});
