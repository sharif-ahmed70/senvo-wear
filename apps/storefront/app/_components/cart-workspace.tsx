"use client";
import { Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { hydrateCart, readCart, writeCart, type CartLine } from "../_lib/cart";
import { storefrontApi, taka } from "../_lib/storefront-api";
export function CartWorkspace() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const stored = readCart(window.localStorage);
    void storefrontApi
      .fullCatalog()
      .then((catalog) => {
        const hydrated = hydrateCart(stored, catalog);
        setLines(hydrated.lines);
        writeCart(window.localStorage, hydrated.lines);
        if (hydrated.removed > 0)
          setNotice("Some unavailable items were removed from your bag.");
        else if (hydrated.changed)
          setNotice(
            "Your bag was refreshed with current product details and prices.",
          );
      })
      .catch(() => {
        setLines(stored);
        setNotice(
          "We could not refresh availability. Checkout will verify every item.",
        );
      });
  }, []);
  const save = (next: CartLine[]) => {
    setLines(next);
    writeCart(window.localStorage, next);
  };
  const total = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPriceMinor,
    0,
  );
  if (lines.length === 0)
    return (
      <main className="empty">
        <h1>Your bag is empty</h1>
        <p>Find something made for your day.</p>
        <Link className="primary link-button" href="/">
          Start shopping
        </Link>
      </main>
    );
  return (
    <main className="cart-page">
      <h1>Your bag</h1>
      {notice ? <p className="notice">{notice}</p> : null}
      <div className="cart-layout">
        <section>
          {lines.map((line) => (
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
                      lines.map((item) =>
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
                      lines.map((item) =>
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
                      lines.map((item) =>
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
                      lines.filter(
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
            <strong>{taka(total)}</strong>
          </p>
          <Link className="primary link-button" href="/checkout">
            Continue to checkout
          </Link>
          <button onClick={() => save([])} type="button">
            Clear bag
          </button>
          <small>Cash on delivery. You will not be charged online.</small>
        </aside>
      </div>
    </main>
  );
}
