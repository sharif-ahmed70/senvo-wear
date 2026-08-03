"use client";

import type {
  SalesBoothContract,
  SalesCounterContract,
  SalesSessionContract,
  StoreManagementContract,
} from "@senvo/contracts";
import {
  CircleAlert,
  Clock3,
  LoaderCircle,
  MonitorSmartphone,
  Plus,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

export function PosManagementWorkspace({
  permissions,
  view,
}: {
  permissions: readonly AdminPermissionKey[];
  view: "counters" | "sessions";
}) {
  if (!permissions.includes("POS:READ"))
    return (
      <main className="pos-page">
        <State
          icon={CircleAlert}
          title="Access unavailable"
          text="Your role does not include sales counter access."
        />
      </main>
    );
  return view === "counters" ? (
    <CounterManagement
      canCreate={permissions.includes("POS:CREATE")}
      canUpdate={permissions.includes("POS:UPDATE")}
    />
  ) : (
    <SessionManagement
      canCreate={permissions.includes("POS:CREATE")}
      canUpdate={permissions.includes("POS:UPDATE")}
    />
  );
}

function CounterManagement({
  canCreate,
  canUpdate,
}: {
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const [counters, setCounters] = useState<SalesCounterContract[]>([]);
  const [stores, setStores] = useState<StoreManagementContract[]>([]);
  const [booths, setBooths] = useState<SalesBoothContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [counterResult, storeResult, boothResult] = await Promise.all([
        client.listSalesCounters(),
        client.listStores(),
        client.listSalesBooths(),
      ]);
      setCounters(counterResult.data);
      setStores(storeResult.data.filter((item) => item.status === "ACTIVE"));
      setBooths(boothResult.data.filter((item) => item.status === "ACTIVE"));
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const form = new FormData(event.currentTarget);
    const type = formText(form, "type") as "STORE" | "EVENT_BOOTH";
    const sourceId = formText(form, "sourceId");
    try {
      await client.createSalesCounter({
        code: formText(form, "code"),
        name: formText(form, "name"),
        type,
        ...(type === "STORE" ? { branchId: sourceId } : { boothId: sourceId }),
      });
      event.currentTarget.reset();
      setShowForm(false);
      setSuccess("Sales counter created.");
      await load();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }
  async function toggle(counter: SalesCounterContract) {
    setError(null);
    try {
      await client.updateSalesCounterStatus({
        counterId: counter.id,
        expectedVersion: counter.version,
        status: counter.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      });
      setSuccess(
        counter.status === "ACTIVE"
          ? "Sales counter deactivated."
          : "Sales counter activated.",
      );
      await load();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }
  return (
    <main className="pos-page">
      <Header
        title="Sales Counters"
        subtitle="Manage the places where your team records in-person sales."
        action={
          canCreate ? (
            <button
              className="catalog-primary-button"
              onClick={() => setShowForm((value) => !value)}
              type="button"
            >
              <Plus size={17} />
              New counter
            </button>
          ) : null
        }
      />
      {showForm ? (
        <CounterForm
          booths={booths}
          stores={stores}
          onSubmit={(event) => void create(event)}
        />
      ) : null}
      <Feedback error={error} success={success} />
      {loading ? (
        <State
          icon={LoaderCircle}
          spin
          title="Loading counters"
          text="Getting your sales counter list."
        />
      ) : counters.length === 0 ? (
        <State
          icon={MonitorSmartphone}
          title="No sales counters yet"
          text="Create a counter for a store or event booth."
        />
      ) : (
        <div className="pos-table-wrap">
          <table className="pos-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Sales location</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {counters.map((counter) => (
                <tr key={counter.id}>
                  <td data-label="Name">
                    <strong>{counter.name}</strong>
                  </td>
                  <td data-label="Code">
                    <span className="pos-code">{counter.code}</span>
                  </td>
                  <td data-label="Sales location">
                    {counter.type === "STORE" ? "Store" : "Event booth"}
                  </td>
                  <td data-label="Status">
                    <Status value={counter.status} />
                  </td>
                  <td data-label="Action">
                    {canUpdate ? (
                      <button
                        className="source-secondary"
                        onClick={() => void toggle(counter)}
                        type="button"
                      >
                        {counter.status === "ACTIVE"
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
    </main>
  );
}

function CounterForm({
  booths,
  stores,
  onSubmit,
}: {
  booths: SalesBoothContract[];
  stores: StoreManagementContract[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [type, setType] = useState<"STORE" | "EVENT_BOOTH">("STORE");
  const sources = type === "STORE" ? stores : booths;
  return (
    <form className="pos-form" onSubmit={onSubmit}>
      <div className="pos-form__title">
        <MonitorSmartphone size={19} />
        <h2>Counter details</h2>
      </div>
      <label>
        Name
        <input
          name="name"
          maxLength={160}
          required
          placeholder="Main showroom counter"
        />
      </label>
      <label>
        Code
        <input name="code" maxLength={64} required placeholder="MAIN-01" />
      </label>
      <label>
        Counter type
        <select
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value as typeof type)}
        >
          <option value="STORE">Store</option>
          <option value="EVENT_BOOTH">Event booth</option>
        </select>
      </label>
      <label>
        {type === "STORE" ? "Store" : "Booth"}
        <select name="sourceId" required defaultValue="">
          <option value="" disabled>
            Select {type === "STORE" ? "a store" : "a booth"}
          </option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </label>
      <button className="catalog-primary-button" type="submit">
        Create counter
      </button>
    </form>
  );
}

function SessionManagement({
  canCreate,
  canUpdate,
}: {
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const [sessions, setSessions] = useState<SalesSessionContract[]>([]);
  const [counters, setCounters] = useState<SalesCounterContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const counterNames = useMemo(
    () => new Map(counters.map((counter) => [counter.id, counter.name])),
    [counters],
  );
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionResult, counterResult] = await Promise.all([
        client.listSalesSessions(),
        client.listSalesCounters(),
      ]);
      setSessions(sessionResult.data);
      setCounters(counterResult.data);
      setError(null);
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      await client.openSalesSession({
        counterId: formText(form, "counterId"),
      });
      setSuccess("Sales session opened.");
      setError(null);
      await load();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }
  async function close(session: SalesSessionContract) {
    try {
      await client.closeSalesSession({
        expectedVersion: session.version,
        sessionId: session.id,
      });
      setSuccess("Sales session closed.");
      setError(null);
      await load();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }
  const availableCounters = counters.filter(
    (counter) =>
      counter.status === "ACTIVE" &&
      !sessions.some(
        (session) =>
          session.counterId === counter.id && session.status === "OPEN",
      ),
  );
  return (
    <main className="pos-page">
      <Header
        title="Sales Sessions"
        subtitle="Open a working session before your team starts an in-person sale."
      />
      {canCreate ? (
        <form
          className="pos-session-open"
          onSubmit={(event) => void open(event)}
        >
          <label>
            Sales counter
            <select name="counterId" required defaultValue="">
              <option value="" disabled>
                Select a counter
              </option>
              {availableCounters.map((counter) => (
                <option key={counter.id} value={counter.id}>
                  {counter.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="catalog-primary-button"
            disabled={availableCounters.length === 0}
            type="submit"
          >
            <Clock3 size={17} />
            Start Selling
          </button>
        </form>
      ) : null}
      <Feedback error={error} success={success} />
      {loading ? (
        <State
          icon={LoaderCircle}
          spin
          title="Loading sessions"
          text="Getting sales session history."
        />
      ) : sessions.length === 0 ? (
        <State
          icon={Clock3}
          title="No sessions yet"
          text="Open a session when a counter is ready for sales."
        />
      ) : (
        <div className="pos-table-wrap">
          <table className="pos-table">
            <thead>
              <tr>
                <th>Counter</th>
                <th>Opened</th>
                <th>Closed</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td data-label="Counter">
                    <strong>
                      {counterNames.get(session.counterId) ?? "Sales counter"}
                    </strong>
                  </td>
                  <td data-label="Opened">{formatDate(session.openedAt)}</td>
                  <td data-label="Closed">
                    {session.closedAt ? formatDate(session.closedAt) : "-"}
                  </td>
                  <td data-label="Status">
                    <Status value={session.status} />
                  </td>
                  <td data-label="Action">
                    {canUpdate && session.status === "OPEN" ? (
                      <button
                        className="source-secondary"
                        onClick={() => void close(session)}
                        type="button"
                      >
                        Close session
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Header({
  action,
  subtitle,
  title,
}: {
  action?: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <header className="pos-header">
      <div>
        <p>Point of sale</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
      </div>
      {action}
    </header>
  );
}
function Feedback({
  error,
  success,
}: {
  error: string | null;
  success: string | null;
}) {
  return (
    <>
      {error ? (
        <p className="barcode-feedback barcode-feedback--error">
          <CircleAlert size={17} />
          {error}
        </p>
      ) : null}
      {success ? <p className="barcode-feedback">{success}</p> : null}
    </>
  );
}
function State({
  icon: Icon,
  spin,
  text,
  title,
}: {
  icon: typeof Clock3;
  spin?: boolean;
  text: string;
  title: string;
}) {
  return (
    <section className="pos-state">
      <Icon className={spin ? "barcode-spin" : undefined} size={27} />
      <strong>{title}</strong>
      <p>{text}</p>
    </section>
  );
}
function Status({
  value,
}: {
  value: "ACTIVE" | "CLOSED" | "INACTIVE" | "OPEN";
}) {
  return (
    <span className={`pos-status pos-status--${value.toLowerCase()}`}>
      {value === "OPEN"
        ? "Open"
        : value === "CLOSED"
          ? "Closed"
          : value === "ACTIVE"
            ? "Active"
            : "Inactive"}
    </span>
  );
}
function messageFor(reason: unknown) {
  return reason instanceof AdminApiError
    ? reason.message
    : "Something went wrong. Please try again.";
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formText(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value : "";
}
