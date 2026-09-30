"use client";

import type {
  InventoryMovementHistoryContract,
  PurchaseContract,
  SalesOrderListReadContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  Clock,
  ExternalLink,
  History,
  Loader2,
  Package,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminApiClient } from "../../_lib/api-client";
import styles from "./inventory-overview.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type HistoryTab = "movements" | "purchases" | "sales";

export function ProductHistoryModal({
  onClose,
  productCode,
  productId,
  productName,
}: {
  onClose: () => void;
  productCode: string;
  productId: string;
  productName: string;
}) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("movements");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [movements, setMovements] = useState<
    InventoryMovementHistoryContract[]
  >([]);
  const [purchases, setPurchases] = useState<PurchaseContract[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrderListReadContract[]>(
    [],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const [movRes, purRes, salRes] = await Promise.allSettled([
          client.listInventoryMovements({ pageSize: 50 }),
          client.listPurchases({ limit: 50 }),
          client.listSalesOrders({ pageSize: 50 }),
        ]);

        if (cancelled) return;

        if (movRes.status === "fulfilled") {
          const codeQuery = productCode.toLowerCase();
          const nameQuery = productName.toLowerCase();
          const matched = movRes.value.data.items.filter(
            (m) =>
              m.variant.sku.toLowerCase().includes(codeQuery) ||
              m.variant.productName.toLowerCase().includes(nameQuery),
          );
          setMovements(matched);
        }

        if (purRes.status === "fulfilled") {
          setPurchases(purRes.value.data);
        }

        if (salRes.status === "fulfilled") {
          setSalesOrders(salRes.value.data.items);
        }
      } catch (caught: unknown) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Failed to load product history.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [productCode, productId, productName]);

  function formatDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function formatTime(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose} role="presentation">
      <section
        aria-labelledby="product-history-title"
        aria-modal="true"
        className={styles.historyModal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <header className={styles.modalHeader}>
          <div className={styles.modalTitleBlock}>
            <span className={styles.modalIconWrap}>
              <History aria-hidden="true" size={20} />
            </span>
            <div>
              <p className={styles.eyebrow}>Product History / ইতিহাস</p>
              <h2 id="product-history-title">{productName}</h2>
              <p className={styles.modalSub}>
                Code: <strong>{productCode}</strong>
              </p>
            </div>
          </div>
          <div className={styles.modalHeaderActions}>
            <Link
              className={styles.secondaryButton}
              href={`/inventory/movements`}
              target="_blank"
            >
              <span>Full Ledger</span>
              <ExternalLink size={14} />
            </Link>
            <button
              aria-label="Close dialog"
              className={styles.closeButton}
              onClick={onClose}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Tabs Bar */}
        <div className={styles.historyTabs}>
          <button
            className={`${styles.historyTab} ${
              activeTab === "movements" ? styles.historyTab_active : ""
            }`}
            onClick={() => setActiveTab("movements")}
            type="button"
          >
            <Truck size={15} />
            <span>Stock Movements ({movements.length})</span>
          </button>
          <button
            className={`${styles.historyTab} ${
              activeTab === "purchases" ? styles.historyTab_active : ""
            }`}
            onClick={() => setActiveTab("purchases")}
            type="button"
          >
            <Package size={15} />
            <span>Purchases ({purchases.length})</span>
          </button>
          <button
            className={`${styles.historyTab} ${
              activeTab === "sales" ? styles.historyTab_active : ""
            }`}
            onClick={() => setActiveTab("sales")}
            type="button"
          >
            <ShoppingBag size={15} />
            <span>Sales Orders ({salesOrders.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className={styles.historyBody}>
          {loading ? (
            <div className={styles.historyLoading}>
              <Loader2 className={styles.spin} size={24} />
              <span>Loading records…</span>
            </div>
          ) : error ? (
            <div className={styles.scanError} role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : activeTab === "movements" ? (
            movements.length === 0 ? (
              <div className={styles.emptyStateCompact}>
                <Clock size={28} />
                <p>No stock movement records for this product yet.</p>
              </div>
            ) : (
              <div className={styles.historyTableWrap}>
                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Variant / SKU</th>
                      <th>Qty</th>
                      <th>Location</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((item, idx) => {
                      const isPositive =
                        item.type === "RECEIPT" ||
                        item.type === "OPENING" ||
                        item.type === "ADJUSTMENT_IN" ||
                        (item.type === "TRANSFER" &&
                          item.destinationLocation !== null);
                      return (
                        <tr key={`${item.id}-${idx}`}>
                          <td>
                            <strong>{formatDate(item.occurredAt)}</strong>
                            <small>{formatTime(item.occurredAt)}</small>
                          </td>
                          <td>
                            <span className={styles.typeBadge}>
                              {item.type}
                            </span>
                          </td>
                          <td>
                            <span>{item.variant.sku}</span>
                            <small>
                              {item.variant.color} · {item.variant.size}
                            </small>
                          </td>
                          <td>
                            <span
                              className={
                                isPositive
                                  ? styles.qtyPositive
                                  : styles.qtyNegative
                              }
                            >
                              {isPositive ? "+" : "-"}
                              {item.quantity} pcs
                            </span>
                          </td>
                          <td>
                            {item.destinationLocation
                              ? item.destinationLocation.name
                              : item.sourceLocation
                                ? item.sourceLocation.name
                                : "Main Stock"}
                          </td>
                          <td>
                            <span className={styles.typeBadge}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : activeTab === "purchases" ? (
            purchases.length === 0 ? (
              <div className={styles.emptyStateCompact}>
                <Package size={28} />
                <p>No purchase orders recorded for this product yet.</p>
              </div>
            ) : (
              <div className={styles.historyTableWrap}>
                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Purchase Number</th>
                      <th>Status</th>
                      <th>Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase) => {
                      const costNumber = Number.parseInt(
                        purchase.totalCostMinor || "0",
                        10,
                      );
                      return (
                        <tr key={purchase.id}>
                          <td>
                            <strong>
                              {formatDate(
                                purchase.purchaseDate || purchase.createdAt,
                              )}
                            </strong>
                          </td>
                          <td>
                            <code>{purchase.purchaseNumber}</code>
                          </td>
                          <td>
                            <span className={styles.typeBadge}>
                              {purchase.status}
                            </span>
                          </td>
                          <td>
                            <strong>
                              ৳{(costNumber / 100).toLocaleString()}
                            </strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : salesOrders.length === 0 ? (
            <div className={styles.emptyStateCompact}>
              <ShoppingBag size={28} />
              <p>No sales orders linked to this product yet.</p>
            </div>
          ) : (
            <div className={styles.historyTableWrap}>
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salesOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{formatDate(order.createdAt)}</strong>
                      </td>
                      <td>
                        <code>{order.orderNumber}</code>
                      </td>
                      <td>
                        <span>{order.customer.name || "Walk-in Customer"}</span>
                        {order.customer.phone ? (
                          <small>{order.customer.phone}</small>
                        ) : null}
                      </td>
                      <td>
                        <span className={styles.typeBadge}>{order.status}</span>
                      </td>
                      <td>
                        <strong>
                          ৳{(order.totalMinor / 100).toLocaleString()}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
