"use client";

import { Printer } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Code128Barcode,
  dimensionsFor,
  type LabelSize,
} from "../generate/_components/barcode-generation-workflow";
import sheetStyles from "../generate/_components/barcode-generation.module.css";
import styles from "./barcode-label.module.css";

export type BarcodeLabelItem = {
  barcode: string;
  color: string;
  /** Unique per printed copy. */
  key: string;
  productName: string;
  sellingPriceMinor: number;
  size: string;
  sku: string;
};

type PrintTarget = "label" | "sheet";

/** "৳750" or "৳1,250.50" (whole taka shown without decimals). */
export function labelPrice(minor: number): string {
  return `৳${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(minor / 100)}`;
}

/**
 * One sticker, top to bottom: — SENVO —, product name, colour, SKU, barcode,
 * barcode number, then the size in a black box and the price.
 */
export function BarcodeLabel({ item }: { item: BarcodeLabelItem }) {
  return (
    <div className={styles.inner}>
      <span className={styles.brand}>SENVO</span>
      <span className={styles.name}>{item.productName}</span>
      {item.color ? <span className={styles.color}>{item.color}</span> : null}
      <span className={styles.sku}>{item.sku}</span>
      <div className={styles.bars}>
        <Code128Barcode value={item.barcode} />
      </div>
      <span className={styles.number}>{item.barcode}</span>
      <div className={styles.bottom}>
        <span className={styles.size}>{item.size}</span>
        <span className={styles.price}>
          {labelPrice(item.sellingPriceMinor)}
        </span>
      </div>
    </div>
  );
}

/**
 * Label size, printer choice and the printable stickers. "Label printer" makes
 * the page exactly one sticker (no browser header/footer, one label per page).
 */
export function BarcodeLabelSheet({
  children,
  items,
}: {
  /** Extra controls shown before the size and printer choices. */
  children?: ReactNode;
  items: readonly BarcodeLabelItem[];
}) {
  const [labelSize, setLabelSize] = useState<LabelSize>("40x30");
  const [target, setTarget] = useState<PrintTarget>("label");
  const size = dimensionsFor(labelSize);
  const printStyle = {
    "--label-height": `${size.height}mm`,
    "--label-width": `${size.width}mm`,
  } as CSSProperties;

  return (
    <div>
      {target === "label" ? (
        <style>{`@page { size: ${size.width}mm ${size.height}mm; margin: 0; }`}</style>
      ) : null}
      <div className={styles.controls}>
        {children}
        <label>
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
        <label>
          Print on
          <select
            onChange={(event) => setTarget(event.target.value as PrintTarget)}
            value={target}
          >
            <option value="label">Label printer (1 label per page)</option>
            <option value="sheet">A4 sheet (many labels per page)</option>
          </select>
        </label>
        <button
          className={styles.printButton}
          disabled={items.length === 0}
          onClick={() => window.print()}
          type="button"
        >
          <Printer aria-hidden="true" size={16} /> {items.length} টা label print
        </button>
      </div>
      <p className={styles.tip}>
        Print dialog-এ Margins: None, Scale: 100% রাখুন। Label printer-এ প্রতিটা
        স্টিকার আলাদা পেজে যাবে।
      </p>
      {items.length > 0 ? (
        <div
          className={`${sheetStyles.printArea}${
            target === "label" ? ` ${sheetStyles.rollPrint}` : ""
          }`}
          style={printStyle}
        >
          {items.map((item) => (
            <article className={sheetStyles.label} key={item.key}>
              <BarcodeLabel item={item} />
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
