"use client";

import type {
  OrganizationProfileContract,
  RoleVisibilityContract,
  StoreManagementContract,
  TeamMemberContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  Building2,
  Check,
  ChevronDown,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../../_components/page-header";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { useAdminPermissions, useAdminSession } from "../../admin-shell";
import {
  TEAM_ROLES,
  assignableRolesFor,
  roleOptionLabel,
  teamRowAccess,
} from "../_lib/team-roles";

type OrganizationView = "profile" | "roles" | "stores" | "team";
type LoadState = "error" | "loading" | "ready";
const client = new AdminApiClient();

export function OrganizationWorkspace({
  permissions: propsPermissions,
  view,
}: {
  permissions?: readonly AdminPermissionKey[];
  view: OrganizationView;
}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const required =
    view === "team" || view === "roles" ? "TEAM:READ" : "ORGANIZATION:READ";
  if (!permissions.includes(required)) return <AccessNotice />;

  if (view === "profile")
    return (
      <ProfilePanel canUpdate={permissions.includes("ORGANIZATION:UPDATE")} />
    );
  if (view === "stores")
    return (
      <StoresPanel canUpdate={permissions.includes("ORGANIZATION:UPDATE")} />
    );
  if (view === "team")
    return <TeamPanel canUpdate={permissions.includes("TEAM:UPDATE")} />;
  return <RolesPanel />;
}

function ProfilePanel({ canUpdate }: { canUpdate: boolean }) {
  const [profile, setProfile] = useState<OrganizationProfileContract | null>(
    null,
  );
  const [state, setState] = useState<LoadState>("loading");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() {
    setState("loading");
    setError("");
    try {
      setProfile((await client.getOrganizationProfile()).data);
      setState("ready");
    } catch (caught) {
      setError(messageForError(caught));
      setState("error");
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);
  async function save(formData: FormData) {
    if (!profile) return;
    setError("");
    setMessage("");
    try {
      const result = await client.updateOrganizationProfile({
        addressLine1: optionalValue(formData, "addressLine1"),
        addressLine2: optionalValue(formData, "addressLine2"),
        businessName: stringValue(formData, "businessName"),
        city: optionalValue(formData, "city"),
        countryCode: stringValue(formData, "countryCode"),
        district: optionalValue(formData, "district"),
        email: optionalValue(formData, "email"),
        expectedVersion: profile.version,
        phone: optionalValue(formData, "phone"),
        postalCode: optionalValue(formData, "postalCode"),
        timezone: stringValue(formData, "timezone"),
      });
      setProfile(result.data);
      setEditing(false);
      setMessage("Business details saved successfully.");
    } catch (caught) {
      setError(messageForError(caught));
    }
  }
  return (
    <>
      <PageHeader
        description="Keep the details customers and your team use to identify the business."
        eyebrow="Team & Settings"
        title="Organization"
      />
      <section className="organization-section">
        <SectionHeading icon={Building2} title="Business profile">
          {canUpdate && profile ? (
            <button
              className="organization-secondary-button"
              onClick={() => setEditing((value) => !value)}
              type="button"
            >
              {editing ? (
                <X aria-hidden="true" size={16} />
              ) : (
                <Pencil aria-hidden="true" size={16} />
              )}
              {editing ? "Cancel" : "Edit details"}
            </button>
          ) : null}
        </SectionHeading>
        {message ? <SuccessNotice message={message} /> : null}
        {error && state !== "error" ? <InlineError message={error} /> : null}
        {state === "loading" ? (
          <LoadingRows label="Loading business details" />
        ) : null}
        {state === "error" ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : null}
        {state === "ready" && !profile ? (
          <EmptyState title="Business details are not available" />
        ) : null}
        {profile && state === "ready" ? (
          editing ? (
            <ProfileForm profile={profile} save={save} />
          ) : (
            <ProfileSummary profile={profile} />
          )
        ) : null}
      </section>
    </>
  );
}

function ProfileSummary({ profile }: { profile: OrganizationProfileContract }) {
  return (
    <dl className="organization-profile-grid">
      <ProfileValue label="Business name" value={profile.businessName} />
      <ProfileValue label="Business code" value={profile.businessCode} />
      <ProfileValue label="Country" value={profile.countryCode} />
      <ProfileValue label="Timezone" value={profile.timezone} />
      <ProfileValue label="Phone" value={profile.phone} />
      <ProfileValue label="Email" value={profile.email} />
      <ProfileValue label="Address" value={formatAddress(profile)} wide />
    </dl>
  );
}
function ProfileForm({
  profile,
  save,
}: {
  profile: OrganizationProfileContract;
  save: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={save} className="organization-form">
      <Field
        defaultValue={profile.businessName}
        label="Business name"
        name="businessName"
        placeholder="SENVO Wear"
        required
      />
      <Field
        defaultValue={profile.businessCode}
        disabled
        label="Business code"
        name="businessCode"
      />
      <Field
        defaultValue={profile.countryCode}
        label="Country code"
        maxLength={2}
        name="countryCode"
        placeholder="BD"
        required
      />
      <Field
        defaultValue={profile.timezone}
        label="Timezone"
        name="timezone"
        placeholder="Asia/Dhaka"
        required
      />
      <Field
        defaultValue={profile.phone ?? ""}
        label="Phone"
        name="phone"
        placeholder="+880 1XXX XXXXXX"
      />
      <Field
        defaultValue={profile.email ?? ""}
        label="Email"
        name="email"
        placeholder="hello@business.com"
        type="email"
      />
      <Field
        defaultValue={profile.addressLine1 ?? ""}
        label="Address line 1"
        name="addressLine1"
        placeholder="House, road or market"
        wide
      />
      <Field
        defaultValue={profile.addressLine2 ?? ""}
        label="Address line 2"
        name="addressLine2"
        placeholder="Floor or area, if needed"
        wide
      />
      <Field
        defaultValue={profile.city ?? ""}
        label="City"
        name="city"
        placeholder="Dhaka"
      />
      <Field
        defaultValue={profile.district ?? ""}
        label="District"
        name="district"
        placeholder="Dhaka"
      />
      <Field
        defaultValue={profile.postalCode ?? ""}
        label="Postal code"
        name="postalCode"
        placeholder="1207"
      />
      <div className="organization-form__actions">
        <button className="organization-primary-button" type="submit">
          <Check aria-hidden="true" size={16} />
          Save changes
        </button>
      </div>
    </form>
  );
}

function StoresPanel({ canUpdate }: { canUpdate: boolean }) {
  const [stores, setStores] = useState<StoreManagementContract[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StoreManagementContract | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() {
    setState("loading");
    try {
      setStores((await client.listStores()).data);
      setState("ready");
    } catch (caught) {
      setError(messageForError(caught));
      setState("error");
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);
  async function save(formData: FormData) {
    setError("");
    setMessage("");
    try {
      const shared = {
        address: optionalValue(formData, "address"),
        city: optionalValue(formData, "city"),
        name: stringValue(formData, "name"),
        phone: optionalValue(formData, "phone"),
      };
      const wasEditing = editing;
      const result = wasEditing
        ? await client.updateStore({
            ...shared,
            expectedVersion: wasEditing.version,
            storeId: wasEditing.id,
          })
        : await client.createStore({
            ...shared,
            code: stringValue(formData, "code"),
          });
      setStores(
        wasEditing
          ? stores.map((item) =>
              item.id === result.data.id ? result.data : item,
            )
          : [result.data, ...stores],
      );
      setEditing(null);
      setFormOpen(false);
      setMessage(wasEditing ? "Store details updated." : "New store added.");
    } catch (caught) {
      setError(messageForError(caught));
    }
  }
  async function toggle(store: StoreManagementContract) {
    const next = store.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (
      !window.confirm(
        `${next === "INACTIVE" ? "Deactivate" : "Activate"} ${store.name}?`,
      )
    )
      return;
    try {
      const result = await client.updateStoreStatus({
        expectedVersion: store.version,
        status: next,
        storeId: store.id,
      });
      setStores(
        stores.map((item) => (item.id === result.data.id ? result.data : item)),
      );
      setMessage(
        `${store.name} is now ${next === "ACTIVE" ? "active" : "inactive"}.`,
      );
    } catch (caught) {
      setError(messageForError(caught));
    }
  }
  return (
    <>
      <PageHeader
        description="Manage the places where your team serves customers."
        eyebrow="Team & Settings"
        title="Store locations"
      />
      <section className="organization-section">
        <SectionHeading icon={MapPin} title="Your stores">
          {canUpdate ? (
            <button
              className="organization-primary-button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
              Add store
            </button>
          ) : null}
        </SectionHeading>
        {message ? <SuccessNotice message={message} /> : null}
        {error && state !== "error" ? <InlineError message={error} /> : null}
        {formOpen ? (
          <StoreForm
            editing={editing}
            onCancel={() => {
              setEditing(null);
              setFormOpen(false);
            }}
            save={save}
          />
        ) : null}
        {state === "loading" ? <LoadingRows label="Loading stores" /> : null}
        {state === "error" ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : null}
        {state === "ready" && stores.length === 0 ? (
          <EmptyState title="No stores added yet" />
        ) : null}
        {state === "ready" && stores.length ? (
          <StoreList
            canUpdate={canUpdate}
            onEdit={(store) => {
              setEditing(store);
              setFormOpen(true);
            }}
            onToggle={(store) => void toggle(store)}
            stores={stores}
          />
        ) : null}
      </section>
    </>
  );
}
function StoreForm({
  editing,
  onCancel,
  save,
}: {
  editing: StoreManagementContract | null;
  onCancel: () => void;
  save: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={save} className="organization-form organization-form--boxed">
      <div className="organization-form__title">
        <div>
          <h3>{editing ? "Update store" : "Add a store"}</h3>
          <p>Use a short code your team will recognize.</p>
        </div>
        <button
          aria-label="Close form"
          className="organization-icon-button"
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </div>
      <Field
        defaultValue={editing?.name ?? ""}
        label="Store name"
        name="name"
        placeholder="Dhanmondi Store"
        required
      />
      <Field
        defaultValue={editing?.code ?? ""}
        disabled={Boolean(editing)}
        label="Store code"
        name="code"
        placeholder="DHANMONDI"
        required={!editing}
      />
      <Field
        defaultValue={editing?.address ?? ""}
        label="Address"
        name="address"
        placeholder="House, road or market"
        wide
      />
      <Field
        defaultValue={editing?.city ?? ""}
        label="City"
        name="city"
        placeholder="Dhaka"
      />
      <Field
        defaultValue={editing?.phone ?? ""}
        label="Phone"
        name="phone"
        placeholder="+880 1XXX XXXXXX"
      />
      <div className="organization-form__actions">
        <button
          className="organization-secondary-button"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button className="organization-primary-button" type="submit">
          <Check aria-hidden="true" size={16} />
          {editing ? "Save changes" : "Add store"}
        </button>
      </div>
    </form>
  );
}
function StoreList({
  canUpdate,
  onEdit,
  onToggle,
  stores,
}: {
  canUpdate: boolean;
  onEdit: (store: StoreManagementContract) => void;
  onToggle: (store: StoreManagementContract) => void;
  stores: StoreManagementContract[];
}) {
  return (
    <div className="organization-table-wrap">
      <table className="organization-table">
        <thead>
          <tr>
            <th>Store</th>
            <th>Code</th>
            <th>Address</th>
            <th>Phone</th>
            <th>Status</th>
            {canUpdate ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {stores.map((store) => (
            <tr key={store.id}>
              <td data-label="Store">
                <strong>{store.name}</strong>
              </td>
              <td data-label="Code">{store.code}</td>
              <td data-label="Address">
                {[store.address, store.city].filter(Boolean).join(", ") ||
                  "Not added"}
              </td>
              <td data-label="Phone">{store.phone ?? "Not added"}</td>
              <td data-label="Status">
                <StatusBadge status={store.status} />
              </td>
              {canUpdate ? (
                <td data-label="Actions">
                  <span className="organization-row-actions">
                    <button onClick={() => onEdit(store)} type="button">
                      Edit
                    </button>
                    <button onClick={() => onToggle(store)} type="button">
                      {store.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamPanel({ canUpdate }: { canUpdate: boolean }) {
  const session = useAdminSession();
  const actor = session ? { role: session.role, userId: session.userId } : null;
  const [members, setMembers] = useState<TeamMemberContract[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() {
    setState("loading");
    try {
      setMembers((await client.listTeam()).data);
      setState("ready");
    } catch (caught) {
      setError(messageForError(caught));
      setState("error");
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);
  async function add(formData: FormData) {
    try {
      const result = await client.createTeamMember({
        email: stringValue(formData, "email"),
        name: stringValue(formData, "name"),
        role: roleValue(formData),
      });
      setMembers([...members, result.data]);
      setFormOpen(false);
      setMessage("Team member added successfully.");
    } catch (caught) {
      setError(messageForError(caught));
    }
  }
  async function changeRole(
    member: TeamMemberContract,
    role: TeamMemberContract["role"],
  ) {
    if (
      !window.confirm(
        `Change ${member.name ?? member.email}'s role to ${friendlyRole(role)}?`,
      )
    )
      return;
    try {
      const result = await client.assignTeamMemberRole({
        expectedVersion: member.version,
        role,
        teamMemberId: member.id,
      });
      replaceMember(result.data);
      setMessage("Role updated successfully.");
    } catch (caught) {
      setError(messageForError(caught));
    }
  }
  async function toggle(member: TeamMemberContract) {
    const status = member.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (
      !window.confirm(
        `${status === "INACTIVE" ? "Deactivate" : "Activate"} ${member.name ?? member.email}?`,
      )
    )
      return;
    try {
      const result = await client.updateTeamMemberStatus({
        expectedVersion: member.version,
        status,
        teamMemberId: member.id,
      });
      replaceMember(result.data);
      setMessage("Team member status updated.");
    } catch (caught) {
      setError(messageForError(caught));
    }
  }
  function replaceMember(member: TeamMemberContract) {
    setMembers((current) =>
      current.map((item) => (item.id === member.id ? member : item)),
    );
  }
  return (
    <>
      <PageHeader
        description="Keep each employee's role and store access clear."
        eyebrow="Team & Settings"
        title="Team"
      />
      <section className="organization-section">
        <SectionHeading icon={UsersRound} title="Team members">
          {canUpdate ? (
            <button
              className="organization-primary-button"
              onClick={() => setFormOpen(true)}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
              Add team member
            </button>
          ) : null}
        </SectionHeading>
        {message ? <SuccessNotice message={message} /> : null}
        {error && state !== "error" ? <InlineError message={error} /> : null}
        <RoleLegend />
        {formOpen ? (
          <TeamForm
            assignable={assignableRolesFor(actor?.role ?? null)}
            onCancel={() => setFormOpen(false)}
            save={add}
          />
        ) : null}
        {state === "loading" ? <LoadingRows label="Loading team" /> : null}
        {state === "error" ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : null}
        {state === "ready" && members.length === 0 ? (
          <EmptyState title="No team members added yet" />
        ) : null}
        {state === "ready" && members.length ? (
          <TeamList
            actor={actor}
            canUpdate={canUpdate}
            members={members}
            onRoleChange={(member, role) => void changeRole(member, role)}
            onToggle={(member) => void toggle(member)}
          />
        ) : null}
      </section>
    </>
  );
}
function RoleLegend() {
  return (
    <dl className="organization-role-legend" aria-label="Role-এর মানে">
      {TEAM_ROLES.map((item) => (
        <div key={item.role}>
          <dt>{item.label}</dt>
          <dd>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

function TeamForm({
  assignable,
  onCancel,
  save,
}: {
  assignable: readonly TeamMemberContract["role"][];
  onCancel: () => void;
  save: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={save} className="organization-form organization-form--boxed">
      <div className="organization-form__title">
        <div>
          <h3>Add a team member</h3>
          <p>This creates team access only. No password or login is created.</p>
        </div>
        <button
          aria-label="Close form"
          className="organization-icon-button"
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </div>
      <Field label="Name" name="name" placeholder="Employee name" required />
      <Field
        label="Email"
        name="email"
        placeholder="employee@business.com"
        required
        type="email"
      />
      <label>
        <span>Role</span>
        <select defaultValue="STAFF" name="role">
          {TEAM_ROLES.map((item) => (
            <option
              disabled={!assignable.includes(item.role)}
              key={item.role}
              value={item.role}
            >
              {roleOptionLabel(item.role)}
            </option>
          ))}
        </select>
      </label>
      <div className="organization-form__actions">
        <button
          className="organization-secondary-button"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button className="organization-primary-button" type="submit">
          <Check aria-hidden="true" size={16} />
          Add team member
        </button>
      </div>
    </form>
  );
}
function TeamList({
  actor,
  canUpdate,
  members,
  onRoleChange,
  onToggle,
}: {
  actor: { role: TeamMemberContract["role"]; userId: string } | null;
  canUpdate: boolean;
  members: TeamMemberContract[];
  onRoleChange: (
    member: TeamMemberContract,
    role: TeamMemberContract["role"],
  ) => void;
  onToggle: (member: TeamMemberContract) => void;
}) {
  return (
    <div className="organization-table-wrap">
      <table className="organization-table">
        <thead>
          <tr>
            <th>Team member</th>
            <th>Role</th>
            <th>Store access</th>
            <th>Status</th>
            {canUpdate ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const access = teamRowAccess(actor, member, members);
            const editable = canUpdate && access.canChange;
            const assignable = assignableRolesFor(actor?.role ?? null);
            return (
              <tr key={member.id}>
                <td data-label="Team member">
                  <strong>
                    {member.name ?? "Name not added"}
                    {access.isSelf ? " (আপনি)" : ""}
                  </strong>
                  <small>{member.email}</small>
                </td>
                <td data-label="Role">
                  {editable ? (
                    <select
                      aria-label={`Role for ${member.name ?? member.email}`}
                      onChange={(event) =>
                        onRoleChange(
                          member,
                          event.target.value as TeamMemberContract["role"],
                        )
                      }
                      value={member.role}
                    >
                      {TEAM_ROLES.map((item) => (
                        <option
                          disabled={
                            item.role !== member.role &&
                            !assignable.includes(item.role)
                          }
                          key={item.role}
                          value={item.role}
                        >
                          {roleOptionLabel(item.role)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      {friendlyRole(member.role)}
                      {canUpdate && access.lockedReason ? (
                        <small>{access.lockedReason}</small>
                      ) : null}
                    </>
                  )}
                </td>
                <td data-label="Store access">{member.storeAccess}</td>
                <td data-label="Status">
                  <StatusBadge status={member.status} />
                </td>
                {canUpdate ? (
                  <td data-label="Action">
                    {editable ? (
                      <button
                        className="organization-text-button"
                        onClick={() => onToggle(member)}
                        type="button"
                      >
                        {member.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </button>
                    ) : (
                      <span aria-hidden="true">—</span>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RolesPanel() {
  const [roles, setRoles] = useState<RoleVisibilityContract[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  async function load() {
    setState("loading");
    try {
      setRoles((await client.listRoles()).data);
      setState("ready");
    } catch (caught) {
      setError(messageForError(caught));
      setState("error");
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <PageHeader
        description="Understand what each role can do without technical setup."
        eyebrow="Team & Settings"
        title="Roles"
      />
      <section className="organization-section">
        <SectionHeading icon={ShieldCheck} title="Business roles">
          <button
            aria-label="Refresh roles"
            className="organization-icon-button"
            onClick={() => void load()}
            title="Refresh"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} />
          </button>
        </SectionHeading>
        {state === "loading" ? <LoadingRows label="Loading roles" /> : null}
        {state === "error" ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : null}
        {state === "ready" && roles.length === 0 ? (
          <EmptyState title="Role information is not available" />
        ) : null}
        <div className="organization-role-grid">
          {roles.map((role) => (
            <article className="organization-role-card" key={role.role}>
              <ShieldCheck aria-hidden="true" size={20} />
              <h2>{role.name}</h2>
              <p>{roleDescription(role)}</p>
              <details>
                <summary>
                  View access details{" "}
                  <ChevronDown aria-hidden="true" size={15} />
                </summary>
                {role.permissions.length ? (
                  <ul>
                    {role.permissions.map((permission) => (
                      <li key={`${permission.resource}:${permission.action}`}>
                        {friendlyAccess(permission.resource, permission.action)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Access is assigned by the business owner.</p>
                )}
              </details>
            </article>
          ))}
        </div>
        {state === "ready" ? (
          <SuccessNotice message="Role information is up to date." />
        ) : null}
      </section>
    </>
  );
}

function SectionHeading({
  children,
  icon: Icon,
  title,
}: {
  children?: React.ReactNode;
  icon: typeof Building2;
  title: string;
}) {
  return (
    <header className="organization-section__heading">
      <div>
        <Icon aria-hidden="true" size={20} />
        <h2>{title}</h2>
      </div>
      {children}
    </header>
  );
}
function Field({
  defaultValue,
  disabled,
  label,
  maxLength,
  name,
  placeholder,
  required,
  type = "text",
  wide,
}: {
  defaultValue?: string;
  disabled?: boolean;
  label: string;
  maxLength?: number;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "organization-form__wide" : undefined}>
      <span>{label}</span>
      <input
        defaultValue={defaultValue}
        disabled={disabled}
        maxLength={maxLength}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}
function ProfileValue({
  label,
  value,
  wide,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "organization-profile-grid__wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value || "Not added"}</dd>
    </div>
  );
}
function StatusBadge({ status }: { status: "ACTIVE" | "INACTIVE" }) {
  return (
    <span
      className={`organization-status organization-status--${status.toLowerCase()}`}
    >
      {status === "ACTIVE" ? "Active" : "Inactive"}
    </span>
  );
}
function SuccessNotice({ message }: { message: string }) {
  return (
    <p className="organization-success" role="status">
      <Check aria-hidden="true" size={16} />
      {message}
    </p>
  );
}
function InlineError({ message }: { message: string }) {
  return (
    <p className="organization-error" role="alert">
      <AlertCircle aria-hidden="true" size={16} />
      {message}
    </p>
  );
}
function AccessNotice() {
  return (
    <>
      <PageHeader
        description="Business settings are shown according to your role."
        eyebrow="Team & Settings"
        title="Access restricted"
      />
      <section className="organization-inline-state">
        <ShieldCheck aria-hidden="true" size={22} />
        <div>
          <h2>This area is not available</h2>
          <p>
            Your account does not include access to this area. Ask a business
            owner for help.
          </p>
        </div>
      </section>
    </>
  );
}
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="organization-inline-state" role="alert">
      <AlertCircle aria-hidden="true" size={22} />
      <div>
        <h3>We could not load this information</h3>
        <p>{message}</p>
      </div>
      <button
        className="organization-secondary-button"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
function EmptyState({ title }: { title: string }) {
  return (
    <div className="organization-inline-state">
      <Building2 aria-hidden="true" size={22} />
      <div>
        <h3>{title}</h3>
        <p>Use the action above when you are ready to add the first one.</p>
      </div>
    </div>
  );
}
function LoadingRows({ label }: { label: string }) {
  return (
    <div aria-label={label} className="organization-loading">
      <LoaderCircle
        aria-hidden="true"
        className="organization-spin"
        size={20}
      />
      <span>Loading...</span>
    </div>
  );
}
function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function optionalValue(formData: FormData, key: string) {
  return stringValue(formData, key) || null;
}
function roleValue(formData: FormData): TeamMemberContract["role"] {
  const role = stringValue(formData, "role");
  return ["OWNER", "ADMIN", "MANAGER", "STAFF"].includes(role)
    ? (role as TeamMemberContract["role"])
    : "STAFF";
}
function friendlyRole(role: TeamMemberContract["role"]) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}
function formatAddress(profile: OrganizationProfileContract) {
  return (
    [
      profile.addressLine1,
      profile.addressLine2,
      profile.city,
      profile.district,
      profile.postalCode,
    ]
      .filter(Boolean)
      .join(", ") || null
  );
}
function roleDescription(role: RoleVisibilityContract) {
  if (role.role === "OWNER") return "Full business control";
  if (role.role === "MANAGER") return "Daily operation management";
  if (role.role === "STAFF") return "Assigned tasks only";
  return role.description;
}
function friendlyAccess(resource: string, action: string) {
  const area = resource.replaceAll("_", " ").toLowerCase();
  const verb =
    action === "READ"
      ? "View"
      : action === "UPDATE"
        ? "Manage"
        : action.charAt(0) + action.slice(1).toLowerCase();
  return `${verb} ${area}`;
}
function messageForError(error: unknown) {
  if (error instanceof AdminApiError)
    return `${error.message} Request ${error.requestId}.`;
  return "The service could not complete this request. Please try again.";
}
