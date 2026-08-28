"use client";

import type { SalesCounterContract, SalesSessionContract } from "@senvo/contracts";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Square,
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
import styles from "./sales-sessions-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type SessionFilter = "ALL" | "OPEN" | "CLOSED";

export function SalesSessionsWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("POS:READ");
  const canCreate = permissions.includes("POS:CREATE");
  const canUpdate = permissions.includes("POS:UPDATE");

  const [sessions, setSessions] = useState<SalesSessionContract[]>([]);
  const [counters, setCounters] = useState<SalesCounterContract[]>([]);
  const [counterId, setCounterId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SessionFilter>("ALL");
  const [loading, setLoading] = useState(canRead);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!canRead) return;
      mode === "initial" ? setLoading(true) : setRefreshing(true);
      setError(null);

      try {
        const [sessionResult, counterResult] = await Promise.all([
          client.listSalesSessions(),
          client.listSalesCounters(),
        ]);
        setSessions(sessionResult.data);
        setCounters(counterResult.data);
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

  const counterNames = useMemo(
    () => new Map(counters.map((counter) => [counter.id, counter.name])),
    [counters],
  );
  const counterCodes = useMemo(
    () => new Map(counters.map((counter) => [counter.id, counter.code])),
    [counters],
  );

  const availableCounters = useMemo(
    () =>
      counters.filter(
        (counter) =>
          counter.status === "ACTIVE" &&
          !sessions.some(
            (session) =>
              session.counterId === counter.id && session.status === "OPEN",
          ),
      ),
    [counters, sessions],
  );

  useEffect(() => {
    if (
      counterId &&
      !availableCounters.some((counter) => counter.id === counterId)
    ) {
      setCounterId("");
    }
  }, [availableCounters, counterId]);

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...sessions]
      .filter((session) =>
        statusFilter === "ALL" ? true : session.status === statusFilter,
      )
      .filter((session) => {
        if (!normalized) return true;
        const name = counterNames.get(session.counterId) ?? "";
        const code = counterCodes.get(session.counterId) ?? "";
        return `${name} ${code}`.toLowerCase().includes(normalized);
      })
      .sort(
        (left, right) =>
          new Date(right.openedAt).getTime() - new Date(left.openedAt).getTime(),
      );
  }, [counterCodes, counterNames, query, sessions, statusFilter]);

  const openCount = sessions.filter((session) => session.status === "OPEN").length;
  const closedCount = sessions.filter(
    (session) => session.status === "CLOSED",
  ).length;

  async function openSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!counterId || opening) return;

    setOpening(true);
    setError(null);
    setSuccess(null);
    try {
      await client.openSalesSession({ counterId });
      const counterName =
        counters.find((counter) => counter.id === counterId)?.name ??
        "Sales counter";
      setCounterId("");
      setSuccess(`${counterName} is ready for selling.`);
      await load("refresh");
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setOpening(false);
    }
  }

  async function closeSession(session: SalesSessionContract) {
    if (closingId) return;
    const counterName = counterNames.get(session.counterId) ?? "this counter";
    const confirmed = window.confirm(
      `Close the open sales session for ${counterName}? New sales will require another session to be opened.`,
    );
    if (!confirmed) return;

    setClosingId(session.id);
    setError(null);
    setSuccess(null);
    try {
      await client.closeSalesSession({
        expectedVersion: session.version,
        sessionId: session.id,
      });
      setSuccess(`${counterName} session closed.`);
      await load("refresh");
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setClosingId(null);
    }
  }

  if (!canRead) {
    return (
      <main className={styles.page}>
        <State
          icon={CircleAlert}
          title="Sales sessions unavailable"
          text="Your role does not include POS session access."
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
          title="Loading sales sessions"
          text="Checking counters and current session history."
        />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Point of sale</span>
          <h1>Sales Sessions</h1>
          <p>
            Open a counter before selling, then close the session when that
            counter is finished.
          </p>
        </div>
        <button
          className={styles.secondaryButton}
          disabled={refreshing}
          onClick={() => void load("refresh")}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={refreshing ? styles.spin : undefined}
            size={16}
          />
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </header>

      <section className={styles.summary} aria-label="Session summary">
        <div>
          <span>Open now</span>
          <strong>{openCount}</strong>
        </div>
        <div>
          <span>Closed</span>
          <strong>{closedCount}</strong>
        </div>
        <div>
          <span>Available counters</span>
          <strong>{availableCounters.length}</strong>
        </div>
      </section>

      {error ? (
        <div className={styles.error} role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className={styles.success} role="status">
          <CheckCircle2 aria-hidden="true" size={18} />
          <span>{success}</span>
        </div>
      ) : null}

      {canCreate ? (
        <section className={styles.openPanel}>
          <div>
            <span className={styles.eyebrow}>Start selling</span>
            <h2>Open a counter session</h2>
            <p>
              Only active counters without another open session are available.
            </p>
          </div>
          <form onSubmit={(event) => void openSession(event)}>
            <label>
              Sales counter
              <select
                disabled={opening || availableCounters.length === 0}
                required
                value={counterId}
                onChange={(event) => setCounterId(event.target.value)}
              >
                <option value="">
                  {availableCounters.length === 0
                    ? "No counter available"
                    : "Choose a counter"}
                </option>
                {availableCounters.map((counter) => (
                  <option key={counter.id} value={counter.id}>
                    {counter.name} ({counter.code})
                  </option>
                ))}
              </select>
            </label>
            <button
              className={styles.primaryButton}
              disabled={!counterId || opening}
              type="submit"
            >
              {opening ? (
                <LoaderCircle
                  aria-hidden="true"
                  className={styles.spin}
                  size={17}
                />
              ) : (
                <Play aria-hidden="true" size={17} />
              )}
              {opening ? "Opening session" : "Start selling"}
            </button>
          </form>
        </section>
      ) : null}

      <section className={styles.historyPanel}>
        <div className={styles.historyHeader}>
          <div>
            <span className={styles.eyebrow}>Counter history</span>
            <h2>Sessions</h2>
          </div>
          <div className={styles.filters}>
            <label className={styles.search}>
              <Search aria-hidden="true" size={16} />
              <input
                aria-label="Search sessions by counter"
                placeholder="Search counter name or code"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Session status</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as SessionFilter)
                }
              >
                <option value="ALL">All sessions</option>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </select>
            </label>
          </div>
        </div>

        {sessions.length === 0 ? (
          <State
            icon={Clock3}
            title="No sessions yet"
            text="Open a counter session when the team is ready to start selling."
          />
        ) : filteredSessions.length === 0 ? (
          <State
            icon={Search}
            title="No sessions match"
            text="Try another counter search or session status."
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Counter</th>
                  <th>Opened</th>
                  <th>Closed</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => {
                  const counterName =
                    counterNames.get(session.counterId) ?? "Sales counter";
                  const counterCode = counterCodes.get(session.counterId);
                  return (
                    <tr key={session.id}>
                      <td data-label="Counter">
                        <strong>{counterName}</strong>
                        {counterCode ? <span>{counterCode}</span> : null}
                      </td>
                      <td data-label="Opened">{formatDate(session.openedAt)}</td>
                      <td data-label="Closed">
                        {session.closedAt ? formatDate(session.closedAt) : "—"}
                      </td>
                      <td data-label="Status">
                        <span
                          className={`${styles.status} ${
                            session.status === "OPEN"
                              ? styles.statusOpen
                              : styles.statusClosed
                          }`}
                        >
                          {session.status === "OPEN" ? "Open" : "Closed"}
                        </span>
                      </td>
                      <td data-label="Action">
                        {canUpdate && session.status === "OPEN" ? (
                          <button
                            className={styles.closeButton}
                            disabled={closingId !== null}
                            onClick={() => void closeSession(session)}
                            type="button"
                          >
                            {closingId === session.id ? (
                              <LoaderCircle
                                aria-hidden="true"
                                className={styles.spin}
                                size={15}
                              />
                            ) : (
                              <Square aria-hidden="true" size={14} />
                            )}
                            {closingId === session.id
                              ? "Closing"
                              : "Close session"}
                          </button>
                        ) : session.status === "OPEN" ? (
                          <span className={styles.muted}>Restricted</span>
                        ) : (
                          <span className={styles.muted}>Completed</span>
                        )}
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

function State({
  icon: Icon,
  loading = false,
  text,
  title,
}: {
  icon: typeof Clock3;
  loading?: boolean;
  text: string;
  title: string;
}) {
  return (
    <section className={styles.state}>
      <Icon
        aria-hidden="true"
        className={loading ? styles.spin : undefined}
        size={25}
      />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function messageFor(reason: unknown) {
  if (!(reason instanceof AdminApiError)) {
    return "Sales sessions could not be updated. Try again.";
  }
  if (reason.code === "CONCURRENCY.CONFLICT") {
    return "This session changed. Refresh and try again.";
  }
  if (reason.code === "BUSINESS_RULE.VIOLATION") {
    return "The counter is not available for that session action. Refresh and review its current state.";
  }
  return reason.message;
}
