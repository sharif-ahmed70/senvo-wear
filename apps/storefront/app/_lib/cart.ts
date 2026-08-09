import type {
  StorefrontCatalog,
  StorefrontProduct,
  StorefrontVariant,
} from "./storefront-api";
export const cartStorageKey = "senvo-storefront-cart-v1";
export type CartLine = {
  color: string;
  productName: string;
  productSlug: string;
  productVariantId: string;
  quantity: number;
  size: string;
  sku: string;
  unitPriceMinor: number;
};
export function readCart(storage: Pick<Storage, "getItem">): CartLine[] {
  try {
    const value = JSON.parse(
      storage.getItem(cartStorageKey) ?? "[]",
    ) as unknown;
    return Array.isArray(value) ? value.filter(isCartLine) : [];
  } catch {
    return [];
  }
}
export function writeCart(
  storage: Pick<Storage, "setItem">,
  lines: readonly CartLine[],
): void {
  storage.setItem(cartStorageKey, JSON.stringify(lines));
}
export function addToCart(
  lines: readonly CartLine[],
  product: StorefrontProduct,
  variant: StorefrontVariant,
): CartLine[] {
  if (variant.availability !== "IN_STOCK") return [...lines];
  const existing = lines.find((line) => line.productVariantId === variant.id);
  if (existing)
    return lines.map((line) =>
      line.productVariantId === variant.id
        ? { ...line, quantity: Math.min(20, line.quantity + 1) }
        : line,
    );
  return [
    ...lines,
    {
      color: variant.color.name,
      productName: product.name,
      productSlug: product.slug,
      productVariantId: variant.id,
      quantity: 1,
      size: variant.size.name,
      sku: variant.sku,
      unitPriceMinor: variant.sellingPriceMinor,
    },
  ];
}

export function hydrateCart(
  lines: readonly CartLine[],
  catalog: StorefrontCatalog,
) {
  const variants = new Map(
    catalog.products.flatMap((product) =>
      product.variants.map(
        (variant) => [variant.id, { product, variant }] as const,
      ),
    ),
  );
  let changed = false;
  let removed = 0;
  const hydrated: CartLine[] = [];
  for (const line of lines) {
    const current = variants.get(line.productVariantId);
    if (!current || current.variant.availability !== "IN_STOCK") {
      removed += 1;
      continue;
    }
    const next: CartLine = {
      ...line,
      color: current.variant.color.name,
      productName: current.product.name,
      productSlug: current.product.slug,
      size: current.variant.size.name,
      sku: current.variant.sku,
      unitPriceMinor: current.variant.sellingPriceMinor,
    };
    changed ||= JSON.stringify(next) !== JSON.stringify(line);
    hydrated.push(next);
  }
  return { changed, lines: hydrated, removed };
}
function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CartLine>;
  return (
    typeof item.productVariantId === "string" &&
    typeof item.productName === "string" &&
    Number.isInteger(item.quantity) &&
    (item.quantity ?? 0) > 0 &&
    typeof item.unitPriceMinor === "number"
  );
}
