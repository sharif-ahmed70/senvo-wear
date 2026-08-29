"use client";

import type { SalesBoothContract } from "@senvo/contracts";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Download,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  TentTree,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import styles from "./booth-history-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

type PendingStatusChange = {
  booth: SalesBoothContract;
  nextStatus: "ACTIVE" | "INACTIVE";
};

export function BoothHistoryWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("SALES:READ");
  const canCreate = permissions.includes("SALES:CREATE");
  const canUpdate = permissions.includes("SALES:UPDATE");
  const [booths, setBooths] = useState<SalesBoothContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [pendingStatus, setPendingStatus] =
    useState<PendingStatusChange | null>(null);
  const [changingId, setChangingId] = useState("");

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!canRead) {
        setLoading(false);
        return;
      }
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        setBooths((await client.listSalesBooths()).data);
      } catch (caught) {
        setError(messageFor(caught));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canRead],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      booths.filter((booth) => {
        if (statusFilter !== "ALL" && booth.status !== statusFilter)
          return false;
        if (!normalizedQuery) return true;
        return [booth.name, booth.location, booth.responsibleStaffName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [booths, normalizedQuery, statusFilter],
  );

  const activeCount = booths.filter(
    (booth) => booth.status === "ACTIVE",
  ).length;
  const inactiveCount = booths.length - activeCount;

  async function changeStatus() {
    if (!pendingStatus || changingId) return;
    const { booth, nextStatus } = pendingStatus;
    setChangingId(booth.id);
    setError("");
    setSuccess("");
    try {
      await client.updateSalesBoothStatus({
        boothId: booth.id,
        expectedVersion: booth.version,
        status: nextStatus,
      });
      setPendingStatus(null);
      setSuccess(
        `${booth.name} is now ${nextStatus === "ACTIVE" ? "active" : "inactive"}.`,
      );
      await load("refresh");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setChangingId("");
    }
  }

  function exportCsv() {
    if (!filtered.length) return;
    const rows = [
      [
        "Booth",
        "Location",
        "Start date",
        "End date",
        "Responsible staff",
        "Status",
      ],
      ...filtered.map((booth) => [
        booth.name,
        booth.location,
        booth.startDate,
        booth.endDate,
        booth.responsibleStaffName ?? "",
        booth.status,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `senvo-booth-history-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!canRead) {
    return (
      <StatePanel
        icon={<ShieldCheck size={28} />}
        title="Booth history access is restricted"
        text="Your role does not include sales read permission."
      />
    );
  }

  if (loading) {
    return (
      <StatePanel
        icon={<LoaderCircle className={styles.spin} size={28} />}
        title="Loading booth history"
        text="Reading event booth records from the sales service…"
      />
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Sales</p>
          <h1>Booth History</h1>
          <p>
            Manage temporary event sales locations without losing historical
            booth records.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryButton}
            disabled={refreshing}
            onClick={() => void load("refresh")}
            type="button"
          >
            <RefreshCw
              className={refreshing ? styles.spin : undefined}
              size={16}
            />
            Refresh
          </button>
          {canCreate ? (
            <button
              className={styles.primaryButton}
              onClick={() => setShowCreate(true)}
              type="button"
            >
              <Plus size={16} /> Create Booth
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className={styles.feedbackError} role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError("")} type="button">
            Dismiss
          </button>
        </div>
      ) : null}
      {success ? (
        <div className={styles.feedbackSuccess} role="status">
          <CheckCircle2 size={16} />
          <span>{success}</span>
          <button onClick={() => setSuccess("")} type="button">
            Dismiss
          </button>
        </div>
      ) : null}

      <section className={styles.summaryStrip} aria-label="Booth summary">
        <SummaryItem
          label="Booths recorded"
          value={booths.length}
          note="Historical and current"
        />
        <SummaryItem
          label="Active"
          value={activeCount}
          note="Available for current use"
          tone="green"
        />
        <SummaryItem
          label="Inactive"
          value={inactiveCount}
          note="Kept for history"
          tone="muted"
        />
      </section>

      <section className={styles.workspace}>
        <div className={styles.toolbar}>
          <label className={styles.searchField}>
            <Search aria-hidden="true" size={17} />
            <span className={styles.srOnly}>Search booth history</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search booth, location or staff…"
              value={query}
            />
            {query ? (
              <button
                aria-label="Clear search"
                onClick={() => setQuery("")}
                type="button"
              >
                <X size={14} />
              </button>
            ) : null}
          </label>
          <label className={styles.selectField}>
            <span>Status</span>
            <select
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              value={statusFilter}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
          <button
            className={styles.secondaryButton}
            disabled={!filtered.length}
            onClick={exportCsv}
            type="button"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>

        {!booths.length ? (
          <EmptyState
            action={
              canCreate ? (
                <button
                  className={styles.primaryButton}
                  onClick={() => setShowCreate(true)}
                  type="button"
                >
                  <Plus size={16} /> Create first booth
                </button>
              ) : null
            }
            title="No booth history yet"
            text="Create an event booth when the business starts selling from a temporary location."
          />
        ) : !filtered.length ? (
          <EmptyState
            action={
              <button
                className={styles.secondaryButton}
                onClick={() => {
                  setQuery("");
                  setStatusFilter("ALL");
                }}
                type="button"
              >
                Clear filters
              </button>
            }
            title="No booths match these filters"
            text="Try another search or include both active and inactive records."
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Booth</th>
                  <th>Location</th>
                  <th>Dates</th>
                  <th>Responsible staff</th>
                  <th>Status</th>
                  <th>
                    <span className={styles.srOnly}>Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((booth) => (
                  <tr key={booth.id}>
                    <td data-label="Booth">
                      <div className={styles.boothCell}>
                        <span>
                          <TentTree size={17} />
                        </span>
                        <div>
                          <strong>{booth.name}</strong>
                          <small>{dateStateLabel(booth)}</small>
                        </div>
                      </div>
                    </td>
                    <td data-label="Location">
                      <span className={styles.iconText}>
                        <MapPin size={14} />
                        {booth.location}
                      </span>
                    </td>
                    <td data-label="Dates">
                      <span className={styles.iconText}>
                        <CalendarDays size={14} />
                        {dateRange(booth)}
                      </span>
                    </td>
                    <td data-label="Responsible staff">
                      <span className={styles.iconText}>
                        <UserRound size={14} />
                        {booth.responsibleStaffName ?? "Signed-in team member"}
                      </span>
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={booth.status} />
                    </td>
                    <td data-label="Action" className={styles.actionCell}>
                      {canUpdate ? (
                        <button
                          className={styles.rowAction}
                          onClick={() =>
                            setPendingStatus({
                              booth,
                              nextStatus:
                                booth.status === "ACTIVE"
                                  ? "INACTIVE"
                                  : "ACTIVE",
                            })
                          }
                          type="button"
                        >
                          {booth.status === "ACTIVE"
                            ? "Deactivate"
                            : "Activate"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length ? (
          <footer className={styles.tableFooter}>
            Showing {filtered.length} of {booths.length} booth records
          </footer>
        ) : null}
      </section>

      <section className={styles.historyNote}>
        <TentTree size={18} />
        <div>
          <strong>Inactive booths remain visible by design.</strong>
          <p>
            Deactivation stops current use but preserves the booth record for
            accurate sales history.
          </p>
        </div>
      </section>

      {showCreate ? (
        <CreateBoothDialog
          onClose={() => setShowCreate(false)}
          onCreated={async (name) => {
            setShowCreate(false);
            setSuccess(`${name} was created.`);
            await load("refresh");
          }}
          onError={setError}
        />
      ) : null}

      {pendingStatus ? (
        <StatusDialog
          busy={changingId === pendingStatus.booth.id}
          input={pendingStatus}
          onCancel={() => setPendingStatus(null)}
          onConfirm={() => void changeStatus()}
        />
      ) : null}
    </main>
  );
}

function CreateBoothDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: (name: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const input = {
      name: formText(data, "name").trim(),
      location: formText(data, "location").trim(),
      startDate: formText(data, "startDate"),
      endDate: formText(data, "endDate"),
    };
    if (!input.name || !input.location || !input.startDate || !input.endDate) {
      setFormError("Complete all booth fields before creating the record.");
      return;
    }
    if (input.endDate < input.startDate) {
      setFormError("End date cannot be before the start date.");
      return;
    }
    setSaving(true);
    setFormError("");
    onError("");
    try {
      await client.createSalesBooth(input);
      await onCreated(input.name);
    } catch (caught) {
      const message = messageFor(caught);
      setFormError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section
        aria-labelledby="create-booth-title"
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <header>
          <div>
            <p className={styles.eyebrow}>New event location</p>
            <h2 id="create-booth-title">Create Booth</h2>
          </div>
          <button
            aria-label="Close create booth dialog"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span>Booth name</span>
            <input
              autoFocus
              maxLength={120}
              name="name"
              placeholder="UIU Spring Fest 2026"
              required
            />
          </label>
          <label>
            <span>Location</span>
            <input
              maxLength={180}
              name="location"
              placeholder="United International University"
              required
            />
          </label>
          <div className={styles.formGrid}>
            <label>
              <span>Start date</span>
              <input name="startDate" required type="date" />
            </label>
            <label>
              <span>End date</span>
              <input name="endDate" required type="date" />
            </label>
          </div>
          <p className={styles.formHint}>
            <UserRound size={14} /> Responsible staff is assigned from the
            signed-in workforce context.
          </p>
          {formError ? (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          ) : null}
          <footer>
            <button
              className={styles.secondaryButton}
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.primaryButton}
              disabled={saving}
              type="submit"
            >
              {saving ? (
                <LoaderCircle className={styles.spin} size={15} />
              ) : (
                <Plus size={15} />
              )}{" "}
              Create Booth
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function StatusDialog({
  busy,
  input,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  input: PendingStatusChange;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const activating = input.nextStatus === "ACTIVE";
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section
        aria-labelledby="booth-status-title"
        aria-modal="true"
        className={styles.dialogSmall}
        role="dialog"
      >
        <TentTree size={24} />
        <h2 id="booth-status-title">
          {activating ? "Activate" : "Deactivate"} {input.booth.name}?
        </h2>
        <p>
          {activating
            ? "The booth will be available for current event sales again."
            : "The booth stays in history, but it will no longer be active for current use."}
        </p>
        <footer>
          <button
            className={styles.secondaryButton}
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Keep current status
          </button>
          <button
            className={activating ? styles.primaryButton : styles.dangerButton}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? <LoaderCircle className={styles.spin} size={15} /> : null}
            {activating ? "Activate Booth" : "Deactivate Booth"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SummaryItem({
  label,
  note,
  tone = "default",
  value,
}: {
  label: string;
  note: string;
  tone?: "default" | "green" | "muted";
  value: number;
}) {
  return (
    <article
      className={`${styles.summaryItem} ${tone === "green" ? styles.summaryGreen : tone === "muted" ? styles.summaryMuted : ""}`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function StatusBadge({ status }: { status: SalesBoothContract["status"] }) {
  return (
    <span
      className={
        status === "ACTIVE" ? styles.statusActive : styles.statusInactive
      }
    >
      <i />
      {status === "ACTIVE" ? "Active" : "Inactive"}
    </span>
  );
}

function EmptyState({
  action,
  text,
  title,
}: {
  action?: React.ReactNode;
  text: string;
  title: string;
}) {
  return (
    <div className={styles.emptyState}>
      <TentTree size={28} />
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}

function StatePanel({
  icon,
  text,
  title,
}: {
  icon: React.ReactNode;
  text: string;
  title: string;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel}>
        {icon}
        <div>
          <h1>{title}</h1>
          <p>{text}</p>
        </div>
      </section>
    </main>
  );
}

function dateRange(booth: SalesBoothContract) {
  return `${formatDate(booth.startDate)} – ${formatDate(booth.endDate)}`;
}

function dateStateLabel(booth: SalesBoothContract) {
  const today = new Date().toISOString().slice(0, 10);
  if (booth.endDate < today) return "Past event";
  if (booth.startDate > today) return "Upcoming event";
  return "Current event window";
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-BD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formText(data: FormData, field: string) {
  const value = data.get(field);
  return typeof value === "string" ? value : "";
}

function csvCell(value: string) {
  return `"${value.replace(/"/gu, '""')}"`;
}

function messageFor(caught: unknown) {
  if (caught instanceof AdminApiError) {
    if (caught.category === "AUTHENTICATION") return "Sign in is required.";
    if (caught.category === "AUTHORIZATION")
      return "Your role cannot perform this booth action.";
    if (caught.category === "CONCURRENCY")
      return "This booth changed. Refresh the page and try again.";
    return caught.message;
  }
  if (caught instanceof Error) return caught.message;
  return "The sales service could not complete this booth request.";
}
