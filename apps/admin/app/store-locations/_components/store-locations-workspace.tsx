"use client";

import type { StoreManagementContract } from "@senvo/contracts";
import {
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";
import styles from "./store-locations-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

export function StoreLocationsWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("ORGANIZATION:READ");
  const canUpdate = permissions.includes("ORGANIZATION:UPDATE");

  const [stores, setStores] = useState<StoreManagementContract[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [editing, setEditing] = useState<StoreManagementContract | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(canRead);
  const [refreshing, setRefreshing] = useState(false);
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
        const result = await client.listStores();
        setStores(result.data);
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

  const filteredStores = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return stores.filter((store) => {
      if (statusFilter !== "ALL" && store.status !== statusFilter) return false;
      if (!normalized) return true;
      return [store.name, store.code, store.city ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [query, statusFilter, stores]);

  const activeCount = stores.filter((store) => store.status === "ACTIVE").length;
  const inactiveCount = stores.filter((store) => store.status === "INACTIVE").length;

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
    setError(null);
    setSuccess(null);
  }

  function openEdit(store: StoreManagementContract) {
    setEditing(store);
    setFormOpen(true);
    setError(null);
    setSuccess(null);
  }

  function closeForm() {
    if (saving) return;
    setEditing(null);
    setFormOpen(false);
  }

  async function saveStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const shared = {
      address: optionalText(form, "address"),
      city: optionalText(form, "city"),
      name: requiredText(form, "name"),
      phone: optionalText(form, "phone"),
    };

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = editing
        ? await client.updateStore({
            ...shared,
            expectedVersion: editing.version,
            storeId: editing.id,
          })
        : await client.createStore({
            ...shared,
            code: requiredText(form, "code"),
          });

      setStores((current) =>
        editing
          ? current.map((store) => (store.id === result.data.id ? result.data : store))
          : [result.data, ...current],
      );
      setSuccess(editing ? "Store details updated." : "Store location added.");
      setEditing(null);
      setFormOpen(false);
      formElement.reset();
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(store: StoreManagementContract) {
    if (changingId) return;
    const status = store.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const confirmed = window.confirm(
      `${status === "ACTIVE" ? "Activate" : "Deactivate"} ${store.name}?`,
    );
    if (!confirmed) return;

    setChangingId(store.id);
    setError(null);
    setSuccess(null);
    try {
      const result = await client.updateStoreStatus({
        expectedVersion: store.version,
        status,
        storeId: store.id,
      });
      setStores((current) =>
        current.map((item) => (item.id === result.data.id ? result.data : item)),
      );
      setSuccess(`${store.name} ${status === "ACTIVE" ? "activated" : "deactivated"}.`);
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setChangingId(null);
    }
  }

  if (!canRead) {
    return (
      <main className={styles.page}>
        <State
          icon={CircleAlert}
          title="Store locations unavailable"
          text="Your role does not include organization access."
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
          title="Loading store locations"
          text="Getting your current store directory."
        />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Team &amp; settings</span>
          <h1>Store Locations</h1>
          <p>Manage the physical stores your team uses across the business.</p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryButton}
            disabled={refreshing || saving}
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
          {canUpdate ? (
            <button className={styles.primaryButton} onClick={openCreate} type="button">
              <Plus aria-hidden="true" size={17} /> Add store
            </button>
          ) : null}
        </div>
      </header>

      <section className={styles.summary} aria-label="Store summary">
        <div><span>Total stores</span><strong>{stores.length}</strong></div>
        <div><span>Active</span><strong>{activeCount}</strong></div>
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

      {formOpen && canUpdate ? (
        <section className={styles.formPanel} aria-labelledby="store-form-heading">
          <div className={styles.formIntro}>
            <span className={styles.eyebrow}>{editing ? "Edit store" : "New store"}</span>
            <h2 id="store-form-heading">{editing ? "Update store details" : "Add a store location"}</h2>
            <p>
              {editing
                ? "Store code stays fixed after creation."
                : "Use a short code your team will recognize."}
            </p>
          </div>
          <form onSubmit={(event) => void saveStore(event)}>
            <label>
              Store name
              <input defaultValue={editing?.name ?? ""} maxLength={160} name="name" required />
            </label>
            <label>
              Store code
              <input
                defaultValue={editing?.code ?? ""}
                disabled={Boolean(editing)}
                maxLength={64}
                name="code"
                pattern="[A-Za-z0-9-]+"
                required={!editing}
              />
            </label>
            <label className={styles.wide}>
              Address
              <input defaultValue={editing?.address ?? ""} maxLength={240} name="address" />
            </label>
            <label>
              City
              <input defaultValue={editing?.city ?? ""} maxLength={120} name="city" />
            </label>
            <label>
              Phone
              <input defaultValue={editing?.phone ?? ""} maxLength={40} name="phone" />
            </label>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} disabled={saving} onClick={closeForm} type="button">
                <X aria-hidden="true" size={16} /> Cancel
              </button>
              <button className={styles.primaryButton} disabled={saving} type="submit">
                {saving ? (
                  <LoaderCircle aria-hidden="true" className={styles.spin} size={16} />
                ) : (
                  <Check aria-hidden="true" size={16} />
                )}
                {saving ? "Saving" : editing ? "Save changes" : "Add store"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className={styles.listPanel}>
        <div className={styles.listHeader}>
          <div>
            <span className={styles.eyebrow}>Store directory</span>
            <h2>Your stores</h2>
          </div>
          <div className={styles.filters}>
            <label className={styles.search}>
              <Search aria-hidden="true" size={16} />
              <input
                aria-label="Search store locations"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, code or city"
                value={query}
              />
            </label>
            <label>
              <span className="sr-only">Store status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
          </div>
        </div>

        {stores.length === 0 ? (
          <State icon={Building2} title="No store locations yet" text="Add your first physical store location." />
        ) : filteredStores.length === 0 ? (
          <State icon={Search} title="No stores match" text="Try another search or status filter." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Code</th>
                  <th>Address</th>
                  <th>City</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStores.map((store) => (
                  <tr key={store.id}>
                    <td data-label="Store"><strong>{store.name}</strong></td>
                    <td data-label="Code"><span className={styles.code}>{store.code}</span></td>
                    <td data-label="Address">{store.address || "Not provided"}</td>
                    <td data-label="City">{store.city || "Not provided"}</td>
                    <td data-label="Phone">{store.phone || "Not provided"}</td>
                    <td data-label="Status">
                      <span className={`${styles.status} ${store.status === "ACTIVE" ? styles.statusActive : styles.statusInactive}`}>
                        {store.status === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td data-label="Actions">
                      {canUpdate ? (
                        <div className={styles.rowActions}>
                          <button disabled={saving || changingId !== null} onClick={() => openEdit(store)} type="button">
                            <Pencil aria-hidden="true" size={14} /> Edit
                          </button>
                          <button
                            disabled={saving || changingId !== null}
                            onClick={() => void changeStatus(store)}
                            type="button"
                          >
                            {changingId === store.id ? (
                              <LoaderCircle aria-hidden="true" className={styles.spin} size={14} />
                            ) : null}
                            {changingId === store.id
                              ? "Updating"
                              : store.status === "ACTIVE"
                                ? "Deactivate"
                                : "Activate"}
                          </button>
                        </div>
                      ) : (
                        <span className={styles.muted}>Restricted</span>
                      )}
                    </td>
                  </tr>
                ))}
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
  icon: typeof MapPin;
  loading?: boolean;
  text: string;
  title: string;
}) {
  return (
    <section className={styles.state}>
      <Icon aria-hidden="true" className={loading ? styles.spin : undefined} size={25} />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </section>
  );
}

function requiredText(form: FormData, field: string) {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(form: FormData, field: string) {
  const value = requiredText(form, field);
  return value || null;
}

function messageFor(reason: unknown) {
  if (!(reason instanceof AdminApiError)) {
    return "Store locations could not be updated. Try again.";
  }
  if (reason.code === "CONCURRENCY.CONFLICT") {
    return "This store changed after you opened it. Refresh before trying again.";
  }
  if (reason.code === "VALIDATION.INVALID_INPUT") {
    return "Review the store details and try again.";
  }
  return reason.message;
}
