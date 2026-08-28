"use client";

import type { OrganizationProfileContract } from "@senvo/contracts";
import {
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";
import styles from "./organization-profile-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

export function OrganizationProfileWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("ORGANIZATION:READ");
  const canUpdate = permissions.includes("ORGANIZATION:UPDATE");
  const [profile, setProfile] = useState<OrganizationProfileContract | null>(null);
  const [loading, setLoading] = useState(canRead);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!canRead) return;
      mode === "initial" ? setLoading(true) : setRefreshing(true);
      setError(null);
      try {
        const result = await client.getOrganizationProfile();
        setProfile(result.data);
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || saving) return;

    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await client.updateOrganizationProfile({
        addressLine1: optionalText(form, "addressLine1"),
        addressLine2: optionalText(form, "addressLine2"),
        businessName: requiredText(form, "businessName"),
        city: optionalText(form, "city"),
        countryCode: requiredText(form, "countryCode").toUpperCase(),
        district: optionalText(form, "district"),
        email: optionalText(form, "email"),
        expectedVersion: profile.version,
        phone: optionalText(form, "phone"),
        postalCode: optionalText(form, "postalCode"),
        timezone: requiredText(form, "timezone"),
      });
      setProfile(result.data);
      setEditing(false);
      setSuccess("Business profile saved.");
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <main className={styles.page}>
        <State
          icon={CircleAlert}
          title="Organization profile unavailable"
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
          title="Loading organization profile"
          text="Getting the business identity and contact details."
        />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Team & settings</span>
          <h1>Organization</h1>
          <p>
            Keep the business identity, contact information and operating address accurate.
          </p>
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
          {canUpdate && profile ? (
            <button
              className={editing ? styles.secondaryButton : styles.primaryButton}
              disabled={saving}
              onClick={() => {
                setEditing((value) => !value);
                setError(null);
                setSuccess(null);
              }}
              type="button"
            >
              {editing ? <X aria-hidden="true" size={16} /> : <Pencil aria-hidden="true" size={16} />}
              {editing ? "Cancel editing" : "Edit details"}
            </button>
          ) : null}
        </div>
      </header>

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

      {!profile ? (
        <State
          icon={Building2}
          title="Business profile is not available"
          text="Refresh the page to try loading the organization profile again."
        />
      ) : editing ? (
        <EditProfile profile={profile} saving={saving} onSubmit={save} />
      ) : (
        <ProfileSummary profile={profile} />
      )}
    </main>
  );
}

function ProfileSummary({ profile }: { profile: OrganizationProfileContract }) {
  return (
    <div className={styles.summaryLayout}>
      <section className={styles.identityCard}>
        <div className={styles.identityMark} aria-hidden="true">
          <Building2 size={25} />
        </div>
        <div className={styles.identityCopy}>
          <span className={styles.eyebrow}>Business identity</span>
          <h2>{profile.businessName}</h2>
          <p>
            Business code <strong>{profile.businessCode}</strong>
          </p>
        </div>
        <div className={styles.systemBadge}>
          <ShieldCheck aria-hidden="true" size={16} />
          Profile record
        </div>
      </section>

      <section className={styles.detailGrid}>
        <article className={styles.detailCard}>
          <div className={styles.detailHeading}>
            <Phone aria-hidden="true" size={17} />
            <h3>Contact</h3>
          </div>
          <dl>
            <Value label="Phone" value={profile.phone} />
            <Value label="Email" value={profile.email} />
          </dl>
        </article>

        <article className={styles.detailCard}>
          <div className={styles.detailHeading}>
            <MapPin aria-hidden="true" size={17} />
            <h3>Business address</h3>
          </div>
          <dl>
            <Value label="Address" value={formatAddress(profile)} wide />
            <Value label="Country" value={profile.countryCode} />
          </dl>
        </article>

        <article className={styles.detailCard}>
          <div className={styles.detailHeading}>
            <Clock3 aria-hidden="true" size={17} />
            <h3>Operating context</h3>
          </div>
          <dl>
            <Value label="Timezone" value={profile.timezone} />
            <Value label="Business code" value={profile.businessCode} />
          </dl>
        </article>
      </section>
    </div>
  );
}

function EditProfile({
  onSubmit,
  profile,
  saving,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  profile: OrganizationProfileContract;
  saving: boolean;
}) {
  return (
    <form className={styles.editLayout} onSubmit={onSubmit}>
      <section className={styles.formSection}>
        <div className={styles.sectionHeading}>
          <Building2 aria-hidden="true" size={18} />
          <div>
            <span className={styles.eyebrow}>Identity</span>
            <h2>Business details</h2>
          </div>
        </div>
        <div className={styles.formGrid}>
          <Field
            defaultValue={profile.businessName}
            label="Business name"
            maxLength={160}
            name="businessName"
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
            minLength={2}
            name="countryCode"
            pattern="[A-Za-z]{2}"
            required
          />
          <Field
            defaultValue={profile.timezone}
            label="Timezone"
            name="timezone"
            placeholder="Asia/Dhaka"
            required
          />
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.sectionHeading}>
          <Mail aria-hidden="true" size={18} />
          <div>
            <span className={styles.eyebrow}>Contact</span>
            <h2>Phone and email</h2>
          </div>
        </div>
        <div className={styles.formGrid}>
          <Field
            defaultValue={profile.phone ?? ""}
            label="Phone"
            maxLength={40}
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
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.sectionHeading}>
          <MapPin aria-hidden="true" size={18} />
          <div>
            <span className={styles.eyebrow}>Address</span>
            <h2>Business location</h2>
          </div>
        </div>
        <div className={styles.formGrid}>
          <Field
            defaultValue={profile.addressLine1 ?? ""}
            label="Address line 1"
            name="addressLine1"
            wide
          />
          <Field
            defaultValue={profile.addressLine2 ?? ""}
            label="Address line 2"
            name="addressLine2"
            wide
          />
          <Field defaultValue={profile.city ?? ""} label="City" name="city" />
          <Field defaultValue={profile.district ?? ""} label="District" name="district" />
          <Field
            defaultValue={profile.postalCode ?? ""}
            label="Postal code"
            name="postalCode"
          />
        </div>
      </section>

      <div className={styles.saveBar}>
        <div>
          <ShieldCheck aria-hidden="true" size={17} />
          <span>Changes are saved against the latest profile version.</span>
        </div>
        <button className={styles.primaryButton} disabled={saving} type="submit">
          {saving ? (
            <LoaderCircle aria-hidden="true" className={styles.spin} size={16} />
          ) : (
            <Check aria-hidden="true" size={16} />
          )}
          {saving ? "Saving changes" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  defaultValue,
  disabled = false,
  label,
  maxLength,
  minLength,
  name,
  pattern,
  placeholder,
  required = false,
  type = "text",
  wide = false,
}: {
  defaultValue: string;
  disabled?: boolean;
  label: string;
  maxLength?: number;
  minLength?: number;
  name: string;
  pattern?: string;
  placeholder?: string;
  required?: boolean;
  type?: "email" | "text";
  wide?: boolean;
}) {
  return (
    <label className={wide ? styles.wide : undefined}>
      <span>{label}</span>
      <input
        defaultValue={defaultValue}
        disabled={disabled}
        maxLength={maxLength}
        minLength={minLength}
        name={name}
        pattern={pattern}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}

function Value({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null | undefined;
  wide?: boolean;
}) {
  return (
    <div className={wide ? styles.valueWide : undefined}>
      <dt>{label}</dt>
      <dd>{value || "Not provided"}</dd>
    </div>
  );
}

function State({
  icon: Icon,
  loading = false,
  text,
  title,
}: {
  icon: typeof Building2;
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

function formatAddress(profile: OrganizationProfileContract) {
  const locality = [profile.city, profile.district, profile.postalCode]
    .filter(Boolean)
    .join(", ");
  return [profile.addressLine1, profile.addressLine2, locality]
    .filter(Boolean)
    .join(", ") || "Not provided";
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
    return "Organization profile could not be updated. Try again.";
  }
  if (reason.code === "CONCURRENCY.CONFLICT") {
    return "This profile changed after you opened it. Refresh before saving again.";
  }
  if (reason.code === "VALIDATION.INVALID_INPUT") {
    return "Review the highlighted business details and try again.";
  }
  return reason.message;
}
