"use client";

import type {
  ProductDetailsContract,
  VariantInventoryAvailabilityContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ImagePlus,
  LoaderCircle,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

export function ProductInventoryDetail({
  permissions,
  productId,
}: {
  permissions: readonly AdminPermissionKey[];
  productId: string;
}) {
  const [product, setProduct] = useState<ProductDetailsContract | null>(null);
  const [availability, setAvailability] = useState<
    VariantInventoryAvailabilityContract[]
  >([]);
  const [barcodeStatus, setBarcodeStatus] = useState<Record<string, string>>(
    {},
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void client
      .getProduct(productId)
      .then(async (result) => {
        const [inventory, barcodeEntries] = await Promise.all([
          permissions.includes("INVENTORY:READ")
            ? Promise.all(
                result.data.variants.map((variant) =>
                  client
                    .getVariantAvailability({ variantId: variant.id })
                    .then((response) => response.data),
                ),
              )
            : Promise.resolve([]),
          Promise.all(
            result.data.variants.map(async (variant) => ({
              entries: (await client.listVariantBarcodes(variant.id)).data,
              variantId: variant.id,
            })),
          ),
        ]);
        if (active) {
          setProduct(result.data);
          setAvailability(inventory);
          setBarcodeStatus(
            Object.fromEntries(
              barcodeEntries.map(({ entries, variantId }) => [
                variantId,
                entries.some((barcode) => barcode.status === "ACTIVE")
                  ? "ACTIVE"
                  : entries.length > 0
                    ? "INACTIVE"
                    : "NONE",
              ]),
            ),
          );
        }
      })
      .catch((caught) => {
        if (active) setError(messageForError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [permissions, productId]);

  if (!permissions.includes("CATALOG:READ")) {
    return <ProductState title="Catalog access is restricted" />;
  }
  if (loading) {
    return (
      <ProductState
        icon={<LoaderCircle className="inventory-spin" size={22} />}
        title="Loading product"
      />
    );
  }
  if (error || !product) {
    return (
      <ProductState
        icon={<AlertCircle size={22} />}
        message={error}
        title="Product is unavailable"
      />
    );
  }

  return (
    <main className="inventory-page product-detail-page">
      <Link className="inventory-back-link" href="/catalog/products">
        <ArrowLeft aria-hidden="true" size={16} />
        Products
      </Link>
      <header className="inventory-header">
        <div>
          <p className="page-eyebrow">{product.product.productCode}</p>
          <h1>{product.product.name}</h1>
        </div>
        <span className="inventory-badge">
          {humanize(product.product.status)}
        </span>
      </header>
      <ProductMedia
        canUpdate={permissions.includes("CATALOG:UPDATE")}
        details={product}
        onChange={(media) =>
          setProduct((current) => {
            if (!current) return current;
            const primary = media.find((item) => item.role === "PRIMARY");
            return {
              ...current,
              media,
              primaryImage: primary
                ? {
                    altText: primary.altText,
                    assetId: primary.assetId,
                    byteSize: primary.byteSize,
                    contentType: primary.contentType,
                    url: primary.url,
                  }
                : null,
            };
          })
        }
      />
      <section className="inventory-section">
        <div className="admin-section__heading">
          <div>
            <h2>Product options</h2>
          </div>
        </div>
        <div className="inventory-table-wrap">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Barcode</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => (
                <tr key={variant.id}>
                  <td className="inventory-mono">{variant.sku}</td>
                  <td>
                    <span
                      className={`barcode-status barcode-status--${
                        barcodeStatus[variant.id] === "ACTIVE"
                          ? "active"
                          : "inactive"
                      }`}
                    >
                      {barcodeStatus[variant.id] === "ACTIVE"
                        ? "Ready to scan"
                        : barcodeStatus[variant.id] === "INACTIVE"
                          ? "Inactive"
                          : "Not assigned"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="inventory-section">
        <div className="admin-section__heading">
          <div>
            <h2>Inventory availability</h2>
          </div>
        </div>
        {!permissions.includes("INVENTORY:READ") ? (
          <ProductState title="Inventory access is restricted" />
        ) : availability.length === 0 ? (
          <ProductState title="No variants available" />
        ) : (
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Variant</th>
                  <th>SKU</th>
                  <th>Location</th>
                  <th className="inventory-number">On hand</th>
                  <th className="inventory-number">Reserved</th>
                  <th className="inventory-number">Available</th>
                </tr>
              </thead>
              <tbody>
                {availability.flatMap((entry) =>
                  entry.locations.length > 0
                    ? entry.locations.map((position) => (
                        <tr key={`${entry.variant.id}:${position.location.id}`}>
                          <td>
                            {entry.variant.color} / {entry.variant.size}
                          </td>
                          <td className="inventory-mono">
                            {entry.variant.sku}
                          </td>
                          <td>{position.location.name}</td>
                          <td className="inventory-number">
                            {position.onHand}
                          </td>
                          <td className="inventory-number">
                            {position.reserved}
                          </td>
                          <td className="inventory-number inventory-available">
                            {position.availableToSell}
                          </td>
                        </tr>
                      ))
                    : [
                        <tr key={entry.variant.id}>
                          <td>
                            {entry.variant.color} / {entry.variant.size}
                          </td>
                          <td className="inventory-mono">
                            {entry.variant.sku}
                          </td>
                          <td colSpan={4}>No stock positions</td>
                        </tr>,
                      ],
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export function ProductMedia({
  canUpdate,
  details,
  onChange,
}: {
  canUpdate: boolean;
  details: ProductDetailsContract;
  onChange: (media: NonNullable<ProductDetailsContract["media"]>) => void;
}) {
  const [media, setMedia] = useState(details.media ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [uploadIdempotencyKey, setUploadIdempotencyKey] = useState("");
  const [altText, setAltText] = useState(details.product.name);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function upload() {
    if (!file || !uploadIdempotencyKey) {
      setMessage("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5_242_880) {
      setMessage("Image must be 5 MB or smaller.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await client.addProductMedia({
        altText: altText.trim(),
        contentBase64: await fileToBase64(file),
        contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
        idempotencyKey: uploadIdempotencyKey,
        productId: details.product.id,
        productVariantId: null,
      });
      updateMedia([...media, result.data]);
      setFile(null);
      setUploadIdempotencyKey("");
      setMessage("Image added.");
    } catch (caught) {
      setMessage(messageForError(caught));
    } finally {
      setSaving(false);
    }
  }

  function updateMedia(next: typeof media) {
    setMedia(next);
    onChange(next);
  }

  async function makePrimary(linkId: string) {
    setSaving(true);
    setMessage("");
    try {
      const result = await client.setProductMediaPrimary(
        details.product.id,
        linkId,
      );
      updateMedia(result.data);
      setMessage("Primary image updated.");
    } catch (caught) {
      setMessage(messageForError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function move(linkId: string, direction: -1 | 1) {
    const index = media.findIndex((item) => item.linkId === linkId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= media.length) return;
    const next = [...media];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    setSaving(true);
    setMessage("");
    try {
      const result = await client.reorderProductMedia({
        linkIds: next.map((item) => item.linkId),
        productId: details.product.id,
      });
      updateMedia(result.data);
      setMessage("Image order saved.");
    } catch (caught) {
      setMessage(messageForError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(
    linkId: string,
    next: { altText: string; productVariantId: string | null },
  ) {
    setSaving(true);
    setMessage("");
    try {
      const result = await client.updateProductMedia({
        ...next,
        linkId,
        productId: details.product.id,
      });
      updateMedia(
        media.map((item) => (item.linkId === linkId ? result.data : item)),
      );
      setMessage("Image details saved.");
    } catch (caught) {
      setMessage(messageForError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function archive(linkId: string) {
    setSaving(true);
    setMessage("");
    try {
      await client.archiveProductMedia(details.product.id, linkId);
      const result = await client.listProductMedia(details.product.id);
      updateMedia(result.data);
      setMessage("Image archived.");
    } catch (caught) {
      setMessage(messageForError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="inventory-section product-media-section">
      <div className="admin-section__heading">
        <div>
          <h2>Product images</h2>
          <p>Choose the first image, order the gallery, and match variants.</p>
        </div>
      </div>
      <div className="product-media-layout">
        <div className="product-media-gallery">
          {media.length === 0 ? (
            <div className="product-media-empty">
              <ImagePlus aria-hidden="true" size={28} />
              <span>No image yet</span>
            </div>
          ) : (
            media.map((image, index) => (
              <article className="product-media-item" key={image.linkId}>
                <img
                  alt={image.altText}
                  height={120}
                  loading={index === 0 ? "eager" : "lazy"}
                  src={image.url}
                  width={120}
                />
                <div className="product-media-item-copy">
                  <strong>
                    {image.role === "PRIMARY"
                      ? "Primary image"
                      : `Image ${index + 1}`}
                  </strong>
                  <input
                    aria-label="Image description"
                    defaultValue={image.altText}
                    disabled={!canUpdate || saving}
                    maxLength={240}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value && value !== image.altText)
                        void updateItem(image.linkId, {
                          altText: value,
                          productVariantId: image.productVariantId,
                        });
                    }}
                  />
                  <select
                    aria-label="Product option"
                    disabled={!canUpdate || saving}
                    onChange={(event) =>
                      void updateItem(image.linkId, {
                        altText: image.altText,
                        productVariantId: event.target.value || null,
                      })
                    }
                    value={image.productVariantId ?? ""}
                  >
                    <option value="">All product options</option>
                    {details.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.sku}
                      </option>
                    ))}
                  </select>
                </div>
                {canUpdate ? (
                  <div className="product-media-item-actions">
                    <button
                      aria-label="Move image up"
                      disabled={
                        saving ||
                        index === 0 ||
                        media[index - 1]?.role === "PRIMARY"
                      }
                      onClick={() => void move(image.linkId, -1)}
                      title="Move up"
                      type="button"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      aria-label="Move image down"
                      disabled={
                        saving ||
                        index === media.length - 1 ||
                        image.role === "PRIMARY"
                      }
                      onClick={() => void move(image.linkId, 1)}
                      title="Move down"
                      type="button"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      aria-label="Set as primary image"
                      disabled={saving || image.role === "PRIMARY"}
                      onClick={() => void makePrimary(image.linkId)}
                      title="Set as primary"
                      type="button"
                    >
                      <Star size={16} />
                    </button>
                    <button
                      aria-label="Archive image"
                      disabled={saving}
                      onClick={() => void archive(image.linkId)}
                      title="Archive"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
        {canUpdate ? (
          <div className="product-media-controls">
            <label>
              <span>Image file</span>
              <input
                accept="image/jpeg,image/png,image/webp"
                disabled={saving}
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  setUploadIdempotencyKey(
                    selected ? `media_${crypto.randomUUID()}` : "",
                  );
                }}
                type="file"
              />
            </label>
            <label>
              <span>Image description</span>
              <input
                disabled={saving}
                maxLength={240}
                onChange={(event) => setAltText(event.target.value)}
                required
                value={altText}
              />
            </label>
            <div className="product-media-actions">
              <button
                disabled={saving || !file || !altText.trim()}
                onClick={() => void upload()}
                type="button"
              >
                {saving ? (
                  <LoaderCircle className="inventory-spin" size={16} />
                ) : (
                  <ImagePlus size={16} />
                )}
                Add image
              </button>
            </div>
            {message ? (
              <p className="product-media-message" role="status">
                {message}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="product-media-readonly">
            You have view-only catalog access.
          </p>
        )}
      </div>
    </section>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function ProductState({
  icon,
  message,
  title,
}: {
  icon?: ReactNode;
  message?: string;
  title: string;
}) {
  return (
    <div className="inventory-state" role={message ? "alert" : undefined}>
      {icon}
      <strong>{title}</strong>
      {message ? <p>{message}</p> : null}
    </div>
  );
}

function humanize(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function messageForError(error: unknown): string {
  if (error instanceof AdminApiError) {
    return `${error.message} Request ${error.requestId}.`;
  }
  return "The product service could not complete this request.";
}
