import { Minus, Plus, Trash2 } from "lucide-react";
import type { PosCartDetailsContract } from "@senvo/contracts";
import { formatBdt } from "../_lib/money";

export function CartLineList({
  cart,
  mutatingId,
  onQuantity,
  onRemove,
}: {
  cart: PosCartDetailsContract;
  mutatingId: string | null;
  onQuantity: (lineId: string, quantity: number) => void;
  onRemove: (lineId: string) => void;
}) {
  if (cart.lines.length === 0) {
    return (
      <section className="pos-sale-state pos-sale-state--compact">
        <strong>Your order is empty</strong>
        <p>Scan a barcode or enter a product code to add the first item.</p>
      </section>
    );
  }
  return (
    <section aria-label="Order items" className="pos-cart-lines">
      <h2>Order items</h2>
      {cart.lines.map((line) => {
        const busy = mutatingId === line.id;
        return (
          <article className="pos-cart-line" key={line.id} aria-busy={busy}>
            <div className="pos-cart-line__details">
              <strong>{line.productName}</strong>
              <span>
                {line.color} / {line.size}
              </span>
              <small>SKU {line.sku}</small>
            </div>
            <div className="pos-cart-line__price">
              <span>{formatBdt(line.unitPriceMinor)} each</span>
              <strong>{formatBdt(line.lineSubtotalMinor)}</strong>
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
          </article>
        );
      })}
    </section>
  );
}
