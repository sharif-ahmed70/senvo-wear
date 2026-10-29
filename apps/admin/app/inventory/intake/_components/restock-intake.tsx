"use client";

import type {
  ProductInventorySummaryContract,
  VariantLastPurchaseCostContract,
} from "@senvo/contracts";
import { LoaderCircle, Plus, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  normalizeScannedCode,
  submitScanOnEnterOrTab,
} from "../../../_lib/scan-input";
import { parseTaka } from "../_lib/currency-math";
import {
  blankPrices,
  blankPurchase,
  buildRestockPayload,
  gridCounts,
  hasErrors,
  linesFromGrid,
  summarizeIntake,
  validatePriceStep,
  validateQuantityStep,
  type FieldErrors,
  type QuantityGrid,
} from "../_lib/intake-draft";
import { OWNER_ONLY_MESSAGE, readErrorMessage } from "../_lib/intake-support";
import { restockSetupFrom, type RestockSetup } from "../_lib/restock";
import {
  clearPageDraft,
  readPageDraft,
  resumePageDraft,
  usePageDraft,
} from "../../../_lib/page-draft";
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
import { IntakeSuccess } from "./intake-success";
import { ProductThumb } from "../../../_components/product-thumb";
import styles from "./stock-intake-wizard.module.css";
import { intakeClient, useIntakeSubmission } from "./use-intake-submission";

export const RESTOCK_STEPS = [
  "Product খুঁজুন",
  "কত পিস এলো",
  "দাম আর Supplier",
  "দেখে নিন ও Save",
] as const;

const stepLeads = [
  "নাম, Product code বা barcode দিয়ে পুরোনো মাল খুঁজে বেছে নিন।",
  "প্রতিটা রং-size-এ নতুন কত পিস এলো লিখুন। এখনকার stock পাশে দেখানো আছে।",
  "কেনা দাম লিখুন। বিক্রির দাম না বদলালে আগেরটাই থাকবে।",
  "সব ঠিক থাকলে Save করুন — stock আর Supplier খাতা একসাথে আপডেট হবে।",
];

type Selected = RestockSetup & { summary: ProductInventorySummaryContract };

const emptyGrid: QuantityGrid = {
  colors: [],
  sizes: [],
  sizesCustomized: true,
};

/** Opened from a product page: that product is chosen straight away. */
export type RestockStart = {
  /** Go to the quantity step with "নতুন রং বা size এলো" already open. */
  addVariant: boolean;
  productCode: string;
  productId: string;
};

export function RestockIntake({
  canEditSupplier = false,
  canSave,
  references,
  start,
}: {
  canEditSupplier?: boolean;
  canSave: boolean;
  references: IntakeReferences;
  start?: RestockStart | null;
}) {
  const uid = useId();
  // Kept for the tab: Back (or leaving and coming back) shows it again.
  // The kept step is shown only once its product has loaded again.
  const [keptStep] = useState(() => readPageDraft<number>("restock-step") ?? 0);
  const [step, setStep] = usePageDraft("restock-step", 0, () => 0);
  const [query, setQuery] = usePageDraft("restock-query", "");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [results, setResults] = useState<
    ProductInventorySummaryContract[] | null
  >(null);
  const [loadingId, setLoadingId] = useState("");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [grid, setGrid] = usePageDraft<QuantityGrid>("restock-grid", emptyGrid);
  const [showAdd, setShowAdd] = usePageDraft("restock-show-add", false);
  const [prices, setPrices] = usePageDraft("restock-prices", blankPrices);
  const [purchase, setPurchase] = usePageDraft(
    "restock-purchase",
    () => blankPurchase(references.locations.map((location) => location.id)),
    // A chosen memo photo cannot be kept; it is picked again.
    (kept) => ({ ...kept, memoFile: null }),
  );
  // The chosen product is loaded again from the server when coming back.
  const [picked, setPicked] = usePageDraft<{
    code: string;
    id: string;
  } | null>("restock-picked", null);
  const kept = useRef({ grid, picked, prices, showAdd });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [lastCosts, setLastCosts] = useState<
    ReadonlyMap<string, VariantLastPurchaseCostContract>
  >(new Map());
  const submission = useIntakeSubmission();
  // Saved: the entry must not come back filled in.
  useEffect(() => {
    if (submission.result) clearPageDraft();
  }, [submission.result]);
  const selectedProductId = selected?.summary.product.id ?? "";

  // Show the previous purchase price next to each existing size.
  useEffect(() => {
    if (!selectedProductId) return;
    let active = true;
    void intakeClient
      .listLastPurchaseCosts(selectedProductId)
      .then((result) => {
        if (active)
          setLastCosts(
            new Map(result.data.map((row) => [row.productVariantId, row])),
          );
      })
      .catch(() => {
        if (active) setLastCosts(new Map());
      });
    return () => {
      active = false;
    };
  }, [selectedProductId]);

  const existing = selected?.existing;
  const lines = useMemo(() => linesFromGrid(grid, existing), [existing, grid]);
  const counts = gridCounts(grid);
  const totals = useMemo(
    () => summarizeIntake(lines, prices, purchase),
    [lines, prices, purchase],
  );

  async function search() {
    const term = query.trim();
    if (!term) {
      setSearchError("নাম, code বা barcode লিখুন।");
      return;
    }
    setSearching(true);
    setSearchError("");
    try {
      let searchTerm = term;
      let fromBarcode = false;
      const scanned = normalizeScannedCode(term);
      if (/^[A-Za-z0-9._-]+$/u.test(scanned)) {
        try {
          const hit = await intakeClient.lookupBarcode(scanned);
          searchTerm = hit.data.sku;
          fromBarcode = true;
        } catch {
          // Not a barcode; search by name/code/SKU instead.
        }
      }
      const page = await intakeClient.listInventoryProducts({
        pageSize: 20,
        search: searchTerm.slice(0, 120),
      });
      setResults(page.data.items);
      const only = page.data.items[0];
      if (fromBarcode && page.data.items.length === 1 && only) {
        await choose(only);
      }
    } catch (caught) {
      setSearchError(readErrorMessage(caught));
    } finally {
      setSearching(false);
    }
  }

  async function choose(summary: ProductInventorySummaryContract) {
    setLoadingId(summary.product.id);
    setSearchError("");
    try {
      const variants = await intakeClient.listVariants(summary.product.id);
      const setup = restockSetupFrom(summary, variants.data, references.sizes);
      setSelected({ ...setup, summary });
      setPicked({ code: summary.product.productCode, id: summary.product.id });
      setGrid(setup.grid);
      setShowAdd(setup.grid.colors.length === 0);
      setPrices(blankPrices);
      setErrors({});
      return true;
    } catch (caught) {
      setSearchError(readErrorMessage(caught));
      return false;
    } finally {
      setLoadingId("");
    }
  }

  // Opened from a product's "নতুন রং/size" or "আবার মাল এলো" button.
  // Coming back to a half-done entry opens the same product again.
  const started = useRef("");
  useEffect(() => {
    const before = kept.current;
    const resume =
      before.picked && (!start || start.productId === before.picked.id)
        ? before.picked
        : null;
    if (!resume && !start) return;
    const productId = resume?.id ?? start?.productId ?? "";
    const productCode = resume?.code ?? start?.productCode ?? "";
    if (started.current === productId) return;
    started.current = productId;
    setQuery(productCode);
    void (async () => {
      setSearching(true);
      try {
        const page = await intakeClient.listInventoryProducts({
          pageSize: 20,
          search: productCode.slice(0, 120),
        });
        setResults(page.data.items);
        const match = page.data.items.find(
          (item) => item.product.id === productId,
        );
        if (match && (await choose(match))) {
          if (resume) {
            setGrid(before.grid);
            setPrices(before.prices);
            setShowAdd(before.showAdd);
            setStep(keptStep);
          } else {
            setStep(1);
            if (start?.addVariant) setShowAdd(true);
          }
        }
      } catch (caught) {
        setSearchError(readErrorMessage(caught));
      } finally {
        setSearching(false);
      }
    })();
    // choose() only reads stable references; run once per product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  function validate(index: number): FieldErrors {
    if (index === 0) {
      return selected ? {} : { product: "আগে Product খুঁজে বেছে নিন।" };
    }
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
    setStep(step + 1);
  }

  function goBack() {
    setErrors({});
    submission.setError("");
    setStep(Math.max(0, step - 1));
  }

  async function save() {
    if (!selected) return;
    for (const index of [0, 1, 2]) {
      const found = validate(index);
      if (hasErrors(found)) {
        setErrors(found);
        setStep(index);
        return;
      }
    }
    setErrors({});
    await submission.submit((idempotencyKey) =>
      buildRestockPayload({
        idempotencyKey,
        lines,
        prices,
        productId: selected.summary.product.id,
        purchase,
      }),
    );
  }

  function startAnother() {
    setQuery("");
    setResults(null);
    setSelected(null);
    setPicked(null);
    setGrid(emptyGrid);
    setShowAdd(false);
    setPrices(blankPrices);
    setPurchase(
      blankPurchase(references.locations.map((location) => location.id)),
    );
    setErrors({});
    submission.reset();
    resumePageDraft();
    setStep(0);
  }

  if (submission.result) {
    return (
      <IntakeSuccess
        memoFile={purchase.memoFile}
        onAnother={startAnother}
        result={submission.result}
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
        label="পুরোনো মাল তোলার ধাপ"
        note="পুরোনো রং-size-এর barcode আগেরটাই থাকে; নতুন রং বা size হলে নতুন barcode তৈরি হয়।"
        onSelect={(index) => {
          setErrors({});
          setStep(index);
        }}
        steps={RESTOCK_STEPS}
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
        stepCount={RESTOCK_STEPS.length}
        stepIndex={step}
        title={RESTOCK_STEPS[step] ?? ""}
      >
        {step === 0 ? (
          <>
            <form
              className={styles.field}
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
              role="search"
            >
              <label htmlFor={`${uid}-search`}>
                Product-এর নাম, code বা barcode
              </label>
              <div className={styles.addRow}>
                <input
                  id={`${uid}-search`}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={submitScanOnEnterOrTab}
                  placeholder="যেমন Panjabi বা barcode scan করুন"
                  type="search"
                  value={query}
                  {...invalidProps(errors, "product", `${uid}-product-error`)}
                />
                <button
                  className={styles.primaryButton}
                  disabled={searching}
                  type="submit"
                >
                  {searching ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className={styles.spin}
                      size={15}
                    />
                  ) : (
                    <Search aria-hidden="true" size={15} />
                  )}
                  খুঁজুন
                </button>
              </div>
              <FieldMessage
                id={`${uid}-product-error`}
                message={errors.product}
              />
            </form>

            {searchError ? (
              <p className={styles.error} role="alert">
                {searchError}
              </p>
            ) : null}

            {selected ? (
              <div className={styles.productCard}>
                <div>
                  <strong>{selected.summary.product.name}</strong>
                  <span>
                    {selected.summary.product.productCode} · এখন মোট{" "}
                    {selected.summary.onHand} পিস ·{" "}
                    {selected.grid.colors.length} টা রং
                  </span>
                </div>
                <span className={styles.notice}>বেছে নেওয়া হয়েছে</span>
              </div>
            ) : null}

            {results ? (
              results.length ? (
                <ul aria-label="খোঁজার ফল" className={styles.resultList}>
                  {results.map((item) => (
                    <li key={item.product.id}>
                      <button
                        aria-pressed={
                          selected?.summary.product.id === item.product.id
                        }
                        className={styles.resultButton}
                        disabled={Boolean(loadingId)}
                        onClick={() => void choose(item)}
                        type="button"
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <ProductThumb
                            productId={item.product.id}
                            name={item.product.name}
                            size={40}
                          />
                          <span>
                            <strong>{item.product.name}</strong>{" "}
                            <small>{item.product.productCode}</small>
                          </span>
                        </div>
                        <small>
                          {loadingId === item.product.id
                            ? "আনছি…"
                            : `এখন ${item.onHand} পিস · ${item.variants.length} টা রং-size`}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.infoBand}>
                  কিছু পাওয়া যায়নি। একদম নতুন মাল হলে উপরের “নতুন Product” tab
                  ব্যবহার করুন।
                </p>
              )
            ) : null}
          </>
        ) : null}

        {step === 1 && selected ? (
          <>
            <div
              className={styles.addRow}
              style={{ justifyContent: "space-between" }}
            >
              <p className={styles.hint} style={{ margin: 0 }}>
                {selected.summary.product.name} — খালি ঘর মানে ওই রং-size আসেনি।
              </p>
              {showAdd ? null : (
                <button
                  className={styles.secondaryButton}
                  onClick={() => setShowAdd(true)}
                  type="button"
                >
                  <Plus aria-hidden="true" size={15} /> নতুন রং বা size এলো
                </button>
              )}
            </div>
            <QuantityGridEditor
              allowAdding={showAdd}
              colorOptions={references.colors}
              errors={errors}
              existing={selected.existing}
              grid={grid}
              lockedColorIds={selected.lockedColorIds}
              lockedSizes={selected.lockedSizes}
              onChange={setGrid}
              sizeOptions={references.sizes}
            />
          </>
        ) : null}

        {step === 2 ? (
          <PriceAndSupplierStep
            canEditSupplier={canEditSupplier}
            colors={references.colors}
            errors={errors}
            lastCosts={lastCosts}
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

        {step === 3 && selected ? (
          <ReviewSummary
            colors={references.colors}
            heading={`${selected.summary.product.name} · ${selected.summary.product.productCode}`}
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
