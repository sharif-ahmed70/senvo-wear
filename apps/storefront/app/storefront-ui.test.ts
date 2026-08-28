import { describe, expect, it } from "vitest";
import {
  readWishlist,
  toggleWishlist,
  whatsappHref,
  wishlistStorageKey,
} from "./_lib/storefront-ui";

function memoryStorage(initial = "[]") {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (key: string, next: string) => {
      expect(key).toBe(wishlistStorageKey);
      value = next;
    },
  };
}

describe("storefront local UI state", () => {
  it("keeps wishlist IDs on the current device and tolerates invalid data", () => {
    const storage = memoryStorage();
    expect(toggleWishlist(storage, "product-1")).toBe(true);
    expect(readWishlist(storage)).toEqual(["product-1"]);
    expect(toggleWishlist(storage, "product-1")).toBe(false);
    expect(readWishlist(storage)).toEqual([]);
    expect(readWishlist(memoryStorage("{not-json"))).toEqual([]);
  });

  it("builds WhatsApp support links only from valid public configuration", () => {
    expect(whatsappHref("+880 1712-345678")).toContain(
      "https://wa.me/8801712345678",
    );
    expect(whatsappHref("not-configured")).toBeNull();
    expect(whatsappHref(undefined)).toBeNull();
  });
});
