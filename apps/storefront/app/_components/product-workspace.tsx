"use client";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { addToCart, readCart, writeCart } from "../_lib/cart";
import {
  storefrontApi,
  taka,
  type StorefrontProduct,
} from "../_lib/storefront-api";
export function ProductWorkspace({ slug }: { slug: string }) {
  const [product, setProduct] = useState<StorefrontProduct | null>(null);
  const [variantId, setVariantId] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    void storefrontApi
      .product(slug)
      .then((value) => {
        setProduct(value);
        setVariantId(
          value.variants.find((item) => item.availability === "IN_STOCK")?.id ??
            "",
        );
      })
      .catch(() => setMessage("This product is not available right now."));
  }, [slug]);
  if (message && !product)
    return (
      <main>
        <p className="notice error">{message}</p>
      </main>
    );
  if (!product)
    return (
      <main>
        <div className="detail-skeleton" />
      </main>
    );
  const selected = product.variants.find((variant) => variant.id === variantId);
  return (
    <main className="product-detail">
      <Link className="back" href="/">
        <ArrowLeft size={17} /> Back to shop
      </Link>
      <div className="detail-visual">
        {product.primaryImage ? (
          <img
            alt={product.primaryImage.altText}
            height={720}
            src={product.primaryImage.url}
            width={720}
          />
        ) : (
          <span>{product.category.name}</span>
        )}
      </div>
      <section className="detail-copy">
        <p className="eyebrow">{product.productCode}</p>
        <h1>{product.name}</h1>
        <p className="price">
          {selected ? taka(selected.sellingPriceMinor) : "Choose an option"}
        </p>
        <p>
          {product.description ??
            "A versatile SENVO Wear essential for everyday comfort."}
        </p>
        <fieldset>
          <legend>Color and size</legend>
          <div className="variant-options">
            {product.variants.map((variant) => (
              <button
                className={variant.id === variantId ? "selected" : ""}
                disabled={variant.availability === "OUT_OF_STOCK"}
                key={variant.id}
                onClick={() => setVariantId(variant.id)}
                type="button"
              >
                <i style={{ background: variant.color.hexValue }} />
                {variant.color.name} - {variant.size.name}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          className="primary"
          disabled={!selected}
          onClick={() => {
            if (selected) {
              writeCart(
                window.localStorage,
                addToCart(readCart(window.localStorage), selected),
              );
              setMessage("Added to your bag.");
            }
          }}
          type="button"
        >
          <ShoppingBag size={18} /> Add to bag
        </button>
        {message ? <p className="notice success">{message}</p> : null}
      </section>
    </main>
  );
}
