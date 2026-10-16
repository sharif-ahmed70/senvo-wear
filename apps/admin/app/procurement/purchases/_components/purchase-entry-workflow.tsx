"use client";

import type {
  ColorContract,
  CreatePurchaseDraftLineServiceInputContract,
  ProductContract,
  ProductDetailsContract,
  PurchaseContract,
  SizeContract,
  StockLocationReadContract,
  SupplierContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../../_components/page-header";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import { useAdminPermissions } from "../../../admin-shell";
import { PurchaseAccessNotice } from "./purchase-history-workspace";
import styles from "./purchase-entry-workflow.module.css";

const client = new AdminApiClient();

const DRAFT_STORAGE_KEY = "senvo_purchase_workflow_draft_v1";

function safeGetDraftStorage(): string | null {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  return null;
}

function safeSetDraftStorage(value: string): void {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.setItem(DRAFT_STORAGE_KEY, value);
    }
  } catch {
    // ignore
  }
}

function safeRemoveDraftStorage(): void {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export type PurchaseStagedLine = {
  colorName: string;
  id: string; // client temporary ID
  lineNumber: number;
  productName: string;
  productVariantId: string;
  quantity: number;
  sizeName: string;
  sku: string;
  totalCostTaka: number;
  unitCostMinor: number;
  unitCostTaka: number;
  variantName: string;
};

export function buildPurchaseDraftLines(
  stagedLines: PurchaseStagedLine[],
): CreatePurchaseDraftLineServiceInputContract[] {
  return stagedLines.map((l, idx) => ({
    lineNumber: idx + 1,
    notes: null,
    productName: l.productName,
    productVariantId: l.productVariantId,
    quantity: l.quantity,
    sku: l.sku,
    unitCostMinor: l.unitCostMinor,
    variantName: l.variantName,
  }));
}

export function calculatePurchaseTotals(stagedLines: PurchaseStagedLine[]) {
  const totalQuantity = stagedLines.reduce((acc, l) => acc + l.quantity, 0);
  const totalCostTaka = stagedLines.reduce(
    (acc, l) => acc + l.totalCostTaka,
    0,
  );
  return { totalCostTaka, totalQuantity };
}

export type PurchaseEntryWorkflowProps = {
  initialColors?: ColorContract[];
  initialDestinationLocationId?: string;
  initialErrorMessage?: string;
  initialLocations?: StockLocationReadContract[];
  initialNotes?: string;
  initialProducts?: ProductContract[];
  initialPurchaseDate?: string;
  initialSavedPurchase?: PurchaseContract | null;
  initialSizes?: SizeContract[];
  initialStagedLines?: PurchaseStagedLine[];
  initialStep?: 1 | 2 | 3;
  initialSupplierId?: string;
  initialSuppliers?: SupplierContract[];
  onComplete?: (purchase: PurchaseContract) => void;
  permissions?: readonly AdminPermissionKey[];
};

export function PurchaseEntryWorkflow({
  initialColors,
  initialDestinationLocationId,
  initialErrorMessage,
  initialLocations,
  initialNotes,
  initialProducts,
  initialPurchaseDate,
  initialSavedPurchase,
  initialSizes,
  initialStagedLines,
  initialStep,
  initialSupplierId,
  initialSuppliers,
  onComplete,
  permissions: propsPermissions,
}: PurchaseEntryWorkflowProps) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;

  const canCreate = permissions.includes("PROCUREMENT:CREATE");
  const canConfirm = permissions.includes("PROCUREMENT:UPDATE");

  // Step state: 1 = Header, 2 = Products & Variants, 3 = Review & Submit
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(initialStep ?? 1);

  // References
  const [suppliers, setSuppliers] = useState<SupplierContract[]>(
    initialSuppliers ?? [],
  );
  const [locations, setLocations] = useState<StockLocationReadContract[]>(
    initialLocations ?? [],
  );
  const [products, setProducts] = useState<ProductContract[]>(
    initialProducts ?? [],
  );
  const [colors, setColors] = useState<ColorContract[]>(initialColors ?? []);
  const [sizes, setSizes] = useState<SizeContract[]>(initialSizes ?? []);
  const [loadingRefs, setLoadingRefs] = useState(
    !initialSuppliers || !initialLocations || !initialProducts,
  );

  // Step 1: Header form state
  const [supplierId, setSupplierId] = useState<string>(
    initialSupplierId ?? initialSuppliers?.[0]?.id ?? "",
  );
  const [destinationLocationId, setDestinationLocationId] = useState<string>(
    initialDestinationLocationId ?? initialLocations?.[0]?.id ?? "",
  );
  const [purchaseDate, setPurchaseDate] = useState<string>(
    initialPurchaseDate ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState<string>(initialNotes ?? "");

  // Step 2: Line selection state
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [productDetails, setProductDetails] =
    useState<ProductDetailsContract | null>(null);
  const [loadingProductDetails, setLoadingProductDetails] =
    useState<boolean>(false);
  const [commonPriceInput, setCommonPriceInput] = useState<string>("");

  // Staged lines for the entire purchase
  const [stagedLines, setStagedLines] = useState<PurchaseStagedLine[]>(
    initialStagedLines ?? [],
  );

  // Variant input map for currently selected product: variantId -> { quantity, unitCostTaka }
  const [variantInputs, setVariantInputs] = useState<
    Record<string, { quantity: string; unitCostTaka: string }>
  >({});

  // Submission & state tracking
  const [savedPurchase, setSavedPurchase] = useState<PurchaseContract | null>(
    initialSavedPurchase ?? null,
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage ?? null,
  );
  const [successMode, setSuccessMode] = useState<"DRAFT" | "POSTED" | null>(
    initialSavedPurchase
      ? initialSavedPurchase.status === "POSTED"
        ? "POSTED"
        : "DRAFT"
      : null,
  );
  const [draftRestored, setDraftRestored] = useState<boolean>(false);

  // Recover uncommitted draft from session storage on mount
  useEffect(() => {
    if (initialStagedLines || initialSavedPurchase) return;
    const saved = safeGetDraftStorage();
    if (!saved) return;
    try {
      const parsed: unknown = JSON.parse(saved);
      if (typeof parsed === "object" && parsed !== null) {
        const draft = parsed as {
          destinationLocationId?: string;
          notes?: string;
          purchaseDate?: string;
          stagedLines?: PurchaseStagedLine[];
          supplierId?: string;
        };
        let hasContent = false;
        if (
          typeof draft.supplierId === "string" &&
          draft.supplierId &&
          !supplierId
        ) {
          setSupplierId(draft.supplierId);
          hasContent = true;
        }
        if (
          typeof draft.destinationLocationId === "string" &&
          draft.destinationLocationId &&
          !destinationLocationId
        ) {
          setDestinationLocationId(draft.destinationLocationId);
          hasContent = true;
        }
        if (typeof draft.purchaseDate === "string" && draft.purchaseDate) {
          setPurchaseDate(draft.purchaseDate);
        }
        if (typeof draft.notes === "string" && draft.notes) {
          setNotes(draft.notes);
          hasContent = true;
        }
        if (Array.isArray(draft.stagedLines) && draft.stagedLines.length > 0) {
          setStagedLines(draft.stagedLines);
          hasContent = true;
        }
        if (hasContent) {
          setDraftRestored(true);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [
    destinationLocationId,
    initialSavedPurchase,
    initialStagedLines,
    supplierId,
  ]);

  // Sync draft to session storage
  useEffect(() => {
    if (successMode) {
      safeRemoveDraftStorage();
      return;
    }
    if (
      stagedLines.length > 0 ||
      notes ||
      (supplierId && supplierId !== suppliers[0]?.id)
    ) {
      safeSetDraftStorage(
        JSON.stringify({
          destinationLocationId,
          notes,
          purchaseDate,
          stagedLines,
          supplierId,
        }),
      );
    }
  }, [
    supplierId,
    destinationLocationId,
    purchaseDate,
    notes,
    stagedLines,
    successMode,
    suppliers,
  ]);

  const handleResetForm = () => {
    safeRemoveDraftStorage();
    setStagedLines([]);
    setSavedPurchase(null);
    setSuccessMode(null);
    setErrorMessage(null);
    setNotes("");
    setSelectedProductId("");
    setProductDetails(null);
    setVariantInputs({});
    setCommonPriceInput("");
    setCurrentStep(1);
    setDraftRestored(false);
  };

  // Load foundation reference data
  const loadFoundation = useCallback(async () => {
    try {
      const [suppliersRes, locationsRes, productsRes, colorsRes, sizesRes] =
        await Promise.all([
          initialSuppliers ? null : client.listSuppliers(),
          initialLocations
            ? null
            : client.listStockLocations({ pageSize: 100 }),
          initialProducts ? null : client.listProducts(),
          initialColors ? null : client.listColors(),
          initialSizes ? null : client.listSizes(),
        ]);

      if (suppliersRes?.data) {
        const active = suppliersRes.data.filter((s) => s.status === "ACTIVE");
        setSuppliers(active);
        if (active.length > 0 && !supplierId) {
          setSupplierId(active[0]?.id ?? "");
        }
      } else if (
        initialSuppliers &&
        initialSuppliers.length > 0 &&
        !supplierId
      ) {
        setSupplierId(initialSuppliers[0]?.id ?? "");
      }

      if (locationsRes?.data?.items) {
        const activeLocs = locationsRes.data.items.filter(
          (l) => l.status === "ACTIVE",
        );
        setLocations(activeLocs);
        if (activeLocs.length > 0 && !destinationLocationId) {
          setDestinationLocationId(activeLocs[0]?.id ?? "");
        }
      } else if (
        initialLocations &&
        initialLocations.length > 0 &&
        !destinationLocationId
      ) {
        setDestinationLocationId(initialLocations[0]?.id ?? "");
      }

      if (productsRes?.data) {
        setProducts(productsRes.data.filter((p) => p.status !== "ARCHIVED"));
      }
      if (colorsRes?.data) setColors(colorsRes.data);
      if (sizesRes?.data) setSizes(sizesRes.data);
    } catch {
      setErrorMessage("প্রয়োজনীয় তথ্য লোড করতে সমস্যা হয়েছে।");
    } finally {
      setLoadingRefs(false);
    }
  }, [
    initialSuppliers,
    initialLocations,
    initialProducts,
    initialColors,
    initialSizes,
    supplierId,
    destinationLocationId,
  ]);

  useEffect(() => {
    void loadFoundation();
  }, [loadFoundation]);

  // Load product details when product is selected
  useEffect(() => {
    if (!selectedProductId) {
      setProductDetails(null);
      setVariantInputs({});
      return;
    }

    setLoadingProductDetails(true);
    setErrorMessage(null);

    client
      .getProduct(selectedProductId)
      .then((res) => {
        if (res.data) {
          setProductDetails(res.data);
          const initialMap: Record<
            string,
            { quantity: string; unitCostTaka: string }
          > = {};
          res.data.variants.forEach((v) => {
            initialMap[v.id] = {
              quantity: "",
              unitCostTaka: "",
            };
          });
          setVariantInputs(initialMap);
        }
      })
      .catch((err) => {
        if (err instanceof AdminApiError) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage("পণ্যের ভ্যারিয়েন্ট লোড করা যায়নি।");
        }
      })
      .finally(() => {
        setLoadingProductDetails(false);
      });
  }, [selectedProductId]);

  const colorMap = useMemo(
    () => new Map(colors.map((c) => [c.id, c.name])),
    [colors],
  );
  const sizeMap = useMemo(
    () => new Map(sizes.map((s) => [s.id, s.name])),
    [sizes],
  );

  // Apply common buying price to current product's variants
  const handleApplyCommonPrice = () => {
    const price = commonPriceInput.trim();
    if (!price) return;
    setVariantInputs((prev) => {
      const updated = { ...prev };
      for (const variantId of Object.keys(updated)) {
        updated[variantId] = {
          ...updated[variantId]!,
          unitCostTaka: price,
        };
      }
      return updated;
    });
  };

  // Add selected product variants to stagedLines
  const handleAddProductVariantsToPurchase = () => {
    if (!productDetails) return;
    setErrorMessage(null);

    const newLines: PurchaseStagedLine[] = [];
    const activeVariants = productDetails.variants.filter(
      (v) => v.status === "ACTIVE",
    );

    for (const variant of activeVariants) {
      const input = variantInputs[variant.id];
      if (!input) continue;

      const qty = parseInt(input.quantity, 10);
      if (isNaN(qty) || qty <= 0) continue;

      const priceTaka = parseFloat(input.unitCostTaka);
      if (isNaN(priceTaka) || priceTaka < 0) {
        setErrorMessage(
          `ভ্যারিয়েন্ট ${variant.sku}-এর জন্য সঠিক ক্রয় দর প্রদান করুন।`,
        );
        return;
      }

      // Check if already in staged lines
      if (stagedLines.some((l) => l.productVariantId === variant.id)) {
        setErrorMessage(
          `ভ্যারিয়েন্ট ${variant.sku} ইতিমধ্যে ক্রয়ে যুক্ত আছে। একই ভ্যারিয়েন্ট দুবার যোগ করা যাবে না।`,
        );
        return;
      }

      const colorName = colorMap.get(variant.colorId) ?? "—";
      const sizeName = sizeMap.get(variant.sizeId) ?? "—";
      const variantName = `${colorName} / ${sizeName}`;
      const unitCostMinor = Math.round(priceTaka * 100);

      newLines.push({
        colorName,
        id: crypto.randomUUID(),
        lineNumber: stagedLines.length + newLines.length + 1,
        productName: productDetails.product.name,
        productVariantId: variant.id,
        quantity: qty,
        sizeName,
        sku: variant.sku,
        totalCostTaka: qty * priceTaka,
        unitCostMinor,
        unitCostTaka: priceTaka,
        variantName,
      });
    }

    if (newLines.length === 0) {
      setErrorMessage(
        "কমপক্ষে একটি ভ্যারিয়েন্টের পরিমাণ (Qty > 0) উল্লেখ করুন।",
      );
      return;
    }

    setStagedLines((prev) => [...prev, ...newLines]);
    // Clear product selection
    setSelectedProductId("");
    setProductDetails(null);
    setVariantInputs({});
    setCommonPriceInput("");
  };

  const handleRemoveStagedLine = (lineId: string) => {
    setStagedLines((prev) =>
      prev
        .filter((l) => l.id !== lineId)
        .map((l, idx) => ({ ...l, lineNumber: idx + 1 })),
    );
  };

  // Grand totals
  const totalQuantity = useMemo(
    () => stagedLines.reduce((acc, l) => acc + l.quantity, 0),
    [stagedLines],
  );
  const totalCostTaka = useMemo(
    () => stagedLines.reduce((acc, l) => acc + l.totalCostTaka, 0),
    [stagedLines],
  );

  // Save Draft (খসড়া সংরক্ষণ)
  const handleSaveDraft = async () => {
    if (isSubmitting) return;
    if (!supplierId || !destinationLocationId) {
      setErrorMessage("সরবরাহকারী এবং গন্তব্য লোকেশন নির্বাচন করুন।");
      return;
    }
    if (stagedLines.length === 0) {
      setErrorMessage("কমপক্ষে একটি পণ্য তালিকায় যুক্ত করুন।");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const linesInput: CreatePurchaseDraftLineServiceInputContract[] =
        stagedLines.map((l, idx) => ({
          lineNumber: idx + 1,
          notes: null,
          productName: l.productName,
          productVariantId: l.productVariantId,
          quantity: l.quantity,
          sku: l.sku,
          unitCostMinor: l.unitCostMinor,
          variantName: l.variantName,
        }));

      const res = await client.createPurchaseDraft({
        destinationLocationId,
        lines: linesInput,
        notes: notes.trim() || undefined,
        purchaseDate: new Date(purchaseDate).toISOString(),
        supplierId,
      });

      if (res.data) {
        setSavedPurchase(res.data);
        setSuccessMode("DRAFT");
        safeRemoveDraftStorage();
        onComplete?.(res.data);
      }
    } catch (err) {
      if (err instanceof AdminApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("ক্রয় আদেশ খসড়া হিসেবে সংরক্ষণ করতে ব্যর্থ হয়েছে।");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm Purchase (নিশ্চিত করুন ও স্টক যুক্ত করুন)
  const handleConfirmPurchase = async () => {
    if (isSubmitting || !canConfirm) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let targetPurchaseId = savedPurchase?.id;

      // If draft was not yet created, create draft first to get its purchaseId
      if (!targetPurchaseId) {
        const linesInput: CreatePurchaseDraftLineServiceInputContract[] =
          stagedLines.map((l, idx) => ({
            lineNumber: idx + 1,
            notes: null,
            productName: l.productName,
            productVariantId: l.productVariantId,
            quantity: l.quantity,
            sku: l.sku,
            unitCostMinor: l.unitCostMinor,
            variantName: l.variantName,
          }));

        const draftRes = await client.createPurchaseDraft({
          destinationLocationId,
          lines: linesInput,
          notes: notes.trim() || undefined,
          purchaseDate: new Date(purchaseDate).toISOString(),
          supplierId,
        });

        if (!draftRes.data?.id) {
          throw new Error("খসড়া তৈরি করা যায়নি।");
        }
        targetPurchaseId = draftRes.data.id;
        setSavedPurchase(draftRes.data);
      }

      // ONLY call confirmPurchase(purchaseId)
      const confirmRes = await client.confirmPurchase({
        purchaseId: targetPurchaseId,
      });

      if (confirmRes.data) {
        setSavedPurchase(confirmRes.data);
        setSuccessMode("POSTED");
        safeRemoveDraftStorage();
        onComplete?.(confirmRes.data);
      }
    } catch (err) {
      if (err instanceof AdminApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("ক্রয় আদেশ নিশ্চিতকরণ ও স্টক যুক্ত করতে ব্যর্থ হয়েছে।");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canCreate) {
    return <PurchaseAccessNotice />;
  }

  const selectedSupplierName =
    suppliers.find((s) => s.id === supplierId)?.name ?? "—";
  const selectedLocationName =
    locations.find((l) => l.id === destinationLocationId)?.name ?? "—";

  // Success view
  if (successMode && savedPurchase) {
    return (
      <div className={styles.container}>
        <div className={styles.successBox}>
          <CheckCircle2 color="#166534" size={54} />
          <h2 className={styles.successTitle}>
            {successMode === "POSTED"
              ? "ক্রয় সফলভাবে নিশ্চিত হয়েছে ও স্টক যোগ হয়েছে!"
              : "ক্রয় আদেশটি খসড়া (DRAFT) হিসেবে সংরক্ষিত হয়েছে!"}
          </h2>
          <p className={styles.successDescription}>
            ক্রয় আদেশ নম্বর: <strong>{savedPurchase.purchaseNumber}</strong>।
            {successMode === "POSTED"
              ? " সমস্ত পণ্যের স্টক গোডাউনে যুক্ত হয়েছে এবং মুভিং এভারেজ ক্রয়মূল্য হালনাগাদ করা হয়েছে।"
              : " এটি একটি খসড়া আদেশ। এতে কোনো ইনভেন্টরি স্টক বা ক্রয়মূল্য পরিবর্তন করা হয়নি।"}
          </p>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              marginTop: "1rem",
              flexWrap: "wrap",
            }}
          >
            <Link
              className={styles.primaryButton}
              href={`/procurement/purchases/${savedPurchase.id}`}
            >
              আদেশের বিবরণ দেখুন (View Details)
            </Link>
            <Link
              className={styles.secondaryButton}
              href="/procurement/purchases"
            >
              ক্রয় তালিকায় ফিরে যান (Back to list)
            </Link>
            <button
              className={styles.secondaryButton}
              onClick={handleResetForm}
              type="button"
            >
              নতুন আরেকটি ক্রয় এন্ট্রি (Create another purchase)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link className={styles.backLink} href="/procurement/purchases">
        <ArrowLeft size={16} />
        ক্রয় তালিকায় ফিরে যান (Back to purchases)
      </Link>

      <PageHeader
        description="সরবরাহকারী থেকে নতুন পণ্য গ্রহণ, ক্রয়মূল্য ও স্টক এন্ট্রি।"
        eyebrow="Procurement / নতুন ক্রয়"
        title="নতুন ক্রয় এন্ট্রি (New Purchase Entry)"
      />

      {/* Draft Restored Banner */}
      {draftRestored && (
        <div
          style={{
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "0.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              color: "#166534",
              fontSize: "0.875rem",
            }}
          >
            <CheckCircle2 size={16} />
            <span>
              পূর্বের অসম্পূর্ণ ড্রাফটের তথ্য উদ্ধার করা হয়েছে (Draft restored
              from browser session)।
            </span>
          </div>
          <button
            onClick={() => {
              safeRemoveDraftStorage();
              setStagedLines([]);
              setNotes("");
              setDraftRestored(false);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#dc2626",
              cursor: "pointer",
              fontSize: "0.8125rem",
              fontWeight: 600,
              textDecoration: "underline",
            }}
            type="button"
          >
            ড্রাফট মুছে নতুন শুরু করুন (Discard)
          </button>
        </div>
      )}

      {/* 3-Step Wizard Indicator */}
      <div className={styles.stepper}>
        <div
          className={`${styles.stepItem} ${currentStep === 1 ? styles.stepItemActive : ""}`}
        >
          <span
            className={`${styles.stepNumber} ${currentStep === 1 ? styles.stepNumberActive : ""}`}
          >
            ১
          </span>
          চালান ও সরবরাহকারী (Supplier)
        </div>
        <div className={styles.stepDivider} />
        <div
          className={`${styles.stepItem} ${currentStep === 2 ? styles.stepItemActive : ""}`}
        >
          <span
            className={`${styles.stepNumber} ${currentStep === 2 ? styles.stepNumberActive : ""}`}
          >
            ২
          </span>
          পণ্য ও দর (Products & Qty)
        </div>
        <div className={styles.stepDivider} />
        <div
          className={`${styles.stepItem} ${currentStep === 3 ? styles.stepItemActive : ""}`}
        >
          <span
            className={`${styles.stepNumber} ${currentStep === 3 ? styles.stepNumberActive : ""}`}
          >
            ৩
          </span>
          পর্যালোচনা ও স্টক (Review)
        </div>
      </div>

      {errorMessage && (
        <div
          className={styles.errorBox}
          role="alert"
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <div>{errorMessage}</div>
          </div>
          {currentStep === 3 && (
            <button
              disabled={isSubmitting}
              onClick={
                savedPurchase
                  ? () => void handleConfirmPurchase()
                  : () => void handleSaveDraft()
              }
              style={{
                backgroundColor: "#dc2626",
                border: "none",
                borderRadius: "0.25rem",
                color: "#ffffff",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                fontSize: "0.8125rem",
                fontWeight: 600,
                padding: "0.25rem 0.75rem",
                whiteSpace: "nowrap",
              }}
              type="button"
            >
              পুনরায় চেষ্টা করুন (Retry)
            </button>
          )}
        </div>
      )}

      {/* STEP 1: Supplier & Location */}
      {currentStep === 1 && (
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>
            ১. সরবরাহকারী ও গন্তব্য নির্বাচন (Supplier & Destination)
          </h2>

          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>
                সরবরাহকারী (Supplier) <span className={styles.required}>*</span>
              </label>
              <select
                aria-label="Select Supplier"
                className={styles.select}
                disabled={loadingRefs}
                onChange={(e) => setSupplierId(e.target.value)}
                value={supplierId}
              >
                <option value="">সরবরাহকারী বেছে নিন</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>
                গন্তব্য গোডাউন / দোকান (Destination Location){" "}
                <span className={styles.required}>*</span>
              </label>
              <select
                aria-label="Select Destination Location"
                className={styles.select}
                disabled={loadingRefs}
                onChange={(e) => setDestinationLocationId(e.target.value)}
                value={destinationLocationId}
              >
                <option value="">গোডাউন বা দোকান বেছে নিন</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>
                ক্রয়ের তারিখ (Purchase Date){" "}
                <span className={styles.required}>*</span>
              </label>
              <input
                aria-label="Purchase Date"
                className={styles.input}
                onChange={(e) => setPurchaseDate(e.target.value)}
                type="date"
                value={purchaseDate}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>
                চালান / নোট (Invoice / Notes)
              </label>
              <input
                aria-label="Invoice Notes"
                className={styles.input}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="যেমন: চালান #১২৩ বা শীতের স্টক"
                type="text"
                value={notes}
              />
            </div>
          </div>

          <div className={styles.buttonRow}>
            <div />
            <button
              className={styles.primaryButton}
              disabled={!supplierId || !destinationLocationId}
              onClick={() => {
                setErrorMessage(null);
                setCurrentStep(2);
              }}
              type="button"
            >
              পরবর্তী ধাপ: পণ্য ও দর
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Products & Variants */}
      {currentStep === 2 && (
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>
            ২. পণ্য ও ভ্যারিয়েন্ট নির্বাচন (Add Products & Quantities)
          </h2>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>
              ক্যাটালগ থেকে পণ্য নির্বাচন করুন (Select Product)
            </label>
            <select
              aria-label="Select Product to Add"
              className={styles.select}
              onChange={(e) => setSelectedProductId(e.target.value)}
              value={selectedProductId}
            >
              <option value="">পণ্য বেছে নিন...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.productCode})
                </option>
              ))}
            </select>
          </div>

          {loadingProductDetails && (
            <div style={{ padding: "1rem", color: "#64748b" }}>
              পণ্যের ভ্যারিয়েন্ট ও সাইজ তালিকা লোড হচ্ছে...
            </div>
          )}

          {productDetails && !loadingProductDetails && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                marginTop: "0.5rem",
              }}
            >
              {/* Common Price Input */}
              <div className={styles.priceInputRow}>
                <span
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#166534",
                  }}
                >
                  একক সাধারণ ক্রয়মূল্য (Common Buying Price - ৳):
                </span>
                <input
                  aria-label="Common Buying Price"
                  className={styles.commonPriceInput}
                  onChange={(e) => setCommonPriceInput(e.target.value)}
                  placeholder="যেমন: 500"
                  type="number"
                  value={commonPriceInput}
                />
                <button
                  className={styles.applyButton}
                  onClick={handleApplyCommonPrice}
                  type="button"
                >
                  সকল সাইজে বসান (Apply to all)
                </button>
              </div>

              {/* Variant selection table */}
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>পণ্য (Product)</th>
                      <th>রঙ (Color)</th>
                      <th>সাইজ (Size)</th>
                      <th>পরিমাণ (Qty pcs)</th>
                      <th>ক্রয় দর (Unit ৳)</th>
                      <th>মোট (Line ৳)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productDetails.variants
                      .filter((v) => v.status === "ACTIVE")
                      .map((variant) => {
                        const colorName = colorMap.get(variant.colorId) ?? "—";
                        const sizeName = sizeMap.get(variant.sizeId) ?? "—";
                        const input = variantInputs[variant.id] ?? {
                          quantity: "",
                          unitCostTaka: "",
                        };
                        const qty = parseInt(input.quantity, 10) || 0;
                        const price = parseFloat(input.unitCostTaka) || 0;
                        const lineTotal = qty * price;

                        return (
                          <tr key={variant.id}>
                            <td style={{ fontWeight: 600 }}>
                              {productDetails.product.name}
                            </td>
                            <td>
                              <span className={styles.badge}>{colorName}</span>
                            </td>
                            <td>
                              <span className={styles.badge}>{sizeName}</span>
                            </td>
                            <td>
                              <input
                                aria-label={`Quantity for ${colorName} ${sizeName}`}
                                className={styles.qtyInput}
                                min={0}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setVariantInputs((prev) => ({
                                    ...prev,
                                    [variant.id]: {
                                      ...prev[variant.id]!,
                                      quantity: val,
                                    },
                                  }));
                                }}
                                placeholder="0"
                                type="number"
                                value={input.quantity}
                              />
                            </td>
                            <td>
                              <input
                                aria-label={`Unit price for ${colorName} ${sizeName}`}
                                className={styles.unitPriceInput}
                                min={0}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setVariantInputs((prev) => ({
                                    ...prev,
                                    [variant.id]: {
                                      ...prev[variant.id]!,
                                      unitCostTaka: val,
                                    },
                                  }));
                                }}
                                placeholder="0.00"
                                type="number"
                                value={input.unitCostTaka}
                              />
                            </td>
                            <td className={styles.lineTotal}>
                              ৳{lineTotal.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className={styles.primaryButton}
                  onClick={handleAddProductVariantsToPurchase}
                  type="button"
                >
                  <Plus size={16} />
                  এই পণ্য ক্রয়ে যোগ করুন (Add to Order)
                </button>
              </div>
            </div>
          )}

          {/* Currently Staged Lines */}
          <div style={{ marginTop: "1rem" }}>
            <h3 className={styles.sectionTitle}>
              যুক্তকৃত পণ্যের তালিকা (Current Order Items - {stagedLines.length}
              )
            </h3>
            {stagedLines.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
                এখনও কোনো পণ্য যুক্ত করা হয়নি। উপরের ড্রপডাউন থেকে পণ্য ও সাইজ
                যোগ করুন।
              </p>
            ) : (
              <div
                className={styles.tableWrapper}
                style={{ marginTop: "0.5rem" }}
              >
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>ক্রমিক</th>
                      <th>পণ্য (Product)</th>
                      <th>রঙ (Color)</th>
                      <th>সাইজ (Size)</th>
                      <th>পরিমাণ</th>
                      <th>ক্রয় দর</th>
                      <th>মোট দর</th>
                      <th>বাতিল</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stagedLines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.lineNumber}</td>
                        <td style={{ fontWeight: 600 }}>{line.productName}</td>
                        <td>
                          <span className={styles.badge}>{line.colorName}</span>
                        </td>
                        <td>
                          <span className={styles.badge}>{line.sizeName}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{line.quantity}</td>
                        <td>৳{line.unitCostTaka.toFixed(2)}</td>
                        <td className={styles.lineTotal}>
                          ৳{line.totalCostTaka.toFixed(2)}
                        </td>
                        <td>
                          <button
                            aria-label={`Remove ${line.productName} ${line.variantName}`}
                            onClick={() => handleRemoveStagedLine(line.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#ef4444",
                              cursor: "pointer",
                            }}
                            type="button"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.buttonRow}>
            <button
              className={styles.secondaryButton}
              onClick={() => setCurrentStep(1)}
              type="button"
            >
              পূর্ববর্তী ধাপ
            </button>
            <button
              className={styles.primaryButton}
              disabled={stagedLines.length === 0}
              onClick={() => {
                setErrorMessage(null);
                setCurrentStep(3);
              }}
              type="button"
            >
              পরবর্তী ধাপ: পর্যালোচনা ও নিশ্চিতকরণ
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Review & Actions */}
      {currentStep === 3 && (
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>
            ৩. ক্রয় আদেশ পর্যালোচনা ও চূড়ান্ত নিশ্চিতকরণ (Review & Confirm)
          </h2>

          <div className={styles.summaryCard}>
            <div className={styles.summaryRow}>
              <span>সরবরাহকারী (Supplier):</span>
              <strong>{selectedSupplierName}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>গন্তব্য গোডাউন (Destination):</span>
              <strong>{selectedLocationName}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>তারিখ (Date):</span>
              <strong>{purchaseDate}</strong>
            </div>
            {notes && (
              <div className={styles.summaryRow}>
                <span>নোট / চালান (Notes):</span>
                <span>{notes}</span>
              </div>
            )}
            <div className={styles.summaryRow}>
              <span>মোট পণ্যের সংখ্যা:</span>
              <strong>{stagedLines.length} টি ভ্যারিয়েন্ট</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>মোট পরিমাণ (Total Pieces):</span>
              <strong>{totalQuantity} পিস</strong>
            </div>
            <div className={styles.summaryTotalRow}>
              <span>সর্বমোট ক্রয়মূল্য (Grand Total):</span>
              <span style={{ color: "#166534" }}>
                ৳
                {totalCostTaka.toLocaleString("en-BD", {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          {/* Lines Table */}
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ক্রমিক</th>
                  <th>পণ্য (Product)</th>
                  <th>রঙ (Color)</th>
                  <th>সাইজ (Size)</th>
                  <th>পরিমাণ</th>
                  <th>ক্রয় দর (৳)</th>
                  <th>মোট দর (৳)</th>
                </tr>
              </thead>
              <tbody>
                {stagedLines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.lineNumber}</td>
                    <td>{line.productName}</td>
                    <td>{line.colorName}</td>
                    <td>{line.sizeName}</td>
                    <td>{line.quantity}</td>
                    <td>৳{line.unitCostTaka.toFixed(2)}</td>
                    <td className={styles.lineTotal}>
                      ৳{line.totalCostTaka.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Confirmation Safety Notice */}
          <div
            style={{
              backgroundColor: "#fffbeb",
              border: "1px solid #fef3c7",
              borderRadius: "0.5rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              marginTop: "1.5rem",
              padding: "1rem",
            }}
          >
            <AlertCircle
              color="#d97706"
              size={20}
              style={{ flexShrink: 0, marginTop: "0.125rem" }}
            />
            <div
              style={{
                color: "#92400e",
                fontSize: "0.875rem",
                lineHeight: 1.5,
              }}
            >
              <strong>চূড়ান্ত স্টক ও দর সতর্কতা:</strong> Confirm করলে stock
              increase হবে এবং cost update হবে। নিশ্চিত করার পর গোডাউনে সমস্ত
              পণ্যের স্টক বৃদ্ধি পাবে এবং পণ্যের মুভিং এভারেজ ক্রয়মূল্য হালনাগাদ
              হবে। নিশ্চিত করার পর এই আদেশ বাতিল বা পরিবর্তন করা যাবে না।
            </div>
          </div>

          <div className={styles.buttonRow}>
            <button
              className={styles.secondaryButton}
              disabled={isSubmitting}
              onClick={() => setCurrentStep(2)}
              type="button"
            >
              পূর্ববর্তী ধাপ (পণ্য পরিবর্তন)
            </button>

            <div
              style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}
            >
              {/* Save Draft */}
              <button
                aria-busy={isSubmitting}
                className={styles.secondaryButton}
                disabled={isSubmitting || !!savedPurchase}
                onClick={() => void handleSaveDraft()}
                type="button"
              >
                {isSubmitting ? (
                  <Clock className={styles.spinning} size={16} />
                ) : null}
                {isSubmitting
                  ? "সংরক্ষণ করা হচ্ছে..."
                  : savedPurchase
                    ? "খসড়া সংরক্ষিত (Draft Saved)"
                    : "খসড়া সংরক্ষণ করুন (Save Draft)"}
              </button>

              {/* Confirm & Add Stock */}
              <div>
                <button
                  aria-busy={isSubmitting}
                  className={styles.confirmButton}
                  disabled={isSubmitting || !canConfirm}
                  onClick={() => void handleConfirmPurchase()}
                  type="button"
                >
                  {isSubmitting ? (
                    <Clock className={styles.spinning} size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {isSubmitting
                    ? "নিশ্চিত করা হচ্ছে..."
                    : "নিশ্চিত করুন ও স্টক যুক্ত করুন (Confirm & Add Stock)"}
                </button>
                {!canConfirm && (
                  <div className={styles.disabledHint}>
                    স্টক নিশ্চিত করতে PROCUREMENT:UPDATE অনুমতি প্রয়োজন।
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
