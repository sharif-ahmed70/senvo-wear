"use client";

import type {
  CategoryContract,
  ColorContract,
  SizeContract,
  StockLocationReadContract,
  SupplierContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { formatTaka, takaInputFromMinor } from "../_lib/currency-math";
import {
  applyRowToSameSize,
  cleanName,
  colorPieces,
  costText,
  isRowEdited,
  normalizeName,
  rowProfitMinor,
  sellText,
  setPriceForAll,
  setRowPrice,
  variantKey,
  type ExistingVariant,
  type FieldErrors,
  type IntakeColor,
  type IntakeLine,
  type IntakeTotals,
  type PaymentMethod,
  type PriceDraft,
  type PurchaseDraft,
  type QuantityGrid,
  type SupplierMode,
} from "../_lib/intake-draft";
import { swatchFor } from "../_lib/intake-support";
import styles from "./stock-intake-wizard.module.css";
import { intakeClient } from "./use-intake-submission";

export type IntakeReferences = {
  categories: CategoryContract[];
  colors: ColorContract[];
  locations: StockLocationReadContract[];
  sizes: SizeContract[];
  suppliers: SupplierContract[];
};

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

export function CountBadge({
  colors,
  pieces,
}: {
  colors: number;
  pieces: number;
}) {
  return (
    <span aria-live="polite" className={styles.countBadge}>
      মোট {pieces} পিস · {colors} টা রং
    </span>
  );
}

export function Stepper({
  current,
  label,
  note,
  onSelect,
  steps,
}: {
  current: number;
  label: string;
  note?: ReactNode;
  onSelect: (index: number) => void;
  steps: readonly string[];
}) {
  return (
    <nav aria-label={label} className={styles.stepRail}>
      {steps.map((title, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <button
            aria-current={active ? "step" : undefined}
            className={`${styles.stepButton} ${active ? styles.stepActive : ""} ${done ? styles.stepComplete : ""}`}
            disabled={index > current}
            key={title}
            onClick={() => done && onSelect(index)}
            type="button"
          >
            <span aria-hidden="true" className={styles.stepNumber}>
              {done ? <Check size={14} /> : index + 1}
            </span>
            <strong>
              {title}
              {done ? (
                <span className={styles.visuallyHidden}> (হয়ে গেছে)</span>
              ) : null}
            </strong>
          </button>
        );
      })}
      {note ? <p className={styles.flowNote}>{note}</p> : null}
    </nav>
  );
}

export function StepFrame({
  badge,
  children,
  errorMessage,
  isLast,
  lead,
  onBack,
  onNext,
  saveDisabled,
  saving,
  stepCount,
  stepIndex,
  title,
}: {
  badge: ReactNode;
  children: ReactNode;
  errorMessage: string;
  isLast: boolean;
  lead: string;
  onBack: () => void;
  onNext: () => void;
  saveDisabled: boolean;
  saving: boolean;
  stepCount: number;
  stepIndex: number;
  title: string;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={styles.formCard}>
      <header className={styles.cardHeader}>
        <div>
          <span>
            ধাপ {stepIndex + 1} / {stepCount}
          </span>
          <h2 id={titleId}>{title}</h2>
          <p>{lead}</p>
        </div>
        {badge}
      </header>
      <div className={styles.cardBody}>
        {children}
        {errorMessage ? (
          <p className={styles.error} role="alert">
            <AlertCircle aria-hidden="true" size={16} /> {errorMessage}
          </p>
        ) : null}
      </div>
      <footer className={styles.cardFooter}>
        <button
          className={styles.secondaryButton}
          disabled={stepIndex === 0 || saving}
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={15} /> Back
        </button>
        {isLast ? (
          <button
            aria-busy={saving}
            className={styles.primaryButton}
            disabled={saving || saveDisabled}
            onClick={onNext}
            type="button"
          >
            {saving ? (
              <LoaderCircle
                aria-hidden="true"
                className={styles.spin}
                size={16}
              />
            ) : (
              <Check aria-hidden="true" size={16} />
            )}
            {saving ? "Save হচ্ছে…" : "Save করুন ✓"}
          </button>
        ) : (
          <button
            className={styles.primaryButton}
            onClick={onNext}
            type="button"
          >
            Continue <ArrowRight aria-hidden="true" size={15} />
          </button>
        )}
      </footer>
    </section>
  );
}

export function FieldMessage({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  if (!message) return null;
  return (
    <span className={styles.fieldError} id={id}>
      {message}
    </span>
  );
}

/** aria wiring for an input that may carry a field error. */
export function invalidProps(errors: FieldErrors, key: string, id: string) {
  return errors[key]
    ? { "aria-describedby": id, "aria-invalid": true as const }
    : {};
}

export const STEP_ERROR_SUMMARY = "লাল দাগ দেওয়া ঘরগুলো ঠিক করুন।";

export function Swatch({ hex, label }: { hex: string | null; label: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.swatch} ${hex ? "" : styles.swatchUnknown}`}
      style={hex ? { background: hex } : undefined}
      title={label}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: colours, sizes and pieces                                   */
/* ------------------------------------------------------------------ */

export function QuantityGridEditor({
  allowAdding = true,
  colorOptions,
  errors,
  existing,
  grid,
  lockedColorIds,
  lockedSizes,
  onChange,
  sizeOptions,
}: {
  allowAdding?: boolean;
  colorOptions: readonly ColorContract[];
  errors: FieldErrors;
  existing?: ReadonlyMap<string, ExistingVariant>;
  grid: QuantityGrid;
  lockedColorIds?: ReadonlySet<string>;
  lockedSizes?: ReadonlySet<string>;
  onChange: (grid: QuantityGrid) => void;
  sizeOptions: readonly SizeContract[];
}) {
  const uid = useId();
  const [newColor, setNewColor] = useState("");
  const [newSize, setNewSize] = useState("");
  const [addError, setAddError] = useState<{ color?: string; size?: string }>(
    {},
  );

  function addColor() {
    const name = cleanName(newColor);
    if (!name) {
      setAddError({ color: "রঙের নাম লিখুন।" });
      return;
    }
    if (
      grid.colors.some(
        (color) => normalizeName(color.name) === normalizeName(name),
      )
    ) {
      setAddError({ color: "এই রং আগেই আছে।" });
      return;
    }
    onChange({
      ...grid,
      colors: [
        ...grid.colors,
        { id: crypto.randomUUID(), name, quantities: {} },
      ],
    });
    setNewColor("");
    setAddError({});
  }

  function addSize() {
    const name = cleanName(newSize);
    if (!name) {
      setAddError({ size: "Size লিখুন।" });
      return;
    }
    if (name.length > 160) {
      setAddError({ size: "Size ১৬০ অক্ষরের মধ্যে রাখুন।" });
      return;
    }
    if (
      grid.sizes.some((size) => normalizeName(size) === normalizeName(name))
    ) {
      setAddError({ size: "এই size আগেই আছে।" });
      return;
    }
    onChange({ ...grid, sizes: [...grid.sizes, name], sizesCustomized: true });
    setNewSize("");
    setAddError({});
  }

  function removeSize(size: string) {
    onChange({
      ...grid,
      sizes: grid.sizes.filter((item) => item !== size),
      sizesCustomized: true,
    });
  }

  function updateColor(id: string, patch: Partial<IntakeColor>) {
    onChange({
      ...grid,
      colors: grid.colors.map((color) =>
        color.id === id ? { ...color, ...patch } : color,
      ),
    });
  }

  function removeColor(id: string) {
    onChange({
      ...grid,
      colors: grid.colors.filter((color) => color.id !== id),
    });
  }

  const colorListId = `${uid}-colors`;
  const sizeListId = `${uid}-sizes`;

  return (
    <>
      <datalist id={colorListId}>
        {colorOptions.map((color) => (
          <option key={color.id} value={color.name} />
        ))}
      </datalist>
      <datalist id={sizeListId}>
        {sizeOptions.map((size) => (
          <option key={size.id} value={size.name} />
        ))}
      </datalist>

      <div className={styles.field}>
        <h3 className={styles.sectionTitle}>Size গুলো</h3>
        <div className={styles.sizeBar}>
          {grid.sizes.length === 0 ? (
            <span className={styles.hint}>
              এখনো কোনো size নেই — নিচে যোগ করুন।
            </span>
          ) : null}
          {grid.sizes.map((size) => (
            <span className={styles.sizeChip} key={size}>
              {size}
              {lockedSizes?.has(normalizeName(size)) ? null : (
                <button
                  aria-label={`${size} size সরান`}
                  onClick={() => removeSize(size)}
                  type="button"
                >
                  <X aria-hidden="true" size={14} />
                </button>
              )}
            </span>
          ))}
        </div>
        {allowAdding ? (
          <div className={`${styles.addRow} ${styles.compact}`}>
            <label
              className={styles.visuallyHidden}
              htmlFor={`${uid}-new-size`}
            >
              নতুন size
            </label>
            <input
              id={`${uid}-new-size`}
              list={sizeListId}
              onChange={(event) => setNewSize(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addSize();
                }
              }}
              placeholder="যেমন 3XL"
              value={newSize}
              {...(addError.size
                ? {
                    "aria-describedby": `${uid}-size-error`,
                    "aria-invalid": true,
                  }
                : {})}
            />
            <button
              className={styles.secondaryButton}
              onClick={addSize}
              type="button"
            >
              <Plus aria-hidden="true" size={15} /> Size
            </button>
            <FieldMessage id={`${uid}-size-error`} message={addError.size} />
          </div>
        ) : null}
      </div>

      {allowAdding ? (
        <div className={styles.field}>
          <label htmlFor={`${uid}-new-color`}>রঙের নাম</label>
          <div className={styles.addRow}>
            <input
              id={`${uid}-new-color`}
              list={colorListId}
              onChange={(event) => setNewColor(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addColor();
                }
              }}
              placeholder="যেমন Black, Navy, মেরুন — লিখে Enter চাপুন"
              value={newColor}
              {...(addError.color
                ? {
                    "aria-describedby": `${uid}-color-error`,
                    "aria-invalid": true,
                  }
                : {})}
            />
            <button
              className={styles.primaryButton}
              onClick={addColor}
              type="button"
            >
              <Plus aria-hidden="true" size={15} /> রং যোগ করুন
            </button>
          </div>
          <FieldMessage id={`${uid}-color-error`} message={addError.color} />
        </div>
      ) : null}

      {grid.colors.length === 0 ? (
        <p className={styles.infoBand}>
          উপরে রঙের নাম লিখে “+ রং যোগ করুন” চাপুন। প্রতিটা রঙের জন্য একটা কার্ড
          আসবে, সেখানে size অনুযায়ী কত পিস এলো লিখবেন।
        </p>
      ) : (
        <div className={styles.colorList}>
          {grid.colors.map((color) => {
            const locked = lockedColorIds?.has(color.id) ?? false;
            const total = colorPieces(color, grid.sizes);
            const nameError = errors[`color:${color.id}`];
            return (
              <article
                aria-label={`${color.name || "নতুন রং"} — মোট ${total} পিস`}
                className={styles.colorCard}
                key={color.id}
              >
                <div className={styles.colorHead}>
                  <Swatch
                    hex={swatchFor(color.name, colorOptions)}
                    label={color.name}
                  />
                  {locked ? (
                    <strong>{color.name}</strong>
                  ) : (
                    <>
                      <label
                        className={styles.visuallyHidden}
                        htmlFor={`${uid}-${color.id}-name`}
                      >
                        রঙের নাম
                      </label>
                      <input
                        id={`${uid}-${color.id}-name`}
                        list={colorListId}
                        onChange={(event) =>
                          updateColor(color.id, { name: event.target.value })
                        }
                        value={color.name}
                        {...invalidProps(
                          errors,
                          `color:${color.id}`,
                          `${uid}-${color.id}-name-error`,
                        )}
                      />
                    </>
                  )}
                  <span className={styles.colorTotal}>মোট {total} পিস</span>
                  {locked ? null : (
                    <button
                      className={styles.textButton}
                      onClick={() => removeColor(color.id)}
                      type="button"
                    >
                      <X aria-hidden="true" size={14} /> রং সরান
                    </button>
                  )}
                  <FieldMessage
                    id={`${uid}-${color.id}-name-error`}
                    message={nameError}
                  />
                </div>
                <div className={styles.sizeGrid}>
                  {grid.sizes.map((size) => {
                    const value = color.quantities[size] ?? "";
                    const current = existing?.get(variantKey(color.name, size));
                    const errorKey = `qty:${color.id}:${size}`;
                    const inputId = `${uid}-${color.id}-${size}`;
                    return (
                      <label
                        className={`${styles.sizeBox} ${value.trim() ? styles.sizeBoxFilled : ""}`}
                        htmlFor={inputId}
                        key={size}
                      >
                        <span>{size}</span>
                        <input
                          aria-label={`${color.name || "রং"} — ${size} কত পিস`}
                          autoComplete="off"
                          id={inputId}
                          inputMode="numeric"
                          onChange={(event) =>
                            updateColor(color.id, {
                              quantities: {
                                ...color.quantities,
                                [size]: event.target.value,
                              },
                            })
                          }
                          placeholder="—"
                          value={value}
                          {...invalidProps(
                            errors,
                            errorKey,
                            `${inputId}-error`,
                          )}
                        />
                        {existing ? (
                          current ? (
                            <span className={styles.stockNow}>
                              এখন {current.onHand} পিস
                            </span>
                          ) : (
                            <span className={styles.newTag}>নতুন</span>
                          )
                        ) : null}
                        <FieldMessage
                          id={`${inputId}-error`}
                          message={errors[errorKey]}
                        />
                      </label>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {errors.pieces ? (
        <p className={styles.fieldError} role="alert">
          {errors.pieces}
        </p>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3: prices, transport, supplier and payment                     */
/* ------------------------------------------------------------------ */

export function PriceAndSupplierStep({
  colors,
  errors,
  lines,
  locations,
  onPrices,
  onPurchase,
  prices,
  purchase,
  suppliers,
  totals,
}: {
  colors: readonly ColorContract[];
  errors: FieldErrors;
  lines: readonly IntakeLine[];
  locations: readonly StockLocationReadContract[];
  onPrices: (prices: PriceDraft) => void;
  onPurchase: (purchase: PurchaseDraft) => void;
  prices: PriceDraft;
  purchase: PurchaseDraft;
  suppliers: readonly SupplierContract[];
  totals: IntakeTotals;
}) {
  const uid = useId();
  const hasExisting = lines.some((line) => line.existing);
  const groups = useMemo(() => groupByColor(lines), [lines]);
  const sizeColorCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of lines) {
      const key = normalizeName(line.sizeName);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [lines]);

  function update(patch: Partial<PurchaseDraft>) {
    onPurchase({ ...purchase, ...patch });
  }

  return (
    <>
      <div className={styles.priceAll}>
        <label className={styles.field}>
          কেনা দাম (সবগুলোতে)
          <input
            inputMode="decimal"
            onChange={(event) =>
              onPrices(setPriceForAll(prices, "cost", event.target.value))
            }
            placeholder="প্রতি পিস ৳"
            value={prices.costAll}
          />
          <span className={styles.hint}>লিখলে নিচের সব লাইনে বসে যাবে।</span>
        </label>
        <label className={styles.field}>
          বিক্রির দাম (সবগুলোতে)
          <input
            inputMode="decimal"
            onChange={(event) =>
              onPrices(setPriceForAll(prices, "sell", event.target.value))
            }
            placeholder={
              hasExisting ? "খালি রাখলে আগের দাম থাকবে" : "প্রতি পিস ৳"
            }
            value={prices.sellAll}
          />
          <span className={styles.hint}>
            আলাদা দাম লাগলে নিচের লাইনে বদলান — সেই লাইন হলুদ হবে।
          </span>
        </label>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.priceTable}>
          <caption className={styles.visuallyHidden}>
            রং আর size অনুযায়ী দাম
          </caption>
          <thead>
            <tr>
              <th scope="col">Size</th>
              <th scope="col">পিস</th>
              <th scope="col">কেনা দাম</th>
              <th scope="col">বিক্রির দাম</th>
              <th scope="col">প্রতি পিসে লাভ</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.colorId}>
              <tr className={styles.groupRow}>
                <td colSpan={5}>
                  <span>
                    <Swatch
                      hex={swatchFor(group.colorName, colors)}
                      label={group.colorName}
                    />
                    {group.colorName} · {group.pieces} পিস
                  </span>
                </td>
              </tr>
              {group.lines.map((line) => {
                const edited = isRowEdited(line, prices);
                const profit = rowProfitMinor(
                  line,
                  prices,
                  totals.transportPerPieceMinor,
                );
                const costId = `${uid}-${line.key}-cost`;
                const sellId = `${uid}-${line.key}-sell`;
                return (
                  <tr
                    className={edited ? styles.editedRow : undefined}
                    key={line.key}
                  >
                    <th
                      scope="row"
                      style={{ fontSize: "0.8rem", textAlign: "left" }}
                    >
                      {line.sizeName}
                    </th>
                    <td>{line.quantity}</td>
                    <td>
                      <input
                        aria-label={`${line.colorName} ${line.sizeName} কেনা দাম`}
                        id={costId}
                        inputMode="decimal"
                        onChange={(event) =>
                          onPrices(
                            setRowPrice(
                              prices,
                              line.key,
                              "cost",
                              event.target.value,
                            ),
                          )
                        }
                        value={costText(line, prices)}
                        {...invalidProps(
                          errors,
                          `cost:${line.key}`,
                          `${costId}-error`,
                        )}
                      />
                      <FieldMessage
                        id={`${costId}-error`}
                        message={errors[`cost:${line.key}`]}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${line.colorName} ${line.sizeName} বিক্রির দাম`}
                        id={sellId}
                        inputMode="decimal"
                        onChange={(event) =>
                          onPrices(
                            setRowPrice(
                              prices,
                              line.key,
                              "sell",
                              event.target.value,
                            ),
                          )
                        }
                        value={sellText(line, prices)}
                        {...invalidProps(
                          errors,
                          `sell:${line.key}`,
                          `${sellId}-error`,
                        )}
                      />
                      {line.existing ? (
                        <span className={styles.currentPrice}>
                          এখনকার দাম{" "}
                          {formatTaka(line.existing.sellingPriceMinor)}
                        </span>
                      ) : null}
                      <FieldMessage
                        id={`${sellId}-error`}
                        message={errors[`sell:${line.key}`]}
                      />
                    </td>
                    <td>
                      {profit === null ? (
                        "—"
                      ) : (
                        <span
                          className={
                            profit < 0
                              ? styles.profitNegative
                              : styles.profitPositive
                          }
                        >
                          {formatTaka(profit)}
                        </span>
                      )}
                      {edited &&
                      (sizeColorCount.get(normalizeName(line.sizeName)) ?? 0) >
                        1 ? (
                        <button
                          className={styles.textButton}
                          onClick={() =>
                            onPrices(applyRowToSameSize(prices, lines, line))
                          }
                          style={{
                            display: "flex",
                            minHeight: 32,
                            marginTop: 4,
                          }}
                          type="button"
                        >
                          এই size-এর সব রঙে বসাও
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <div className={styles.transportBox}>
        <label className={styles.field}>
          গাড়ি ভাড়া / কুলি (ঐচ্ছিক)
          <input
            inputMode="decimal"
            onChange={(event) => update({ transport: event.target.value })}
            placeholder="মোট ৳"
            value={purchase.transport}
            {...invalidProps(errors, "transport", `${uid}-transport-error`)}
          />
          <FieldMessage
            id={`${uid}-transport-error`}
            message={errors.transport}
          />
        </label>
        <p className={styles.perPiece} aria-live="polite">
          প্রতি পিসে + {formatTaka(totals.transportPerPieceMinor)}
        </p>
        <label className={styles.checkLabel}>
          <input
            checked={purchase.transportPaidToSupplier}
            onChange={(event) =>
              update({ transportPaidToSupplier: event.target.checked })
            }
            type="checkbox"
          />
          ভাড়া supplier-কে দেওয়া হয়েছে (supplier-এর বিলে যোগ হবে)
        </label>
      </div>

      <SupplierSection
        errors={errors}
        onChange={onPurchase}
        purchase={purchase}
        suppliers={suppliers}
      />

      <div className={styles.fields}>
        <label className={styles.field}>
          <span>
            কেনার তারিখ <b>*</b>
          </span>
          <input
            onChange={(event) => update({ purchaseDate: event.target.value })}
            type="date"
            value={purchase.purchaseDate}
            {...invalidProps(errors, "purchaseDate", `${uid}-date-error`)}
          />
          <FieldMessage
            id={`${uid}-date-error`}
            message={errors.purchaseDate}
          />
        </label>
        <label className={styles.field}>
          মেমো / চালান নং
          <input
            maxLength={60}
            onChange={(event) => update({ memoNumber: event.target.value })}
            placeholder="Supplier-এর মেমো নম্বর"
            value={purchase.memoNumber}
            {...invalidProps(errors, "memoNumber", `${uid}-memo-error`)}
          />
          <FieldMessage id={`${uid}-memo-error`} message={errors.memoNumber} />
        </label>
        <div className={styles.field}>
          <label htmlFor={`${uid}-paid`}>এখন কত দিলেন</label>
          <div className={styles.addRow}>
            <input
              id={`${uid}-paid`}
              inputMode="decimal"
              onChange={(event) => update({ paid: event.target.value })}
              placeholder="৳0 — বাকি থাকলে খালি রাখুন"
              value={purchase.paid}
              {...invalidProps(errors, "paid", `${uid}-paid-error`)}
            />
            <button
              className={styles.secondaryButton}
              disabled={totals.payableMinor <= 0n}
              onClick={() =>
                update({
                  paid: takaInputFromMinor(Number(totals.payableMinor)),
                })
              }
              type="button"
            >
              পুরোটা ({formatTaka(totals.payableMinor)})
            </button>
          </div>
          <FieldMessage id={`${uid}-paid-error`} message={errors.paid} />
        </div>
        <fieldset className={styles.segmented}>
          <legend>কীভাবে দিলেন</legend>
          {(
            [
              ["CASH", "Cash"],
              ["MOBILE_BANKING", "bKash"],
              ["BANK", "Bank"],
            ] as const satisfies ReadonlyArray<[PaymentMethod, string]>
          ).map(([value, label]) => (
            <label className={styles.segment} key={value}>
              <input
                checked={purchase.method === value}
                name={`${uid}-method`}
                onChange={() => update({ method: value })}
                type="radio"
                value={value}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label className={styles.field}>
          <span>
            মাল কোথায় রাখবেন <b>*</b>
          </span>
          <select
            onChange={(event) => update({ locationId: event.target.value })}
            value={purchase.locationId}
            {...invalidProps(errors, "locationId", `${uid}-location-error`)}
          >
            <option value="">বেছে নিন</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} · {location.branch.name}
              </option>
            ))}
          </select>
          {locations.length === 0 ? (
            <span className={styles.hint}>
              কোনো চালু Stock location নেই — আগে Inventory › Locations-এ একটা
              তৈরি করুন।
            </span>
          ) : null}
          <FieldMessage
            id={`${uid}-location-error`}
            message={errors.locationId}
          />
        </label>
        <label className={styles.field}>
          Note
          <textarea
            maxLength={1000}
            onChange={(event) => update({ note: event.target.value })}
            rows={3}
            value={purchase.note}
          />
          <FieldMessage id={`${uid}-note-error`} message={errors.note} />
        </label>
      </div>
    </>
  );
}

function SupplierSection({
  errors,
  onChange,
  purchase,
  suppliers,
}: {
  errors: FieldErrors;
  onChange: (purchase: PurchaseDraft) => void;
  purchase: PurchaseDraft;
  suppliers: readonly SupplierContract[];
}) {
  const uid = useId();
  const [query, setQuery] = useState("");
  const [due, setDue] = useState<{
    message: string;
    status: "error" | "idle" | "loading" | "ready";
    supplierId: string;
  }>({ message: "", status: "idle", supplierId: "" });
  const selected = purchase.existingSupplier;
  const selectedId = selected?.id ?? "";

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setDue({ message: "", status: "loading", supplierId: selectedId });
    intakeClient
      .getSupplierBalance(selectedId)
      .then((result) => {
        if (!active) return;
        setDue({
          message: formatTaka(result.data.outstandingBalanceMinor),
          status: "ready",
          supplierId: selectedId,
        });
      })
      .catch(() => {
        if (active) {
          setDue({
            message: "বাকি দেখা যায়নি",
            status: "error",
            supplierId: selectedId,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const matches = useMemo(() => {
    const needle = normalizeName(query);
    const digits = query.replace(/\D/gu, "");
    return suppliers
      .filter((supplier) => supplier.code !== "SELF")
      .filter((supplier) => {
        if (!needle) return true;
        return (
          normalizeName(supplier.name).includes(needle) ||
          normalizeName(supplier.code).includes(needle) ||
          (digits.length >= 3 &&
            (supplier.phone ?? "").replace(/\D/gu, "").includes(digits))
        );
      })
      .slice(0, 6);
  }, [query, suppliers]);

  function update(patch: Partial<PurchaseDraft>) {
    onChange({ ...purchase, ...patch });
  }

  function choose(supplier: SupplierContract) {
    update({
      editSupplier: false,
      existingSupplier: {
        address: supplier.address,
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
      },
      supplierAddress: supplier.address ?? "",
      supplierPhone: supplier.phone ?? "",
    });
    setQuery("");
  }

  return (
    <div className={styles.supplierPanel}>
      <fieldset className={styles.segmented}>
        <legend>Supplier</legend>
        {(
          [
            ["existing", "পুরোনো Supplier"],
            ["new", "+ নতুন Supplier"],
            ["none", "Supplier নেই / নিজে কেনা"],
          ] as const satisfies ReadonlyArray<[SupplierMode, string]>
        ).map(([value, label]) => (
          <label className={styles.segment} key={value}>
            <input
              checked={purchase.supplierMode === value}
              name={`${uid}-supplier-mode`}
              onChange={() => update({ supplierMode: value })}
              type="radio"
              value={value}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {purchase.supplierMode === "existing" ? (
        selected ? (
          <div className={styles.supplierCard}>
            <strong>{selected.name}</strong>
            <span>Phone: {selected.phone || "—"}</span>
            <span>ঠিকানা: {selected.address || "—"}</span>
            <span className={styles.dueText} aria-live="polite">
              আগের বাকি:{" "}
              {due.supplierId === selected.id && due.status === "ready"
                ? due.message
                : due.status === "error"
                  ? due.message
                  : "দেখা হচ্ছে…"}
            </span>
            <div className={styles.addRow}>
              <button
                className={styles.textButton}
                onClick={() => update({ existingSupplier: null })}
                type="button"
              >
                অন্য Supplier বেছে নিন
              </button>
              <button
                aria-expanded={purchase.editSupplier}
                className={styles.textButton}
                onClick={() =>
                  update({
                    editSupplier: !purchase.editSupplier,
                    supplierAddress: selected.address ?? "",
                    supplierPhone: selected.phone ?? "",
                  })
                }
                type="button"
              >
                {purchase.editSupplier
                  ? "Phone/ঠিকানা বদলাবো না"
                  : "Phone/ঠিকানা বদলান"}
              </button>
            </div>
            {purchase.editSupplier ? (
              <div className={styles.fields}>
                <label className={styles.field}>
                  নতুন Phone
                  <input
                    inputMode="tel"
                    onChange={(event) =>
                      update({ supplierPhone: event.target.value })
                    }
                    value={purchase.supplierPhone}
                    {...invalidProps(
                      errors,
                      "supplierPhone",
                      `${uid}-sp-error`,
                    )}
                  />
                  <FieldMessage
                    id={`${uid}-sp-error`}
                    message={errors.supplierPhone}
                  />
                </label>
                <label className={styles.field}>
                  নতুন ঠিকানা
                  <input
                    onChange={(event) =>
                      update({ supplierAddress: event.target.value })
                    }
                    value={purchase.supplierAddress}
                    {...invalidProps(
                      errors,
                      "supplierAddress",
                      `${uid}-sa-error`,
                    )}
                  />
                  <FieldMessage
                    id={`${uid}-sa-error`}
                    message={errors.supplierAddress}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.field}>
            <label htmlFor={`${uid}-supplier-search`}>
              Phone বা নাম দিয়ে খুঁজুন
            </label>
            <div className={styles.addRow}>
              <Search aria-hidden="true" size={16} style={{ marginTop: 13 }} />
              <input
                id={`${uid}-supplier-search`}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="যেমন 01711 বা Rahim Traders"
                type="search"
                value={query}
                {...invalidProps(errors, "supplier", `${uid}-supplier-error`)}
              />
            </div>
            <FieldMessage
              id={`${uid}-supplier-error`}
              message={errors.supplier}
            />
            {matches.length ? (
              <ul aria-label="Supplier খোঁজার ফল" className={styles.resultList}>
                {matches.map((supplier) => (
                  <li key={supplier.id}>
                    <button
                      className={styles.resultButton}
                      onClick={() => choose(supplier)}
                      type="button"
                    >
                      <span>
                        <strong>{supplier.name}</strong>{" "}
                        <small>{supplier.code}</small>
                      </span>
                      <small>{supplier.phone ?? "Phone নেই"}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>
                {suppliers.length
                  ? "কোনো Supplier মেলেনি। নতুন হলে “+ নতুন Supplier” বেছে নিন।"
                  : "এখনো কোনো Supplier নেই। “+ নতুন Supplier” বেছে নিন।"}
              </p>
            )}
          </div>
        )
      ) : null}

      {purchase.supplierMode === "new" ? (
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>
              Supplier-এর নাম <b>*</b>
            </span>
            <input
              onChange={(event) =>
                update({
                  newSupplier: {
                    ...purchase.newSupplier,
                    name: event.target.value,
                  },
                })
              }
              value={purchase.newSupplier.name}
              {...invalidProps(
                errors,
                "newSupplierName",
                `${uid}-ns-name-error`,
              )}
            />
            <FieldMessage
              id={`${uid}-ns-name-error`}
              message={errors.newSupplierName}
            />
          </label>
          <label className={styles.field}>
            <span>
              Phone <b>*</b>
            </span>
            <input
              inputMode="tel"
              onChange={(event) =>
                update({
                  newSupplier: {
                    ...purchase.newSupplier,
                    phone: event.target.value,
                  },
                })
              }
              value={purchase.newSupplier.phone}
              {...invalidProps(
                errors,
                "newSupplierPhone",
                `${uid}-ns-phone-error`,
              )}
            />
            <FieldMessage
              id={`${uid}-ns-phone-error`}
              message={errors.newSupplierPhone}
            />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            ঠিকানা
            <input
              onChange={(event) =>
                update({
                  newSupplier: {
                    ...purchase.newSupplier,
                    address: event.target.value,
                  },
                })
              }
              value={purchase.newSupplier.address}
              {...invalidProps(
                errors,
                "newSupplierAddress",
                `${uid}-ns-address-error`,
              )}
            />
            <FieldMessage
              id={`${uid}-ns-address-error`}
              message={errors.newSupplierAddress}
            />
          </label>
        </div>
      ) : null}

      {purchase.supplierMode === "none" ? (
        <p className={styles.infoBand}>
          নিজে কিনে আনলে Supplier লাগবে না। হিসাব “নিজে কেনা” খাতায় থাকবে —
          টাকা পুরো দিয়ে থাকলে “এখন কত দিলেন”-এ পুরোটা লিখুন।
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4: review                                                      */
/* ------------------------------------------------------------------ */

export type ColorGroup = {
  colorId: string;
  colorName: string;
  lines: IntakeLine[];
  pieces: number;
};

export function groupByColor(lines: readonly IntakeLine[]): ColorGroup[] {
  const groups = new Map<string, ColorGroup>();
  for (const line of lines) {
    const group = groups.get(line.colorId) ?? {
      colorId: line.colorId,
      colorName: line.colorName,
      lines: [],
      pieces: 0,
    };
    group.lines.push(line);
    group.pieces += line.quantity;
    groups.set(line.colorId, group);
  }
  return [...groups.values()];
}

export function ReviewSummary({
  colors,
  heading,
  lines,
  locationName,
  supplierLabel,
  totals,
}: {
  colors: readonly ColorContract[];
  heading: ReactNode;
  lines: readonly IntakeLine[];
  locationName: string;
  supplierLabel: string;
  totals: IntakeTotals;
}) {
  const groups = groupByColor(lines);
  return (
    <div className={styles.reviewGrid}>
      <section className={styles.reviewCard}>
        <h3>{heading}</h3>
        {groups.map((group) => (
          <div className={styles.colorSummary} key={group.colorId}>
            <strong>
              <Swatch
                hex={swatchFor(group.colorName, colors)}
                label={group.colorName}
              />
              {group.colorName} — {group.pieces} পিস
            </strong>
            <span>
              {group.lines
                .map((line) => `${line.sizeName} × ${line.quantity}`)
                .join(" · ")}
            </span>
          </div>
        ))}
        <ReviewLine
          label="Barcode"
          value={`${lines.length} টা (প্রতি রং-size-এ একটা)`}
        />
        <ReviewLine label="Supplier" value={supplierLabel} />
        <ReviewLine label="মাল রাখা হবে" value={locationName || "—"} />
      </section>
      <section className={styles.reviewCard}>
        <h3>হিসাব</h3>
        <ReviewLine big label="মোট পিস" value={`${totals.pieces} পিস`} />
        <ReviewLine
          label="সব বিক্রি হলে"
          value={formatTaka(totals.sellTotalMinor)}
        />
        <ReviewLine
          label="সম্ভাব্য লাভ"
          value={formatTaka(totals.profitMinor)}
        />
        <ReviewLine label="মালের দাম" value={formatTaka(totals.goodsMinor)} />
        <ReviewLine
          label="গাড়ি ভাড়া / কুলি"
          value={formatTaka(totals.transportMinor)}
        />
        <ReviewLine
          big
          label="মোট খরচ (ভাড়াসহ)"
          value={formatTaka(totals.totalCostMinor)}
        />
        <ReviewLine label="এখন দিলেন" value={formatTaka(totals.paidMinor)} />
        <ReviewLine
          big
          label="Supplier-এর বাকি"
          value={formatTaka(totals.supplierDueMinor)}
        />
      </section>
    </div>
  );
}

function ReviewLine({
  big = false,
  label,
  value,
}: {
  big?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={`${styles.reviewLine} ${big ? styles.reviewBig : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function supplierLabel(purchase: PurchaseDraft): string {
  if (purchase.supplierMode === "none") return "নিজে কেনা";
  if (purchase.supplierMode === "new") {
    return `${cleanName(purchase.newSupplier.name)} (নতুন)`;
  }
  return purchase.existingSupplier?.name ?? "—";
}

export function locationLabel(
  locations: readonly StockLocationReadContract[],
  id: string,
): string {
  const location = locations.find((item) => item.id === id);
  return location ? `${location.name} · ${location.branch.name}` : "";
}
