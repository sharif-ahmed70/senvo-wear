"use client";

import type { StockIntakeContract } from "@senvo/contracts";
import { Printer } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import {
  Code128Barcode,
  dimensionsFor,
  type LabelSize,
} from "../../../catalog/barcodes/generate/_components/barcode-generation-workflow";
import labelStyles from "../../../catalog/barcodes/generate/_components/barcode-generation.module.css";
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
  const [labelSize, setLabelSize] = useState<LabelSize>("40x30");
  const labels = useMemo(() => labelCopies(variants, mode), [mode, variants]);
  const wanted = variants
    .filter((variant) => variant.barcode)
    .reduce(
      (sum, variant) => sum + (mode === "perPiece" ? variant.quantity : 1),
      0,
    );
  const size = dimensionsFor(labelSize);
  const printStyle = {
    "--label-height": `${size.height}mm`,
    "--label-width": `${size.width}mm`,
  } as CSSProperties;

  return (
    <section aria-label="Barcode label print" className={styles.supplierPanel}>
      <div className={styles.addRow} style={{ alignItems: "end" }}>
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
        <label className={styles.field}>
          Label size
          <select
            onChange={(event) => setLabelSize(event.target.value as LabelSize)}
            value={labelSize}
          >
            <option value="40x30">40mm × 30mm</option>
            <option value="50x30">50mm × 30mm</option>
            <option value="50x40">50mm × 40mm</option>
          </select>
        </label>
        <button
          className={styles.primaryButton}
          disabled={labels.length === 0}
          onClick={() => window.print()}
          type="button"
        >
          <Printer aria-hidden="true" size={16} /> {labels.length} টা label
          print
        </button>
      </div>
      {wanted > labels.length ? (
        <p className={styles.warning} role="status">
          একবারে {MAX_PRINT_LABELS} টা label দেখানো হচ্ছে। বাকিগুলো Barcodes
          পাতা থেকে print করুন।
        </p>
      ) : null}
      {labels.length === 0 ? (
        <p className={styles.hint}>এই মালের কোনো barcode পাওয়া যায়নি।</p>
      ) : (
        <div className={labelStyles.printArea} style={printStyle}>
          {labels.map((item) => (
            <article className={labelStyles.label} key={item.copyKey}>
              <strong>{productName}</strong>
              <span className={labelStyles.labelVariant}>
                {item.color} / {item.size}
              </span>
              <small>{item.sku}</small>
              <Code128Barcode value={item.barcode ?? ""} />
              <span className={labelStyles.labelValue}>{item.barcode}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
