"use client";

import type {
  CategoryContract,
  CollectionContract,
  ColorContract,
  SizeContract,
} from "@senvo/contracts";
import {
  Check,
  CheckCircle2,
  Palette,
  Plus,
  Ruler,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ColorQuickCreateModal } from "./color-quick-create-modal";
import { SizeQuickCreateModal } from "./size-quick-create-modal";
import styles from "./variant-matrix.module.css";

type ReferenceData = {
  categories: CategoryContract[];
  collections: CollectionContract[];
  colors: ColorContract[];
  sizes: SizeContract[];
};

type VariantDraft = {
  sellingPrice: string;
  colorId: string;
  id: string;
  sizeId: string;
  sku: string;
};

type BasicsState = {
  categoryId: string;
  collectionId: string;
  description: string;
  name: string;
  productCode: string;
  status: "ACTIVE" | "DRAFT";
};

function cleanCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/gu, "");
}

export function VariantMatrixSection({
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
  const [showColorModal, setShowColorModal] = useState(false);
  const [showSizeModal, setShowSizeModal] = useState(false);

  // Matrix selection state
  const [selectedColorIds, setSelectedColorIds] = useState<string[]>([]);
  const [selectedSizeIds, setSelectedSizeIds] = useState<string[]>([]);
  const [matrixBasePrice, setMatrixBasePrice] = useState("");
  const [matrixPrefix, setMatrixPrefix] = useState(basics?.productCode ?? "");
  const [matrixMessage, setMatrixMessage] = useState("");

  // Bulk price state for table
  const [bulkPriceInput, setBulkPriceInput] = useState("");

  useEffect(() => {
    if (basics?.productCode && !matrixPrefix) {
      setMatrixPrefix(basics.productCode);
    }
  }, [basics?.productCode, matrixPrefix]);

  function handleColorCreated(newColor: ColorContract) {
    onColorCreated?.(newColor);
    setSelectedColorIds((prev) =>
      prev.includes(newColor.id) ? prev : [...prev, newColor.id],
    );
    setShowColorModal(false);
  }

  function handleSizeCreated(newSize: SizeContract) {
    onSizeCreated?.(newSize);
    setSelectedSizeIds((prev) =>
      prev.includes(newSize.id) ? prev : [...prev, newSize.id],
    );
    setShowSizeModal(false);
  }

  function toggleColor(colorId: string) {
    setSelectedColorIds((prev) =>
      prev.includes(colorId)
        ? prev.filter((id) => id !== colorId)
        : [...prev, colorId],
    );
  }

  function toggleSize(sizeId: string) {
    setSelectedSizeIds((prev) =>
      prev.includes(sizeId)
        ? prev.filter((id) => id !== sizeId)
        : [...prev, sizeId],
    );
  }

  function generateMatrix() {
    if (selectedColorIds.length === 0 || selectedSizeIds.length === 0) return;

    const prefix = cleanCode(
      matrixPrefix.trim() || basics?.productCode?.trim() || "ITEM",
    );
    const basePrice = matrixBasePrice.trim();

    const selectedColors = references.colors.filter((c) =>
      selectedColorIds.includes(c.id),
    );
    const selectedSizes = references.sizes.filter((s) =>
      selectedSizeIds.includes(s.id),
    );

    const existingCombinations = new Set(
      variants
        .filter((v) => v.colorId && v.sizeId)
        .map((v) => `${v.colorId}:${v.sizeId}`),
    );

    const newVariants: VariantDraft[] = [];

    for (const color of selectedColors) {
      for (const size of selectedSizes) {
        const comboKey = `${color.id}:${size.id}`;
        if (existingCombinations.has(comboKey)) {
          continue;
        }

        const sku = `${prefix}-${cleanCode(color.code)}-${cleanCode(size.code)}`;
        newVariants.push({
          id: crypto.randomUUID(),
          colorId: color.id,
          sizeId: size.id,
          sku,
          sellingPrice: basePrice,
        });
      }
    }

    if (newVariants.length === 0) {
      setMatrixMessage(
        "সিলেক্ট করা সব কম্বিনেশন ইতিমধ্যে তালিকায় আছে (All selected combinations already exist).",
      );
      return;
    }

    const first = variants[0];
    const isOnlyEmptyDraft =
      variants.length === 1 &&
      Boolean(first && !first.colorId && !first.sizeId && !first.sku);

    if (isOnlyEmptyDraft) {
      setVariants(newVariants);
    } else {
      setVariants([...variants, ...newVariants]);
    }

    setMatrixMessage(
      `সফলভাবে ${newVariants.length}টি ভ্যারিয়েন্ট তৈরি হয়েছে (Generated ${newVariants.length} variants).`,
    );
  }

  function applyBulkPrice() {
    const trimmed = bulkPriceInput.trim();
    if (!trimmed) return;
    setVariants(
      variants.map((v) => ({
        ...v,
        sellingPrice: trimmed,
      })),
    );
  }

  const combinationsCount = selectedColorIds.length * selectedSizeIds.length;

  return (
    <>
      {showColorModal ? (
        <ColorQuickCreateModal
          onClose={() => setShowColorModal(false)}
          onSuccess={handleColorCreated}
        />
      ) : null}

      {showSizeModal ? (
        <SizeQuickCreateModal
          existingSizesCount={references.sizes.length}
          onClose={() => setShowSizeModal(false)}
          onSuccess={handleSizeCreated}
        />
      ) : null}

      {/* ⚡ Color x Size Matrix Generator Card */}
      <div className={styles.matrixCard}>
        <div className={styles.matrixHeader}>
          <div className={styles.matrixTitleWrap}>
            <Sparkles size={18} className={styles.matrixIcon} />
            <div>
              <strong>Matrix Generator (রং ও সাইজ কম্বিনেশন)</strong>
              <p>
                একাধিক কালার ও সাইজ নির্বাচন করে এক ক্লিকে সব ভ্যারিয়েন্ট ও SKU
                তৈরি করুন।
              </p>
            </div>
          </div>
        </div>

        {/* Colors selector */}
        <div className={styles.matrixSection}>
          <div className={styles.matrixSectionHeader}>
            <span className={styles.matrixSectionTitle}>
              <Palette size={14} /> ১. কালার বেছে নিন (Select Colors) ·{" "}
              {selectedColorIds.length}টি সিলেক্টেড
            </span>
            <div className={styles.matrixHeaderActions}>
              <button
                type="button"
                className={styles.matrixTextBtn}
                onClick={() =>
                  setSelectedColorIds(references.colors.map((c) => c.id))
                }
              >
                সব সিলেক্ট (All)
              </button>
              <button
                type="button"
                className={styles.matrixTextBtn}
                onClick={() => setSelectedColorIds([])}
              >
                মুছুন (Clear)
              </button>
              <button
                type="button"
                className={styles.matrixTextBtn}
                onClick={() => setShowColorModal(true)}
              >
                <Plus size={12} /> নতুন কালার
              </button>
            </div>
          </div>

          <div className={styles.matrixChipsWrap}>
            {references.colors.length === 0 ? (
              <button
                type="button"
                className={styles.chip}
                onClick={() => setShowColorModal(true)}
              >
                <Plus size={13} /> কোনো কালার নেই — নতুন কালার যোগ করুন
              </button>
            ) : (
              references.colors.map((color) => {
                const isSelected = selectedColorIds.includes(color.id);
                return (
                  <button
                    key={color.id}
                    type="button"
                    className={`${styles.chip} ${isSelected ? styles.chipSelected : ""}`}
                    onClick={() => toggleColor(color.id)}
                    title={color.name}
                  >
                    <span
                      className={styles.chipSwatch}
                      style={{ backgroundColor: color.hexValue ?? "#111" }}
                    />
                    <span>{color.name}</span>
                    {isSelected ? <Check size={12} /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Sizes selector */}
        <div className={styles.matrixSection}>
          <div className={styles.matrixSectionHeader}>
            <span className={styles.matrixSectionTitle}>
              <Ruler size={14} /> ২. সাইজ বেছে নিন (Select Sizes) ·{" "}
              {selectedSizeIds.length}টি সিলেক্টেড
            </span>
            <div className={styles.matrixHeaderActions}>
              <button
                type="button"
                className={styles.matrixTextBtn}
                onClick={() =>
                  setSelectedSizeIds(references.sizes.map((s) => s.id))
                }
              >
                সব সিলেক্ট (All)
              </button>
              <button
                type="button"
                className={styles.matrixTextBtn}
                onClick={() => setSelectedSizeIds([])}
              >
                মুছুন (Clear)
              </button>
              <button
                type="button"
                className={styles.matrixTextBtn}
                onClick={() => setShowSizeModal(true)}
              >
                <Plus size={12} /> নতুন সাইজ
              </button>
            </div>
          </div>

          <div className={styles.matrixChipsWrap}>
            {references.sizes.length === 0 ? (
              <button
                type="button"
                className={styles.chip}
                onClick={() => setShowSizeModal(true)}
              >
                <Plus size={13} /> কোনো সাইজ নেই — নতুন সাইজ যোগ করুন
              </button>
            ) : (
              references.sizes.map((size) => {
                const isSelected = selectedSizeIds.includes(size.id);
                return (
                  <button
                    key={size.id}
                    type="button"
                    className={`${styles.chip} ${isSelected ? styles.chipSelected : ""}`}
                    onClick={() => toggleSize(size.id)}
                  >
                    <span>{size.name}</span>
                    {isSelected ? <Check size={12} /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Controls row */}
        <div className={styles.matrixControlsRow}>
          <label className={styles.matrixControlField}>
            <span>বিক্রি মূল্য / Base Price (টাকা)</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="যেমন: 1250.00"
              value={matrixBasePrice}
              onChange={(e) => setMatrixBasePrice(e.target.value)}
            />
            <small>তৈরি হওয়া সব ভ্যারিয়েন্টে এই দাম বসবে।</small>
          </label>

          <label className={styles.matrixControlField}>
            <span>পণ্য কোড / SKU Prefix</span>
            <input
              type="text"
              placeholder="SW-SH-OXF"
              value={matrixPrefix}
              onChange={(e) => setMatrixPrefix(cleanCode(e.target.value))}
            />
            <small>
              যেমন: {cleanCode(matrixPrefix || "ITEM")}-
              {references.colors[0]?.code ?? "BLK"}-
              {references.sizes[0]?.code ?? "M"}
            </small>
          </label>
        </div>

        {/* Action row */}
        <div className={styles.matrixActionRow}>
          <div className={styles.matrixSummary}>
            হিসাব: <b>{selectedColorIds.length}</b> কালার ×{" "}
            <b>{selectedSizeIds.length}</b> সাইজ = <b>{combinationsCount}</b>টি
            ভ্যারিয়েন্ট
          </div>
          <button
            type="button"
            className={styles.generateMatrixBtn}
            onClick={generateMatrix}
            disabled={combinationsCount === 0}
          >
            <Sparkles size={14} /> ম্যাট্রিক্স তৈরি করুন ({combinationsCount}টি
            ভ্যারিয়েন্ট)
          </button>
        </div>

        {matrixMessage ? (
          <div className={styles.infoBand}>
            <CheckCircle2 size={16} />
            <div>
              <strong>ম্যাট্রিক্স আপডেট</strong>
              <p>{matrixMessage}</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Bulk price quick updater */}
      {variants.length > 1 ? (
        <div className={styles.bulkPriceRow}>
          <span className={styles.bulkPriceLabel}>
            সব ভ্যারিয়েন্টে এক দাম বসান (Bulk Price):
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="যেমন: 1350"
            className={styles.bulkPriceInput}
            value={bulkPriceInput}
            onChange={(e) => setBulkPriceInput(e.target.value)}
          />
          <button
            type="button"
            className={styles.bulkPriceBtn}
            onClick={applyBulkPrice}
          >
            সবগুলোতে দিন (Apply to All)
          </button>
        </div>
      ) : null}
    </>
  );
}
