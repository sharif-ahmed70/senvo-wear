"use client";

import type { RoleVisibilityContract } from "@senvo/contracts";
import {
  CircleAlert,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";
import styles from "./roles-permissions-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

export function RolesPermissionsWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("TEAM:READ");
  const [roles, setRoles] = useState<RoleVisibilityContract[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleVisibilityContract["role"] | null>(null);
  const [loading, setLoading] = useState(canRead);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!canRead) return;
      mode === "initial" ? setLoading(true) : setRefreshing(true);
      setError(null);
      try {
        const result = await client.listRoles();
        setRoles(result.data);
        setSelectedRole((current) =>
          current && result.data.some((role) => role.role === current)
            ? current
            : (result.data[0]?.role ?? null),
        );
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

  const selected = roles.find((role) => role.role === selectedRole) ?? null;
  const permissionGroups = useMemo(() => groupPermissions(selected), [selected]);

  if (!canRead) {
    return (
      <main className={styles.page}>
        <State
          icon={CircleAlert}
          title="Roles unavailable"
          text="Your role does not include team access."
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
          title="Loading roles"
          text="Getting the current workforce roles and permissions."
        />
      </main>
    );
  }

  if (error && roles.length === 0) {
    return (
      <main className={styles.page}>
        <State
          icon={CircleAlert}
          title="Roles could not be loaded"
          text={error}
          action={
            <button className={styles.secondaryButton} onClick={() => void load("refresh")} type="button">
              <RefreshCw aria-hidden="true" size={16} /> Retry
            </button>
          }
        />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Team &amp; settings</span>
          <h1>Roles &amp; Permissions</h1>
          <p>Understand what each fixed workforce role can access across SENVO operations.</p>
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

      <section className={styles.readOnlyNotice}>
        <ShieldCheck aria-hidden="true" size={18} />
        <div>
          <strong>Role access is read-only here</strong>
          <p>The current backend exposes role visibility, not role or permission editing.</p>
        </div>
      </section>

      {error ? (
        <div className={styles.error} role="alert">
          <CircleAlert aria-hidden="true" size={18} /> <span>{error}</span>
        </div>
      ) : null}

      {roles.length === 0 ? (
        <State
          icon={ShieldCheck}
          title="No role information available"
          text="Refresh to try loading the current role configuration again."
        />
      ) : (
        <>
          <section className={styles.roleGrid} aria-label="Workforce roles">
            {roles.map((role) => {
              const active = role.role === selectedRole;
              return (
                <button
                  aria-pressed={active}
                  className={`${styles.roleCard} ${active ? styles.roleCardActive : ""}`}
                  key={role.role}
                  onClick={() => setSelectedRole(role.role)}
                  type="button"
                >
                  <div className={styles.roleCardTop}>
                    <span className={styles.roleIcon} aria-hidden="true">
                      <ShieldCheck size={19} />
                    </span>
                    <span className={styles.permissionCount}>{role.permissions.length} permissions</span>
                  </div>
                  <strong>{role.name}</strong>
                  <span className={styles.roleCode}>{role.role}</span>
                  <p>{role.description}</p>
                </button>
              );
            })}
          </section>

          {selected ? (
            <section className={styles.detailPanel}>
              <header className={styles.detailHeader}>
                <div>
                  <span className={styles.eyebrow}>Selected role</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.description}</p>
                </div>
                <div className={styles.detailCount}>
                  <KeyRound aria-hidden="true" size={18} />
                  <span>{selected.permissions.length}</span>
                  <small>permissions</small>
                </div>
              </header>

              {permissionGroups.length === 0 ? (
                <State
                  icon={KeyRound}
                  title="No permissions exposed"
                  text="The current role contract does not expose any permissions for this role."
                />
              ) : (
                <div className={styles.permissionGroups}>
                  {permissionGroups.map((group) => (
                    <article className={styles.permissionGroup} key={group.resource}>
                      <div className={styles.permissionGroupHeading}>
                        <div>
                          <span className={styles.resourceMark} aria-hidden="true">
                            <ShieldCheck size={16} />
                          </span>
                          <div>
                            <strong>{friendlyResource(group.resource)}</strong>
                            <small>{group.actions.length} allowed actions</small>
                          </div>
                        </div>
                      </div>
                      <div className={styles.actionList}>
                        {group.actions.map((action) => (
                          <span className={styles.actionChip} key={`${group.resource}:${action}`}>
                            {friendlyAction(action)}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

function groupPermissions(role: RoleVisibilityContract | null) {
  if (!role) return [];
  const grouped = new Map<string, string[]>();
  for (const permission of role.permissions) {
    const actions = grouped.get(permission.resource) ?? [];
    if (!actions.includes(permission.action)) actions.push(permission.action);
    grouped.set(permission.resource, actions);
  }
  return [...grouped.entries()]
    .map(([resource, actions]) => ({ resource, actions: actions.sort() }))
    .sort((a, b) => a.resource.localeCompare(b.resource));
}

function friendlyResource(resource: string) {
  return resource
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function friendlyAction(action: string) {
  return action.charAt(0) + action.slice(1).toLowerCase();
}

function State({
  action,
  icon: Icon,
  loading = false,
  text,
  title,
}: {
  action?: React.ReactNode;
  icon: typeof ShieldCheck;
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
        {action ? <div className={styles.stateAction}>{action}</div> : null}
      </div>
    </section>
  );
}

function messageFor(reason: unknown) {
  if (!(reason instanceof AdminApiError)) {
    return "Role information could not be loaded. Try again.";
  }
  return reason.message;
}
