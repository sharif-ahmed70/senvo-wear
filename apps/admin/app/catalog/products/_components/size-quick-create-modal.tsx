"use client";

import type { SizeContract } from "@senvo/contracts";
import { AlertCircle, Check, LoaderCircle, Ruler, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import styles from "./variant-matrix.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

const PRESET_SIZE_GROUPS = [
  {
    group: "Apparel (পোশাক)",
    items: [
      { name: "XS", code: "XS", sortOrder: 1 },
      { name: "S", code: "S", sortOrder: 2 },
      { name: "M", code: "M", sortOrder: 3 },
      { name: "L", code: "L", sortOrder: 4 },
      { name: "XL", code: "XL", sortOrder: 5 },
      { name: "XXL", code: "XXL", sortOrder: 6 },
      { name: "3XL", code: "3XL", sortOrder: 7 },
      { name: "Free Size", code: "FREE", sortOrder: 8 },
    ],
  },
  {
    group: "Pants / Waist (প্যান্টের মাপ)",
    items: [
      { name: "28", code: "28", sortOrder: 28 },
      { name: "30", code: "30", sortOrder: 30 },
      { name: "32", code: "32", sortOrder: 32 },
      { name: "34", code: "34", sortOrder: 34 },
      { name: "36", code: "36", sortOrder: 36 },
      { name: "38", code: "38", sortOrder: 38 },
      { name: "40", code: "40", sortOrder: 40 },
    ],
  },
  {
    group: "Shoes / Footwear (জুতার মাপ)",
    items: [
      { name: "39", code: "39", sortOrder: 39 },
      { name: "40", code: "40", sortOrder: 40 },
      { name: "41", code: "41", sortOrder: 41 },
      { name: "42", code: "42", sortOrder: 42 },
      { name: "43", code: "43", sortOrder: 43 },
      { name: "44", code: "44", sortOrder: 44 },
    ],
  },
];

function generateCode(name: string): string {
  return name
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9\s-]/gu, "")
    .replace(/\s+/gu, "-")
    .slice(0, 30);
}

export function SizeQuickCreateModal({
  existingSizesCount = 0,
  onClose,
  onSuccess,
}: {
  existingSizesCount?: number;
  onClose: () => void;
  onSuccess: (size: SizeContract) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState(existingSizesCount + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleNameChange(value: string) {
    setName(value);
    setCode(generateCode(value));
  }

  function handlePresetSelect(item: {
    name: string;
    code: string;
    sortOrder: number;
  }) {
    setName(item.name);
    setCode(item.code);
    setSortOrder(item.sortOrder);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanCodeValue = code
      .toUpperCase()
      .replace(/[^A-Z0-9-]/gu, "")
      .trim();

    if (!cleanName) {
      setError("সাইজের নাম আবশ্যক (Size name is required)");
      return;
    }
    if (!cleanCodeValue) {
      setError("সাইজ কোড আবশ্যক (Size code is required)");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await client.createSize({
        code: cleanCodeValue,
        name: cleanName,
        sortOrder: Number(sortOrder) || existingSizesCount + 1,
      });
      onSuccess(response.data);
      onClose();
    } catch (caught) {
      if (caught instanceof AdminApiError) {
        setError(caught.message);
      } else if (caught instanceof Error) {
        setError(caught.message);
      } else {
        setError("সাইজ তৈরি করতে সমস্যা হয়েছে (Failed to create size)");
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
            <Ruler size={18} className={styles.modalIcon} />
            <div>
              <h3>নতুন সাইজ যোগ করুন (Add New Size)</h3>
              <p>দোকানের পোশাক বা পণ্যের জন্য মাপ যুক্ত করুন।</p>
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
              দ্রুত সাইজ বেছে নিন (Presets):
            </span>
            <div className={styles.presetCategoryList}>
              {PRESET_SIZE_GROUPS.map((group) => (
                <div key={group.group} className={styles.presetCategoryRow}>
                  <span className={styles.presetCategoryName}>
                    {group.group}:
                  </span>
                  <div className={styles.presetPillWrap}>
                    {group.items.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        className={styles.presetPillBtn}
                        onClick={() => handlePresetSelect(item)}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.modalFields}>
            <label>
              <span>
                সাইজের নাম (Size Name) <b>*</b>
              </span>
              <input
                autoFocus
                placeholder="যেমন: XXL, 32, Free Size"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </label>

            <label>
              <span>
                সাইজ কোড (Code) <b>*</b>
              </span>
              <input
                placeholder="যেমন: XXL, 32, FREE"
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
              <span>ক্রমিক নম্বর (Sort Order)</span>
              <input
                type="number"
                min="0"
                max="9999"
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(parseInt(e.target.value, 10) || 0)
                }
              />
              <small>তালিকায় আগে-পরে দেখানোর ক্রম।</small>
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
                  <Check size={15} /> সাইজ সেভ করুন
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
