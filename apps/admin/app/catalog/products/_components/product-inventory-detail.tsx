"use client";

import type {
  ProductDetailsContract,
  VariantInventoryAvailabilityContract,
} from "@senvo/contracts";
import { AlertCircle, ArrowLeft, LoaderCircle } from "lucide-react";
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
