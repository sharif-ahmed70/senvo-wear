"use client";

import {
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import styles from "./workforce-login-workspace.module.css";

type AuthReason =
  | "access-denied"
  | "service-unavailable"
  | "session-expired"
  | "signed-out";

type FailurePayload = {
  error?: {
    code?: string;
    fieldErrors?: Record<string, string[]>;
    message?: string;
  };
  success?: false;
};

export function WorkforceLoginWorkspace({ reason }: { reason: AuthReason }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(() => messageForReason(reason));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin-auth/login", {
        body: JSON.stringify({ email: email.trim(), password, rememberMe }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as FailurePayload | null;
      if (!response.ok) {
        setError(messageForFailure(response.status, payload));
        return;
      }
      window.location.reload();
    } catch {
      setError("The admin sign-in service could not be reached. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel} aria-label="SENVO Wear Admin">
        <div className={styles.brandLockup}>
          <span className={styles.brandMark} aria-hidden="true">
            S
          </span>
          <span>
            <strong>SENVO</strong>
            <small>Wear operations</small>
          </span>
        </div>

        <div className={styles.brandMessage}>
          <span className={styles.eyebrow}>Workforce access</span>
          <h1>Run the business from one focused workspace.</h1>
          <p>
            Sign in with an active SENVO workforce account to continue to the
            admin and in-person sales workspace.
          </p>
        </div>

        <div className={styles.securityNote}>
          <ShieldCheck aria-hidden="true" size={20} strokeWidth={1.7} />
          <span>
            <strong>Role-aware access</strong>
            <small>Your available tools follow your active workforce role.</small>
          </span>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formCard}>
          <span className={styles.formIcon} aria-hidden="true">
            <LockKeyhole size={21} strokeWidth={1.8} />
          </span>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>SENVO Admin</span>
            <h2>Sign in</h2>
            <p>Use your authorized workforce email and password.</p>
          </div>

          {error ? (
            <div className={styles.error} role="alert" aria-live="polite">
              {error}
            </div>
          ) : null}

          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}>
              <span>Email</span>
              <input
                autoComplete="username"
                inputMode="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@senvo.com"
                required
                type="email"
                value={email}
              />
            </label>

            <label className={styles.field}>
              <span>Password</span>
              <span className={styles.passwordField}>
                <input
                  autoComplete="current-password"
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((visible) => !visible)}
                  type="button"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" size={18} strokeWidth={1.8} />
                  ) : (
                    <Eye aria-hidden="true" size={18} strokeWidth={1.8} />
                  )}
                </button>
              </span>
            </label>

            <label className={styles.remember}>
              <input
                checked={rememberMe}
                name="rememberMe"
                onChange={(event) => setRememberMe(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>Remember me</strong>
                <small>Keep this workforce session signed in for longer.</small>
              </span>
            </label>

            <button className={styles.submit} disabled={submitting} type="submit">
              {submitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className={styles.spinner}
                  size={18}
                  strokeWidth={1.9}
                />
              ) : (
                <LockKeyhole aria-hidden="true" size={17} strokeWidth={1.9} />
              )}
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function messageForReason(reason: AuthReason): string | null {
  if (reason === "session-expired") {
    return "Your workforce session expired. Sign in again to continue.";
  }
  if (reason === "access-denied") {
    return "This workforce session no longer has active organization access.";
  }
  if (reason === "service-unavailable") {
    return "SENVO could not verify your workforce session. You can try signing in again.";
  }
  return null;
}

function messageForFailure(status: number, payload: FailurePayload | null): string {
  const code = payload?.error?.code;
  const fieldMessage =
    payload?.error?.fieldErrors?.email?.[0] ??
    payload?.error?.fieldErrors?.password?.[0];
  if (fieldMessage) return fieldMessage;
  if (status === 401) return "Email or password is incorrect.";
  if (
    status === 403 ||
    code === "AUTHORIZATION.ACCOUNT_DISABLED" ||
    code === "AUTHORIZATION.MEMBERSHIP_INACTIVE"
  ) {
    return "This account does not have active workforce access.";
  }
  if (status === 429 || code === "RATE_LIMIT.AUTHENTICATION") {
    return "Too many sign-in attempts. Wait a little before trying again.";
  }
  if (status >= 500) {
    return "The admin sign-in service is temporarily unavailable. Try again.";
  }
  return payload?.error?.message || "Sign in could not be completed.";
}
