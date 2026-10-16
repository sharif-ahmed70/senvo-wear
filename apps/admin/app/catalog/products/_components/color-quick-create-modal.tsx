"use client";

import type { ColorContract } from "@senvo/contracts";
import { AlertCircle, Check, LoaderCircle, Palette, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import styles from "./variant-matrix.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

const PRESET_COLORS = [
  { name: "Black", code: "BLK", hex: "#111111" },
  { name: "White", code: "WHT", hex: "#FFFFFF" },
  { name: "Navy Blue", code: "NVY", hex: "#1B2A4A" },
  { name: "Olive Green", code: "OLV", hex: "#556B2F" },
  { name: "Maroon", code: "MRN", hex: "#6B1830" },
  { name: "Charcoal Gray", code: "CHR", hex: "#333333" },
  { name: "Beige", code: "BGE", hex: "#C8B89F" },
  { name: "Royal Blue", code: "RBL", hex: "#2B6CB0" },
  { name: "Brown", code: "BRN", hex: "#4A2E18" },
  { name: "Mustard", code: "MST", hex: "#D4A017" },
  { name: "Sage Green", code: "SGE", hex: "#9CAF88" },
  { name: "Burgundy", code: "BGD", hex: "#800020" },
];

function generateCode(name: string): string {
  return name
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9\s-]/gu, "")
    .replace(/\s+/gu, "-")
    .slice(0, 30);
}

export function ColorQuickCreateModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (color: ColorContract) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [hexValue, setHexValue] = useState("#111111");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleNameChange(value: string) {
    setName(value);
    setCode(generateCode(value));
  }

  function handlePresetSelect(preset: (typeof PRESET_COLORS)[number]) {
    setName(preset.name);
    setCode(preset.code);
    setHexValue(preset.hex);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanCodeValue = code
      .toUpperCase()
      .replace(/[^A-Z0-9-]/gu, "")
      .trim();

    if (!cleanName) {
      setError("কালারের নাম আবশ্যক (Color name is required)");
      return;
    }
    if (!cleanCodeValue) {
      setError("কালার কোড আবশ্যক (Color code is required)");
      return;
    }
    if (!/^#[0-9A-Fa-f]{6}$/iu.test(hexValue)) {
      setError("সঠিক হেক্স কোড দিন (Use valid #RRGGBB format)");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await client.createColor({
        code: cleanCodeValue,
        hexValue: hexValue.toUpperCase(),
        name: cleanName,
      });
      onSuccess(response.data);
      onClose();
    } catch (caught) {
      if (caught instanceof AdminApiError) {
        setError(caught.message);
      } else if (caught instanceof Error) {
        setError(caught.message);
      } else {
        setError("কালার তৈরি করতে সমস্যা হয়েছে (Failed to create color)");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleWrap}>
            <Palette size={18} className={styles.modalIcon} />
            <div>
              <h3>নতুন কালার যোগ করুন (Add New Color)</h3>
              <p>দোকানের জন্য নতুন কাপড়ের কালার বা শেড যুক্ত করুন।</p>
            </div>
          </div>
          <button
            className={styles.modalCloseBtn}
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className={styles.modalForm}
        >
          {error ? (
            <div className={styles.modalError} role="alert">
              <AlertCircle size={15} /> {error}
            </div>
          ) : null}

          <div className={styles.presetSection}>
            <span className={styles.presetLabel}>
              জনপ্রিয় কালার (Quick Presets):
            </span>
            <div className={styles.presetGrid}>
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.code}
                  type="button"
                  className={styles.presetBtn}
                  onClick={() => handlePresetSelect(preset)}
                  title={`${preset.name} (${preset.hex})`}
                >
                  <span
                    className={styles.presetSwatch}
                    style={{ backgroundColor: preset.hex }}
                  />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.modalFields}>
            <label>
              <span>
                কালারের নাম (Color Name) <b>*</b>
              </span>
              <input
                autoFocus
                placeholder="যেমন: Olive Green, Navy Blue"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </label>

            <label>
              <span>
                কালার কোড (Code) <b>*</b>
              </span>
              <input
                placeholder="যেমন: OLV, NVY"
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9-]/gu, ""),
                  )
                }
                required
              />
              <small>শুধুমাত্র ইংরেজি অক্ষর, সংখ্যা ও হাইফেন (-)।</small>
            </label>

            <label>
              <span>
                রং সিলেক্ট করুন (Color Shade) <b>*</b>
              </span>
              <div className={styles.colorPickerRow}>
                <input
                  type="color"
                  value={hexValue}
                  onChange={(e) => setHexValue(e.target.value.toUpperCase())}
                  className={styles.nativeColorInput}
                />
                <input
                  type="text"
                  value={hexValue}
                  onChange={(e) => setHexValue(e.target.value.toUpperCase())}
                  placeholder="#000000"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  className={styles.hexTextInput}
                  required
                />
              </div>
            </label>
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClose}
              disabled={loading}
            >
              বাতিল (Cancel)
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={loading}
            >
              {loading ? (
                <>
                  <LoaderCircle size={15} className={styles.spin} /> সংরক্ষণ
                  হচ্ছে...
                </>
              ) : (
                <>
                  <Check size={15} /> কালার সেভ করুন
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
