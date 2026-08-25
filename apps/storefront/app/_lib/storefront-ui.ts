export const wishlistStorageKey = "senvo-storefront-wishlist-v1";

export function readWishlist(storage: Pick<Storage, "getItem">): string[] {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(wishlistStorageKey) ?? "[]",
    );
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function toggleWishlist(
  storage: Pick<Storage, "getItem" | "setItem">,
  productId: string,
): boolean {
  const current = readWishlist(storage);
  const active = current.includes(productId);
  storage.setItem(
    wishlistStorageKey,
    JSON.stringify(
      active
        ? current.filter((item) => item !== productId)
        : [...current, productId],
    ),
  );
  return !active;
}

export function whatsappHref(configured: string | undefined): string | null {
  const number = configured?.replace(/[^0-9]/gu, "") ?? "";
  if (number.length < 10 || number.length > 15) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(
    "Hello SENVO, I need help with my order.",
  )}`;
}
