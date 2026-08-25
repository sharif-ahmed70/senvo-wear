"use client";

import { ArrowUpRight, Heart, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { addToCart, readCart, writeCart } from "../_lib/cart";
import { readWishlist, toggleWishlist } from "../_lib/storefront-ui";
import {
  taka,
  type StorefrontProduct,
  type StorefrontVariant,
} from "../_lib/storefront-api";

export function preferredVariant(product: StorefrontProduct) {
  return (
    product.variants.find((variant) => variant.availability === "IN_STOCK") ??
    product.variants[0]
  );
}

export function ProductCard({
  onAdded,
  onQuickView,
  product,
}: {
  onAdded?: (product: StorefrontProduct) => void;
  onQuickView?: (product: StorefrontProduct) => void;
  product: StorefrontProduct;
}) {
  const [liked, setLiked] = useState(false);
  const variant = preferredVariant(product);
  const images = product.media?.length
    ? product.media
    : product.primaryImage
      ? [{ ...product.primaryImage, linkId: product.primaryImage.assetId }]
      : [];

  useEffect(() => {
    const timer = window.setTimeout(
      () => setLiked(readWishlist(window.localStorage).includes(product.id)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [product.id]);

  const add = (selection: StorefrontVariant | undefined) => {
    if (!selection || selection.availability !== "IN_STOCK") return;
    writeCart(
      window.localStorage,
      addToCart(readCart(window.localStorage), selection),
    );
    onAdded?.(product);
  };

  return (
    <article className="premium-product-card">
      <div className="premium-product-media">
        <Link
          aria-label={`View ${product.name}`}
          className="product-image-link"
          href={`/products/${product.slug}`}
        >
          {images[0] ? (
            <>
              <img
                alt={images[0].altText}
                className="product-image primary-image"
                height={640}
                loading="lazy"
                src={images[0].url}
                width={512}
              />
              {images[1] ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className="product-image alternate-image"
                  height={640}
                  loading="lazy"
                  src={images[1].url}
                  width={512}
                />
              ) : null}
            </>
          ) : (
            <span className="product-fallback">{product.category.name}</span>
          )}
        </Link>
        <button
          aria-label={`${liked ? "Remove" : "Save"} ${product.name} ${
            liked ? "from" : "to"
          } this device's wishlist`}
          aria-pressed={liked}
          className={`wishlist-button${liked ? " active" : ""}`}
          onClick={() =>
            setLiked(toggleWishlist(window.localStorage, product.id))
          }
          type="button"
        >
          <Heart fill={liked ? "currentColor" : "none"} size={18} />
        </button>
        <button
          className="quick-view-button"
          onClick={() => onQuickView?.(product)}
          type="button"
        >
          Quick view
        </button>
      </div>
      <div className="premium-product-copy">
        <div>
          <p>{product.collection?.name ?? product.category.name}</p>
          <Link href={`/products/${product.slug}`}>
            <h2>{product.name}</h2>
          </Link>
          <span>
            {variant ? taka(variant.sellingPriceMinor) : "Unavailable"}
          </span>
        </div>
        <button
          aria-label={`Add ${product.name} to bag`}
          disabled={!variant || variant.availability !== "IN_STOCK"}
          onClick={() => add(variant)}
          type="button"
        >
          <ShoppingBag size={17} />
        </button>
      </div>
      <button
        className="text-action"
        onClick={() => onQuickView?.(product)}
        type="button"
      >
        View details <ArrowUpRight size={14} />
      </button>
    </article>
  );
}
