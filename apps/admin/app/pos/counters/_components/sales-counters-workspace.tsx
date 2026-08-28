"use client";

import type {
  SalesBoothContract,
  SalesCounterContract,
  SalesSessionContract,
  StoreManagementContract,
} from "@senvo/contracts";
import {
  CheckCircle2,
  CircleAlert,
  Download,
  LoaderCircle,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import styles from "./sales-counters-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type CounterStatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
type CounterTypeFilter = "ALL" | "STORE" | "EVENT_BOOTH";
type CounterType = Exclude<CounterTypeFilter, "ALL">;

export function SalesCountersWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("POS:READ");
  const canCreate = permissions.includes("POS:CREATE");
  const canUpdate = permissions.includes("POS:UPDATE");

  const [counters, setCounters] = useState<SalesCounterContract[]>([]);
  const [currentSessions, setCurrentSessions] = useState<SalesSessionContract[]>([]);
  const [stores, setStores] = useState<StoreManagementContract[]>([]);
  const [booths, setBooths] = useState<SalesBoothContract[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CounterStatusFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<CounterTypeFilter>("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<CounterType>("STORE");
  const [loading, setLoading] = useState(canRead);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!canRead) return;
      mode === "initial" ? setLoading(true) : setRefreshing(true);
      setError(null);
      try {
        const [counterResult, sessionResult] = await Promise.all([
          client.listSalesCounters(),
          client.listCurrentSalesSessions(),
        ]);
        setCounters(counterResult.data);
        setCurrentSessions(sessionResult.data);
      } catch (reason) {
        setError(messageFor(reason));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canRead],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openCounterIds = useMemo(
    () => new Set(currentSessions.map((session) => session.counterId)),
    [currentSessions],
  );

  const filteredCounters = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return counters.filter((counter) => {
      if (statusFilter !== "ALL" && counter.status !== statusFilter) return false;
      if (typeFilter !== "ALL" && counter.type !== typeFilter) return false;
      if (!normalized) return true;
      return `${counter.name} ${counter.code}`.toLowerCase().includes(normalized);
    });
  }, [counters, query, statusFilter, typeFilter]);

  const activeCount = counters.filter((counter) => counter.status === "ACTIVE").length;
  const inactiveCount = counters.filter((counter) => counter.status === "INACTIVE").length;
  const inUseCount = counters.filter((counter) => openCounterIds.has(counter.id)).length;

  async function openCreatePanel() {
    setShowCreate(true);
    setError(null);
    if (stores.length || booths.length || loadingSources) return;
    setLoadingSources(true);
    try {
      const [storeResult, boothResult] = await Promise.all([
        client.listStores(),
        client.listSalesBooths(),
      ]);
      setStores(storeResult.data.filter((item) => item.status === "ACTIVE"));
      setBooths(boothResult.data.filter((item) => item.status === "ACTIVE"));
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setLoadingSources(false);
    }
  }

  async function createCounter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const sourceId = formText(form, "sourceId");
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await client.createSalesCounter({
        code: formText(form, "code").trim(),
        name: formText(form, "name").trim(),
        type: createType,
        ...(createType === "STORE" ? { branchId: sourceId } : { boothId: sourceId }),
      });
      setSuccess("Sales counter created.");
      setShowCreate(false);
      formElement.reset();
      setCreateType("STORE");
      await load("refresh");
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(counter: SalesCounterContract) {
    if (changingId) return;
    const nextStatus = counter.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const confirmed = window.confirm(
      `${nextStatus === "ACTIVE" ? "Activate" : "Deactivate"} ${counter.name}?`,
    );
    if (!confirmed) return;

    setChangingId(counter.id);
    setError(null);
    setSuccess(null);
    try {
      await client.updateSalesCounterStatus({
        counterId: counter.id,
        expectedVersion: counter.version,
        status: nextStatus,
      });
      setSuccess(
        `${counter.name} ${nextStatus === "ACTIVE" ? "activated" : "deactivated"}.`,
      );
      await load("refresh");
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setChangingId(null);
    }
  }

  function exportCsv() {
    const rows = [
      ["Counter name", "Code", "Type", "Status", "Session"],
      ...filteredCounters.map((counter) => [
        counter.name,
        counter.code,
        counter.type === "STORE" ? "Store" : "Event booth",
        counter.status === "ACTIVE" ? "Active" : "Inactive",
        openCounterIds.has(counter.id) ? "Open" : "None",
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "senvo-sales-counters.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!canRead) {
    return (
      <main className={styles.page}>
        <State
          icon={CircleAlert}
          title="Sales counters unavailable"
          text="Your role does not include POS counter access."
        />
      </main>
    );
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <State
          icon={LoaderCircle}
          loading
          title="Loading sales counters"
          text="Checking counters and their current session state."
        />
      </main>
    );
  }

  const sources = createType === "STORE" ? stores : booths;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Point of sale</span>
          <h1>Sales Counters</h1>
          <p>
            Manage the store and event-booth counters your team can use for in-person sales.
          </p>
        </div>
        <div className={styles.headerActions}>
          {canCreate ? (
            <button className={styles.primaryButton} onClick={() => void openCreatePanel()} type="button">
              <Plus aria-hidden="true" size={17} /> Add counter
            </button>
          ) : null}
          <button className={styles.secondaryButton} disabled={refreshing} onClick={() => void load("refresh")} type="button">
            <RefreshCw aria-hidden="true" className={refreshing ? styles.spin : undefined} size={16} />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
          <button className={styles.secondaryButton} disabled={filteredCounters.length === 0} onClick={exportCsv} type="button">
            <Download aria-hidden="true" size={16} /> Export CSV
          </button>
        </div>
      </header>

      <section className={styles.summary} aria-label="Counter summary">
        <div><span>Total counters</span><strong>{counters.length}</strong></div>
        <div><span>Active</span><strong>{activeCount}</strong></div>
        <div><span>In use</span><strong>{inUseCount}</strong></div>
        <div><span>Inactive</span><strong>{inactiveCount}</strong></div>
      </section>

      {error ? (
        <div className={styles.error} role="alert">
          <CircleAlert aria-hidden="true" size={18} /> <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className={styles.success} role="status">
          <CheckCircle2 aria-hidden="true" size={18} /> <span>{success}</span>
        </div>
      ) : null}

      {showCreate && canCreate ? (
        <section className={styles.createPanel} aria-labelledby="create-counter-heading">
          <div className={styles.createIntro}>
            <span className={styles.eyebrow}>New counter</span>
            <h2 id="create-counter-heading">Add a sales counter</h2>
            <p>Bind the counter to one active store or event booth.</p>
          </div>
          <form onSubmit={(event) => void createCounter(event)}>
            <label>
              Counter name
              <input maxLength={160} name="name" placeholder="Flagship POS 01" required />
            </label>
            <label>
              Counter code
              <input maxLength={64} name="code" pattern="[A-Za-z0-9-]+" placeholder="FLAGSHIP-01" required />
            </label>
            <label>
              Counter type
              <select value={createType} onChange={(event) => setCreateType(event.target.value as CounterType)}>
                <option value="STORE">Store</option>
                <option value="EVENT_BOOTH">Event booth</option>
              </select>
            </label>
            <label>
              {createType === "STORE" ? "Store" : "Event booth"}
              <select key={createType} disabled={loadingSources || sources.length === 0} name="sourceId" required defaultValue="">
                <option value="" disabled>
                  {loadingSources
                    ? "Loading available locations"
                    : sources.length === 0
                      ? `No active ${createType === "STORE" ? "store" : "booth"} available`
                      : `Choose ${createType === "STORE" ? "a store" : "an event booth"}`}
                </option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>{source.name}</option>
                ))}
              </select>
            </label>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} disabled={saving} onClick={() => setShowCreate(false)} type="button">Cancel</button>
              <button className={styles.primaryButton} disabled={saving || loadingSources || sources.length === 0} type="submit">
                {saving ? <LoaderCircle aria-hidden="true" className={styles.spin} size={16} /> : <Plus aria-hidden="true" size={16} />}
                {saving ? "Creating" : "Create counter"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className={styles.listPanel}>
        <div className={styles.listHeader}>
          <div>
            <span className={styles.eyebrow}>Counter directory</span>
            <h2>Available sales points</h2>
          </div>
          <div className={styles.filters}>
            <label className={styles.search}>
              <Search aria-hidden="true" size={16} />
              <input aria-label="Search sales counters" placeholder="Search name or code" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label>
              <span className="sr-only">Counter status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CounterStatusFilter)}>
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Counter type</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as CounterTypeFilter)}>
                <option value="ALL">All types</option>
                <option value="STORE">Store</option>
                <option value="EVENT_BOOTH">Event booth</option>
              </select>
            </label>
          </div>
        </div>

        {counters.length === 0 ? (
          <State icon={MonitorSmartphone} title="No sales counters yet" text="Create a counter for an active store or event booth." />
        ) : filteredCounters.length === 0 ? (
          <State icon={Search} title="No counters match" text="Try another search, status, or counter type." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Counter</th><th>Code</th><th>Type</th><th>Status</th><th>Session</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filteredCounters.map((counter) => {
                  const inUse = openCounterIds.has(counter.id);
                  return (
                    <tr key={counter.id}>
                      <td data-label="Counter"><strong>{counter.name}</strong></td>
                      <td data-label="Code"><span className={styles.code}>{counter.code}</span></td>
                      <td data-label="Type">{counter.type === "STORE" ? "Store" : "Event booth"}</td>
                      <td data-label="Status">
                        <span className={`${styles.status} ${counter.status === "ACTIVE" ? styles.statusActive : styles.statusInactive}`}>
                          {counter.status === "ACTIVE" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td data-label="Session">
                        <span className={inUse ? styles.sessionOpen : styles.muted}>{inUse ? "Open session" : "No open session"}</span>
                      </td>
                      <td data-label="Action">
                        {canUpdate ? (
                          <button className={styles.statusButton} disabled={changingId !== null} onClick={() => void changeStatus(counter)} type="button">
                            {changingId === counter.id ? <LoaderCircle aria-hidden="true" className={styles.spin} size={15} /> : null}
                            {changingId === counter.id ? "Updating" : counter.status === "ACTIVE" ? "Deactivate" : "Activate"}
                          </button>
                        ) : <span className={styles.muted}>Restricted</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function State({ icon: Icon, loading = false, text, title }: { icon: typeof MonitorSmartphone; loading?: boolean; text: string; title: string }) {
  return (
    <section className={styles.state}>
      <Icon aria-hidden="true" className={loading ? styles.spin : undefined} size={25} />
      <div><strong>{title}</strong><p>{text}</p></div>
    </section>
  );
}

function formText(data: FormData, field: string) {
  const value = data.get(field);
  return typeof value === "string" ? value : "";
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function messageFor(reason: unknown) {
  if (!(reason instanceof AdminApiError)) return "Sales counters could not be updated. Try again.";
  if (reason.code === "CONCURRENCY.CONFLICT") return "This counter changed. Refresh and try again.";
  if (reason.code === "BUSINESS_RULE.VIOLATION") return "This counter action is not allowed in its current state. Refresh and review it again.";
  return reason.message;
}
