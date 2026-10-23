"use client";

import type { StockIntakeContract } from "@senvo/contracts";
import { useMemo, useState } from "react";
import { BarcodeLabelSheet } from "../../../catalog/barcodes/_components/barcode-label-sheet";
import styles from "./stock-intake-wizard.module.css";

/** Keeps the preview responsive; larger runs can be printed in batches. */
export const MAX_PRINT_LABELS = 1000;

type CopyMode = "perPiece" | "perVariant";

export function labelCopies(
  variants: StockIntakeContract["variants"],
  mode: CopyMode,
): Array<StockIntakeContract["variants"][number] & { copyKey: string }> {
  const labels: Array<
    StockIntakeContract["variants"][number] & { copyKey: string }
  > = [];
  for (const variant of variants) {
    if (!variant.barcode) continue;
    const copies = mode === "perPiece" ? variant.quantity : 1;
    for (let index = 0; index < copies; index += 1) {
      if (labels.length >= MAX_PRINT_LABELS) return labels;
      labels.push({ ...variant, copyKey: `${variant.id}-${index}` });
    }
  }
  return labels;
}

export function IntakeBarcodeLabels({
  productName,
  variants,
}: {
  productName: string;
  variants: StockIntakeContract["variants"];
}) {
  const [mode, setMode] = useState<CopyMode>("perPiece");
  const labels = useMemo(() => labelCopies(variants, mode), [mode, variants]);
  const wanted = variants
    .filter((variant) => variant.barcode)
    .reduce(
      (sum, variant) => sum + (mode === "perPiece" ? variant.quantity : 1),
      0,
    );

  return (
    <section aria-label="Barcode label print" className={styles.supplierPanel}>
      <BarcodeLabelSheet
        items={labels.map((item) => ({
          barcode: item.barcode ?? "",
          color: item.color,
          key: item.copyKey,
          productName,
          sellingPriceMinor: item.sellingPriceMinor,
          size: item.size,
          sku: item.sku,
        }))}
      >
        <fieldset className={styles.segmented}>
          <legend>কতগুলো label</legend>
          <label className={styles.segment}>
            <input
              checked={mode === "perPiece"}
              name="intake-label-mode"
              onChange={() => setMode("perPiece")}
              type="radio"
            />
            প্রতি পিসে একটা
          </label>
          <label className={styles.segment}>
            <input
              checked={mode === "perVariant"}
              name="intake-label-mode"
              onChange={() => setMode("perVariant")}
              type="radio"
            />
            প্রতি রং-size-এ একটা
          </label>
        </fieldset>
      </BarcodeLabelSheet>
      {wanted > labels.length ? (
        <p className={styles.warning} role="status">
          একবারে {MAX_PRINT_LABELS} টা label দেখানো হচ্ছে। বাকিগুলো Barcodes
          পাতা থেকে print করুন।
        </p>
      ) : null}
      {labels.length === 0 ? (
        <p className={styles.hint}>এই মালের কোনো barcode পাওয়া যায়নি।</p>
      ) : null}
    </section>
  );
}
