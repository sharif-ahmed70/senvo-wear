import type {
  StorefrontCatalog,
  StorefrontProduct,
  StorefrontVariant,
} from "./storefront-api";

export const cartStorageKey = "senvo-storefront-cart-v1";
export const checkoutPriceRefreshMessage =
  "Your order was refreshed with current prices. Please review the total before placing the order.";

export type PersistedCartLine = {
  productVariantId: string;
  quantity: number;
};

export type HydratedCartLine = PersistedCartLine & {
  availability: "IN_STOCK";
  color: string;
  productName: string;
  productSlug: string;
  size: string;
  sku: string;
  unitPriceMinor: number;
};

type PersistedCart = {
  lines: PersistedCartLine[];
  version: 1;
};

export type HydratedCart = {
  lines: HydratedCartLine[];
  unavailable: PersistedCartLine[];
};

export function readCart(
  storage: Pick<Storage, "getItem">,
): PersistedCartLine[] {
  try {
    const value = JSON.parse(
      storage.getItem(cartStorageKey) ?? "[]",
    ) as unknown;
    const lines = Array.isArray(value)
      ? value
      : isPersistedCart(value)
        ? value.lines
        : [];
    return lines.filter(isPersistedCartLine).map(toPersistedLine);
  } catch {
    return [];
  }
}

export function writeCart(
  storage: Pick<Storage, "setItem">,
  lines: readonly PersistedCartLine[],
): void {
  const cart: PersistedCart = {
    lines: lines.filter(isPersistedCartLine).map(toPersistedLine),
    version: 1,
  };
  storage.setItem(cartStorageKey, JSON.stringify(cart));
}

export function addToCart(
  lines: readonly PersistedCartLine[],
  variant: StorefrontVariant,
): PersistedCartLine[] {
  if (variant.availability !== "IN_STOCK") return [...lines];
  const existing = lines.find((line) => line.productVariantId === variant.id);
  if (existing) {
    return lines.map((line) =>
      line.productVariantId === variant.id
        ? { ...line, quantity: Math.min(20, line.quantity + 1) }
        : line,
    );
  }
  return [...lines, { productVariantId: variant.id, quantity: 1 }];
}

export function hydrateCart(
  selections: readonly PersistedCartLine[],
  catalog: StorefrontCatalog,
): HydratedCart {
  const variants = new Map(
    catalog.products.flatMap((product) =>
      product.variants.map(
        (variant) => [variant.id, { product, variant }] as const,
      ),
    ),
  );
  const lines: HydratedCartLine[] = [];
  const unavailable: PersistedCartLine[] = [];
  for (const selection of selections) {
    const current = variants.get(selection.productVariantId);
    if (!current || current.variant.availability !== "IN_STOCK") {
      unavailable.push(toPersistedLine(selection));
      continue;
    }
    lines.push(hydrateLine(selection, current.product, current.variant));
  }
  return { lines, unavailable };
}

export async function hydrateStoredCart(
  storage: Pick<Storage, "getItem">,
  loadCatalog: () => Promise<StorefrontCatalog>,
): Promise<HydratedCart> {
  const selections = readCart(storage);
  return hydrateCart(selections, await loadCatalog());
}

export function canContinueToCheckout(
  status: "error" | "loading" | "ready",
  cart: HydratedCart,
): boolean {
  return (
    status === "ready" && cart.lines.length > 0 && cart.unavailable.length === 0
  );
}

export function canSubmitCheckout(
  status: "empty" | "error" | "loading" | "ready" | "unavailable",
  cart: HydratedCart,
  submitting: boolean,
): boolean {
  return (
    !submitting &&
    status === "ready" &&
    cart.lines.length > 0 &&
    cart.unavailable.length === 0
  );
}

function hydrateLine(
  selection: PersistedCartLine,
  product: StorefrontProduct,
  variant: StorefrontVariant,
): HydratedCartLine {
  return {
    availability: "IN_STOCK",
    color: variant.color.name,
    productName: product.name,
    productSlug: product.slug,
    productVariantId: variant.id,
    quantity: selection.quantity,
    size: variant.size.name,
    sku: variant.sku,
    unitPriceMinor: variant.sellingPriceMinor,
  };
}

function isPersistedCart(value: unknown): value is PersistedCart {
  if (!value || typeof value !== "object") return false;
  const cart = value as Partial<PersistedCart>;
  return cart.version === 1 && Array.isArray(cart.lines);
}

function isPersistedCartLine(value: unknown): value is PersistedCartLine {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PersistedCartLine>;
  return (
    typeof item.productVariantId === "string" &&
    item.productVariantId.length > 0 &&
    Number.isInteger(item.quantity) &&
    (item.quantity ?? 0) > 0 &&
    (item.quantity ?? 0) <= 20
  );
}

function toPersistedLine(line: PersistedCartLine): PersistedCartLine {
  return {
    productVariantId: line.productVariantId,
    quantity: line.quantity,
  };
}
