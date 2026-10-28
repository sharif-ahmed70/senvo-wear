"use client";

import type {
  CategoryContract,
  ProductDetailsContract,
  PurchaseContract,
  VariantLastPurchaseCostContract,
} from "@senvo/contracts";
import { CheckCircle2, ImagePlus, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { formatTaka, parseTaka, takaInputFromMinor } from "../_lib/currency-math";
import {
  blankPurchase,
  cleanName,
  gridCounts,
  hasErrors,
  lineKey,
  linesFromGrid,
  normalizeName,
  sellText,
  summarizeIntake,
  todayInDhaka,
  validatePriceStep,
  validateProductStep,
  variantKey,
  type ExistingVariant,
  type FieldErrors,
  type PriceDraft,
  type ProductDraft,
  type PurchaseDraft,
  type QuantityGrid,
} from "../_lib/intake-draft";
import {
  audienceOptions,
  intakeErrorMessage,
  typeOptions,
} from "../_lib/intake-support";
import {
  CountBadge,
  FieldMessage,
  invalidProps,
  PriceAndSupplierStep,
  QuantityGridEditor,
  STEP_ERROR_SUMMARY,
  StepFrame,
  Stepper,
  type IntakeReferences,
} from "./intake-parts";
import {
  ChoiceField,
  MAX_PHOTO_BYTES,
  NEW_PRODUCT_STEPS,
  photoPayload,
  photoTypes,
  type PhotoType,
} from "./new-product-intake";
import styles from "./stock-intake-wizard.module.css";
import { intakeClient } from "./use-intake-submission";

const stepLeads = [
  "নাম, কার জন্য, কী মাল, ছবি আর বিবরণ ঠিক করুন।",
  "এই এন্ট্রিতে কোন রং-size কত পিস এসেছিল (শুধু দেখার জন্য)।",
  "বিক্রির দাম আর অতিরিক্ত খরচ (গাড়ি ভাড়া, কুলি) ঠিক করুন।",
  "কী কী বদলাবে দেখে নিন, তারপর Save করুন।",
];

export type EditIntakeSource = {
  details: ProductDetailsContract;
  /** The product's purchases (intakes), oldest first. */
  purchases: ReadonlyArray<{ date: string; id: string; number: string }>;
  purchase: PurchaseContract | null;
};

type Original = {
  categoryId: string;
  grid: QuantityGrid;
  existing: Map<string, ExistingVariant>;
  prices: PriceDraft;
  product: ProductDraft;
  purchase: PurchaseDraft;
  transportMinor: number;
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

function extraTotalMinor(purchase: PurchaseContract | null): number {
  return (purchase?.lines ?? []).reduce(
    (sum, line) => sum + line.quantity * (line.extraCostPerUnitMinor ?? 0),
    0,
  );
}

/** Rebuilds the intake wizard's drafts from a saved product and purchase. */
function originalFrom(
  source: EditIntakeSource,
  references: IntakeReferences,
): Original {
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

  // Only the variants in this purchase, with the pieces it brought.
  const colors: QuantityGrid["colors"] = [];
  const sizeIds: string[] = [];
  const existing = new Map<string, ExistingVariant>();
  const overrides: PriceDraft["overrides"] = {};
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
    existing.set(variantKey(color, size), {
      colorName: color,
      onHand: 0,
      sellingPriceMinor: variant.sellingPriceMinor,
      sizeName: size,
      variantId: variant.id,
    });
    const supplierPrice =
      line.supplierUnitCostMinor ??
      line.unitCostMinor - (line.extraCostPerUnitMinor ?? 0);
    overrides[lineKey(id, size)] = {
      cost: takaInputFromMinor(supplierPrice),
      sell: takaInputFromMinor(variant.sellingPriceMinor),
    };
  }
  sizeIds.sort(
    (a, b) =>
      (sizeOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (sizeOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
  const sizes = sizeIds.map((id) => sizeName.get(id) ?? id);

  const transportMinor = extraTotalMinor(purchase);
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
    categoryId: details.product.categoryId,
    existing,
    grid: { colors, sizes, sizesCustomized: true },
    prices: { costAll: "", overrides, sellAll: "" },
    product,
    purchase: draft,
    transportMinor,
  };
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

/**
 * Edit a product through the same four steps it was entered with. Name,
 * category, photo, description, selling prices and the purchase's extra
 * cost can change; pieces, purchase price, supplier and payment stay as
 * entered (they are tied to stock and the supplier's account).
 */
export function EditProductIntake({
  canEditExtraCost,
  canSave,
  onPurchaseChange,
  references,
  source,
}: {
  canEditExtraCost: boolean;
  canSave: boolean;
  onPurchaseChange: (purchaseId: string) => void;
  references: IntakeReferences;
  source: EditIntakeSource;
}) {
  const uid = useId();
  const original = useMemo(
    () => originalFrom(source, references),
    [references, source],
  );
  const [step, setStep] = useState(0);
  const [product, setProduct] = useState<ProductDraft>(original.product);
  const [prices, setPrices] = useState<PriceDraft>(original.prices);
  const [purchase, setPurchase] = useState<PurchaseDraft>(original.purchase);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [done, setDone] = useState<string[] | null>(null);

  // A different purchase (or a reload) starts again from the saved values.
  useEffect(() => {
    setProduct(original.product);
    setPrices(original.prices);
    setPurchase(original.purchase);
    setErrors({});
    setSaveError("");
  }, [original]);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  const lines = useMemo(
    () => linesFromGrid(original.grid, original.existing),
    [original],
  );
  const counts = gridCounts(original.grid);
  const totals = useMemo(
    () => summarizeIntake(lines, prices, purchase),
    [lines, prices, purchase],
  );
  const audiences = useMemo(
    () => audienceOptions(references.categories),
    [references.categories],
  );
  const types = useMemo(
    () => typeOptions(references.categories, product.audience),
    [product.audience, references.categories],
  );
  const missingSupplierPrice = (source.purchase?.lines ?? []).some(
    (line) => line.supplierUnitCostMinor === null,
  );

  const changes = useMemo(() => {
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
    if (photo) list.push("নতুন ছবি");
    for (const line of lines) {
      const sell = parseTaka(sellText(line, prices));
      if (line.existing && sell !== null && sell !== line.existing.sellingPriceMinor) {
        list.push(
          `বিক্রির দাম ${line.colorName} ${line.sizeName}: ${formatTaka(line.existing.sellingPriceMinor)} → ${formatTaka(sell)}`,
        );
      }
    }
    const transport = parseTaka(purchase.transport) ?? 0;
    if (transport !== original.transportMinor) {
      list.push(
        `অতিরিক্ত খরচ: ${formatTaka(original.transportMinor)} → ${formatTaka(transport)}`,
      );
    }
    return list;
  }, [lines, original, photo, prices, product, purchase.transport]);

  function validate(index: number): FieldErrors {
    if (index === 0) return validateProductStep(product);
    if (index === 2 && source.purchase) {
      return validatePriceStep(lines, prices, purchase);
    }
    return {};
  }

  function goNext() {
    if (step === 3) {
      void save();
      return;
    }
    const found = validate(step);
    setErrors(found);
    if (hasErrors(found)) return;
    setStep(step + 1);
  }

  function goBack() {
    setErrors({});
    setSaveError("");
    setStep(Math.max(0, step - 1));
  }

  async function resolveCategoryId(): Promise<string> {
    let categories = references.categories;
    let parent = findCategory(categories, cleanName(product.audience), null);
    if (!parent) {
      parent = (
        await intakeClient.createCategory({
          name: cleanName(product.audience),
          parentId: null,
          slug: categorySlug(product.audience),
        })
      ).data;
      categories = [...categories, parent];
    }
    const type = findCategory(categories, cleanName(product.type), parent.id);
    if (type) return type.id;
    return (
      await intakeClient.createCategory({
        name: cleanName(product.type),
        parentId: parent.id,
        slug: categorySlug(product.type),
      })
    ).data.id;
  }

  async function save() {
    for (const index of [0, 2]) {
      const found = validate(index);
      if (hasErrors(found)) {
        setErrors(found);
        setStep(index);
        return;
      }
    }
    setErrors({});
    setSaveError("");
    setSaving(true);
    const applied: string[] = [];
    try {
      const before = original.product;
      const categoryChanged =
        normalizeName(product.audience) !== normalizeName(before.audience) ||
        normalizeName(product.type) !== normalizeName(before.type);
      const categoryId = categoryChanged
        ? await resolveCategoryId()
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
          productId: source.details.product.id,
        });
        applied.push("নাম / Category / বিবরণ");
      }

      if (photo) {
        await intakeClient.setPrimaryProductImage({
          altText: name.slice(0, 240),
          ...(await photoPayload(photo.file)),
          idempotencyKey: `edit-photo:${crypto.randomUUID()}`,
          productId: source.details.product.id,
        });
        applied.push("ছবি");
      }

      for (const line of lines) {
        const sell = parseTaka(sellText(line, prices));
        if (!line.existing || sell === null) continue;
        if (sell === line.existing.sellingPriceMinor) continue;
        await intakeClient.updateVariantPrice({
          expectedSellingPriceMinor: line.existing.sellingPriceMinor,
          sellingPriceMinor: sell,
          variantId: line.existing.variantId,
        });
        applied.push(`বিক্রির দাম ${line.colorName} ${line.sizeName}`);
      }

      const transport = parseTaka(purchase.transport) ?? 0;
      if (source.purchase && transport !== original.transportMinor) {
        await intakeClient.correctPurchaseExtraCost(source.purchase.id, transport);
        applied.push("অতিরিক্ত খরচ");
      }
      setDone(applied);
    } catch (caught) {
      setSaveError(
        `${intakeErrorMessage(caught)}${applied.length ? ` (আগেই Save হয়েছে: ${applied.join(", ")})` : ""}`,
      );
    } finally {
      setSaving(false);
    }
  }

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!photoTypes.includes(file.type as PhotoType)) {
      setPhotoError("শুধু JPG, PNG বা WebP ছবি দিন।");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("ছবি ৫ MB-এর মধ্যে হতে হবে।");
      return;
    }
    setPhotoError("");
    setPhoto({ file, url: URL.createObjectURL(file) });
  }

  function updateProduct(patch: Partial<ProductDraft>) {
    setProduct((current) => ({ ...current, ...patch }));
  }

  if (done) {
    return (
      <section className={styles.formCard} role="status">
        <div className={styles.cardBody}>
          <h2>
            <CheckCircle2 aria-hidden="true" size={20} /> Save হয়েছে
          </h2>
          <p>
            {done.length
              ? `বদলানো হয়েছে: ${done.join(", ")}।`
              : "কিছু বদলানো হয়নি।"}
          </p>
          <div className={styles.addRow}>
            <Link className={styles.primaryButton} href="/inventory">
              Inventory-তে ফিরে যান
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const stepError =
    saveError ||
    (hasErrors(errors) ? STEP_ERROR_SUMMARY : "") ||
    (step === 3 && !canSave ? "Edit করার অনুমতি শুধু Owner বা Admin-এর।" : "") ||
    (step === 3 && changes.length === 0 ? "কিছু বদলানো হয়নি।" : "");
  const shownPhoto = photo?.url ?? source.details.primaryImage?.url ?? null;
  const extraCostLocked = !canEditExtraCost || missingSupplierPrice;

  return (
    <div className={styles.layout}>
      <Stepper
        current={step}
        label="Product Edit করার ধাপ"
        note="নতুন মাল তোলার সময় যা দিয়েছিলেন সেগুলো এখানে আছে — যা ভুল তা ঠিক করে Save করুন।"
        onSelect={(index) => {
          setErrors({});
          setStep(index);
        }}
        steps={NEW_PRODUCT_STEPS}
      />
      <StepFrame
        badge={<CountBadge colors={counts.colors} pieces={counts.pieces} />}
        errorMessage={stepError}
        isLast={step === 3}
        lead={stepLeads[step] ?? ""}
        onBack={goBack}
        onNext={goNext}
        saveDisabled={!canSave || changes.length === 0}
        saving={saving}
        stepCount={NEW_PRODUCT_STEPS.length}
        stepIndex={step}
        title={NEW_PRODUCT_STEPS[step] ?? ""}
      >
        {source.purchases.length > 1 ? (
          <label className={styles.field}>
            কোন মাল তোলার এন্ট্রি
            <select
              onChange={(event) => onPurchaseChange(event.target.value)}
              value={source.purchase?.id ?? ""}
            >
              {source.purchases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.number} ·{" "}
                  {new Date(item.date).toLocaleDateString("en-GB")}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {step === 0 ? (
          <>
            <div className={styles.fields}>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span>
                  Product-এর নাম <b>*</b>
                </span>
                <input
                  maxLength={160}
                  onChange={(event) =>
                    updateProduct({ name: event.target.value })
                  }
                  value={product.name}
                  {...invalidProps(errors, "name", `${uid}-name-error`)}
                />
                <FieldMessage id={`${uid}-name-error`} message={errors.name} />
              </label>
              <ChoiceField
                errorId={`${uid}-audience-error`}
                errorMessage={errors.audience}
                label="কার জন্য"
                onChange={(audience) => updateProduct({ audience })}
                options={audiences}
                placeholder="অন্য কিছু হলে লিখুন"
                value={product.audience}
              />
              <ChoiceField
                emptyHint="এই ভাগে এখনো কিছু নেই — লিখে দিন, যেমন T-shirt বা Panjabi।"
                errorId={`${uid}-type-error`}
                errorMessage={errors.type}
                label="কী মাল"
                onChange={(type) => updateProduct({ type })}
                options={types}
                placeholder="যেমন T-shirt, Pant, Saree"
                value={product.type}
              />
            </div>

            <div className={styles.field}>
              <span>ছবি</span>
              <div className={styles.photoRow}>
                {shownPhoto ? (
                  <span className={styles.photoPreview}>
                    <Image
                      alt={product.name || "Product-এর ছবি"}
                      fill
                      sizes="92px"
                      src={shownPhoto}
                      unoptimized
                    />
                  </span>
                ) : null}
                <label className={styles.uploadZone} style={{ flex: 1 }}>
                  {shownPhoto ? (
                    <ImagePlus aria-hidden="true" size={22} />
                  ) : (
                    <Upload aria-hidden="true" size={22} />
                  )}
                  <span>
                    <strong>{shownPhoto ? "ছবি বদলান" : "ছবি দিন"}</strong>
                    <span>JPG, PNG বা WebP · ৫ MB পর্যন্ত</span>
                  </span>
                  <input
                    accept={photoTypes.join(",")}
                    className={styles.visuallyHidden}
                    onChange={(event) => {
                      choosePhoto(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </label>
                {photo ? (
                  <button
                    aria-label="নতুন ছবি বাদ দিন"
                    className={styles.iconButton}
                    onClick={() => setPhoto(null)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                ) : null}
              </div>
              {photoError ? (
                <span className={styles.fieldError} role="alert">
                  {photoError}
                </span>
              ) : null}
            </div>

            <label className={`${styles.field} ${styles.fieldWide}`}>
              বিবরণ
              <textarea
                maxLength={2000}
                onChange={(event) =>
                  updateProduct({ description: event.target.value })
                }
                placeholder="কাপড়, fit, যত্ন — যা জানা দরকার"
                rows={4}
                value={product.description}
                {...invalidProps(
                  errors,
                  "description",
                  `${uid}-description-error`,
                )}
              />
              <FieldMessage
                id={`${uid}-description-error`}
                message={errors.description}
              />
            </label>
            <p className={styles.infoBand}>
              Product code: {source.details.product.productCode} (বদলায় না)
            </p>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <p className={styles.infoBand}>
              পিসের সংখ্যা এখানে বদলানো যায় না। সংখ্যা ভুল হলে Inventory →
              Stock Adjustment ব্যবহার করুন; নতুন রং/size এলে “নতুন রং / Size
              যোগ করুন”।
            </p>
            {source.purchase ? (
              <fieldset
                disabled
                style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}
              >
                <QuantityGridEditor
                  allowAdding={false}
                  colorOptions={references.colors}
                  errors={{}}
                  existing={original.existing}
                  grid={original.grid}
                  onChange={() => undefined}
                  sizeOptions={references.sizes}
                />
              </fieldset>
            ) : (
              <p className={styles.hint}>এই Product-এর মাল তোলার এন্ট্রি পাওয়া যায়নি।</p>
            )}
          </>
        ) : null}

        {step === 2 ? (
          source.purchase ? (
            <>
              <PriceAndSupplierStep
                colors={references.colors}
                editMode
                errors={errors}
                lines={lines}
                locations={references.locations}
                onPrices={setPrices}
                lockTransport={extraCostLocked}
                onPurchase={(next) =>
                  // Only the extra cost can change here.
                  setPurchase((current) => ({
                    ...current,
                    transport: next.transport,
                  }))
                }
                prices={prices}
                purchase={purchase}
                suppliers={references.suppliers}
                totals={totals}
              />
              {missingSupplierPrice ? (
                <p className={styles.hint}>
                  এই এন্ট্রিতে Supplier-এর প্রতি পিসের দাম লেখা নেই, তাই
                  অতিরিক্ত খরচ বদলানো যাবে না।
                </p>
              ) : !canEditExtraCost ? (
                <p className={styles.hint}>
                  অতিরিক্ত খরচ বদলাতে পারেন শুধু Owner বা Admin।
                </p>
              ) : null}
            </>
          ) : (
            <p className={styles.hint}>এই Product-এর মাল তোলার এন্ট্রি পাওয়া যায়নি।</p>
          )
        ) : null}

        {step === 3 ? (
          changes.length ? (
            <div className={styles.field}>
              <span>যা বদলাবে:</span>
              <ul>
                {changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
              <p className={styles.hint}>
                বিক্রির দাম বদলালে এখন থেকে নতুন দামে বিক্রি হবে। অতিরিক্ত খরচ
                বদলালে কেনা দাম আর লাভের হিসাব সেই অনুযায়ী ঠিক হবে।
              </p>
            </div>
          ) : (
            <p className={styles.hint}>
              কিছু বদলানো হয়নি — আগের ধাপে গিয়ে যা ভুল তা ঠিক করুন।
            </p>
          )
        ) : null}
      </StepFrame>
    </div>
  );
}
