"use client";

import { ImagePlus, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useMemo, useState } from "react";
import { AdminApiError } from "../../../_lib/api-client";
import { parseTaka } from "../_lib/currency-math";
import {
  blankPrices,
  blankProduct,
  blankPurchase,
  buildNewProductPayload,
  gridCounts,
  hasErrors,
  linesFromGrid,
  normalizeName,
  summarizeIntake,
  validatePriceStep,
  validateProductStep,
  validateQuantityStep,
  type FieldErrors,
  type ProductDraft,
  type QuantityGrid,
} from "../_lib/intake-draft";
import {
  audienceOptions,
  OWNER_ONLY_MESSAGE,
  typeOptions,
} from "../_lib/intake-support";
import { sizePresetFor } from "../_lib/size-presets";
import {
  CountBadge,
  FieldMessage,
  invalidProps,
  locationLabel,
  PriceAndSupplierStep,
  QuantityGridEditor,
  ReviewSummary,
  STEP_ERROR_SUMMARY,
  StepFrame,
  Stepper,
  supplierLabel,
  type IntakeReferences,
} from "./intake-parts";
import { IntakeSuccess, type PhotoUploadState } from "./intake-success";
import styles from "./stock-intake-wizard.module.css";
import { intakeClient, useIntakeSubmission } from "./use-intake-submission";

export const NEW_PRODUCT_STEPS = [
  "Product-এর তথ্য",
  "রং, size আর কত পিস",
  "দাম আর Supplier",
  "দেখে নিন ও Save",
] as const;

const stepLeads = [
  "নাম, কার জন্য আর কী মাল — এটুকু দিলেই হবে। ছবি চাইলে এখনই দিন।",
  "প্রতিটা রঙের জন্য size অনুযায়ী কত পিস এলো লিখুন। খালি ঘর মানে ওই size আসেনি।",
  "কেনা আর বিক্রির দাম, গাড়ি ভাড়া, Supplier আর কত টাকা দিলেন।",
  "সব ঠিক থাকলে Save করুন — Product, barcode, stock আর Supplier খাতা একসাথে তৈরি হবে।",
];

const MAX_PHOTO_BYTES = 5_242_880;
const photoTypes = ["image/jpeg", "image/png", "image/webp"] as const;
type PhotoType = (typeof photoTypes)[number];

export function NewProductIntake({
  canSave,
  references,
}: {
  canSave: boolean;
  references: IntakeReferences;
}) {
  const uid = useId();
  const [step, setStep] = useState(0);
  const [product, setProduct] = useState<ProductDraft>(blankProduct);
  const [grid, setGrid] = useState<QuantityGrid>({
    colors: [],
    sizes: [],
    sizesCustomized: false,
  });
  const [prices, setPrices] = useState(blankPrices);
  const [purchase, setPurchase] = useState(() =>
    blankPurchase(references.locations.map((location) => location.id)),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [photoUpload, setPhotoUpload] = useState<PhotoUploadState>({
    status: "none",
  });
  const submission = useIntakeSubmission();

  const lines = useMemo(() => linesFromGrid(grid), [grid]);
  const counts = gridCounts(grid);
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

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  function validate(index: number): FieldErrors {
    if (index === 0) return validateProductStep(product);
    if (index === 1) return validateQuantityStep(grid);
    if (index === 2) return validatePriceStep(lines, prices, purchase);
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
    if (step === 0 && !grid.sizesCustomized) {
      setGrid((current) => ({
        ...current,
        sizes: sizePresetFor(product.type, product.audience),
      }));
    }
    setStep(step + 1);
  }

  function goBack() {
    setErrors({});
    submission.setError("");
    setStep(Math.max(0, step - 1));
  }

  async function save() {
    for (const index of [0, 1, 2]) {
      const found = validate(index);
      if (hasErrors(found)) {
        setErrors(found);
        setStep(index);
        return;
      }
    }
    setErrors({});
    const saved = await submission.submit((idempotencyKey) =>
      buildNewProductPayload({
        idempotencyKey,
        lines,
        prices,
        product,
        purchase,
      }),
    );
    if (saved && photo) await uploadPhoto(saved.product.id, photo.file);
  }

  async function uploadPhoto(productId: string, file: File) {
    setPhotoUpload({ status: "uploading" });
    try {
      await intakeClient.setPrimaryProductImage({
        altText: product.name.trim().slice(0, 240),
        ...(await photoPayload(file)),
        idempotencyKey: `intake-photo:${crypto.randomUUID()}`,
        productId,
      });
      setPhotoUpload({ status: "saved" });
    } catch (caught) {
      setPhotoUpload({
        message:
          caught instanceof AdminApiError && caught.status === 403
            ? OWNER_ONLY_MESSAGE
            : caught instanceof Error
              ? caught.message
              : "অজানা সমস্যা",
        status: "failed",
      });
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

  function startAnother() {
    setPhoto(null);
    setPhotoError("");
    setPhotoUpload({ status: "none" });
    setProduct(blankProduct);
    setGrid({ colors: [], sizes: [], sizesCustomized: false });
    setPrices(blankPrices);
    setPurchase(
      blankPurchase(references.locations.map((location) => location.id)),
    );
    setErrors({});
    submission.reset();
    setStep(0);
  }

  function updateProduct(patch: Partial<ProductDraft>) {
    setProduct((current) => ({ ...current, ...patch }));
  }

  const saved = submission.result;
  if (saved) {
    return (
      <IntakeSuccess
        onAnother={startAnother}
        onRetryPhoto={
          photo
            ? () => void uploadPhoto(saved.product.id, photo.file)
            : undefined
        }
        photo={photoUpload}
        result={saved}
        typedTransportMinor={parseTaka(purchase.transport) ?? 0}
      />
    );
  }

  const stepError =
    submission.error ||
    (hasErrors(errors) ? STEP_ERROR_SUMMARY : "") ||
    (step === 3 && !canSave ? OWNER_ONLY_MESSAGE : "");

  return (
    <div className={styles.layout}>
      <Stepper
        current={step}
        label="নতুন Product তোলার ধাপ"
        note="Save করলে Product, প্রতিটা রং-size-এর barcode, stock আর Supplier-এর হিসাব একসাথে তৈরি হয়।"
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
        saveDisabled={!canSave}
        saving={submission.saving}
        stepCount={NEW_PRODUCT_STEPS.length}
        stepIndex={step}
        title={NEW_PRODUCT_STEPS[step] ?? ""}
      >
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
                  placeholder="যেমন Cotton Panjabi"
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
                emptyHint={
                  product.audience.trim()
                    ? "এই ভাগে এখনো কিছু নেই — লিখে দিন, যেমন T-shirt বা Panjabi।"
                    : "আগে “কার জন্য” বেছে নিন, অথবা সরাসরি লিখুন।"
                }
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
              <span>ছবি (ঐচ্ছিক)</span>
              <div className={styles.photoRow}>
                {photo ? (
                  <span className={styles.photoPreview}>
                    <Image
                      alt={product.name || "Product-এর ছবি"}
                      fill
                      sizes="92px"
                      src={photo.url}
                      unoptimized
                    />
                  </span>
                ) : null}
                <label className={styles.uploadZone} style={{ flex: 1 }}>
                  {photo ? (
                    <ImagePlus aria-hidden="true" size={22} />
                  ) : (
                    <Upload aria-hidden="true" size={22} />
                  )}
                  <span>
                    <strong>{photo ? "ছবি বদলান" : "ছবি দিন"}</strong>
                    <span>
                      JPG, PNG বা WebP · ৫ MB পর্যন্ত · Save হওয়ার পরে তোলা হবে
                    </span>
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
                    aria-label="ছবি সরান"
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

            <details className={styles.moreInfo}>
              <summary>আরও তথ্য (ঐচ্ছিক)</summary>
              <div className={styles.fields}>
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
                <label className={styles.field}>
                  অবস্থা
                  <select
                    onChange={(event) =>
                      updateProduct({
                        status: event.target.value as ProductDraft["status"],
                      })
                    }
                    value={product.status}
                  >
                    <option value="ACTIVE">চালু — এখনই বিক্রি করা যাবে</option>
                    <option value="DRAFT">Draft — এখন দেখাবে না</option>
                    <option value="INACTIVE">বন্ধ</option>
                  </select>
                </label>
              </div>
            </details>

            <p className={styles.infoBand}>Product code Save করলে তৈরি হবে।</p>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <p className={styles.infoBand}>
              Size list এসেছে “{product.type.trim() || "Product"}” দেখে — দরকার
              হলে Size যোগ করুন বা ✕ দিয়ে সরান।
            </p>
            <QuantityGridEditor
              colorOptions={references.colors}
              errors={errors}
              grid={grid}
              onChange={setGrid}
              sizeOptions={references.sizes}
            />
          </>
        ) : null}

        {step === 2 ? (
          <PriceAndSupplierStep
            colors={references.colors}
            errors={errors}
            lines={lines}
            locations={references.locations}
            onPrices={setPrices}
            onPurchase={setPurchase}
            prices={prices}
            purchase={purchase}
            suppliers={references.suppliers}
            totals={totals}
          />
        ) : null}

        {step === 3 ? (
          <ReviewSummary
            colors={references.colors}
            heading={`${product.name.trim()} · ${product.audience.trim()} › ${product.type.trim()}${photo ? " · ছবিসহ" : ""}`}
            lines={lines}
            locationName={locationLabel(
              references.locations,
              purchase.locationId,
            )}
            supplierLabel={supplierLabel(purchase)}
            totals={totals}
          />
        ) : null}
      </StepFrame>
    </div>
  );
}

function ChoiceField({
  emptyHint,
  errorId,
  errorMessage,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  emptyHint?: string;
  errorId: string;
  errorMessage?: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
  value: string;
}) {
  const inputId = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={inputId}>
        {label} <b>*</b>
      </label>
      {options.length ? (
        <div aria-label={label} className={styles.chipRow} role="group">
          {options.map((option) => {
            const active = normalizeName(option) === normalizeName(value);
            return (
              <button
                aria-pressed={active}
                className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                key={option}
                onClick={() => onChange(option)}
                type="button"
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : emptyHint ? (
        <span className={styles.hint}>{emptyHint}</span>
      ) : null}
      <input
        id={inputId}
        maxLength={160}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
        {...(errorMessage
          ? { "aria-describedby": errorId, "aria-invalid": true }
          : {})}
      />
      <FieldMessage id={errorId} message={errorMessage} />
    </div>
  );
}

async function photoPayload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return { contentBase64: btoa(binary), contentType: file.type as PhotoType };
}
