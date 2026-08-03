"use client";

import type {
  SalesBoothContract,
  SalesSourceSummaryContract,
} from "@senvo/contracts";
import {
  CalendarDays,
  CircleAlert,
  LoaderCircle,
  MapPin,
  Plus,
  RadioTower,
  Store,
  TentTree,
  UserRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});
const sourceDetails = {
  ONLINE: {
    description: "Orders placed through your online shop.",
    icon: RadioTower,
    name: "Online sales",
  },
  OFFLINE_STORE: {
    description: "Sales completed at a permanent store.",
    icon: Store,
    name: "Store sales",
  },
  EVENT_BOOTH: {
    description: "Sales made at fairs, festivals, and temporary booths.",
    icon: TentTree,
    name: "Event booth sales",
  },
} as const;

export function SalesSourceWorkspace({
  permissions,
  view,
}: {
  permissions: readonly AdminPermissionKey[];
  view: "booths" | "channels";
}) {
  if (!permissions.includes("SALES:READ")) return <AccessMessage />;
  return view === "channels" ? (
    <SalesChannels />
  ) : (
    <BoothHistory
      canCreate={permissions.includes("SALES:CREATE")}
      canUpdate={permissions.includes("SALES:UPDATE")}
    />
  );
}

function SalesChannels() {
  const [summary, setSummary] = useState<SalesSourceSummaryContract | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    client
      .getSalesSourceSummary()
      .then((result) => setSummary(result.data))
      .catch((reason: unknown) => setError(messageFor(reason)));
  }, []);
  return (
    <main className="source-page">
      <PageHeading
        eyebrow="Sales"
        title="Sales Sources"
        subtitle="See where your orders come from across online, stores, and events."
      />
      {error ? <ErrorMessage message={error} /> : null}
      {!summary && !error ? (
        <LoadingMessage label="Loading sales sources" />
      ) : null}
      {summary ? (
        <section
          className="source-channel-grid"
          aria-label="Sales source summary"
        >
          {summary.channels.map((channel) => {
            const detail = sourceDetails[channel.salesChannel];
            const Icon = detail.icon;
            return (
              <article className="source-channel" key={channel.salesChannel}>
                <Icon aria-hidden="true" size={22} />
                <div>
                  <h2>{detail.name}</h2>
                  <p>{detail.description}</p>
                </div>
                <dl>
                  <div>
                    <dt>Orders</dt>
                    <dd>{channel.orderCount}</dd>
                  </div>
                  <div>
                    <dt>Sales</dt>
                    <dd>{money(channel.totalMinor)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
          {summary.legacyOrderCount > 0 ? (
            <p className="source-note">
              {summary.legacyOrderCount} earlier orders keep their original
              source labels for accurate history.
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function BoothHistory({
  canCreate,
  canUpdate,
}: {
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const [booths, setBooths] = useState<SalesBoothContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBooths((await client.listSalesBooths()).data);
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    client
      .listSalesBooths()
      .then((result) => {
        if (active) setBooths(result.data);
      })
      .catch((reason: unknown) => {
        if (active) setError(messageFor(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function changeStatus(booth: SalesBoothContract) {
    const next = booth.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (
      !window.confirm(
        `${next === "ACTIVE" ? "Activate" : "Deactivate"} ${booth.name}?`,
      )
    )
      return;
    setError(null);
    setSuccess(null);
    try {
      await client.updateSalesBoothStatus({
        boothId: booth.id,
        expectedVersion: booth.version,
        status: next,
      });
      setSuccess(
        `${booth.name} is now ${next === "ACTIVE" ? "active" : "inactive"}.`,
      );
      await load();
    } catch (reason) {
      setError(messageFor(reason));
    }
  }
  return (
    <main className="source-page">
      <PageHeading
        eyebrow="Sales"
        title="Booth History"
        subtitle="Keep a clear history of temporary event sales locations."
        action={
          canCreate ? (
            <button
              className="source-primary"
              onClick={() => setShowForm((value) => !value)}
              type="button"
            >
              <Plus size={16} />
              New booth
            </button>
          ) : null
        }
      />
      {showForm ? (
        <BoothForm
          onCreated={(name) => {
            setShowForm(false);
            setSuccess(`${name} was created.`);
            return load();
          }}
          onError={setError}
        />
      ) : null}
      {success ? (
        <p className="source-feedback source-feedback--success">{success}</p>
      ) : null}
      {error ? <ErrorMessage message={error} /> : null}
      {loading ? <LoadingMessage label="Loading booth history" /> : null}
      {!loading && booths.length === 0 ? (
        <section className="source-empty">
          <TentTree size={28} />
          <h2>No booth history yet</h2>
          <p>Create your first event booth when you are ready.</p>
        </section>
      ) : null}
      {!loading && booths.length > 0 ? (
        <BoothTable
          booths={booths}
          canUpdate={canUpdate}
          onStatus={(booth) => {
            void changeStatus(booth);
          }}
        />
      ) : null}
    </main>
  );
}

function BoothForm({
  onCreated,
  onError,
}: {
  onCreated: (name: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    onError("");
    const data = new FormData(event.currentTarget);
    const input = {
      name: formText(data, "name"),
      location: formText(data, "location"),
      startDate: formText(data, "startDate"),
      endDate: formText(data, "endDate"),
    };
    try {
      await client.createSalesBooth(input);
      await onCreated(input.name);
    } catch (reason) {
      onError(messageFor(reason));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="source-form"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <h2>Create event booth</h2>
      <div className="source-form-grid">
        <label>
          Booth name
          <input name="name" placeholder="UIU Spring Fest 2026" required />
        </label>
        <label>
          Location
          <input
            name="location"
            placeholder="United International University"
            required
          />
        </label>
        <label>
          Start date
          <input name="startDate" required type="date" />
        </label>
        <label>
          End date
          <input name="endDate" required type="date" />
        </label>
      </div>
      <p className="source-form-note">
        <UserRound size={15} />
        Responsible staff will be set to the signed-in team member.
      </p>
      <button className="source-primary" disabled={saving} type="submit">
        {saving ? (
          <LoaderCircle className="source-spin" size={16} />
        ) : (
          <Plus size={16} />
        )}
        Create booth
      </button>
    </form>
  );
}

function BoothTable({
  booths,
  canUpdate,
  onStatus,
}: {
  booths: SalesBoothContract[];
  canUpdate: boolean;
  onStatus: (booth: SalesBoothContract) => void;
}) {
  return (
    <section className="source-table-wrap">
      <table className="source-table">
        <thead>
          <tr>
            <th>Booth</th>
            <th>Location</th>
            <th>Dates</th>
            <th>Responsible staff</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {booths.map((booth) => (
            <tr key={booth.id}>
              <td data-label="Booth">
                <strong>{booth.name}</strong>
              </td>
              <td data-label="Location">
                <span>
                  <MapPin size={14} />
                  {booth.location}
                </span>
              </td>
              <td data-label="Dates">
                <span>
                  <CalendarDays size={14} />
                  {dateRange(booth)}
                </span>
              </td>
              <td data-label="Responsible staff">
                {booth.responsibleStaffName ?? "Team member"}
              </td>
              <td data-label="Status">
                <span
                  className={`source-status source-status--${booth.status.toLowerCase()}`}
                >
                  {booth.status === "ACTIVE" ? "Active" : "Inactive"}
                </span>
              </td>
              <td data-label="Action">
                {canUpdate ? (
                  <button
                    className="source-secondary"
                    onClick={() => onStatus(booth)}
                    type="button"
                  >
                    {booth.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className="source-header">
      <div>
        <p className="page-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}
function AccessMessage() {
  return (
    <main className="source-page">
      <section className="source-empty">
        <CircleAlert size={28} />
        <h1>Sales access needed</h1>
        <p>Ask a business owner to give you access to sales information.</p>
      </section>
    </main>
  );
}
function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="source-feedback source-feedback--error">
      <CircleAlert size={16} />
      {message}
    </p>
  );
}
function LoadingMessage({ label }: { label: string }) {
  return (
    <p className="source-loading">
      <LoaderCircle className="source-spin" size={18} />
      {label}
    </p>
  );
}
function messageFor(error: unknown) {
  return error instanceof AdminApiError
    ? `${error.message} Request ID: ${error.requestId}`
    : "Something went wrong. Please try again.";
}
function formText(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value : "";
}
function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value / 100);
}
function dateRange(booth: SalesBoothContract) {
  return `${new Date(`${booth.startDate}T00:00:00Z`).toLocaleDateString("en-BD")} - ${new Date(`${booth.endDate}T00:00:00Z`).toLocaleDateString("en-BD")}`;
}
