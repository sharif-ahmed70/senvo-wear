"use client";

import type { TeamMemberContract } from "@senvo/contracts";
import {
  Check,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";
import styles from "./team-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type StatusFilter = "ALL" | TeamMemberContract["status"];
type RoleFilter = "ALL" | TeamMemberContract["role"];

const roles: TeamMemberContract["role"][] = ["OWNER", "ADMIN", "MANAGER", "STAFF"];

export function TeamWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("TEAM:READ");
  const canUpdate = permissions.includes("TEAM:UPDATE");

  const [members, setMembers] = useState<TeamMemberContract[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
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
        const result = await client.listTeam();
        setMembers(result.data);
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

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return members.filter((member) => {
      if (statusFilter !== "ALL" && member.status !== statusFilter) return false;
      if (roleFilter !== "ALL" && member.role !== roleFilter) return false;
      if (!normalized) return true;
      return `${member.name ?? ""} ${member.email}`.toLowerCase().includes(normalized);
    });
  }, [members, query, roleFilter, statusFilter]);

  const activeCount = members.filter((member) => member.status === "ACTIVE").length;
  const inactiveCount = members.filter((member) => member.status === "INACTIVE").length;
  const initialLoadFailed = Boolean(error && members.length === 0);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await client.createTeamMember({
        email: requiredText(form, "email"),
        name: requiredText(form, "name"),
        role: roleValue(form),
      });
      setMembers((current) => [...current, result.data]);
      setFormOpen(false);
      setSuccess("Team member added.");
      formElement.reset();
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(member: TeamMemberContract, role: TeamMemberContract["role"]) {
    if (changingId || role === member.role) return;
    const confirmed = window.confirm(
      `Change ${member.name ?? member.email}'s role to ${friendlyRole(role)}?`,
    );
    if (!confirmed) return;

    setChangingId(member.id);
    setError(null);
    setSuccess(null);
    try {
      const result = await client.assignTeamMemberRole({
        expectedVersion: member.version,
        role,
        teamMemberId: member.id,
      });
      replaceMember(result.data);
      setSuccess("Team member role updated.");
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setChangingId(null);
    }
  }

  async function changeStatus(member: TeamMemberContract) {
    if (changingId) return;
    const status = member.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const confirmed = window.confirm(
      `${status === "ACTIVE" ? "Activate" : "Deactivate"} ${member.name ?? member.email}?`,
    );
    if (!confirmed) return;

    setChangingId(member.id);
    setError(null);
    setSuccess(null);
    try {
      const result = await client.updateTeamMemberStatus({
        expectedVersion: member.version,
        status,
        teamMemberId: member.id,
      });
      replaceMember(result.data);
      setSuccess(`Team member ${status === "ACTIVE" ? "activated" : "deactivated"}.`);
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setChangingId(null);
    }
  }

  function replaceMember(member: TeamMemberContract) {
    setMembers((current) => current.map((item) => (item.id === member.id ? member : item)));
  }

  if (!canRead) {
    return (
      <main className={styles.page}>
        <State
          icon={CircleAlert}
          title="Team unavailable"
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
          title="Loading team"
          text="Getting current team members, roles and access status."
        />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Team &amp; settings</span>
          <h1>Team</h1>
          <p>Manage workforce membership, business roles and active access.</p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryButton}
            disabled={refreshing || saving || changingId !== null}
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
            <button
              className={styles.primaryButton}
              onClick={() => {
                setFormOpen(true);
                setError(null);
                setSuccess(null);
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={17} /> Add team member
            </button>
          ) : null}
        </div>
      </header>

      {!initialLoadFailed ? (
        <section className={styles.summary} aria-label="Team summary">
          <div><span>Total members</span><strong>{members.length}</strong></div>
          <div><span>Active</span><strong>{activeCount}</strong></div>
          <div><span>Inactive</span><strong>{inactiveCount}</strong></div>
        </section>
      ) : null}

      {error && !initialLoadFailed ? (
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
        <section className={styles.formPanel} aria-labelledby="team-form-heading">
          <div className={styles.formIntro}>
            <span className={styles.eyebrow}>New team member</span>
            <h2 id="team-form-heading">Add workforce access</h2>
            <p>This creates team membership only. Password or login credentials are not created here.</p>
          </div>
          <form onSubmit={(event) => void addMember(event)}>
            <label>
              Name
              <input maxLength={160} name="name" placeholder="Employee name" required />
            </label>
            <label>
              Email
              <input maxLength={254} name="email" placeholder="employee@business.com" required type="email" />
            </label>
            <label>
              Role
              <select defaultValue="STAFF" name="role">
                {roles.map((role) => (
                  <option key={role} value={role}>{friendlyRole(role)}</option>
                ))}
              </select>
            </label>
            <div className={styles.formActions}>
              <button
                className={styles.secondaryButton}
                disabled={saving}
                onClick={() => setFormOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={16} /> Cancel
              </button>
              <button className={styles.primaryButton} disabled={saving} type="submit">
                {saving ? (
                  <LoaderCircle aria-hidden="true" className={styles.spin} size={16} />
                ) : (
                  <Check aria-hidden="true" size={16} />
                )}
                {saving ? "Adding member" : "Add member"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className={styles.listPanel}>
        <div className={styles.listHeader}>
          <div>
            <span className={styles.eyebrow}>People directory</span>
            <h2>Team members</h2>
          </div>
          <div className={styles.filters}>
            <label className={styles.search}>
              <Search aria-hidden="true" size={16} />
              <input
                aria-label="Search team members"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or email"
                value={query}
              />
            </label>
            <label>
              <span className="sr-only">Team status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Team role</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
                <option value="ALL">All roles</option>
                {roles.map((role) => (
                  <option key={role} value={role}>{friendlyRole(role)}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {initialLoadFailed ? (
          <State icon={CircleAlert} title="Team could not be loaded" text="Refresh to try loading team members again." />
        ) : members.length === 0 ? (
          <State icon={UsersRound} title="No team members yet" text="Add the first workforce member when access is needed." />
        ) : filteredMembers.length === 0 ? (
          <State icon={Search} title="No team members match" text="Try another name, email, role or status." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Role</th>
                  <th>Store access</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id}>
                    <td data-label="Team member">
                      <div className={styles.person}>
                        <span className={styles.avatar} aria-hidden="true">{initials(member.name ?? member.email)}</span>
                        <div>
                          <strong>{member.name ?? "Name not provided"}</strong>
                          <small>{member.email}</small>
                        </div>
                      </div>
                    </td>
                    <td data-label="Role">
                      {canUpdate ? (
                        <label className={styles.roleControl}>
                          <ShieldCheck aria-hidden="true" size={14} />
                          <select
                            aria-label={`Role for ${member.name ?? member.email}`}
                            disabled={changingId !== null}
                            onChange={(event) => void changeRole(member, event.target.value as TeamMemberContract["role"])}
                            value={member.role}
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>{friendlyRole(role)}</option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span>{friendlyRole(member.role)}</span>
                      )}
                    </td>
                    <td data-label="Store access">{member.storeAccess}</td>
                    <td data-label="Status">
                      <span className={`${styles.status} ${member.status === "ACTIVE" ? styles.statusActive : styles.statusInactive}`}>
                        {member.status === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td data-label="Action">
                      {canUpdate ? (
                        <button
                          className={styles.statusButton}
                          disabled={changingId !== null}
                          onClick={() => void changeStatus(member)}
                          type="button"
                        >
                          {changingId === member.id ? (
                            <LoaderCircle aria-hidden="true" className={styles.spin} size={14} />
                          ) : (
                            <UserRound aria-hidden="true" size={14} />
                          )}
                          {changingId === member.id
                            ? "Updating"
                            : member.status === "ACTIVE"
                              ? "Deactivate"
                              : "Activate"}
                        </button>
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
  icon: typeof UsersRound;
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

function roleValue(form: FormData): TeamMemberContract["role"] {
  const value = requiredText(form, "role") as TeamMemberContract["role"];
  return roles.includes(value) ? value : "STAFF";
}

function friendlyRole(role: TeamMemberContract["role"]) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function requiredText(form: FormData, field: string) {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "TM";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function messageFor(reason: unknown) {
  if (!(reason instanceof AdminApiError)) {
    return "Team information could not be updated. Try again.";
  }
  if (reason.code === "CONCURRENCY.CONFLICT") {
    return "This team member changed after you opened the page. Refresh before trying again.";
  }
  if (reason.code === "VALIDATION.INVALID_INPUT") {
    return "Review the team member details and try again.";
  }
  return reason.message;
}
