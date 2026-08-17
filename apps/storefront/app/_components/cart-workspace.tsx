"use client";
import { Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  canContinueToCheckout,
  hydrateStoredCart,
  readCart,
  writeCart,
  type HydratedCart,
  type HydratedCartLine,
} from "../_lib/cart";
import { storefrontApi, taka } from "../_lib/storefront-api";

const emptyCart: HydratedCart = { lines: [], unavailable: [] };
export function CartWorkspace() {
  const [cart, setCart] = useState<HydratedCart>(emptyCart);
  const [status, setStatus] = useState<"error" | "loading" | "ready">(
    "loading",
  );
  const load = useCallback(async () => {
    const selections = readCart(window.localStorage);
    if (selections.length === 0) {
      setCart(emptyCart);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    try {
      setCart(
        await hydrateStoredCart(window.localStorage, () =>
          storefrontApi.fullCatalog(),
        ),
      );
      setStatus("ready");
    } catch {
      setCart(emptyCart);
      setStatus("error");
    }
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  const save = (lines: HydratedCartLine[]) => {
    setCart((current) => ({ ...current, lines }));
    writeCart(window.localStorage, [...lines, ...cart.unavailable]);
  };
  const removeUnavailable = (productVariantId: string) => {
    const unavailable = cart.unavailable.filter(
      (line) => line.productVariantId !== productVariantId,
    );
    setCart((current) => ({ ...current, unavailable }));
    writeCart(window.localStorage, [...cart.lines, ...unavailable]);
  };
  const clear = () => {
    setCart(emptyCart);
    writeCart(window.localStorage, []);
  };
  const total = cart.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPriceMinor,
    0,
  );
  if (status === "loading")
    return (
      <main className="empty" aria-live="polite">
        <h1>Refreshing your bag</h1>
        <p>Checking current prices and availability...</p>
      </main>
    );
  if (status === "error")
    return (
      <main className="empty" aria-live="polite">
        <h1>We could not refresh your bag.</h1>
        <p>
          Retry to check current prices and availability before checkout. Your
          selections are still saved.
        </p>
        <button className="primary" onClick={() => void load()} type="button">
          <RefreshCw size={18} /> Retry
        </button>
        <Link href="/">Back to shop</Link>
      </main>
    );
  if (cart.lines.length === 0 && cart.unavailable.length === 0)
    return (
      <main className="empty">
        <h1>Your bag is empty</h1>
        <p>Find something made for your day.</p>
        <Link className="primary link-button" href="/">
          Start shopping
        </Link>
      </main>
    );
  const canCheckout = canContinueToCheckout(status, cart);
  return (
    <main className="cart-page">
      <h1>Your bag</h1>
      <p className={`notice${cart.unavailable.length ? " error" : ""}`}>
        {cart.unavailable.length
          ? "Some items are no longer available. Remove them before checkout."
          : "Your bag shows current product details, prices, and availability."}
      </p>
      <div className="cart-layout">
        <section>
          {cart.lines.map((line) => (
            <article className="cart-line" key={line.productVariantId}>
              <div className="cart-thumb" />
              <div>
                <Link href={`/products/${line.productSlug}`}>
                  <h2>{line.productName}</h2>
                </Link>
                <p>
                  {line.color} - {line.size}
                </p>
                <strong>{taka(line.unitPriceMinor)}</strong>
              </div>
              <div className="quantity">
                <button
                  aria-label="Decrease quantity"
                  onClick={() =>
                    save(
                      cart.lines.map((item) =>
                        item.productVariantId === line.productVariantId
                          ? {
                              ...item,
                              quantity: Math.max(1, item.quantity - 1),
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <Minus />
                </button>
                <input
                  aria-label={`Quantity for ${line.productName}`}
                  max={20}
                  min={1}
                  onChange={(event) =>
                    save(
                      cart.lines.map((item) =>
                        item.productVariantId === line.productVariantId
                          ? {
                              ...item,
                              quantity: Math.max(
                                1,
                                Math.min(20, Number(event.target.value) || 1),
                              ),
                            }
                          : item,
                      ),
                    )
                  }
                  type="number"
                  value={line.quantity}
                />
                <button
                  aria-label="Increase quantity"
                  onClick={() =>
                    save(
                      cart.lines.map((item) =>
                        item.productVariantId === line.productVariantId
                          ? {
                              ...item,
                              quantity: Math.min(20, item.quantity + 1),
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <Plus />
                </button>
                <button
                  aria-label="Remove item"
                  onClick={() =>
                    save(
                      cart.lines.filter(
                        (item) =>
                          item.productVariantId !== line.productVariantId,
                      ),
                    )
                  }
                >
                  <Trash2 />
                </button>
              </div>
            </article>
          ))}
          {cart.unavailable.map((line) => (
            <article
              className="cart-line unavailable"
              key={line.productVariantId}
            >
              <div className="cart-thumb" />
              <div>
                <h2>Unavailable item</h2>
                <p>This selection can no longer be purchased.</p>
              </div>
              <button
                onClick={() => removeUnavailable(line.productVariantId)}
                type="button"
              >
                <Trash2 size={18} /> Remove
              </button>
            </article>
          ))}
        </section>
        <aside className="summary">
          <h2>Order summary</h2>
          <p>
            <span>Products</span>
            <strong>{taka(total)}</strong>
          </p>
          <p>
            <span>Delivery</span>
            <span>Confirmed at review</span>
          </p>
          <hr />
          <p>
            <span>Total</span>
            <strong>{canCheckout ? taka(total) : "Review needed"}</strong>
          </p>
          {canCheckout ? (
            <Link className="primary link-button" href="/checkout">
              Continue to checkout
            </Link>
          ) : (
            <button className="primary" disabled type="button">
              Continue to checkout
            </button>
          )}
          <button onClick={clear} type="button">
            Clear bag
          </button>
          <small>Cash on delivery. You will not be charged online.</small>
        </aside>
      </div>
    </main>
  );
}
