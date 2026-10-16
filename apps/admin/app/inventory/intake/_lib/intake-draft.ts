import type { CreateStockIntakeServiceInputContract } from "@senvo/contracts";
import {
  formatTaka,
  parseQuantity,
  parseTaka,
  profitPerPieceMinor,
  takaInputFromMinor,
  transportPerPieceMinor,
} from "./currency-math";

/* ------------------------------------------------------------------ */
/* Draft state                                                         */
/* ------------------------------------------------------------------ */

export type ProductStatus = "ACTIVE" | "DRAFT" | "INACTIVE";

export type ProductDraft = {
  audience: string;
  description: string;
  name: string;
  status: ProductStatus;
  type: string;
};

export type IntakeColor = {
  id: string;
  name: string;
  /** Piece count text per size name; empty means "no variant". */
  quantities: Record<string, string>;
};

export type QuantityGrid = {
  colors: IntakeColor[];
  sizes: string[];
  /** True once staff add/remove a size; stops presets overwriting them. */
  sizesCustomized: boolean;
};

/** An existing variant of the product being restocked. */
export type ExistingVariant = {
  colorName: string;
  onHand: number;
  sellingPriceMinor: number;
  sizeName: string;
  variantId: string;
};

export type IntakeLine = {
  colorId: string;
  colorName: string;
  existing: ExistingVariant | null;
  key: string;
  quantity: number;
  sizeName: string;
};

export type PriceOverride = { cost?: string; sell?: string };

export type PriceDraft = {
  costAll: string;
  overrides: Record<string, PriceOverride>;
  sellAll: string;
};

export type SupplierMode = "existing" | "new" | "none";
export type PaymentMethod = "BANK" | "CASH" | "MOBILE_BANKING";

export type SelectedSupplier = {
  address: string | null;
  id: string;
  name: string;
  phone: string | null;
};

export type PurchaseDraft = {
  editSupplier: boolean;
  existingSupplier: SelectedSupplier | null;
  locationId: string;
  memoNumber: string;
  method: PaymentMethod;
  newSupplier: { address: string; name: string; phone: string };
  note: string;
  paid: string;
  purchaseDate: string;
  supplierAddress: string;
  supplierMode: SupplierMode;
  supplierPhone: string;
  transport: string;
  transportPaidToSupplier: boolean;
};

export type FieldErrors = Record<string, string>;

export const MAX_LINES = 100;
export const MAX_QUANTITY = 100_000;
const MAX_PRICE_MINOR = 2_147_483_647;
const phonePattern = /^[+0-9() .-]+$/u;

export const blankProduct: ProductDraft = {
  audience: "",
  description: "",
  name: "",
  status: "ACTIVE",
  type: "",
};

export const blankPrices: PriceDraft = {
  costAll: "",
  overrides: {},
  sellAll: "",
};

export function blankPurchase(
  locationIds: readonly string[],
  today = todayInDhaka(),
): PurchaseDraft {
  return {
    editSupplier: false,
    existingSupplier: null,
    locationId: locationIds.length === 1 ? (locationIds[0] ?? "") : "",
    memoNumber: "",
    method: "CASH",
    newSupplier: { address: "", name: "", phone: "" },
    note: "",
    paid: "",
    purchaseDate: today,
    supplierAddress: "",
    supplierMode: "existing",
    supplierPhone: "",
    transport: "",
    transportPaidToSupplier: false,
  };
}

/** Today's calendar date in Asia/Dhaka as YYYY-MM-DD. */
export function todayInDhaka(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Dhaka",
    year: "numeric",
  }).format(now);
}

/* ------------------------------------------------------------------ */
/* Names, lines and prices                                             */
/* ------------------------------------------------------------------ */

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

export function cleanName(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function variantKey(colorName: string, sizeName: string): string {
  return `${normalizeName(colorName)}|${normalizeName(sizeName)}`;
}

export function lineKey(colorId: string, sizeName: string): string {
  return `${colorId}::${normalizeName(sizeName)}`;
}

/**
 * Turns the quantity grid into intake lines. Only boxes with a whole number
 * above zero become lines; empty boxes create nothing.
 */
export function linesFromGrid(
  grid: QuantityGrid,
  existing: ReadonlyMap<string, ExistingVariant> = new Map(),
): IntakeLine[] {
  const lines: IntakeLine[] = [];
  for (const color of grid.colors) {
    const colorName = cleanName(color.name);
    for (const sizeName of grid.sizes) {
      const quantity = parseQuantity(color.quantities[sizeName] ?? "");
      if (!quantity) continue;
      lines.push({
        colorId: color.id,
        colorName,
        existing: existing.get(variantKey(colorName, sizeName)) ?? null,
        key: lineKey(color.id, sizeName),
        quantity,
        sizeName,
      });
    }
  }
  return lines;
}

export function colorPieces(color: IntakeColor, sizes: readonly string[]) {
  return sizes.reduce(
    (sum, size) => sum + (parseQuantity(color.quantities[size] ?? "") ?? 0),
    0,
  );
}

export function gridCounts(grid: QuantityGrid) {
  let pieces = 0;
  let colors = 0;
  for (const color of grid.colors) {
    const count = colorPieces(color, grid.sizes);
    pieces += count;
    if (count > 0) colors += 1;
  }
  return { colors, pieces };
}

export function costText(line: IntakeLine, prices: PriceDraft): string {
  return prices.overrides[line.key]?.cost ?? prices.costAll;
}

export function sellText(line: IntakeLine, prices: PriceDraft): string {
  const override = prices.overrides[line.key]?.sell;
  if (override !== undefined) return override;
  if (prices.sellAll.trim() !== "") return prices.sellAll;
  return line.existing
    ? takaInputFromMinor(line.existing.sellingPriceMinor)
    : "";
}

export function isRowEdited(line: IntakeLine, prices: PriceDraft): boolean {
  const override = prices.overrides[line.key];
  return Boolean(
    override && (override.cost !== undefined || override.sell !== undefined),
  );
}

/** "সবগুলোতে" input: sets the shared value and clears that field per row. */
export function setPriceForAll(
  prices: PriceDraft,
  field: "cost" | "sell",
  value: string,
): PriceDraft {
  const overrides: Record<string, PriceOverride> = {};
  for (const [key, override] of Object.entries(prices.overrides)) {
    const rest = { ...override };
    delete rest[field];
    if (rest.cost !== undefined || rest.sell !== undefined) {
      overrides[key] = rest;
    }
  }
  return field === "cost"
    ? { ...prices, costAll: value, overrides }
    : { ...prices, overrides, sellAll: value };
}

export function setRowPrice(
  prices: PriceDraft,
  key: string,
  field: "cost" | "sell",
  value: string,
): PriceDraft {
  return {
    ...prices,
    overrides: {
      ...prices.overrides,
      [key]: { ...prices.overrides[key], [field]: value },
    },
  };
}

/** "এই size-এর সব রঙে বসাও": copy a row's prices to that size in every color. */
export function applyRowToSameSize(
  prices: PriceDraft,
  lines: readonly IntakeLine[],
  source: IntakeLine,
): PriceDraft {
  const cost = costText(source, prices);
  const sell = sellText(source, prices);
  const overrides = { ...prices.overrides };
  for (const line of lines) {
    if (normalizeName(line.sizeName) !== normalizeName(source.sizeName)) {
      continue;
    }
    overrides[line.key] = { cost, sell };
  }
  return { ...prices, overrides };
}

/* ------------------------------------------------------------------ */
/* Totals                                                              */
/* ------------------------------------------------------------------ */

export type IntakeTotals = {
  colorCount: number;
  goodsMinor: bigint;
  /** Most the supplier can be paid now for this delivery. */
  payableMinor: bigint;
  paidMinor: bigint;
  pieces: number;
  profitMinor: bigint;
  sellTotalMinor: bigint;
  supplierDueMinor: bigint;
  totalCostMinor: bigint;
  transportMinor: number;
  transportPerPieceMinor: number;
};

export function summarizeIntake(
  lines: readonly IntakeLine[],
  prices: PriceDraft,
  purchase: PurchaseDraft,
): IntakeTotals {
  let goods = 0n;
  let sellTotal = 0n;
  let pieces = 0;
  const colors = new Set<string>();
  for (const line of lines) {
    pieces += line.quantity;
    colors.add(line.colorId);
    goods +=
      BigInt(line.quantity) * BigInt(parseTaka(costText(line, prices)) ?? 0);
    sellTotal +=
      BigInt(line.quantity) * BigInt(parseTaka(sellText(line, prices)) ?? 0);
  }
  const transportMinor = parseTaka(purchase.transport) ?? 0;
  const transport = BigInt(transportMinor);
  const totalCost = goods + transport;
  const payable = purchase.transportPaidToSupplier ? totalCost : goods;
  const paid = BigInt(parseTaka(purchase.paid) ?? 0);
  return {
    colorCount: colors.size,
    goodsMinor: goods,
    paidMinor: paid,
    payableMinor: payable,
    pieces,
    profitMinor: sellTotal - totalCost,
    sellTotalMinor: sellTotal,
    supplierDueMinor: payable - paid,
    totalCostMinor: totalCost,
    transportMinor,
    transportPerPieceMinor: transportPerPieceMinor(transportMinor, pieces),
  };
}

/** Per-piece profit for one row, or null while prices are incomplete. */
export function rowProfitMinor(
  line: IntakeLine,
  prices: PriceDraft,
  transportPerPiece: number,
): number | null {
  const cost = parseTaka(costText(line, prices));
  const sell = parseTaka(sellText(line, prices));
  if (cost === null || sell === null) return null;
  return profitPerPieceMinor(sell, cost, transportPerPiece);
}

/* ------------------------------------------------------------------ */
/* Validation (field-level Bangla messages)                            */
/* ------------------------------------------------------------------ */

export function validateProductStep(product: ProductDraft): FieldErrors {
  const errors: FieldErrors = {};
  const name = cleanName(product.name);
  if (!name) errors.name = "Product-এর নাম লিখুন।";
  else if (name.length > 160) errors.name = "নাম ১৬০ অক্ষরের মধ্যে রাখুন।";
  if (!cleanName(product.audience)) {
    errors.audience = "কার জন্য — একটা বেছে নিন বা লিখুন।";
  } else if (cleanName(product.audience).length > 160) {
    errors.audience = "নাম ১৬০ অক্ষরের মধ্যে রাখুন।";
  }
  if (!cleanName(product.type)) {
    errors.type = "কী মাল — একটা বেছে নিন বা লিখুন।";
  } else if (cleanName(product.type).length > 160) {
    errors.type = "নাম ১৬০ অক্ষরের মধ্যে রাখুন।";
  }
  if (product.description.trim().length > 2000) {
    errors.description = "বিবরণ ২০০০ অক্ষরের মধ্যে রাখুন।";
  }
  return errors;
}

export function validateQuantityStep(grid: QuantityGrid): FieldErrors {
  const errors: FieldErrors = {};
  const seen = new Set<string>();
  for (const color of grid.colors) {
    const name = cleanName(color.name);
    if (!name) {
      errors[`color:${color.id}`] = "রঙের নাম লিখুন।";
    } else if (name.length > 160) {
      errors[`color:${color.id}`] = "নাম ১৬০ অক্ষরের মধ্যে রাখুন।";
    } else if (seen.has(normalizeName(name))) {
      errors[`color:${color.id}`] = "এই রং আগেই আছে।";
    }
    seen.add(normalizeName(name));
    for (const size of grid.sizes) {
      const text = (color.quantities[size] ?? "").trim();
      if (!text) continue;
      const quantity = parseQuantity(text);
      if (quantity === null) {
        errors[`qty:${color.id}:${size}`] = "শুধু পুরো সংখ্যা।";
      } else if (quantity > MAX_QUANTITY) {
        errors[`qty:${color.id}:${size}`] = "১,০০,০০০-এর বেশি না।";
      }
    }
  }
  const lines = linesFromGrid(grid);
  if (lines.length === 0) {
    errors.pieces = "অন্তত একটা রঙের একটা size-এ কত পিস এলো লিখুন।";
  } else if (lines.length > MAX_LINES) {
    errors.pieces = `একবারে সর্বোচ্চ ${MAX_LINES}টা রং-size Save করা যায়।`;
  }
  return errors;
}

export function validatePriceStep(
  lines: readonly IntakeLine[],
  prices: PriceDraft,
  purchase: PurchaseDraft,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const line of lines) {
    const cost = parseTaka(costText(line, prices));
    if (cost === null || cost > MAX_PRICE_MINOR) {
      errors[`cost:${line.key}`] = "কেনা দাম লিখুন (০ বা বেশি)।";
    }
    const sellRaw = sellText(line, prices).trim();
    const sell = parseTaka(sellRaw);
    if (!line.existing || sellRaw !== "") {
      if (sell === null || sell <= 0 || sell > MAX_PRICE_MINOR) {
        errors[`sell:${line.key}`] = "বিক্রির দাম লিখুন (০-এর বেশি)।";
      }
    }
  }
  if (purchase.transport.trim() !== "") {
    const transport = parseTaka(purchase.transport);
    if (transport === null || transport > MAX_PRICE_MINOR) {
      errors.transport = "ঠিক টাকার অঙ্ক লিখুন।";
    }
  }

  if (purchase.supplierMode === "existing") {
    if (!purchase.existingSupplier) {
      errors.supplier = "পুরোনো Supplier খুঁজে বেছে নিন।";
    } else if (purchase.editSupplier) {
      const phone = purchase.supplierPhone.trim();
      if (phone && (!phonePattern.test(phone) || phone.length > 40)) {
        errors.supplierPhone = "Phone-এ শুধু সংখ্যা, +, -, ( ) দিন।";
      }
      if (purchase.supplierAddress.trim().length > 255) {
        errors.supplierAddress = "ঠিকানা ২৫৫ অক্ষরের মধ্যে রাখুন।";
      }
    }
  } else if (purchase.supplierMode === "new") {
    const { address, name, phone } = purchase.newSupplier;
    if (!cleanName(name)) errors.newSupplierName = "Supplier-এর নাম লিখুন।";
    else if (cleanName(name).length > 160) {
      errors.newSupplierName = "নাম ১৬০ অক্ষরের মধ্যে রাখুন।";
    }
    if (!phone.trim()) errors.newSupplierPhone = "Phone নম্বর লিখুন।";
    else if (!phonePattern.test(phone.trim()) || phone.trim().length > 40) {
      errors.newSupplierPhone = "Phone-এ শুধু সংখ্যা, +, -, ( ) দিন।";
    }
    if (address.trim().length > 255) {
      errors.newSupplierAddress = "ঠিকানা ২৫৫ অক্ষরের মধ্যে রাখুন।";
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(purchase.purchaseDate)) {
    errors.purchaseDate = "কেনার তারিখ দিন।";
  }
  if ([...purchase.memoNumber.trim()].length > 60) {
    errors.memoNumber = "মেমো নং ৬০ অক্ষরের মধ্যে রাখুন।";
  }
  if (purchase.note.trim().length > 1000) {
    errors.note = "Note ১০০০ অক্ষরের মধ্যে রাখুন।";
  }
  if (!purchase.locationId) {
    errors.locationId = "মাল কোথায় রাখবেন বেছে নিন।";
  }

  if (purchase.paid.trim() !== "") {
    const paid = parseTaka(purchase.paid);
    if (paid === null) {
      errors.paid = "ঠিক টাকার অঙ্ক লিখুন।";
    } else {
      const totals = summarizeIntake(lines, prices, purchase);
      if (BigInt(paid) > totals.payableMinor) {
        errors.paid = `এই মালের জন্য Supplier-কে সর্বোচ্চ ${formatTaka(totals.payableMinor)} দেওয়া যায়।`;
      }
    }
  }
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/* ------------------------------------------------------------------ */
/* Payload builders                                                    */
/* ------------------------------------------------------------------ */

type PurchaseSection = Pick<
  CreateStockIntakeServiceInputContract,
  | "payment"
  | "purchase"
  | "supplier"
  | "transportCostMinor"
  | "transportPaidToSupplier"
>;

function requireAmount(text: string, label: string): number {
  const value = parseTaka(text);
  if (value === null) throw new Error(`${label} is not a valid amount.`);
  return value;
}

export function buildLines(
  lines: readonly IntakeLine[],
  prices: PriceDraft,
): CreateStockIntakeServiceInputContract["lines"] {
  return lines.map((line) => {
    const unitCostMinor = requireAmount(costText(line, prices), "Unit cost");
    const sellRaw = sellText(line, prices).trim();
    if (line.existing) {
      const sell =
        sellRaw === "" ? null : requireAmount(sellRaw, "Selling price");
      // Only send a price when staff changed it; otherwise keep the old one.
      return sell !== null && sell !== line.existing.sellingPriceMinor
        ? {
            existingVariantId: line.existing.variantId,
            quantity: line.quantity,
            sellingPriceMinor: sell,
            unitCostMinor,
          }
        : {
            existingVariantId: line.existing.variantId,
            quantity: line.quantity,
            unitCostMinor,
          };
    }
    return {
      colorName: line.colorName,
      quantity: line.quantity,
      sellingPriceMinor: requireAmount(sellRaw, "Selling price"),
      sizeName: line.sizeName,
      unitCostMinor,
    };
  });
}

export function buildSupplier(
  purchase: PurchaseDraft,
): CreateStockIntakeServiceInputContract["supplier"] {
  if (purchase.supplierMode === "none") return null;
  if (purchase.supplierMode === "new") {
    const address = purchase.newSupplier.address.trim();
    return {
      new: {
        ...(address ? { address } : {}),
        name: cleanName(purchase.newSupplier.name),
        phone: purchase.newSupplier.phone.trim(),
      },
    };
  }
  const selected = purchase.existingSupplier;
  if (!selected) throw new Error("No supplier selected.");
  if (!purchase.editSupplier) return { existingSupplierId: selected.id };
  const updates: { address?: string | null; phone?: string | null } = {};
  const phone = purchase.supplierPhone.trim() || null;
  const address = purchase.supplierAddress.trim() || null;
  if (phone !== (selected.phone?.trim() || null)) updates.phone = phone;
  if (address !== (selected.address?.trim() || null)) updates.address = address;
  return Object.keys(updates).length
    ? { existingSupplierId: selected.id, updates }
    : { existingSupplierId: selected.id };
}

export function buildPurchaseSection(purchase: PurchaseDraft): PurchaseSection {
  const paid =
    purchase.paid.trim() === "" ? 0 : requireAmount(purchase.paid, "Payment");
  const transport =
    purchase.transport.trim() === ""
      ? 0
      : requireAmount(purchase.transport, "Transport");
  const memoNumber = purchase.memoNumber.trim();
  const note = purchase.note.trim();
  return {
    payment: paid > 0 ? { amountMinor: paid, method: purchase.method } : null,
    purchase: {
      destinationLocationId: purchase.locationId,
      ...(memoNumber ? { memoNumber } : {}),
      ...(note ? { note } : {}),
      purchaseDate: purchase.purchaseDate,
    },
    supplier: buildSupplier(purchase),
    transportCostMinor: transport,
    transportPaidToSupplier: purchase.transportPaidToSupplier,
  };
}

export function buildNewProductPayload(input: {
  idempotencyKey: string;
  lines: readonly IntakeLine[];
  prices: PriceDraft;
  product: ProductDraft;
  purchase: PurchaseDraft;
}): CreateStockIntakeServiceInputContract {
  const description = input.product.description.trim();
  return {
    idempotencyKey: input.idempotencyKey,
    lines: buildLines(input.lines, input.prices),
    product: {
      audienceCategoryName: cleanName(input.product.audience),
      ...(description ? { description } : {}),
      name: cleanName(input.product.name),
      status: input.product.status,
      typeCategoryName: cleanName(input.product.type),
    },
    ...buildPurchaseSection(input.purchase),
  };
}

export function buildRestockPayload(input: {
  idempotencyKey: string;
  lines: readonly IntakeLine[];
  prices: PriceDraft;
  productId: string;
  purchase: PurchaseDraft;
}): CreateStockIntakeServiceInputContract {
  return {
    idempotencyKey: input.idempotencyKey,
    lines: buildLines(input.lines, input.prices),
    product: { existingProductId: input.productId },
    ...buildPurchaseSection(input.purchase),
  };
}

/* ------------------------------------------------------------------ */
/* Idempotency                                                         */
/* ------------------------------------------------------------------ */

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * One key per form. A failed or uncertain attempt keeps the key so a retry
 * can never record the delivery twice; only a saved intake (or a fresh form)
 * gets a new one.
 */
export function keyAfterAttempt(
  currentKey: string,
  outcome: "failed" | "saved",
  makeKey: () => string = createIdempotencyKey,
): string {
  return outcome === "saved" ? makeKey() : currentKey;
}
