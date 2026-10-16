"use client";

import type {
  PurchaseContract,
  StockLocationReadContract,
  SupplierContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Clock,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../../_components/page-header";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import { useAdminPermissions } from "../../../admin-shell";
import styles from "./purchase-history-workspace.module.css";

const client = new AdminApiClient();

export type PurchaseStatus = PurchaseContract["status"];

export const STATUS_LABELS: Record<PurchaseStatus, string> = {
  CANCELLED: "বাতিল",
  DRAFT: "খসড়া — Stock not added",
  POSTED: "নিশ্চিত — Stock added",
};

export function formatPurchaseAmount(
  totalCostMinor: string | number | bigint,
): string {
  const minor =
    typeof totalCostMinor === "string"
      ? Number(totalCostMinor)
      : typeof totalCostMinor === "bigint"
        ? Number(totalCostMinor)
        : totalCostMinor;

  if (isNaN(minor)) return "৳০.০০";
  const taka = minor / 100;
  return `৳${taka.toLocaleString("en-BD", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

export function formatPurchaseDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

export type PurchaseHistoryWorkspaceProps = {
  initialError?: string;
  initialPurchase?: PurchaseContract | null;
  initialPurchases?: PurchaseContract[];
  permissions?: readonly AdminPermissionKey[];
  purchaseId?: string;
  view?: "list" | "details";
};

export function PurchaseHistoryWorkspace({
  initialError,
  initialPurchase,
  initialPurchases,
  permissions: propsPermissions,
  purchaseId,
  view = "list",
}: PurchaseHistoryWorkspaceProps) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;

  const canRead = permissions.includes("PROCUREMENT:READ");

  if (!canRead) {
    return <PurchaseAccessNotice />;
  }

  if (view === "details" && purchaseId) {
    return (
      <PurchaseDetailsPanel
        initialError={initialError}
        initialPurchase={initialPurchase}
        permissions={permissions}
        purchaseId={purchaseId}
      />
    );
  }

  return (
    <PurchaseListPanel
      initialError={initialError}
      initialPurchases={initialPurchases}
    />
  );
}

export function PurchaseAccessNotice() {
  return (
    <div className={styles.container}>
      <PageHeader
        description="ক্রয় সংক্রান্ত তথ্য বা ইতিহাস দেখার অনুমতি নেই।"
        eyebrow="Procurement / ক্রয়"
        title="প্রবেশাধিকার সংরক্ষিত (Access Restricted)"
      />
      <div className={styles.stateBox} role="alert">
        <ShieldCheck className={styles.stateIcon} size={40} />
        <h2 className={styles.stateTitle}>ক্রয় ইতিহাস দেখার অনুমতি নেই</h2>
        <p className={styles.stateDescription}>
          আপনার অ্যাকাউন্টে ক্রয় তালিকা বা ইতিহাস দেখার অনুমতি দেওয়া হয়নি।
          দোকানের অ্যাডমিন বা মালিকের সাথে যোগাযোগ করুন।
        </p>
      </div>
    </div>
  );
}

function PurchaseListPanel({
  initialError,
  initialPurchases,
}: {
  initialError?: string;
  initialPurchases?: PurchaseContract[];
}) {
  const [purchases, setPurchases] = useState<PurchaseContract[]>(
    initialPurchases ?? [],
  );
  const [suppliers, setSuppliers] = useState<SupplierContract[]>([]);
  const [locations, setLocations] = useState<StockLocationReadContract[]>([]);
  const [isLoading, setIsLoading] = useState(!initialPurchases);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  // Backend-supported filters only
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");

  const loadReferenceData = useCallback(async () => {
    try {
      const [suppliersRes, locationsRes] = await Promise.all([
        client.listSuppliers(),
        client.listStockLocations(),
      ]);
      if (suppliersRes.data) {
        setSuppliers(suppliersRes.data);
      }
      if (locationsRes.data?.items) {
        setLocations(locationsRes.data.items);
      }
    } catch {
      // Reference lookup errors do not block purchase rendering
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const query: {
        destinationLocationId?: string;
        status?: PurchaseStatus;
        supplierId?: string;
      } = {};

      if (statusFilter) {
        query.status = statusFilter as PurchaseStatus;
      }
      if (supplierFilter) {
        query.supplierId = supplierFilter;
      }
      if (locationFilter) {
        query.destinationLocationId = locationFilter;
      }

      const res = await client.listPurchases(query);
      if (res.data) {
        setPurchases(res.data);
      }
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("ক্রয় তালিকা লোড করা সম্ভব হয়নি।");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, supplierFilter, locationFilter]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (!initialPurchases || statusFilter || supplierFilter || locationFilter) {
      void loadPurchases();
    }
  }, [
    loadPurchases,
    initialPurchases,
    statusFilter,
    supplierFilter,
    locationFilter,
  ]);

  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const locationMap = new Map(locations.map((l) => [l.id, l.name]));

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <PageHeader
          description="সকল পূর্ববর্তী পণ্য ক্রয়, সরবরাহকারী ও স্টকের হিসাব।"
          eyebrow="Procurement / ক্রয় ব্যবস্থাপনা"
          title="ক্রয় ইতিহাস (Purchase History)"
        />
        <Link
          className={styles.primaryButton}
          href="/procurement/purchases/new"
        >
          <Plus size={16} />
          নতুন ক্রয় এন্ট্রি
        </Link>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterControls}>
          <label className={styles.filterLabel}>
            অবস্থা (Status)
            <select
              aria-label="Filter by status"
              className={styles.select}
              onChange={(e) => setStatusFilter(e.target.value)}
              value={statusFilter}
            >
              <option value="">সকল অবস্থা (All Statuses)</option>
              <option value="DRAFT">খসড়া (DRAFT)</option>
              <option value="POSTED">নিশ্চিত (POSTED)</option>
              <option value="CANCELLED">বাতিল (CANCELLED)</option>
            </select>
          </label>

          <label className={styles.filterLabel}>
            সরবরাহকারী (Supplier)
            <select
              aria-label="Filter by supplier"
              className={styles.select}
              onChange={(e) => setSupplierFilter(e.target.value)}
              value={supplierFilter}
            >
              <option value="">সকল সরবরাহকারী (All Suppliers)</option>
              {suppliers.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.name} ({sup.code})
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filterLabel}>
            গন্তব্য লোকেশন (Destination)
            <select
              aria-label="Filter by location"
              className={styles.select}
              onChange={(e) => setLocationFilter(e.target.value)}
              value={locationFilter}
            >
              <option value="">সকল লোকেশন (All Locations)</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          aria-label="Refresh purchases"
          className={styles.refreshButton}
          disabled={isRefreshing}
          onClick={() => void loadPurchases()}
          type="button"
        >
          <RefreshCw
            className={isRefreshing ? styles.spinning : ""}
            size={16}
          />
          রিফ্রেশ
        </button>
      </div>

      {error && (
        <div className={styles.errorBox} role="alert">
          <AlertCircle size={20} />
          <div>
            <div className={styles.errorTitle}>সমস্যা দেখা দিয়েছে</div>
            <div className={styles.errorDescription}>{error}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className={styles.stateBox} data-testid="loading-state">
          <Clock
            className={`${styles.stateIcon} ${styles.spinning}`}
            size={32}
          />
          <h2 className={styles.stateTitle}>ক্রয় তালিকা লোড হচ্ছে...</h2>
        </div>
      ) : purchases.length === 0 ? (
        <div className={styles.stateBox} data-testid="empty-state">
          <Package className={styles.stateIcon} size={40} />
          <h2 className={styles.stateTitle}>কোনো ক্রয় রেকর্ড পাওয়া যায়নি</h2>
          <p className={styles.stateDescription}>
            নির্বাচিত ফিল্টারের সাথে মিলে এমন কোনো ক্রয় আদেশ পাওয়া যায়নি।
          </p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>তারিখ (Date)</th>
                <th>ক্রয় নম্বর (PO #)</th>
                <th>সরবরাহকারী (Supplier)</th>
                <th>গন্তব্য (Destination)</th>
                <th>মোট টাকা (Total Amount)</th>
                <th>অবস্থা (Status)</th>
                <th>পদক্ষেপ (Action)</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => {
                const supplierName =
                  supplierMap.get(purchase.supplierId) ?? purchase.supplierId;
                const locationName =
                  locationMap.get(purchase.destinationLocationId) ??
                  purchase.destinationLocationId;

                return (
                  <tr key={purchase.id}>
                    <td>{formatPurchaseDate(purchase.purchaseDate)}</td>
                    <td className={styles.purchaseNumber}>
                      {purchase.purchaseNumber}
                    </td>
                    <td>{supplierName}</td>
                    <td>{locationName}</td>
                    <td className={styles.amount}>
                      {formatPurchaseAmount(purchase.totalCostMinor)}
                    </td>
                    <td>
                      <StatusBadge status={purchase.status} />
                    </td>
                    <td>
                      <Link
                        className={styles.viewButton}
                        href={`/procurement/purchases/${purchase.id}`}
                      >
                        বিস্তারিত
                        <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: PurchaseStatus }) {
  const label = STATUS_LABELS[status] ?? status;

  let badgeClass = styles.statusDraft;
  if (status === "POSTED") {
    badgeClass = styles.statusPosted;
  } else if (status === "CANCELLED") {
    badgeClass = styles.statusCancelled;
  }

  return (
    <span className={`${styles.statusBadge} ${badgeClass}`}>
      <span className={styles.statusDot} />
      {label}
    </span>
  );
}

function PurchaseDetailsPanel({
  initialError,
  initialPurchase,
  permissions = [],
  purchaseId,
}: {
  initialError?: string;
  initialPurchase?: PurchaseContract | null;
  permissions?: readonly AdminPermissionKey[];
  purchaseId: string;
}) {
  const [purchase, setPurchase] = useState<PurchaseContract | null>(
    initialPurchase ?? null,
  );
  const [isLoading, setIsLoading] = useState(!initialPurchase);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [confirmSuccess, setConfirmSuccess] = useState<boolean>(false);

  const canConfirm = permissions.includes("PROCUREMENT:UPDATE");

  const handleConfirmDraftPurchase = async () => {
    if (isConfirming || !canConfirm || !purchase) return;
    setIsConfirming(true);
    setError(null);
    try {
      const res = await client.confirmPurchase({ purchaseId: purchase.id });
      if (res.data) {
        setPurchase(res.data);
        setConfirmSuccess(true);
      }
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError("ক্রয় আদেশ নিশ্চিতকরণ ও স্টক যুক্ত করতে ব্যর্থ হয়েছে।");
      }
    } finally {
      setIsConfirming(false);
    }
  };

  useEffect(() => {
    if (!initialPurchase) {
      setIsLoading(true);
      setError(null);
      client
        .getPurchase(purchaseId)
        .then((res) => {
          if (res.data) {
            setPurchase(res.data);
          }
        })
        .catch((err) => {
          if (err instanceof AdminApiError) {
            setError(err.message);
          } else {
            setError("ক্রয় আদেশের বিবরণ লোড করা যায়নি।");
          }
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [purchaseId, initialPurchase]);

  return (
    <div className={styles.container}>
      <Link className={styles.backLink} href="/procurement/purchases">
        <ArrowLeft size={16} />
        সকল ক্রয় তালিকায় ফিরে যান (Back to purchases)
      </Link>

      <PageHeader
        description="ক্রয় আদেশের সম্পূর্ণ বিবরণ ও পণ্যের তালিকা।"
        eyebrow="Procurement / ক্রয় বিবরণ"
        title={
          purchase
            ? `ক্রয় আদেশ: ${purchase.purchaseNumber}`
            : "ক্রয় বিবরণ (Purchase Details)"
        }
      />

      {error && (
        <div className={styles.errorBox} role="alert">
          <AlertCircle size={20} />
          <div>
            <div className={styles.errorTitle}>সমস্যা দেখা দিয়েছে</div>
            <div className={styles.errorDescription}>{error}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className={styles.stateBox} data-testid="loading-state">
          <Clock
            className={`${styles.stateIcon} ${styles.spinning}`}
            size={32}
          />
          <h2 className={styles.stateTitle}>বিবরণ লোড হচ্ছে...</h2>
        </div>
      ) : !purchase ? (
        <div className={styles.stateBox} data-testid="not-found-state">
          <Package className={styles.stateIcon} size={40} />
          <h2 className={styles.stateTitle}>ক্রয় আদেশ পাওয়া যায়নি</h2>
        </div>
      ) : (
        <div className={styles.detailCard}>
          {confirmSuccess && (
            <div
              style={{
                backgroundColor: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "0.5rem",
                color: "#166534",
                fontSize: "0.875rem",
                fontWeight: 600,
                marginBottom: "1.5rem",
                padding: "0.875rem 1.25rem",
              }}
            >
              ক্রয় আদেশ সফলভাবে নিশ্চিত করা হয়েছে এবং গোডাউনে সমস্ত স্টক যুক্ত
              হয়েছে।
            </div>
          )}

          {purchase.status === "DRAFT" && (
            <div
              style={{
                backgroundColor: "#fefce8",
                border: "1px solid #fef08a",
                borderRadius: "0.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
                marginBottom: "1.5rem",
                padding: "1rem 1.25rem",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#854d0e",
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                  }}
                >
                  খসড়া অবস্থা — স্টক এখনও যোগ করা হয়নি (Draft Order — Stock Not
                  Added)
                </div>
                <div
                  style={{
                    color: "#a16207",
                    fontSize: "0.8125rem",
                    marginTop: "0.25rem",
                  }}
                >
                  সতর্কতা: Confirm করলে stock increase হবে এবং cost update হবে।
                </div>
              </div>
              <div>
                <button
                  aria-busy={isConfirming}
                  disabled={isConfirming || !canConfirm}
                  onClick={() => void handleConfirmDraftPurchase()}
                  style={{
                    alignItems: "center",
                    backgroundColor: canConfirm ? "#166534" : "#9ca3af",
                    border: "none",
                    borderRadius: "0.375rem",
                    color: "#ffffff",
                    cursor:
                      canConfirm && !isConfirming ? "pointer" : "not-allowed",
                    display: "flex",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    gap: "0.5rem",
                    padding: "0.5rem 1rem",
                  }}
                  type="button"
                >
                  {isConfirming ? (
                    <Clock className={styles.spinning} size={16} />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  {isConfirming
                    ? "নিশ্চিত করা হচ্ছে..."
                    : "স্টক নিশ্চিত করুন (Confirm & Add Stock)"}
                </button>
                {!canConfirm && (
                  <div
                    style={{
                      color: "#b91c1c",
                      fontSize: "0.75rem",
                      marginTop: "0.25rem",
                      textAlign: "right",
                    }}
                  >
                    স্টক নিশ্চিত করতে PROCUREMENT:UPDATE অনুমতি প্রয়োজন।
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>ক্রয় নম্বর (PO #)</span>
              <span className={`${styles.infoValue} ${styles.purchaseNumber}`}>
                {purchase.purchaseNumber}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>তারিখ (Purchase Date)</span>
              <span className={styles.infoValue}>
                {formatPurchaseDate(purchase.purchaseDate)}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>অবস্থা (Status)</span>
              <div>
                <StatusBadge status={purchase.status} />
              </div>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>মোট টাকা (Total Amount)</span>
              <span className={`${styles.infoValue} ${styles.amount}`}>
                {formatPurchaseAmount(purchase.totalCostMinor)}
              </span>
            </div>
            {purchase.receiptMovementId && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>
                  ইনভেন্টরি রিসিট আইডি (Movement ID)
                </span>
                <span className={styles.infoValue}>
                  {purchase.receiptMovementId}
                </span>
              </div>
            )}
            {purchase.notes && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>নোট (Notes)</span>
                <span className={styles.infoValue}>{purchase.notes}</span>
              </div>
            )}
          </div>

          <h3 className={styles.stateTitle}>
            ক্রয়কৃত পণ্যের তালিকা (Line Items)
          </h3>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ক্রমিক (Line #)</th>
                  <th>পণ্য (Product)</th>
                  <th>ভ্যারিয়েন্ট (Variant)</th>
                  <th>এসকেইউ (SKU)</th>
                  <th>পরিমাণ (Qty)</th>
                  <th>দর (Unit Cost)</th>
                  <th>মোট (Line Total)</th>
                </tr>
              </thead>
              <tbody>
                {(purchase.lines ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: "center", color: "#64748b" }}
                    >
                      কোনো লাইন আইটেম যুক্ত নেই (No line items found)
                    </td>
                  </tr>
                ) : (
                  (purchase.lines ?? []).map((line) => (
                    <tr key={line.id}>
                      <td>{line.lineNumber}</td>
                      <td>{line.productName}</td>
                      <td>{line.variantName ?? "—"}</td>
                      <td className={styles.purchaseNumber}>{line.sku}</td>
                      <td>{line.quantity}</td>
                      <td>{formatPurchaseAmount(line.unitCostMinor)}</td>
                      <td className={styles.amount}>
                        {formatPurchaseAmount(line.totalCostMinor)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
