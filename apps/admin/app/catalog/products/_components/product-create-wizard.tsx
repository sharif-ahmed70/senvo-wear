"use client";

import type {
  CategoryContract,
  CollectionContract,
  ColorContract,
  ProductContract,
  ProductVariantContract,
  SizeContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Barcode,
  Check,
  CheckCircle2,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  PackagePlus,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  Warehouse,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminApiClient } from "../../../_lib/api-client";
import {
  parseVariantPrice,
  formatVariantPrice,
} from "../../_lib/variant-price";
import { VariantMatrixSection } from "./variant-matrix-section";
export { VariantMatrixSection } from "./variant-matrix-section";
import styles from "./product-create-wizard.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

const steps = ["Basics", "Variants", "Media", "Review"] as const;
type Step = 0 | 1 | 2 | 3;

type BasicsState = {
  categoryId: string;
  collectionId: string;
  description: string;
  name: string;
  productCode: string;
  status: "ACTIVE" | "DRAFT";
};

type VariantDraft = {
  sellingPrice: string;
  colorId: string;
  id: string;
  sizeId: string;
  sku: string;
};

type MediaDraft = {
  altText: string;
  file: File;
  id: string;
  isPrimary: boolean;
  previewUrl: string;
  variantDraftId: string;
};

type ReferenceData = {
  categories: CategoryContract[];
  collections: CollectionContract[];
  colors: ColorContract[];
  sizes: SizeContract[];
};

type SaveResult = {
  galleryCount: number;
  primaryImageSaved: boolean;
  product: ProductContract;
  variants: ProductVariantContract[];
};

type PartialSave = {
  message: string;
  productId: string;
};

const blankBasics: BasicsState = {
  categoryId: "",
  collectionId: "",
  description: "",
  name: "",
  productCode: "",
  status: "DRAFT",
};

export function ProductCreateWizard() {
  const [references, setReferences] = useState<ReferenceData | null>(null);
  const [referenceError, setReferenceError] = useState("");
  const [step, setStep] = useState<Step>(0);
  const [basics, setBasics] = useState<BasicsState>(blankBasics);
  const [variants, setVariants] = useState<VariantDraft[]>([
    createVariantDraft(),
  ]);
  const [media, setMedia] = useState<MediaDraft[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [partialSave, setPartialSave] = useState<PartialSave | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      client.listCategories(),
      client.listCollections(),
      client.listColors(),
      client.listSizes(),
    ])
      .then(([categoryResult, collectionResult, colorResult, sizeResult]) => {
        if (!active) return;
        setReferences({
          categories: categoryResult.data.filter(
            (item) => item.status === "ACTIVE",
          ),
          collections: collectionResult.data.filter(
            (item) => item.status === "ACTIVE",
          ),
          colors: colorResult.data.filter((item) => item.status === "ACTIVE"),
          sizes: sizeResult.data.filter((item) => item.status === "ACTIVE"),
        });
      })
      .catch((caught) => {
        if (active) setReferenceError(messageFor(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      media.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    },
    [media],
  );

  const colorMap = useMemo(
    () => new Map(references?.colors.map((item) => [item.id, item.name]) ?? []),
    [references],
  );
  const sizeMap = useMemo(
    () => new Map(references?.sizes.map((item) => [item.id, item.name]) ?? []),
    [references],
  );
  const categoryMap = useMemo(
    () =>
      new Map(references?.categories.map((item) => [item.id, item.name]) ?? []),
    [references],
  );
  const collectionMap = useMemo(
    () =>
      new Map(
        references?.collections.map((item) => [item.id, item.name]) ?? [],
      ),
    [references],
  );

  function goNext() {
    const validation = validateStep(step, basics, variants, media);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    setStep((current) => Math.min(3, current + 1) as Step);
  }

  function goBack() {
    setError("");
    setStep((current) => Math.max(0, current - 1) as Step);
  }

  function reset() {
    media.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setBasics(blankBasics);
    setVariants([createVariantDraft()]);
    setMedia([]);
    setError("");
    setPartialSave(null);
    setResult(null);
    setStep(0);
  }

  const submissionPending = useRef(false);

  async function saveProduct() {
    if (submissionPending.current) return;
    const validation = validateStep(3, basics, variants, media);
    if (validation) {
      setError(validation);
      return;
    }
    if (!references) return;

    submissionPending.current = true;
    setSaving(true);
    setError("");
    setPartialSave(null);
    let createdProductId = "";

    try {
      const productResult = await client.createProduct({
        categoryId: basics.categoryId,
        collectionId: basics.collectionId || undefined,
        description: basics.description.trim() || null,
        name: basics.name.trim(),
        productCode: basics.productCode.trim(),
        slug: slugify(basics.name),
        status: basics.status,
      });
      createdProductId = productResult.data.id;

      const createdVariants: ProductVariantContract[] = [];
      const variantIdMap = new Map<string, string>();
      for (const draft of variants) {
        const variantResult = await client.createVariant({
          colorId: draft.colorId,
          productId: productResult.data.id,
          sizeId: draft.sizeId,
          sku: draft.sku.trim(),
          sellingPriceMinor: parseVariantPrice(draft.sellingPrice)!,
        });
        createdVariants.push(variantResult.data);
        variantIdMap.set(draft.id, variantResult.data.id);
      }

      let primaryImageSaved = false;
      let galleryCount = 0;
      const primary = media.find((item) => item.isPrimary) ?? media[0];
      if (primary) {
        const payload = await mediaPayload(primary.file);
        await client.setPrimaryProductImage({
          altText: primary.altText.trim() || basics.name.trim(),
          ...payload,
          idempotencyKey: `catalog-primary:${crypto.randomUUID()}`,
          productId: productResult.data.id,
        });
        primaryImageSaved = true;
      }

      for (const item of media) {
        if (item.id === primary?.id) continue;
        const payload = await mediaPayload(item.file);
        await client.addProductMedia({
          altText: item.altText.trim() || basics.name.trim(),
          ...payload,
          idempotencyKey: `catalog-gallery:${crypto.randomUUID()}`,
          productId: productResult.data.id,
          productVariantId: item.variantDraftId
            ? (variantIdMap.get(item.variantDraftId) ?? null)
            : null,
        });
        galleryCount += 1;
      }

      setResult({
        galleryCount,
        primaryImageSaved,
        product: productResult.data,
        variants: createdVariants,
      });
    } catch (caught) {
      const message = messageFor(caught);
      if (createdProductId) {
        setPartialSave({
          message,
          productId: createdProductId,
        });
      } else {
        setError(message);
      }
    } finally {
      submissionPending.current = false;
      setSaving(false);
    }
  }

  if (referenceError) {
    return (
      <main className={styles.page}>
        <Link className={styles.backLink} href="/catalog">
          <ArrowLeft size={15} /> Back to catalog
        </Link>
        <StatePanel icon={AlertCircle} title="Product setup could not load">
          <p>{referenceError}</p>
          <button onClick={() => window.location.reload()} type="button">
            Try again
          </button>
        </StatePanel>
      </main>
    );
  }

  if (!references) {
    return (
      <main className={styles.page}>
        <Link className={styles.backLink} href="/catalog">
          <ArrowLeft size={15} /> Back to catalog
        </Link>
        <StatePanel icon={LoaderCircle} spin title="Preparing product setup">
          <p>
            Loading active categories, collections, colors and sizes from SENVO.
          </p>
        </StatePanel>
      </main>
    );
  }

  if (result) {
    return <SuccessState result={result} onAddAnother={reset} />;
  }

  if (partialSave) {
    return <PartialSaveState partialSave={partialSave} />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.topline}>
        <Link className={styles.backLink} href="/catalog">
          <ArrowLeft size={15} /> Back to catalog
        </Link>
        <span>New merchandise setup</span>
      </div>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Catalog · Add product</p>
          <h1>Create a product</h1>
          <p>
            Define the merchandise once. Barcode and stock workflows follow from
            the variants you create here.
          </p>
        </div>
        <span className={styles.safeNote}>
          <Sparkles size={15} /> No editable stock balance lives in this form.
        </span>
      </header>

      <div className={styles.layout}>
        <aside
          className={styles.stepRail}
          aria-label="Product creation progress"
        >
          {steps.map((label, index) => {
            const complete = index < step;
            const active = index === step;
            return (
              <button
                aria-current={active ? "step" : undefined}
                className={`${styles.stepButton} ${active ? styles.stepActive : ""} ${complete ? styles.stepComplete : ""}`}
                disabled={index > step}
                key={label}
                onClick={() => index < step && setStep(index as Step)}
                type="button"
              >
                <span>{complete ? <Check size={14} /> : index + 1}</span>
                <span>
                  <strong>{label}</strong>
                  <small>{stepDescription(index as Step)}</small>
                </span>
              </button>
            );
          })}
          <div className={styles.flowNote}>
            <strong>What happens after save?</strong>
            <p>
              Generate barcodes, then receive opening stock. SENVO keeps those
              as separate operational events.
            </p>
          </div>
        </aside>

        <section className={styles.formCard}>
          <header className={styles.cardHeader}>
            <div>
              <span>
                Step {step + 1} of {steps.length}
              </span>
              <h2>{stepTitle(step)}</h2>
              <p>{stepLead(step)}</p>
            </div>
          </header>

          <div className={styles.cardBody}>
            {step === 0 ? (
              <BasicsStep
                basics={basics}
                references={references}
                setBasics={setBasics}
              />
            ) : null}
            {step === 1 ? (
              <VariantsStep
                basics={basics}
                onColorCreated={(newColor) => {
                  setReferences((prev) =>
                    prev
                      ? {
                          ...prev,
                          colors: prev.colors.some((c) => c.id === newColor.id)
                            ? prev.colors
                            : [...prev.colors, newColor],
                        }
                      : prev,
                  );
                }}
                onSizeCreated={(newSize) => {
                  setReferences((prev) =>
                    prev
                      ? {
                          ...prev,
                          sizes: prev.sizes.some((s) => s.id === newSize.id)
                            ? prev.sizes
                            : [...prev.sizes, newSize],
                        }
                      : prev,
                  );
                }}
                references={references}
                setVariants={setVariants}
                variants={variants}
              />
            ) : null}
            {step === 2 ? (
              <MediaStep
                basics={basics}
                media={media}
                setMedia={setMedia}
                variants={variants}
                colorMap={colorMap}
                sizeMap={sizeMap}
              />
            ) : null}
            {step === 3 ? (
              <ReviewStep
                basics={basics}
                categoryMap={categoryMap}
                collectionMap={collectionMap}
                colorMap={colorMap}
                media={media}
                sizeMap={sizeMap}
                variants={variants}
              />
            ) : null}

            {error ? (
              <p className={styles.error} role="alert">
                <AlertCircle size={16} /> {error}
              </p>
            ) : null}
          </div>

          <footer className={styles.cardFooter}>
            <button
              className={styles.secondaryButton}
              disabled={step === 0 || saving}
              onClick={goBack}
              type="button"
            >
              <ArrowLeft size={15} /> Back
            </button>
            {step < 3 ? (
              <button
                className={styles.primaryButton}
                onClick={goNext}
                type="button"
              >
                Continue <ArrowRight size={15} />
              </button>
            ) : (
              <button
                className={styles.primaryButton}
                disabled={saving}
                onClick={() => void saveProduct()}
                type="button"
              >
                {saving ? (
                  <LoaderCircle className={styles.spin} size={16} />
                ) : (
                  <PackagePlus size={16} />
                )}
                {saving ? "Saving product…" : "Create product"}
              </button>
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}

function BasicsStep({
  basics,
  references,
  setBasics,
}: {
  basics: BasicsState;
  references: ReferenceData;
  setBasics: (value: BasicsState) => void;
}) {
  function update<K extends keyof BasicsState>(key: K, value: BasicsState[K]) {
    setBasics({ ...basics, [key]: value });
  }
  return (
    <div className={styles.fields}>
      <label className={styles.fieldWide}>
        <span>
          Product name <b>*</b>
        </span>
        <input
          autoFocus
          onChange={(event) => update("name", event.target.value)}
          placeholder="Premium Oxford Shirt"
          value={basics.name}
        />
        <small>Use the customer-facing merchandise name.</small>
      </label>
      <label>
        <span>
          Product code <b>*</b>
        </span>
        <input
          onChange={(event) =>
            update("productCode", cleanCode(event.target.value))
          }
          placeholder="SW-SH-OXF-001"
          value={basics.productCode}
        />
        <small>Stable internal product identity, not a variant SKU.</small>
      </label>
      <label>
        <span>
          Category <b>*</b>
        </span>
        <select
          onChange={(event) => update("categoryId", event.target.value)}
          value={basics.categoryId}
        >
          <option value="">Select category</option>
          {references.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Collection</span>
        <select
          onChange={(event) => update("collectionId", event.target.value)}
          value={basics.collectionId}
        >
          <option value="">No collection</option>
          {references.collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Initial status</span>
        <select
          onChange={(event) =>
            update("status", event.target.value as BasicsState["status"])
          }
          value={basics.status}
        >
          <option value="DRAFT">Draft — finish setup first</option>
          <option value="ACTIVE">Active — merchandise is ready</option>
        </select>
      </label>
      <label className={styles.fieldWide}>
        <span>Description</span>
        <textarea
          maxLength={2000}
          onChange={(event) => update("description", event.target.value)}
          placeholder="Fit, fabric, finish and useful product details…"
          rows={5}
          value={basics.description}
        />
        <small>{basics.description.length}/2000 characters</small>
      </label>
    </div>
  );
}

export function VariantsStep({
  basics,
  onColorCreated,
  onSizeCreated,
  references,
  setVariants,
  variants,
}: {
  basics?: BasicsState;
  onColorCreated?: (color: ColorContract) => void;
  onSizeCreated?: (size: SizeContract) => void;
  references: ReferenceData;
  setVariants: (value: VariantDraft[]) => void;
  variants: VariantDraft[];
}) {
  function update(
    id: string,
    key: keyof Omit<VariantDraft, "id">,
    value: string,
  ) {
    setVariants(
      variants.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    );
  }
  function addVariant() {
    setVariants([...variants, createVariantDraft()]);
  }
  function removeVariant(id: string) {
    if (variants.length === 1) return;
    setVariants(variants.filter((item) => item.id !== id));
  }
  return (
    <div className={styles.variantStep}>
      <VariantMatrixSection
        basics={basics}
        onColorCreated={onColorCreated}
        onSizeCreated={onSizeCreated}
        references={references}
        setVariants={setVariants}
        variants={variants}
      />
      <div className={styles.sectionIntro}>
        <div>
          <strong>Sellable variants</strong>
          <p>
            Each color/size combination gets its own SKU and later its own
            barcode.
          </p>
        </div>
        <button
          className={styles.secondaryButton}
          onClick={addVariant}
          type="button"
        >
          <Plus size={15} /> Add variant
        </button>
      </div>
      <div className={styles.variantTableWrap}>
        <table className={styles.variantTable}>
          <thead>
            <tr>
              <th>Color</th>
              <th>Size</th>
              <th>SKU</th>
              <th>Selling price (BDT)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {variants.map((variant, index) => (
              <tr key={variant.id}>
                <td>
                  <select
                    aria-label={`Color for variant ${index + 1}`}
                    onChange={(event) =>
                      update(variant.id, "colorId", event.target.value)
                    }
                    value={variant.colorId}
                  >
                    <option value="">Select color</option>
                    {references.colors.map((color) => (
                      <option key={color.id} value={color.id}>
                        {color.name} · {color.code}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label={`Size for variant ${index + 1}`}
                    onChange={(event) =>
                      update(variant.id, "sizeId", event.target.value)
                    }
                    value={variant.sizeId}
                  >
                    <option value="">Select size</option>
                    {references.sizes.map((size) => (
                      <option key={size.id} value={size.id}>
                        {size.name} · {size.code}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`SKU for variant ${index + 1}`}
                    onChange={(event) =>
                      update(variant.id, "sku", cleanCode(event.target.value))
                    }
                    placeholder="SW-SH-OXF-BLK-M"
                    value={variant.sku}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Selling price for variant ${index + 1}`}
                    inputMode="decimal"
                    required
                    placeholder="125.50"
                    value={variant.sellingPrice}
                    onChange={(event) =>
                      update(variant.id, "sellingPrice", event.target.value)
                    }
                  />
                </td>
                <td>
                  <button
                    aria-label={`Remove variant ${index + 1}`}
                    className={styles.iconButton}
                    disabled={variants.length === 1}
                    onClick={() => removeVariant(variant.id)}
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.infoBand}>
        <Barcode size={17} />
        <div>
          <strong>Barcodes come next.</strong>
          <p>
            Do not type barcode values here. After creation, SENVO can identify
            these variants from the Barcode workspace.
          </p>
        </div>
      </div>
    </div>
  );
}

function MediaStep({
  basics,
  colorMap,
  media,
  setMedia,
  sizeMap,
  variants,
}: {
  basics: BasicsState;
  colorMap: Map<string, string>;
  media: MediaDraft[];
  setMedia: (value: MediaDraft[]) => void;
  sizeMap: Map<string, string>;
  variants: VariantDraft[];
}) {
  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const accepted = Array.from(fileList)
      .filter(
        (file) =>
          ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
          file.size <= 5_242_880,
      )
      .slice(0, Math.max(0, 8 - media.length));
    const next = accepted.map((file, index) => ({
      altText: basics.name.trim() || "SENVO product image",
      file,
      id: crypto.randomUUID(),
      isPrimary: media.length === 0 && index === 0,
      previewUrl: URL.createObjectURL(file),
      variantDraftId: "",
    }));
    setMedia([...media, ...next]);
  }
  function update(
    id: string,
    patch: Partial<Omit<MediaDraft, "file" | "id" | "previewUrl">>,
  ) {
    setMedia(
      media
        .map((item) => {
          if (item.id !== id)
            return patch.isPrimary ? { ...item, isPrimary: false } : item;
          const updated = { ...item, ...patch };
          return updated.isPrimary
            ? { ...updated, variantDraftId: "" }
            : updated;
        })
        .map((item) =>
          patch.isPrimary && item.id !== id
            ? { ...item, isPrimary: false }
            : item,
        ),
    );
  }
  function remove(id: string) {
    const target = media.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    const next = media.filter((item) => item.id !== id);
    if (target?.isPrimary && next[0]) next[0] = { ...next[0], isPrimary: true };
    setMedia(next);
  }
  return (
    <div className={styles.mediaStep}>
      <label className={styles.uploadZone}>
        <Upload size={24} />
        <strong>Upload real product photography</strong>
        <span>
          JPEG, PNG or WebP · up to 5 MB each · maximum 8 images in this setup
          flow
        </span>
        <input
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            addFiles(event.target.files);
            event.currentTarget.value = "";
          }}
          type="file"
        />
      </label>
      {media.length === 0 ? (
        <div className={styles.mediaEmpty}>
          <ImagePlus size={20} />
          <div>
            <strong>Media is optional for saving</strong>
            <p>
              But a clear primary image makes Catalog, Storefront and
              operational identification much easier.
            </p>
          </div>
        </div>
      ) : (
        <div className={styles.mediaGrid}>
          {media.map((item, index) => (
            <article
              className={`${styles.mediaCard} ${item.isPrimary ? styles.mediaPrimary : ""}`}
              key={item.id}
            >
              <div className={styles.mediaPreview}>
                <Image
                  alt={item.altText || basics.name || "Product preview"}
                  fill
                  sizes="220px"
                  src={item.previewUrl}
                  unoptimized
                />
                {item.isPrimary ? <span>Primary</span> : null}
                <button
                  aria-label={`Remove image ${index + 1}`}
                  onClick={() => remove(item.id)}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
              <label>
                <span>Alt text</span>
                <input
                  maxLength={240}
                  onChange={(event) =>
                    update(item.id, { altText: event.target.value })
                  }
                  value={item.altText}
                />
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  checked={item.isPrimary}
                  name="primary-image"
                  onChange={() => update(item.id, { isPrimary: true })}
                  type="radio"
                />{" "}
                Use as primary image
              </label>
              {!item.isPrimary ? (
                <label>
                  <span>Variant image for</span>
                  <select
                    onChange={(event) =>
                      update(item.id, { variantDraftId: event.target.value })
                    }
                    value={item.variantDraftId}
                  >
                    <option value="">General product gallery</option>
                    {variants.map((variant, variantIndex) => (
                      <option key={variant.id} value={variant.id}>
                        {variantLabel(variant, variantIndex, colorMap, sizeMap)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReviewStep({
  basics,
  categoryMap,
  collectionMap,
  colorMap,
  media,
  sizeMap,
  variants,
}: {
  basics: BasicsState;
  categoryMap: Map<string, string>;
  collectionMap: Map<string, string>;
  colorMap: Map<string, string>;
  media: MediaDraft[];
  sizeMap: Map<string, string>;
  variants: VariantDraft[];
}) {
  const primary = media.find((item) => item.isPrimary) ?? media[0];
  return (
    <div className={styles.review}>
      <section className={styles.reviewHero}>
        <span className={styles.reviewImage}>
          {primary ? (
            <Image
              alt={primary.altText || basics.name}
              fill
              sizes="120px"
              src={primary.previewUrl}
              unoptimized
            />
          ) : (
            <ImagePlus size={24} />
          )}
        </span>
        <div>
          <p>Ready to create</p>
          <h3>{basics.name}</h3>
          <span>
            {basics.productCode} ·{" "}
            {categoryMap.get(basics.categoryId) ?? "Category"}
          </span>
        </div>
        <span className={styles.reviewStatus}>
          {basics.status === "DRAFT" ? "Draft" : "Active"}
        </span>
      </section>
      <div className={styles.reviewGrid}>
        <ReviewCard title="Product">
          <ReviewLine
            label="Category"
            value={categoryMap.get(basics.categoryId) ?? "—"}
          />
          <ReviewLine
            label="Collection"
            value={
              basics.collectionId
                ? (collectionMap.get(basics.collectionId) ?? "—")
                : "No collection"
            }
          />
          <ReviewLine
            label="Description"
            value={basics.description.trim() ? "Added" : "Not added"}
          />
        </ReviewCard>
        <ReviewCard title="Variants">
          {variants.map((variant, index) => (
            <ReviewLine
              key={variant.id}
              label={`${colorMap.get(variant.colorId) ?? "Color"} / ${sizeMap.get(variant.sizeId) ?? "Size"}`}
              value={`${variant.sku || `Variant ${index + 1}`} / ${formatVariantPrice(parseVariantPrice(variant.sellingPrice) ?? 0)}`}
            />
          ))}
        </ReviewCard>
        <ReviewCard title="Media">
          <ReviewLine
            label="Primary image"
            value={primary ? "Ready" : "Not added"}
          />
          <ReviewLine
            label="Gallery images"
            value={String(Math.max(0, media.length - (primary ? 1 : 0)))}
          />
          <ReviewLine
            label="Variant media"
            value={String(media.filter((item) => item.variantDraftId).length)}
          />
        </ReviewCard>
      </div>
      <div className={styles.infoBand}>
        <Warehouse size={17} />
        <div>
          <strong>Stock is intentionally not part of product creation.</strong>
          <p>
            After save, use Receive Stock so every quantity change becomes an
            auditable inventory movement.
          </p>
        </div>
      </div>
    </div>
  );
}

function SuccessState({
  result,
  onAddAnother,
}: {
  result: SaveResult;
  onAddAnother: () => void;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.successCard}>
        <span className={styles.successIcon}>
          <CheckCircle2 size={28} />
        </span>
        <p className={styles.eyebrow}>Product created</p>
        <h1>{result.product.name}</h1>
        <p>
          {result.variants.length}{" "}
          {result.variants.length === 1 ? "variant" : "variants"} created ·{" "}
          {result.primaryImageSaved
            ? "primary image saved"
            : "no primary image"}{" "}
          · {result.galleryCount} gallery images.
        </p>
        <div className={styles.successActions}>
          <Link
            className={styles.primaryButton}
            href={`/catalog/products/${result.product.id}`}
          >
            View product <ArrowRight size={15} />
          </Link>
          <Link className={styles.secondaryButton} href="/catalog/barcodes">
            <Barcode size={15} /> Generate barcodes
          </Link>
          <Link className={styles.secondaryButton} href="/inventory">
            <Warehouse size={15} /> Receive opening stock
          </Link>
          <button
            className={styles.textButton}
            onClick={onAddAnother}
            type="button"
          >
            <RotateCcw size={14} /> Add another product
          </button>
        </div>
        <div className={styles.successFlow}>
          <span>Product</span>
          <ChevronRight size={14} />
          <span>Variants</span>
          <ChevronRight size={14} />
          <strong>Barcode</strong>
          <ChevronRight size={14} />
          <strong>Receive stock</strong>
        </div>
      </div>
    </main>
  );
}

function PartialSaveState({ partialSave }: { partialSave: PartialSave }) {
  return (
    <main className={styles.page}>
      <div className={styles.partialCard}>
        <span className={styles.partialIcon}>
          <AlertCircle size={25} />
        </span>
        <p className={styles.eyebrow}>Setup needs attention</p>
        <h1>The product record was created, but setup did not finish.</h1>
        <p>{partialSave.message}</p>
        <p className={styles.partialNote}>
          SENVO does not pretend the whole operation rolled back. Open the
          created product and finish variants/media from its real record.
        </p>
        <div className={styles.successActions}>
          <Link
            className={styles.primaryButton}
            href={`/catalog/products/${partialSave.productId}`}
          >
            Open created product <ArrowRight size={15} />
          </Link>
          <Link className={styles.secondaryButton} href="/catalog">
            Back to catalog
          </Link>
        </div>
      </div>
    </main>
  );
}

function StatePanel({
  children,
  icon: Icon,
  spin = false,
  title,
}: {
  children: React.ReactNode;
  icon: typeof AlertCircle;
  spin?: boolean;
  title: string;
}) {
  return (
    <section className={styles.statePanel}>
      <Icon className={spin ? styles.spin : ""} size={23} />
      <div>
        <h1>{title}</h1>
        {children}
      </div>
    </section>
  );
}

function ReviewCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className={styles.reviewCard}>
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reviewLine}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function validateStep(
  step: Step,
  basics: BasicsState,
  variants: VariantDraft[],
  media: MediaDraft[],
) {
  if (step >= 0) {
    if (basics.name.trim().length < 2)
      return "Product name must contain at least 2 characters.";
    if (!basics.productCode.trim()) return "Product code is required.";
    if (!/^[A-Za-z0-9-]+$/u.test(basics.productCode.trim()))
      return "Product code may contain only letters, numbers and hyphen.";
    if (!basics.categoryId) return "Choose a category.";
  }
  if (step >= 1) {
    if (variants.length === 0) return "Add at least one sellable variant.";
    if (
      variants.some(
        (item) => !item.colorId || !item.sizeId || item.sku.trim().length < 3,
      )
    )
      return "Every variant needs a color, size and SKU of at least 3 characters.";
    if (variants.some((item) => parseVariantPrice(item.sellingPrice) === null))
      return "Every variant needs a positive selling price in BDT with at most two decimal places (maximum 21474836.47).";
    const skus = variants.map((item) => item.sku.trim().toUpperCase());
    if (new Set(skus).size !== skus.length)
      return "Variant SKUs must be unique in this product.";
    const combinations = variants.map(
      (item) => `${item.colorId}:${item.sizeId}`,
    );
    if (new Set(combinations).size !== combinations.length)
      return "The same color and size combination cannot be added twice.";
  }
  if (step >= 2) {
    if (media.some((item) => item.altText.trim().length > 240))
      return "Image alt text must be 240 characters or fewer.";
  }
  return "";
}

function createVariantDraft(): VariantDraft {
  return {
    colorId: "",
    id: crypto.randomUUID(),
    sizeId: "",
    sku: "",
    sellingPrice: "",
  };
}

function stepTitle(step: Step) {
  return [
    "Basic product information",
    "Create sellable variants",
    "Add real product media",
    "Review before creation",
  ][step];
}

function stepLead(step: Step) {
  return [
    "Name and organize the merchandise. Product code identifies the style, while SKU belongs to each variant.",
    "Color, size and SKU define what staff can later identify, barcode and sell.",
    "Upload the real product images that should represent this merchandise across SENVO.",
    "Confirm the merchandise identity. Inventory will remain a separate operational workflow.",
  ][step];
}

function stepDescription(step: Step) {
  return [
    "Identity & organization",
    "Color, size & SKU",
    "Primary & variant images",
    "Confirm & create",
  ][step];
}

function variantLabel(
  variant: VariantDraft,
  index: number,
  colorMap: Map<string, string>,
  sizeMap: Map<string, string>,
) {
  return `${colorMap.get(variant.colorId) ?? `Variant ${index + 1}`} / ${sizeMap.get(variant.sizeId) ?? "Size"} · ${variant.sku || "SKU pending"}`;
}

function cleanCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/gu, "");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 120);
}

async function mediaPayload(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Only JPEG, PNG and WebP product media are supported.");
  if (file.size > 5_242_880)
    throw new Error(`${file.name} is larger than the 5 MB media limit.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return {
    contentBase64: btoa(binary),
    contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
  };
}

function messageFor(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "The product could not be saved.";
}
