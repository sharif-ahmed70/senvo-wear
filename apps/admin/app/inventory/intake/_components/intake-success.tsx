"use client";

import type { StockIntakeContract } from "@senvo/contracts";
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  LoaderCircle,
  Plus,
  RotateCcw,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatTaka } from "../_lib/currency-math";
import { IntakeBarcodeLabels } from "./intake-barcode-labels";
import styles from "./stock-intake-wizard.module.css";

export type PhotoUploadState =
  | { status: "none" }
  | { status: "uploading" }
  | { status: "saved" }
  | { message: string; status: "failed" };

export function IntakeSuccess({
  onAnother,
  onRetryPhoto,
  photo = { status: "none" },
  result,
  typedTransportMinor,
}: {
  onAnother: () => void;
  onRetryPhoto?: () => void;
  photo?: PhotoUploadState;
  result: StockIntakeContract;
  typedTransportMinor: number;
}) {
  const [showLabels, setShowLabels] = useState(false);
  const pieces = result.variants.reduce((sum, item) => sum + item.quantity, 0);
  const barcodes = result.variants.filter((item) => item.barcode).length;
  const transportChanged = result.transportAppliedMinor !== typedTransportMinor;

  return (
    <section aria-live="polite" className={styles.successCard}>
      <div className={styles.successHead}>
        <span className={styles.successIcon}>
          <CheckCircle2 aria-hidden="true" size={28} />
        </span>
        <p className={styles.eyebrow}>
          Stock-এ উঠেছে · {result.purchase.purchaseNumber}
        </p>
        <h1>
          {result.product.name} — {pieces} পিস Stock-এ
        </h1>
        <p className={styles.heroLead} style={{ margin: "8px auto 0" }}>
          Product code {result.product.code} · Supplier: {result.supplier.name}
        </p>
      </div>

      {result.replayed ? (
        <p className={styles.notice} role="status">
          এই মাল আগেই Save হয়েছিল — আবার চাপাতে দুবার ওঠেনি।
        </p>
      ) : null}

      <div className={styles.successStats}>
        <div>
          <span>Barcode</span>
          <strong>{barcodes} টা</strong>
        </div>
        <div>
          <span>মোট খরচ</span>
          <strong>{formatTaka(result.purchase.totalCostMinor)}</strong>
        </div>
        <div>
          <span>এখন দিলেন</span>
          <strong>{formatTaka(result.payment?.amountMinor ?? "0")}</strong>
        </div>
        <div>
          <span>Supplier-এর বাকি</span>
          <strong>{formatTaka(result.dueMinor)}</strong>
        </div>
      </div>

      {transportChanged ? (
        <p className={styles.warning} role="status">
          <AlertTriangle aria-hidden="true" size={16} />
          গাড়ি ভাড়া {formatTaka(typedTransportMinor)} লেখা হয়েছিল; পিস প্রতি
          সমান ভাগ করতে গিয়ে {formatTaka(result.transportAppliedMinor)} খরচে
          বসানো হয়েছে।
        </p>
      ) : null}

      {photo.status === "uploading" ? (
        <p className={styles.notice} role="status">
          <LoaderCircle aria-hidden="true" className={styles.spin} size={16} />
          ছবি তোলা হচ্ছে…
        </p>
      ) : null}
      {photo.status === "saved" ? (
        <p className={styles.notice} role="status">
          <CheckCircle2 aria-hidden="true" size={16} /> ছবি Save হয়েছে।
        </p>
      ) : null}
      {photo.status === "failed" ? (
        <div className={styles.warning} role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          <span>
            মাল Save হয়েছে, কিন্তু ছবি তোলা যায়নি ({photo.message}). পরে
            Product পাতা থেকে ছবি দিতে পারবেন।
            {onRetryPhoto ? (
              <>
                {" "}
                <button
                  className={styles.textButton}
                  onClick={onRetryPhoto}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={14} /> আবার চেষ্টা
                </button>
              </>
            ) : null}
          </span>
        </div>
      ) : null}

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
          onClick={onAnother}
          type="button"
        >
          <Plus aria-hidden="true" size={15} /> আরও মাল তুলুন
        </button>
        <Link className={styles.secondaryButton} href="/inventory">
          <Warehouse aria-hidden="true" size={15} /> Inventory
        </Link>
        <Link
          className={styles.secondaryButton}
          href={`/procurement/suppliers/${result.supplier.id}`}
        >
          Supplier খাতা
        </Link>
        <Link
          className={styles.textButton}
          href={`/catalog/products/${result.product.id}`}
        >
          Product দেখুন
        </Link>
      </div>

      {showLabels ? (
        <IntakeBarcodeLabels
          productName={result.product.name}
          variants={result.variants}
        />
      ) : null}
    </section>
  );
}
