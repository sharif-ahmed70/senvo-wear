import { describe, expect, it } from "vitest";
import {
  buildCategoryTree,
  categoryHref,
  collectionHref,
} from "./_components/category-menu";

describe("storefront category menu", () => {
  it("nests sub-categories under their sections in display order", () => {
    const tree = buildCategoryTree([
      {
        code: "panjabi",
        id: "3",
        name: "Panjabi",
        parentId: "1",
        sortOrder: 1,
      },
      { code: "women", id: "2", name: "Women", parentId: null, sortOrder: 1 },
      { code: "men", id: "1", name: "Men", parentId: null, sortOrder: 0 },
      { code: "shirt", id: "4", name: "Shirt", parentId: "1", sortOrder: 0 },
    ]);
    expect(tree.map((node) => node.name)).toEqual(["Men", "Women"]);
    expect(tree[0]?.children.map((node) => node.name)).toEqual([
      "Shirt",
      "Panjabi",
    ]);
  });

  it("treats categories without a known parent as main sections", () => {
    const tree = buildCategoryTree([
      { code: "shoes", id: "1", name: "Shoes" },
      { code: "bags", id: "2", name: "Bags", parentId: "hidden" },
    ]);
    expect(tree.map((node) => node.name)).toEqual(["Bags", "Shoes"]);
  });

  it("links to the filtered edit on the homepage", () => {
    expect(categoryHref("t shirt")).toBe("/?category=t%20shirt#collection");
    expect(collectionHref("eid")).toBe("/?collection=eid#collection");
  });
});
