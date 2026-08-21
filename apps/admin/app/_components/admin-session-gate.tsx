"use client";

import { AlertCircle, LoaderCircle, LogIn } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AdminApiClient, AdminApiError } from "../_lib/api-client";
import {
  adminPermissionKeys,
  type AdminPermissionKey,
  type AdminSession,
} from "../_lib/admin-access";
import { AdminAppFrame } from "./admin-app-frame";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

export function AdminSessionGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void client
      .getSession()
      .then((result) => setSession(normalizeSession(result.data)))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      const result = await client.login({
        identifier: formString(form, "identifier"),
        organizationCode: formString(form, "organizationCode"),
        password: formString(form, "password"),
      });
      setSession(normalizeSession(result.data));
    } catch (reason) {
      setError(
        reason instanceof AdminApiError
          ? reason.message
          : "Sign in could not be completed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setSubmitting(true);
    try {
      await client.logout();
    } finally {
      setSession(null);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="admin-auth-state">
        <section className="admin-state-panel" aria-live="polite">
          <LoaderCircle className="admin-auth-spin" size={24} />
          <h1>Opening your workspace</h1>
          <p>Checking your secure session.</p>
        </section>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="admin-auth-state">
        <form className="admin-login" onSubmit={(event) => void login(event)}>
          <div>
            <span className="admin-state-panel__icon">
              <LogIn aria-hidden="true" size={20} />
            </span>
            <p className="admin-kicker">SENVO Wear</p>
            <h1>Sign in to Admin</h1>
            <p>Use your business account to continue.</p>
          </div>
          <label>
            <span>Email</span>
            <input
              autoComplete="username"
              name="identifier"
              required
              type="email"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          <label>
            <span>Business code</span>
            <input
              autoCapitalize="characters"
              maxLength={64}
              name="organizationCode"
              required
            />
          </label>
          {error ? (
            <p className="admin-login__error" role="alert">
              <AlertCircle aria-hidden="true" size={17} />
              {error}
            </p>
          ) : null}
          <button disabled={submitting} type="submit">
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    );
  }
  return (
    <AdminAppFrame
      onLogout={() => void logout()}
      session={session}
      sessionBusy={submitting}
    >
      {children}
    </AdminAppFrame>
  );
}

function normalizeSession(session: AdminSession): AdminSession {
  return {
    ...session,
    permissions: session.permissions.filter(
      (permission): permission is AdminPermissionKey =>
        adminPermissionKeys.includes(permission),
    ),
  };
}

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
