"use client";

import type {
  ProductDetailsContract,
  VariantInventoryAvailabilityContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowLeft,
  ImagePlus,
  LoaderCircle,
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
        onChange={(primaryImage) =>
          setProduct((current) =>
            current ? { ...current, primaryImage } : current,
          )
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

function ProductMedia({
  canUpdate,
  details,
  onChange,
}: {
  canUpdate: boolean;
  details: ProductDetailsContract;
  onChange: (image: ProductDetailsContract["primaryImage"]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadIdempotencyKey, setUploadIdempotencyKey] = useState("");
  const [altText, setAltText] = useState(
    details.primaryImage?.altText ?? details.product.name,
  );
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
      const result = await client.setPrimaryProductImage({
        altText: altText.trim(),
        contentBase64: await fileToBase64(file),
        contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
        idempotencyKey: uploadIdempotencyKey,
        productId: details.product.id,
      });
      onChange(result.data);
      setFile(null);
      setUploadIdempotencyKey("");
      setMessage("Primary image saved.");
    } catch (caught) {
      setMessage(messageForError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setMessage("");
    try {
      await client.removePrimaryProductImage(details.product.id);
      onChange(null);
      setMessage("Primary image removed.");
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
          <h2>Primary product image</h2>
          <p>The image customers see first in the online shop.</p>
        </div>
      </div>
      <div className="product-media-layout">
        <div className="product-media-preview">
          {details.primaryImage ? (
            <img
              alt={details.primaryImage.altText}
              height={320}
              src={details.primaryImage.url}
              width={320}
            />
          ) : (
            <div className="product-media-empty">
              <ImagePlus aria-hidden="true" size={28} />
              <span>No image yet</span>
            </div>
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
                {details.primaryImage ? "Replace image" : "Upload image"}
              </button>
              {details.primaryImage ? (
                <button
                  className="product-media-remove"
                  disabled={saving}
                  onClick={() => void remove()}
                  type="button"
                >
                  <Trash2 size={16} /> Remove
                </button>
              ) : null}
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
