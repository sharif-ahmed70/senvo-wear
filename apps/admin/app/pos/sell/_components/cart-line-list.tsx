import { Minus, Plus, Tag, Trash2, X } from "lucide-react";
import type { PosCartDetailsContract } from "@senvo/contracts";
import { formatBdt } from "../_lib/money";
import type { ItemDiscountDraft } from "../_lib/discount";
import { ProductThumb } from "../../../_components/product-thumb";

export function CartLineList({
  cart,
  discountAmounts = {},
  discountErrors = {},
  discounts,
  mutatingId,
  onDiscountChange,
  onQuantity,
  onRemove,
}: {
  cart: PosCartDetailsContract;
  /** Preview amount per product variant. */
  discountAmounts?: Readonly<Record<string, number>>;
  discountErrors?: Readonly<Record<string, string>>;
  /** Present only for roles allowed to give discounts. */
  discounts?: Readonly<Record<string, ItemDiscountDraft>>;
  mutatingId: string | null;
  onDiscountChange?: (
    productVariantId: string,
    draft: ItemDiscountDraft | null,
  ) => void;
  onQuantity: (lineId: string, quantity: number) => void;
  onRemove: (lineId: string) => void;
}) {
  if (cart.lines.length === 0) {
    return (
      <section className="pos-sale-state pos-sale-state--compact">
        <strong>Your order is empty</strong>
        <p>Scan a barcode or type a SKU to add the first item.</p>
      </section>
    );
  }
  return (
    <section aria-label="Order items" className="pos-cart-lines">
      <h2>Order items</h2>
      {cart.lines.map((line) => {
        const busy = mutatingId === line.id;
        const draft = discounts?.[line.productVariantId];
        const discountMinor = discountAmounts[line.productVariantId] ?? 0;
        const discountError = discountErrors[line.productVariantId];
        return (
          <article className="pos-cart-line" key={line.id} aria-busy={busy}>
            <ProductThumb
              productId={line.productVariantId}
              name={line.productName}
              size={40}
            />
            <div className="pos-cart-line__details">
              <strong>{line.productName}</strong>
              <span>
                {line.color} / {line.size}
              </span>
              <small>SKU {line.sku}</small>
            </div>
            <div className="pos-cart-line__price">
              <span>{formatBdt(line.unitPriceMinor)} each</span>
              {discountMinor > 0 ? (
                <>
                  <s>{formatBdt(line.lineSubtotalMinor)}</s>
                  <strong>
                    {formatBdt(line.lineSubtotalMinor - discountMinor)}
                  </strong>
                </>
              ) : (
                <strong>{formatBdt(line.lineSubtotalMinor)}</strong>
              )}
            </div>
            <div
              className="pos-quantity"
              aria-label={`Quantity for ${line.productName}`}
            >
              <button
                aria-label={`Decrease ${line.productName} quantity`}
                disabled={busy || line.quantity <= 1}
                onClick={() => onQuantity(line.id, line.quantity - 1)}
                type="button"
              >
                <Minus aria-hidden="true" size={17} />
              </button>
              <input
                aria-label={`Quantity for ${line.productName}`}
                disabled={busy}
                min={1}
                max={10000}
                onBlur={(event) => {
                  const quantity = Number(event.target.value);
                  if (
                    Number.isInteger(quantity) &&
                    quantity > 0 &&
                    quantity !== line.quantity
                  )
                    onQuantity(line.id, quantity);
                  else event.target.value = String(line.quantity);
                }}
                defaultValue={line.quantity}
                inputMode="numeric"
                type="number"
              />
              <button
                aria-label={`Increase ${line.productName} quantity`}
                disabled={busy}
                onClick={() => onQuantity(line.id, line.quantity + 1)}
                type="button"
              >
                <Plus aria-hidden="true" size={17} />
              </button>
              <button
                aria-label={`Remove ${line.productName}`}
                className="pos-remove"
                disabled={busy}
                onClick={() => onRemove(line.id)}
                type="button"
              >
                <Trash2 aria-hidden="true" size={17} />
              </button>
            </div>
            {onDiscountChange ? (
              <div className="pos-item-discount">
                {draft ? (
                  <>
                    <select
                      aria-label={`Discount type for ${line.productName}`}
                      disabled={busy}
                      onChange={(event) =>
                        onDiscountChange(line.productVariantId, {
                          mode: event.target.value as ItemDiscountDraft["mode"],
                          text: draft.text,
                        })
                      }
                      value={draft.mode}
                    >
                      <option value="PERCENT">%</option>
                      <option value="AMOUNT">Tk</option>
                    </select>
                    <input
                      aria-invalid={Boolean(discountError)}
                      aria-label={`Discount for ${line.productName}`}
                      disabled={busy}
                      inputMode="decimal"
                      onChange={(event) =>
                        onDiscountChange(line.productVariantId, {
                          mode: draft.mode,
                          text: event.target.value,
                        })
                      }
                      placeholder={draft.mode === "PERCENT" ? "10" : "200"}
                      value={draft.text}
                    />
                    <button
                      aria-label={`Remove discount for ${line.productName}`}
                      disabled={busy}
                      onClick={() =>
                        onDiscountChange(line.productVariantId, null)
                      }
                      type="button"
                    >
                      <X aria-hidden="true" size={15} />
                    </button>
                    {discountError ? (
                      <small className="pos-field-error">{discountError}</small>
                    ) : discountMinor > 0 ? (
                      <small>−{formatBdt(discountMinor)}</small>
                    ) : null}
                  </>
                ) : (
                  <button
                    className="pos-item-discount__add"
                    disabled={busy}
                    onClick={() =>
                      onDiscountChange(line.productVariantId, {
                        mode: "PERCENT",
                        text: "",
                      })
                    }
                    type="button"
                  >
                    <Tag aria-hidden="true" size={14} /> Discount
                  </button>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
