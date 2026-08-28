"use client";

import {
  ArrowLeft,
  Check,
  Heart,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { addToCart, readCart, writeCart } from "../_lib/cart";
import { mediaForVariant } from "../_lib/product-media";
import { readWishlist, toggleWishlist } from "../_lib/storefront-ui";
import {
  storefrontApi,
  taka,
  type StorefrontProduct,
} from "../_lib/storefront-api";

export { mediaForVariant } from "../_lib/product-media";

export function ProductWorkspace({ slug }: { slug: string }) {
  const [liked, setLiked] = useState(false);
  const [message, setMessage] = useState("");
  const [product, setProduct] = useState<StorefrontProduct | null>(null);
  const [selectedImageId, setSelectedImageId] = useState("");
  const [variantId, setVariantId] = useState("");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    void storefrontApi
      .product(slug)
      .then((value) => {
        if (!active) return;
        const firstAvailable = value.variants.find(
          (item) => item.availability === "IN_STOCK",
        );
        setProduct(value);
        setVariantId(firstAvailable?.id ?? value.variants[0]?.id ?? "");
        setSelectedImageId("");
        setLiked(readWishlist(window.localStorage).includes(value.id));
      })
      .catch(() => {
        if (active) setMessage("This product is not available right now.");
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (message && !product)
    return (
      <main className="premium-state-page">
        <p className="eyebrow">Collection update</p>
        <h1>This piece is resting.</h1>
        <p>{message}</p>
        <Link className="primary-button" href="/#collection">
          Return to the collection
        </Link>
      </main>
    );

  if (!product)
    return (
      <main
        className="premium-product-detail loading-detail"
        aria-live="polite"
      >
        <div className="detail-media-skeleton" />
        <div className="detail-copy-skeleton">
          <i />
          <i />
          <i />
          <i />
        </div>
      </main>
    );

  const selected = product.variants.find((variant) => variant.id === variantId);
  const gallery = mediaForVariant(product.media ?? [], variantId);
  const selectedImage =
    gallery.find((image) => image.linkId === selectedImageId) ??
    gallery[0] ??
    product.primaryImage;
  const availableCount = product.variants.filter(
    (variant) => variant.availability === "IN_STOCK",
  ).length;

  return (
    <main className="premium-product-page">
      <nav aria-label="Breadcrumb" className="product-breadcrumb">
        <Link href="/#collection">
          <ArrowLeft size={15} /> Shop
        </Link>
        <span>/</span>
        <span>{product.category.name}</span>
        <span>/</span>
        <strong>{product.name}</strong>
      </nav>

      <div className="premium-product-detail">
        <section className="product-gallery" aria-label="Product gallery">
          <div className="product-gallery-main">
            <AnimatePresence mode="wait">
              {selectedImage ? (
                <motion.img
                  alt={selectedImage.altText}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  height={900}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  key={selectedImage.assetId}
                  src={selectedImage.url}
                  transition={{ duration: 0.4 }}
                  width={720}
                />
              ) : (
                <span>{product.category.name}</span>
              )}
            </AnimatePresence>
            <button
              aria-label={`${liked ? "Remove" : "Save"} ${product.name} ${
                liked ? "from" : "to"
              } this device's wishlist`}
              aria-pressed={liked}
              className={`detail-wishlist${liked ? " active" : ""}`}
              onClick={() =>
                setLiked(toggleWishlist(window.localStorage, product.id))
              }
              type="button"
            >
              <Heart fill={liked ? "currentColor" : "none"} size={19} />
            </button>
          </div>
          {gallery.length > 1 ? (
            <div className="premium-thumbnails">
              {gallery.map((image, index) => (
                <button
                  aria-label={`View image ${index + 1}: ${image.altText}`}
                  aria-pressed={selectedImage?.assetId === image.assetId}
                  key={image.linkId}
                  onClick={() => setSelectedImageId(image.linkId)}
                  type="button"
                >
                  <img alt="" height={108} src={image.url} width={86} />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="premium-detail-copy">
          <p className="eyebrow">
            {product.collection?.name ?? product.category.name} /{" "}
            {product.productCode}
          </p>
          <h1>{product.name}</h1>
          <strong className="detail-price">
            {selected ? taka(selected.sellingPriceMinor) : "Choose an option"}
          </strong>
          <p className="detail-description">
            {product.description ??
              "A versatile SENVO essential made for everyday comfort and considered style."}
          </p>

          <fieldset className="variant-fieldset detail-variants">
            <legend>
              Select colour and size <span>{availableCount} available</span>
            </legend>
            <div className="premium-variant-options">
              {product.variants.map((variant) => (
                <button
                  aria-pressed={variant.id === variantId}
                  className={variant.id === variantId ? "selected" : ""}
                  disabled={variant.availability === "OUT_OF_STOCK"}
                  key={variant.id}
                  onClick={() => {
                    setVariantId(variant.id);
                    setSelectedImageId("");
                    setMessage("");
                  }}
                  type="button"
                >
                  <i style={{ backgroundColor: variant.color.hexValue }} />
                  <span>{variant.color.name}</span>
                  <small>{variant.size.name}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <button
            className="primary-button product-add-button"
            disabled={!selected || selected.availability !== "IN_STOCK"}
            onClick={() => {
              if (!selected) return;
              writeCart(
                window.localStorage,
                addToCart(readCart(window.localStorage), selected),
              );
              setMessage("Added to your SENVO bag.");
            }}
            type="button"
          >
            <ShoppingBag size={18} />
            {selected?.availability === "IN_STOCK"
              ? "Add to bag"
              : "Unavailable"}
          </button>
          {message ? (
            <p className="inline-success" role="status">
              <Check size={16} /> {message}
            </p>
          ) : null}

          <ul className="product-assurances">
            <li>
              <Truck size={18} />
              <span>
                <strong>Delivery across Bangladesh</strong>Confirmed during
                order review
              </span>
            </li>
            <li>
              <PackageCheck size={18} />
              <span>
                <strong>Easy exchange</strong>Within 7 days of delivery
              </span>
            </li>
            <li>
              <ShieldCheck size={18} />
              <span>
                <strong>Secure order</strong>Stock and price verified by SENVO
              </span>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
