"use client";

import type {
  CategoryContract,
  ProductDetailsContract,
  PurchaseContract,
  StockIntakeContract,
  VariantLastPurchaseCostContract,
} from "@senvo/contracts";
import { Barcode, CheckCircle2, Pencil, Warehouse } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatTaka, parseTaka, takaInputFromMinor } from "../_lib/currency-math";
import {
  blankPurchase,
  buildLines,
  cleanName,
  costText,
  lineKey,
  normalizeName,
  sellText,
  todayInDhaka,
  variantKey,
  type ExistingVariant,
  type IntakeLine,
  type PriceDraft,
  type ProductDraft,
  type PurchaseDraft,
  type QuantityGrid,
} from "../_lib/intake-draft";
import { IntakeBarcodeLabels } from "./intake-barcode-labels";
import type { IntakeReferences } from "./intake-parts";
import { photoPayload } from "./new-product-intake";
import styles from "./stock-intake-wizard.module.css";
import { intakeClient } from "./use-intake-submission";

/** What the edit page loads: the product and one of its intakes. */
export type EditIntakeSource = {
  details: ProductDetailsContract;
  /** The product's purchases (intakes), oldest first. */
  purchases: ReadonlyArray<{ date: string; id: string; number: string }>;
  purchase: PurchaseContract | null;
};

type BookedLine = {
  quantity: number;
  supplierUnitMinor: number;
  variantId: string;
};

/** The intake as it was saved, turned back into the wizard's drafts. */
export type EditOriginal = {
  /** Pieces already booked per line key (this purchase). */
  booked: Map<string, BookedLine>;
  categoryId: string;
  /** Every variant of the product, so typing an old colour/size reuses it. */
  existing: Map<string, ExistingVariant>;
  grid: QuantityGrid;
  lockedColorIds: Set<string>;
  lockedSizes: Set<string>;
  prices: PriceDraft;
  product: ProductDraft;
  purchase: PurchaseDraft;
  transportMinor: number;
};

export type EditSetup = {
  onPurchaseChange: (purchaseId: string) => void;
  original: EditOriginal;
  source: EditIntakeSource;
};

export type EditResult = {
  applied: string[];
  labels: StockIntakeContract["variants"];
  productName: string;
};

/** Purchases of a product, from its variants' latest purchase costs. */
export function purchasesFromLastCosts(
  rows: readonly VariantLastPurchaseCostContract[],
): EditIntakeSource["purchases"] {
  const byId = new Map<string, { date: string; id: string; number: string }>();
  for (const row of rows) {
    byId.set(row.purchaseId, {
      date: row.purchaseDate,
      id: row.purchaseId,
      number: row.purchaseNumber,
    });
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function editOriginalFrom(
  source: EditIntakeSource,
  references: IntakeReferences,
): EditOriginal {
  const { details, purchase } = source;
  const category = references.categories.find(
    (item) => item.id === details.product.categoryId,
  );
  const parent = category?.parentId
    ? references.categories.find((item) => item.id === category.parentId)
    : undefined;
  const product: ProductDraft = {
    audience: parent ? parent.name : (category?.name ?? ""),
    description: details.product.description ?? "",
    name: details.product.name,
    status:
      details.product.status === "ARCHIVED" ? "INACTIVE" : details.product.status,
    type: parent ? (category?.name ?? "") : "",
  };

  const colorName = new Map(references.colors.map((c) => [c.id, c.name]));
  const sizeName = new Map(references.sizes.map((s) => [s.id, s.name]));
  const sizeOrder = new Map(references.sizes.map((s) => [s.id, s.sortOrder]));
  const variants = new Map(details.variants.map((v) => [v.id, v]));

  const existing = new Map<string, ExistingVariant>();
  for (const variant of details.variants) {
    const color = colorName.get(variant.colorId);
    const size = sizeName.get(variant.sizeId);
    if (!color || !size) continue;
    existing.set(variantKey(color, size), {
      colorName: color,
      onHand: 0,
      sellingPriceMinor: variant.sellingPriceMinor,
      sizeName: size,
      variantId: variant.id,
    });
  }

  // The grid shows this purchase's colours and sizes with its pieces.
  const colors: QuantityGrid["colors"] = [];
  const sizeIds: string[] = [];
  const booked = new Map<string, BookedLine>();
  const overrides: PriceDraft["overrides"] = {};
  let firstCost = "";
  for (const line of purchase?.lines ?? []) {
    const variant = variants.get(line.productVariantId);
    if (!variant) continue;
    const color = colorName.get(variant.colorId) ?? line.variantName ?? line.sku;
    const size = sizeName.get(variant.sizeId) ?? line.sku;
    const id = `existing:${variant.colorId}`;
    let row = colors.find((item) => item.id === id);
    if (!row) {
      row = { id, name: color, quantities: {} };
      colors.push(row);
    }
    row.quantities[size] = String(
      Number(row.quantities[size] ?? 0) + line.quantity,
    );
    if (!sizeIds.includes(variant.sizeId)) sizeIds.push(variant.sizeId);
    const supplierUnitMinor =
      line.supplierUnitCostMinor ??
      line.unitCostMinor - (line.extraCostPerUnitMinor ?? 0);
    const key = lineKey(id, size);
    booked.set(key, {
      quantity: (booked.get(key)?.quantity ?? 0) + line.quantity,
      supplierUnitMinor,
      variantId: variant.id,
    });
    if (!existing.has(variantKey(color, size))) {
      existing.set(variantKey(color, size), {
        colorName: color,
        onHand: 0,
        sellingPriceMinor: variant.sellingPriceMinor,
        sizeName: size,
        variantId: variant.id,
      });
    }
    overrides[key] = {
      cost: takaInputFromMinor(supplierUnitMinor),
      sell: takaInputFromMinor(variant.sellingPriceMinor),
    };
    if (!firstCost) firstCost = takaInputFromMinor(supplierUnitMinor);
  }
  sizeIds.sort(
    (a, b) =>
      (sizeOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (sizeOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
  const sizes = sizeIds.map((id) => sizeName.get(id) ?? id);

  const transportMinor = (purchase?.lines ?? []).reduce(
    (sum, line) => sum + line.quantity * (line.extraCostPerUnitMinor ?? 0),
    0,
  );
  const supplier = references.suppliers.find(
    (item) => item.id === purchase?.supplierId,
  );
  const draft: PurchaseDraft = {
    ...blankPurchase(references.locations.map((location) => location.id)),
    existingSupplier: supplier
      ? {
          address: supplier.address ?? null,
          id: supplier.id,
          name: supplier.name,
          phone: supplier.phone ?? null,
        }
      : purchase
        ? { address: null, id: purchase.supplierId, name: "—", phone: null }
        : null,
    locationId: purchase?.destinationLocationId ?? "",
    note: purchase?.notes ?? "",
    purchaseDate: purchase
      ? todayInDhaka(new Date(purchase.purchaseDate))
      : todayInDhaka(),
    supplierMode: purchase ? "existing" : "none",
    transport: transportMinor ? takaInputFromMinor(transportMinor) : "",
  };

  return {
    booked,
    categoryId: details.product.categoryId,
    existing,
    grid: { colors, sizes, sizesCustomized: true },
    lockedColorIds: new Set(colors.map((color) => color.id)),
    lockedSizes: new Set(sizes.map(normalizeName)),
    prices: { costAll: firstCost, overrides, sellAll: "" },
    product,
    purchase: draft,
    transportMinor,
  };
}

/**
 * Gives colours/sizes added while editing the same prices as the rest: the
 * purchase and selling price of a row with the same size (else the first
 * row). An old variant typed in again keeps its own selling price. Each
 * row is filled once (`filled`), so later changes by staff are kept.
 */
export function fillAddedLinePrices(
  lines: readonly IntakeLine[],
  prices: PriceDraft,
  filled: Set<string>,
): PriceDraft | null {
  const added = lines.filter((line) => !filled.has(line.key));
  if (!added.length) return null;
  const known = lines.filter((line) => filled.has(line.key));
  const overrides = { ...prices.overrides };
  for (const line of added) {
    filled.add(line.key);
    const base =
      known.find(
        (other) => normalizeName(other.sizeName) === normalizeName(line.sizeName),
      ) ?? known[0];
    if (!base) continue;
    overrides[line.key] = {
      cost: costText(base, prices),
      sell: line.existing
        ? takaInputFromMinor(line.existing.sellingPriceMinor)
        : sellText(base, prices),
    };
  }
  return { ...prices, overrides };
}

/** Pieces to add (new intake) and to take out, versus the saved intake. */
function quantityChanges(lines: readonly IntakeLine[], original: EditOriginal) {
  const added: IntakeLine[] = [];
  const removed: Array<BookedLine & { label: string }> = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const before = original.booked.get(line.key);
    seen.add(line.key);
    const diff = line.quantity - (before?.quantity ?? 0);
    if (diff > 0) added.push({ ...line, quantity: diff });
    if (diff < 0 && before) {
      removed.push({
        ...before,
        label: `${line.colorName} ${line.sizeName}`,
        quantity: -diff,
      });
    }
  }
  for (const [key, before] of original.booked) {
    if (seen.has(key)) continue;
    const [colorId, size] = key.split("::");
    const color = original.grid.colors.find((item) => item.id === colorId);
    removed.push({ ...before, label: `${color?.name ?? ""} ${size ?? ""}` });
  }
  return { added, removed };
}

/** Plain-language list of what Save will change. */
export function describeEdit(input: {
  lines: readonly IntakeLine[];
  original: EditOriginal;
  photo: boolean;
  prices: PriceDraft;
  product: ProductDraft;
  purchase: PurchaseDraft;
}): string[] {
  const { lines, original, prices, product, purchase } = input;
  const list: string[] = [];
  const before = original.product;
  if (cleanName(product.name) !== cleanName(before.name)) {
    list.push(`নাম: ${before.name} → ${cleanName(product.name)}`);
  }
  if (
    normalizeName(product.audience) !== normalizeName(before.audience) ||
    normalizeName(product.type) !== normalizeName(before.type)
  ) {
    list.push(
      `Category: ${before.audience} › ${before.type || "—"} → ${cleanName(product.audience)} › ${cleanName(product.type)}`,
    );
  }
  if (product.description.trim() !== before.description.trim()) {
    list.push("বিবরণ বদলেছে");
  }
  if (input.photo) list.push("নতুন ছবি");
  for (const line of lines) {
    const sell = parseTaka(sellText(line, prices));
    if (line.existing && sell !== null && sell !== line.existing.sellingPriceMinor) {
      list.push(
        `বিক্রির দাম ${line.colorName} ${line.sizeName}: ${formatTaka(line.existing.sellingPriceMinor)} → ${formatTaka(sell)}`,
      );
    }
  }
  for (const line of lines) {
    const booked = original.booked.get(line.key);
    const cost = parseTaka(costText(line, prices));
    if (booked && cost !== null && cost !== booked.supplierUnitMinor) {
      list.push(
        `কেনা দাম ${line.colorName} ${line.sizeName}: ${formatTaka(booked.supplierUnitMinor)} → ${formatTaka(cost)} (Supplier-এর বাকি সেই হিসাবে বদলাবে)`,
      );
    }
  }
  const transport = parseTaka(purchase.transport) ?? 0;
  if (transport !== original.transportMinor) {
    list.push(
      `অতিরিক্ত খরচ: ${formatTaka(original.transportMinor)} → ${formatTaka(transport)}`,
    );
  }
  const { added, removed } = quantityChanges(lines, original);
  for (const line of added) {
    list.push(
      `${line.existing ? "" : "নতুন "}${line.colorName} ${line.sizeName}: +${line.quantity} পিস (Stock-এ উঠবে, Supplier-এর বাকি বাড়বে)`,
    );
  }
  for (const line of removed) {
    list.push(
      `${line.label}: −${line.quantity} পিস (Stock থেকে বাদ, Supplier-এর বাকি কমবে)`,
    );
  }
  return list;
}

function findCategory(
  categories: readonly CategoryContract[],
  name: string,
  parentId: string | null,
): CategoryContract | undefined {
  return categories.find(
    (item) =>
      (item.parentId ?? null) === parentId &&
      normalizeName(item.name) === normalizeName(name),
  );
}

function categorySlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 90)
    .replace(/-+$/u, "");
  return `${base.length >= 2 ? base : "category"}-${Date.now().toString(36)}`;
}

async function resolveCategoryId(
  categories: readonly CategoryContract[],
  product: ProductDraft,
): Promise<string> {
  let known = categories;
  let parent = findCategory(known, cleanName(product.audience), null);
  if (!parent) {
    parent = (
      await intakeClient.createCategory({
        name: cleanName(product.audience),
        parentId: null,
        slug: categorySlug(product.audience),
      })
    ).data;
    known = [...known, parent];
  }
  const type = findCategory(known, cleanName(product.type), parent.id);
  if (type) return type.id;
  return (
    await intakeClient.createCategory({
      name: cleanName(product.type),
      parentId: parent.id,
      slug: categorySlug(product.type),
    })
  ).data.id;
}

/**
 * Saves the product details (name, category, description, photo), then
 * corrects the intake itself on the server in one step: pieces, new
 * colours/sizes, purchase and selling prices and the extra cost. Stock,
 * the supplier balance and costs change with it. Returns labels to print.
 */
export async function applyIntakeEdit(input: {
  lines: readonly IntakeLine[];
  photo: File | null;
  prices: PriceDraft;
  product: ProductDraft;
  purchase: PurchaseDraft;
  references: IntakeReferences;
  setup: EditSetup;
  onApplied: (applied: string[]) => void;
}): Promise<EditResult> {
  const { lines, prices, product, purchase, references, setup } = input;
  const { original, source } = setup;
  const productId = source.details.product.id;
  const applied: string[] = [];
  const done = (label: string) => {
    applied.push(label);
    input.onApplied([...applied]);
  };

  const before = original.product;
  const categoryChanged =
    normalizeName(product.audience) !== normalizeName(before.audience) ||
    normalizeName(product.type) !== normalizeName(before.type);
  const categoryId = categoryChanged
    ? await resolveCategoryId(references.categories, product)
    : original.categoryId;
  const name = cleanName(product.name);
  const description = product.description.trim();
  if (
    name !== cleanName(before.name) ||
    description !== before.description.trim() ||
    categoryId !== original.categoryId
  ) {
    await intakeClient.editProduct({
      categoryId,
      description: description || null,
      expectedUpdatedAt: source.details.product.updatedAt,
      name,
      productId,
    });
    done("নাম / Category / বিবরণ");
  }

  if (input.photo) {
    await intakeClient.setPrimaryProductImage({
      altText: name.slice(0, 240),
      ...(await photoPayload(input.photo)),
      idempotencyKey: `edit-photo:${crypto.randomUUID()}`,
      productId,
    });
    done("ছবি");
  }

  if (!source.purchase) {
    // No intake entry found: only selling prices can be saved.
    for (const line of lines) {
      const sell = parseTaka(sellText(line, prices));
      if (!line.existing || sell === null) continue;
      if (sell === line.existing.sellingPriceMinor) continue;
      await intakeClient.updateVariantPrice({
        expectedSellingPriceMinor: line.existing.sellingPriceMinor,
        sellingPriceMinor: sell,
        variantId: line.existing.variantId,
      });
      done(`বিক্রির দাম ${line.colorName} ${line.sizeName}`);
    }
    return { applied, labels: [], productName: name };
  }

  const corrected = (
    await intakeClient.correctStockIntake({
      idempotencyKey: `intake-edit:${crypto.randomUUID()}`,
      lines: buildLines(lines, prices),
      purchaseId: source.purchase.id,
      transportCostMinor: parseTaka(purchase.transport) ?? 0,
    })
  ).data;
  const entryChanges = describeEdit({
    lines,
    original,
    photo: false,
    prices,
    product: original.product,
    purchase,
  });
  if (entryChanges.length) done("পিস / দাম / অতিরিক্ত খরচ");
  return { applied, labels: corrected.variants, productName: name };
}

export function EditSuccess({
  onEditAgain,
  result,
}: {
  onEditAgain: () => void;
  result: EditResult;
}) {
  const [showLabels, setShowLabels] = useState(true);
  const pieces = result.labels.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <section aria-live="polite" className={styles.successCard}>
      <div className={styles.successHead}>
        <span className={styles.successIcon}>
          <CheckCircle2 aria-hidden="true" size={28} />
        </span>
        <p className={styles.eyebrow}>Edit Save হয়েছে</p>
        <h1>
          {result.productName} — {pieces} পিস
        </h1>
        <p className={styles.heroLead} style={{ margin: "8px auto 0" }}>
          {result.applied.length
            ? `বদলানো হয়েছে: ${result.applied.join(", ")}।`
            : "কিছু বদলানো হয়নি — আগের তথ্যই আছে।"}
        </p>
      </div>
      <div className={styles.successActions}>
        <button
          aria-expanded={showLabels}
          className={styles.primaryButton}
          onClick={() => setShowLabels((value) => !value)}
          type="button"
        >
          <Barcode aria-hidden="true" size={16} /> Barcode label print
        </button>
        <button
          className={styles.secondaryButton}
          onClick={onEditAgain}
          type="button"
        >
          <Pencil aria-hidden="true" size={15} /> আবার Edit
        </button>
        <Link className={styles.secondaryButton} href="/inventory">
          <Warehouse aria-hidden="true" size={15} /> Inventory
        </Link>
      </div>
      {showLabels ? (
        <IntakeBarcodeLabels
          productName={result.productName}
          variants={result.labels}
        />
      ) : null}
    </section>
  );
}
