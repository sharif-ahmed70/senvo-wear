"use client";

import type { BarcodeLookupContract } from "@senvo/contracts";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  ScanBarcode,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";
import styles from "./inventory-overview.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

function messageFor(error: unknown): string {
  if (error instanceof AdminApiError) {
    return error.message;
  }
  return "Could not lookup barcode. Please verify the connection.";
}

export function InventoryScanDialog({
  onApply,
  onClose,
}: {
  onApply: (barcodeValue: string, lookup: BarcodeLookupContract) => void;
  onClose: () => void;
}) {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BarcodeLookupContract | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleLookup(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await client.lookupBarcode(trimmed);
      setResult(res.data);
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 404) {
        setError(`No active variant matched barcode "${trimmed}".`);
      } else {
        setError(messageFor(caught));
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleLookup(barcodeInput);
  }

  function handleSelect() {
    if (result) {
      onApply(barcodeInput.trim(), result);
      onClose();
    }
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose} role="presentation">
      <section
        aria-labelledby="inventory-scan-title"
        aria-modal="true"
        className={styles.scanModal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <header className={styles.modalHeader}>
          <div className={styles.modalTitleBlock}>
            <span className={styles.modalIconWrap}>
              <ScanBarcode aria-hidden="true" size={20} />
            </span>
            <div>
              <p className={styles.eyebrow}>Quick Scanner</p>
              <h2 id="inventory-scan-title">Scan or Enter Barcode</h2>
            </div>
          </div>
          <button
            aria-label="Close scanner"
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <form className={styles.scanForm} onSubmit={handleSubmit}>
          <label
            className={styles.scanInputLabel}
            htmlFor="inventory-barcode-input"
          >
            Barcode / বারকোড
          </label>
          <div className={styles.scanInputWrap}>
            <input
              autoComplete="off"
              className={styles.scanInput}
              disabled={loading}
              id="inventory-barcode-input"
              name="barcode"
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Scan with handheld scanner or type barcode…"
              ref={inputRef}
              type="text"
              value={barcodeInput}
            />
            <button
              className={styles.primaryButton}
              disabled={loading || !barcodeInput.trim()}
              type="submit"
            >
              {loading ? (
                <Loader2 className={styles.spin} size={16} />
              ) : (
                "Search"
              )}
            </button>
          </div>
          <p className={styles.scanHint}>
            Handheld USB or Bluetooth scanners will submit automatically.
          </p>
        </form>

        {error ? (
          <div className={styles.scanError} role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        {result ? (
          <div className={styles.scanResultCard}>
            <div className={styles.scanResultHeader}>
              <CheckCircle2 className={styles.successIcon} size={20} />
              <div>
                <strong>{result.productName}</strong>
                <p>
                  Color: <strong>{result.color}</strong> · Size:{" "}
                  <strong>{result.size}</strong> · SKU: {result.sku}
                </p>
              </div>
            </div>
            <div className={styles.scanResultFooter}>
              <span className={styles.barcodeValue}>
                Barcode: <code>{result.barcode.value}</code>
              </span>
              <button
                className={styles.primaryButton}
                onClick={handleSelect}
                type="button"
              >
                Inspect Stock in Detail
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
