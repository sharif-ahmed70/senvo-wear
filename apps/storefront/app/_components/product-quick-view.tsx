"use client";

import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addToCart, readCart, writeCart } from "../_lib/cart";
import { mediaForVariant } from "../_lib/product-media";
import { trapFocus } from "../_lib/focus-trap";
import {
  taka,
  type StorefrontProduct,
  type StorefrontVariant,
} from "../_lib/storefront-api";
import { preferredVariant } from "./product-card";

export function ProductQuickView({
  onAdded,
  onClose,
  product,
}: {
  onAdded?: (product: StorefrontProduct) => void;
  onClose: () => void;
  product: StorefrontProduct | null;
}) {
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!product) return;
    void Promise.resolve().then(() => {
      setQuantity(1);
      setVariantId(preferredVariant(product)?.id ?? "");
    });
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => closeButton.current?.focus(), 0);
    document.body.classList.add("no-scroll");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
      previous?.focus();
    };
  }, [onClose, product]);

  const selected = product?.variants.find((item) => item.id === variantId);
  const gallery = product
    ? mediaForVariant(product.media ?? [], variantId)
    : [];
  const image = gallery[0] ?? product?.primaryImage;

  const add = (variant: StorefrontVariant) => {
    let selections = readCart(window.localStorage);
    for (let index = 0; index < quantity; index += 1) {
      selections = addToCart(selections, variant);
    }
    writeCart(window.localStorage, selections);
    if (product) onAdded?.(product);
    onClose();
  };

  return (
    <AnimatePresence>
      {product ? (
        <motion.div
          animate={{ opacity: 1 }}
          aria-modal="true"
          className="quick-view-overlay"
          exit={{ opacity: 0 }}
          initial={reduceMotion ? false : { opacity: 0 }}
          onKeyDown={trapFocus}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) onClose();
          }}
          role="dialog"
        >
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            aria-describedby="quick-view-description"
            aria-labelledby="quick-view-title"
            className="quick-view-dialog"
            exit={{ opacity: 0, y: 20 }}
            initial={reduceMotion ? false : { opacity: 0, y: 28 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="quick-view-media">
              {image ? (
                <img alt={image.altText} src={image.url} />
              ) : (
                <span>{product.category.name}</span>
              )}
            </div>
            <div className="quick-view-copy">
              <button
                aria-label="Close quick view"
                className="close-button"
                onClick={onClose}
                ref={closeButton}
                type="button"
              >
                <X size={20} />
              </button>
              <p className="eyebrow">
                {product.collection?.name ?? product.category.name}
              </p>
              <h2 id="quick-view-title">{product.name}</h2>
              <strong className="quick-price">
                {selected
                  ? taka(selected.sellingPriceMinor)
                  : "Choose an option"}
              </strong>
              <p id="quick-view-description">
                {product.description ??
                  "A considered SENVO essential designed for everyday wear."}
              </p>
              <fieldset className="variant-fieldset">
                <legend>Colour and size</legend>
                <div className="premium-variant-options">
                  {product.variants.map((variant) => (
                    <button
                      aria-pressed={variant.id === variantId}
                      className={variant.id === variantId ? "selected" : ""}
                      disabled={variant.availability === "OUT_OF_STOCK"}
                      key={variant.id}
                      onClick={() => setVariantId(variant.id)}
                      type="button"
                    >
                      <i style={{ backgroundColor: variant.color.hexValue }} />
                      <span>{variant.color.name}</span>
                      <small>{variant.size.name}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="quick-buy-row">
                <div className="quantity-control">
                  <button
                    aria-label="Decrease quantity"
                    onClick={() =>
                      setQuantity((current) => Math.max(1, current - 1))
                    }
                    type="button"
                  >
                    <Minus size={15} />
                  </button>
                  <span>{quantity}</span>
                  <button
                    aria-label="Increase quantity"
                    onClick={() =>
                      setQuantity((current) => Math.min(20, current + 1))
                    }
                    type="button"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <button
                  className="primary-button"
                  disabled={!selected}
                  onClick={() => selected && add(selected)}
                  type="button"
                >
                  <ShoppingBag size={17} /> Add to bag
                </button>
              </div>
              <Link
                className="view-full-product"
                href={`/products/${product.slug}`}
              >
                View full product details
              </Link>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
