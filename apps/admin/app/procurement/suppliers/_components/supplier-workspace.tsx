"use client";

import type {
  SupplierBalanceSummaryContract,
  SupplierContract,
  SupplierLedgerEntryContract,
} from "@senvo/contracts";
import { SupplierPayableSection } from "./supplier-payable-section";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../../_components/page-header";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { useAdminPermissions } from "../../../admin-shell";
import styles from "./supplier-workspace.module.css";

const client = new AdminApiClient();

export type SupplierWorkspaceProps = {
  initialBalance?: SupplierBalanceSummaryContract | null;
  initialError?: string;
  initialLedger?: SupplierLedgerEntryContract[];
  initialSupplier?: SupplierContract | null;
  initialSuppliers?: SupplierContract[];
  permissions?: readonly AdminPermissionKey[];
  supplierId?: string;
  view?: "list" | "details";
};

export function SupplierWorkspace({
  initialBalance,
  initialError,
  initialLedger,
  initialSupplier,
  initialSuppliers,
  permissions: propsPermissions,
  supplierId,
  view = "list",
}: SupplierWorkspaceProps) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;

  const canRead = permissions.includes("PROCUREMENT:READ");
  const canCreate = permissions.includes("PROCUREMENT:CREATE");
  const canUpdate = permissions.includes("PROCUREMENT:UPDATE");

  if (!canRead) {
    return <AccessNotice />;
  }

  if (view === "details" && supplierId) {
    return (
      <SupplierDetailsPanel
        canCreate={canCreate}
        canUpdate={canUpdate}
        initialBalance={initialBalance}
        initialError={initialError}
        initialLedger={initialLedger}
        initialSupplier={initialSupplier}
        supplierId={supplierId}
      />
    );
  }

  return (
    <SupplierListPanel
      canCreate={canCreate}
      canUpdate={canUpdate}
      initialError={initialError}
      initialSuppliers={initialSuppliers}
    />
  );
}

// ---------------------------------------------------------------------------
// Access Notice when user lacks PROCUREMENT:READ
// ---------------------------------------------------------------------------
export function AccessNotice() {
  return (
    <div className={styles.container}>
      <PageHeader
        description="সরবরাহকারী সংক্রান্ত তথ্য দেখার অনুমতি নেই।"
        eyebrow="Procurement / সরবরাহকারী"
        title="প্রবেশাধিকার সংরক্ষিত (Access Restricted)"
      />
      <div className={styles.stateBox} role="alert">
        <ShieldCheck className={styles.stateIcon} size={40} />
        <h2 className={styles.stateTitle}>সরবরাহকারী দেখার অনুমতি নেই</h2>
        <p className={styles.stateDescription}>
          আপনার অ্যাকাউন্টে সরবরাহকারী তালিকা বা তথ্য দেখার অনুমতি দেওয়া হয়নি।
          দোকানের মালিকের সাথে যোগাযোগ করুন।
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplier List Panel
// ---------------------------------------------------------------------------
export function SupplierListPanel({
  canCreate,
  canUpdate,
  initialError,
  initialSuppliers,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  initialError?: string;
  initialSuppliers?: SupplierContract[];
}) {
  const [suppliers, setSuppliers] = useState<SupplierContract[]>(
    initialSuppliers ?? [],
  );
  const [loading, setLoading] = useState(
    initialSuppliers === undefined && !initialError,
  );
  const [error, setError] = useState(initialError ?? "");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE"
  >("ALL");

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] =
    useState<SupplierContract | null>(null);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const filterInput = {
        search: searchQuery.trim() || undefined,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      };
      const result = await client.listSuppliers(filterInput);
      setSuppliers(result.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    if (initialSuppliers !== undefined || initialError !== undefined) {
      return;
    }
    const timer = setTimeout(() => {
      void loadSuppliers();
    }, 150);
    return () => clearTimeout(timer);
  }, [initialError, initialSuppliers, loadSuppliers]);

  async function handleDeactivate(id: string) {
    if (
      !window.confirm("আপনি কি নিশ্চিত এই সরবরাহকারীকে নিষ্ক্রিয় করতে চান?")
    ) {
      return;
    }
    setError("");
    try {
      await client.deactivateSupplier(id);
      setSuccessMessage("সরবরাহকারী সফলভাবে নিষ্ক্রিয় করা হয়েছে।");
      await loadSuppliers();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className={styles.container}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <PageHeader
          description="আপনার দোকানের সকল কাপড়ের সরবরাহকারী ও পাইকারি বিক্রেতাদের তালিকা।"
          eyebrow="খাতার হিসাব / Procurement"
          title="সরবরাহকারী তালিকা (Suppliers)"
        />
        {canCreate && (
          <div className={styles.headerActions}>
            <button
              className={styles.primaryButton}
              onClick={() => setIsAddModalOpen(true)}
              type="button"
            >
              <Plus size={16} />
              <span>নতুন সরবরাহকারী যোগ করুন</span>
            </button>
          </div>
        )}
      </div>

      {/* Success/Error Alerts */}
      {successMessage && (
        <div
          className={`${styles.alertBox} ${styles.alertSuccess}`}
          role="status"
        >
          <Check size={18} />
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage("")}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
            }}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <div className={`${styles.alertBox} ${styles.alertError}`} role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
            }}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className={styles.filterBar}>
        <div className={styles.searchBox}>
          <Search size={18} className={styles.infoIcon} />
          <input
            aria-label="সরবরাহকারী খুঁজুন"
            placeholder="নাম বা কোড দিয়ে খুঁজুন..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#64748b",
              }}
              type="button"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div
          className={styles.tabGroup}
          role="tablist"
          aria-label="Status filter"
        >
          <button
            className={`${styles.tabItem} ${statusFilter === "ALL" ? styles.tabItemActive : ""}`}
            onClick={() => setStatusFilter("ALL")}
            type="button"
          >
            সকল ({suppliers.length})
          </button>
          <button
            className={`${styles.tabItem} ${statusFilter === "ACTIVE" ? styles.tabItemActive : ""}`}
            onClick={() => setStatusFilter("ACTIVE")}
            type="button"
          >
            সক্রিয়
          </button>
          <button
            className={`${styles.tabItem} ${statusFilter === "INACTIVE" ? styles.tabItemActive : ""}`}
            onClick={() => setStatusFilter("INACTIVE")}
            type="button"
          >
            নিষ্ক্রিয়
          </button>
        </div>
      </div>

      {/* Content: Loading, Error, Empty, or Grid */}
      {loading ? (
        <div className={styles.stateBox}>
          <RefreshCw
            className={styles.stateIcon}
            size={32}
            style={{ animation: "spin 1s linear infinite" }}
          />
          <p className={styles.stateDescription}>
            সরবরাহকারীদের তথ্য লোড হচ্ছে...
          </p>
        </div>
      ) : suppliers.length === 0 ? (
        <div className={styles.stateBox}>
          <Truck className={styles.stateIcon} size={40} />
          <h3 className={styles.stateTitle}>কোনো সরবরাহকারী পাওয়া যায়নি</h3>
          <p className={styles.stateDescription}>
            {searchQuery
              ? `"${searchQuery}" দিয়ে কোনো সরবরাহকারী খুঁজে পাওয়া যায়নি।`
              : "আপনার দোকানে এখনও কোনো সরবরাহকারী যোগ করা হয়নি।"}
          </p>
          {canCreate && !searchQuery && (
            <button
              className={styles.primaryButton}
              onClick={() => setIsAddModalOpen(true)}
              style={{ marginTop: "0.5rem" }}
              type="button"
            >
              <Plus size={16} />
              <span>প্রথম সরবরাহকারী যোগ করুন</span>
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {suppliers.map((supplier) => (
            <div key={supplier.id} className={styles.card}>
              <div>
                <div className={styles.cardTop}>
                  <div>
                    <h3 className={styles.supplierName}>{supplier.name}</h3>
                    <span className={styles.supplierCode}>{supplier.code}</span>
                  </div>
                  <span
                    className={`${styles.statusBadge} ${
                      supplier.status === "ACTIVE"
                        ? styles.statusActive
                        : styles.statusInactive
                    }`}
                  >
                    {supplier.status === "ACTIVE" ? "সক্রিয়" : "নিষ্ক্রিয়"}
                  </span>
                </div>

                <div className={styles.infoRows} style={{ marginTop: "1rem" }}>
                  {supplier.contactPerson && (
                    <div className={styles.infoRow}>
                      <User size={16} className={styles.infoIcon} />
                      <span>{supplier.contactPerson}</span>
                    </div>
                  )}
                  {supplier.phone && (
                    <div className={styles.infoRow}>
                      <Phone size={16} className={styles.infoIcon} />
                      <a
                        href={`tel:${supplier.phone}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {supplier.phone}
                      </a>
                    </div>
                  )}
                  {supplier.address && (
                    <div className={styles.infoRow}>
                      <MapPin size={16} className={styles.infoIcon} />
                      <span>{supplier.address}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.cardActions}>
                <Link
                  className={styles.secondaryButton}
                  href={`/procurement/suppliers/${supplier.id}`}
                >
                  বিস্তারিত
                </Link>
                {canUpdate && (
                  <>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => setEditingSupplier(supplier)}
                      title="সম্পাদনা করুন"
                      type="button"
                    >
                      <Pencil size={14} />
                      <span>সম্পাদনা</span>
                    </button>
                    {supplier.status === "ACTIVE" && (
                      <button
                        className={styles.dangerButton}
                        onClick={() => void handleDeactivate(supplier.id)}
                        title="নিষ্ক্রিয় করুন"
                        type="button"
                      >
                        নিষ্ক্রিয়
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Supplier Modal */}
      {isAddModalOpen && (
        <SupplierFormModal
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={async () => {
            setIsAddModalOpen(false);
            setSuccessMessage("নতুন সরবরাহকারী সফলভাবে যোগ করা হয়েছে।");
            await loadSuppliers();
          }}
        />
      )}

      {/* Edit Supplier Modal */}
      {editingSupplier && (
        <SupplierFormModal
          supplier={editingSupplier}
          onClose={() => setEditingSupplier(null)}
          onSuccess={async () => {
            setEditingSupplier(null);
            setSuccessMessage("সরবরাহকারীর তথ্য সফলভাবে আপডেট করা হয়েছে।");
            await loadSuppliers();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplier Details Panel
// ---------------------------------------------------------------------------
export function SupplierDetailsPanel({
  canCreate = true,
  canUpdate,
  initialBalance,
  initialError,
  initialLedger,
  initialSupplier,
  supplierId,
}: {
  canCreate?: boolean;
  canUpdate: boolean;
  initialBalance?: SupplierBalanceSummaryContract | null;
  initialError?: string;
  initialLedger?: SupplierLedgerEntryContract[];
  initialSupplier?: SupplierContract | null;
  supplierId: string;
}) {
  const [supplier, setSupplier] = useState<SupplierContract | null>(
    initialSupplier ?? null,
  );
  const [loading, setLoading] = useState(
    initialSupplier === undefined && !initialError,
  );
  const [error, setError] = useState(initialError ?? "");
  const [successMessage, setSuccessMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const loadSupplier = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await client.getSupplier(supplierId);
      setSupplier(result.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    if (initialSupplier !== undefined || initialError !== undefined) {
      return;
    }
    void loadSupplier();
  }, [initialError, initialSupplier, loadSupplier]);

  async function handleDeactivate() {
    if (!supplier) return;
    if (
      !window.confirm("আপনি কি নিশ্চিত এই সরবরাহকারীকে নিষ্ক্রিয় করতে চান?")
    ) {
      return;
    }
    setError("");
    try {
      const result = await client.deactivateSupplier(supplier.id);
      setSupplier(result.data);
      setSuccessMessage("সরবরাহকারী সফলভাবে নিষ্ক্রিয় করা হয়েছে।");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.stateBox}>
          <RefreshCw
            className={styles.stateIcon}
            size={32}
            style={{ animation: "spin 1s linear infinite" }}
          />
          <p className={styles.stateDescription}>
            সরবরাহকারীর বিস্তারিত তথ্য লোড হচ্ছে...
          </p>
        </div>
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className={styles.container}>
        <div className={styles.stateBox} role="alert">
          <AlertCircle className={styles.stateIcon} size={40} />
          <h2 className={styles.stateTitle}>সরবরাহকারী খুঁজে পাওয়া যায়নি</h2>
          <p className={styles.stateDescription}>
            {error || "অনুরোধকৃত সরবরাহকারী সিস্টেমে বিদ্যমান নেই।"}
          </p>
          <Link
            className={styles.secondaryButton}
            href="/procurement/suppliers"
          >
            <ChevronLeft size={16} />
            <span>তালিকায় ফিরে যান</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div>
        <Link
          className={styles.secondaryButton}
          href="/procurement/suppliers"
          style={{ marginBottom: "1rem" }}
        >
          <ChevronLeft size={16} />
          <span>সরবরাহকারী তালিকায় ফিরে যান</span>
        </Link>
        <PageHeader
          description={`সরবরাহকারী কোড: ${supplier.code}`}
          eyebrow="সরবরাহকারী বিবরণ / Supplier Details"
          title={supplier.name}
        />
      </div>

      {successMessage && (
        <div
          className={`${styles.alertBox} ${styles.alertSuccess}`}
          role="status"
        >
          <Check size={18} />
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage("")}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
            }}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Detail Card */}
      <div className={styles.detailCard}>
        <div className={styles.detailHeader}>
          <div>
            <h2
              className={styles.supplierName}
              style={{ fontSize: "1.375rem" }}
            >
              {supplier.name}
            </h2>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                marginTop: "0.25rem",
              }}
            >
              <span className={styles.supplierCode}>{supplier.code}</span>
              <span
                className={`${styles.statusBadge} ${
                  supplier.status === "ACTIVE"
                    ? styles.statusActive
                    : styles.statusInactive
                }`}
              >
                {supplier.status === "ACTIVE" ? "সক্রিয়" : "নিষ্ক্রিয়"}
              </span>
            </div>
          </div>

          {canUpdate && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className={styles.secondaryButton}
                onClick={() => setIsEditing(true)}
                type="button"
              >
                <Pencil size={16} />
                <span>তথ্য সম্পাদনা</span>
              </button>
              {supplier.status === "ACTIVE" && (
                <button
                  className={styles.dangerButton}
                  onClick={() => void handleDeactivate()}
                  type="button"
                >
                  নিষ্ক্রিয় করুন
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.detailInfoGrid}>
          <div className={styles.detailField}>
            <span className={styles.detailLabel}>
              যোগাযোগকারী ব্যক্তি (Contact Person)
            </span>
            <span className={styles.detailValue}>
              {supplier.contactPerson || "তথ্য নেই"}
            </span>
          </div>

          <div className={styles.detailField}>
            <span className={styles.detailLabel}>ফোন নম্বর (Phone)</span>
            <span className={styles.detailValue}>
              {supplier.phone ? (
                <a href={`tel:${supplier.phone}`} style={{ color: "#0f172a" }}>
                  {supplier.phone}
                </a>
              ) : (
                "তথ্য নেই"
              )}
            </span>
          </div>

          <div className={styles.detailField}>
            <span className={styles.detailLabel}>ইমেইল (Email)</span>
            <span className={styles.detailValue}>
              {supplier.email || "তথ্য নেই"}
            </span>
          </div>

          <div className={styles.detailField}>
            <span className={styles.detailLabel}>
              ঠিকানা / অবস্থান (Address)
            </span>
            <span className={styles.detailValue}>
              {supplier.address || "তথ্য নেই"}
            </span>
          </div>

          <div className={styles.detailField} style={{ gridColumn: "1 / -1" }}>
            <span className={styles.detailLabel}>মন্তব্য বা নোট (Notes)</span>
            <span className={styles.detailValue}>
              {supplier.notes || "কোনো বিশেষ মন্তব্য নেই।"}
            </span>
          </div>
        </div>
      </div>

      {/* Supplier Payable & Ledger Section */}
      <SupplierPayableSection
        canCreatePayment={canCreate}
        initialBalance={initialBalance}
        initialLedger={initialLedger}
        supplier={supplier}
      />

      {/* Edit Modal */}
      {isEditing && (
        <SupplierFormModal
          supplier={supplier}
          onClose={() => setIsEditing(false)}
          onSuccess={async () => {
            setIsEditing(false);
            setSuccessMessage("সরবরাহকারীর তথ্য সফলভাবে আপডেট করা হয়েছে।");
            await loadSupplier();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit Supplier Form Modal
// ---------------------------------------------------------------------------
export function SupplierFormModal({
  onClose,
  onSuccess,
  supplier,
}: {
  onClose: () => void;
  onSuccess: () => Promise<void>;
  supplier?: SupplierContract;
}) {
  const isEditing = Boolean(supplier);
  const [name, setName] = useState(supplier?.name ?? "");
  const [contactPerson, setContactPerson] = useState(
    supplier?.contactPerson ?? "",
  );
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("দয়া করে সরবরাহকারীর নাম লিখুন।");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (isEditing && supplier) {
        await client.updateSupplier({
          address: address.trim() || null,
          contactPerson: contactPerson.trim() || null,
          email: email.trim() || null,
          name: name.trim(),
          notes: notes.trim() || null,
          phone: phone.trim() || null,
          supplierId: supplier.id,
        });
      } else {
        const autoCode = `SUP-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        await client.createSupplier({
          address: address.trim() || null,
          code: autoCode,
          contactPerson: contactPerson.trim() || null,
          email: email.trim() || null,
          name: name.trim(),
          notes: notes.trim() || null,
          phone: phone.trim() || null,
        });
      }
      await onSuccess();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalDialog}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>
              {isEditing
                ? "সরবরাহকারীর তথ্য সম্পাদনা"
                : "নতুন সরবরাহকারী যোগ করুন"}
            </h2>
            <p className={styles.modalSubtitle}>
              দোকানের মাল যেখান থেকে কেনা হয় তার তথ্য লিখে রাখুন
            </p>
          </div>
          <button
            className={styles.closeButton}
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          style={{ display: "contents" }}
        >
          <div className={styles.modalBody}>
            {error && (
              <div
                className={`${styles.alertBox} ${styles.alertError}`}
                role="alert"
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                সরবরাহকারী / প্রতিষ্ঠানের নাম
                <span className={styles.formLabelRequired}>*</span>
              </label>
              <input
                className={styles.formInput}
                placeholder="যেমন: ইসলামপুর টেক্সটাইল, বাবাবাজার ফ্যাশন"
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                যোগাযোগকারী ব্যক্তি (ঐচ্ছিক)
              </label>
              <input
                className={styles.formInput}
                placeholder="ম্যানেজার বা মালিকের নাম"
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>ফোন নম্বর (ঐচ্ছিক)</label>
              <input
                className={styles.formInput}
                placeholder="যেমন: 017XXXXXXXX"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>ইমেইল (ঐচ্ছিক)</label>
              <input
                className={styles.formInput}
                placeholder="supplier@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                দোকান / গোডাউনের ঠিকানা (ঐচ্ছিক)
              </label>
              <input
                className={styles.formInput}
                placeholder="যেমন: ইসলামপুর, ঢাকা"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                নোট বা মন্তব্য (ঐচ্ছিক)
              </label>
              <textarea
                className={styles.formTextarea}
                placeholder="পণ্য বা লেনদেন সংক্রান্ত বিশেষ কোনো তথ্য..."
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              className={styles.secondaryButton}
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              বাতিল
            </button>
            <button
              className={styles.primaryButton}
              disabled={submitting || !name.trim()}
              type="submit"
            >
              {submitting ? (
                <>
                  <RefreshCw
                    size={16}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                  <span>সংরক্ষণ হচ্ছে...</span>
                </>
              ) : (
                <span>{isEditing ? "আপডেট করুন" : "সংরক্ষণ করুন"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "অনাকাঙ্ক্ষিত ত্রুটি ঘটেছে। পুনরায় চেষ্টা করুন।";
}
