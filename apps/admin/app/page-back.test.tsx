import { afterEach, describe, expect, it, vi } from "vitest";
import { pageCrumbs } from "./_components/page-back-bar";
import { clearPageDraft, readPageDraft } from "./_lib/page-draft";

describe("page back bar", () => {
  it("shows the way from the dashboard to a nested page", () => {
    expect(pageCrumbs("/procurement/purchases/abc/extra-cost")).toEqual([
      { href: "/", label: "Dashboard" },
      { href: "/procurement/purchases", label: "Purchases" },
      { href: "/procurement/purchases/abc", label: "Purchase" },
      {
        href: "/procurement/purchases/abc/extra-cost",
        label: "অতিরিক্ত খরচ",
      },
    ]);
  });

  it("skips path parts that are not pages", () => {
    expect(pageCrumbs("/pos/sessions/s1/z-report")).toEqual([
      { href: "/", label: "Dashboard" },
      { href: "/pos/sessions", label: "Sales Sessions" },
      { href: "/pos/sessions/s1/z-report", label: "Z-Report" },
    ]);
  });

  it("places Product Edit under Inventory", () => {
    expect(pageCrumbs("/inventory/intake/edit").map((c) => c.label)).toEqual([
      "Dashboard",
      "Inventory",
      "Product Edit",
    ]);
  });
});

describe("page drafts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubWindow(path: string) {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
      removeItem: (key: string) => void store.delete(key),
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    vi.stubGlobal("window", {
      location: { pathname: path, search: "" },
      sessionStorage,
    });
    return store;
  }

  it("clears only the current page after a save", () => {
    const store = stubWindow("/inventory/receive");
    store.set("senvo:draft:/inventory/receive::note", JSON.stringify("box 4"));
    store.set("senvo:draft:/inventory/transfer::note", JSON.stringify("keep"));

    expect(readPageDraft<string>("note")).toBe("box 4");
    clearPageDraft();

    expect(readPageDraft<string>("note")).toBeUndefined();
    expect(readPageDraft<string>("note", "/inventory/transfer")).toBe("keep");
  });
});
