"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AdminAuthClient } from "../../_lib/admin-auth";
import type { AdminLoginError } from "../../_lib/admin-auth";
import styles from "./admin-login-form.module.css";

const authClient = new AdminAuthClient();

function safeReturnTo(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && raw !== "/login") {
    return raw;
  }
  return "/";
}

function errorMessage(error: AdminLoginError): string {
  switch (error.kind) {
    case "invalid_credentials":
      return "Invalid email or password.";
    case "account_disabled":
      return "This account has been disabled. Contact your administrator.";
    case "membership_inactive":
      return "Your organization membership is not active.";
    case "rate_limited":
      return "Too many sign-in attempts. Please wait a moment and try again.";
    case "network":
      return "Could not reach the server. Check your connection and try again.";
    case "unknown":
      return error.message || "An unexpected error occurred.";
  }
}

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setFormError("Email and password are required.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const result = await authClient.login(trimmedEmail, password, rememberMe);

    if (!result.ok) {
      setFormError(errorMessage(result.error));
      setSubmitting(false);
      return;
    }

    // Dispatch session event so AdminShell can pick up the new session
    window.dispatchEvent(
      new CustomEvent("senvo:admin:session", { detail: result }),
    );
    router.replace(returnTo);
  }

  return (
    <main className={styles.root}>
      <div className={styles.panel}>
        {/* Brand mark */}
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            S
          </span>
          <div className={styles.brandCopy}>
            <strong>SENVO</strong>
            <span>Wear operations</span>
          </div>
        </div>

        <h1 className={styles.heading}>Sign in</h1>
        <p className={styles.sub}>
          Sign in with your authorized organization account.
        </p>

        <form
          className={styles.form}
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
        >
          {formError && (
            <div className={styles.formError} role="alert" aria-live="polite">
              {formError}
            </div>
          )}

          <label className={styles.field} htmlFor="admin-email">
            <span className={styles.label}>Email</span>
            <input
              autoCapitalize="off"
              autoComplete="username"
              autoCorrect="off"
              className={styles.input}
              disabled={submitting}
              id="admin-email"
              name="email"
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              placeholder="you@example.com"
              required
              spellCheck={false}
              type="email"
              value={email}
            />
          </label>

          <label className={styles.field} htmlFor="admin-password">
            <span className={styles.label}>Password</span>
            <div className={styles.passwordWrap}>
              <input
                autoComplete="current-password"
                className={styles.input}
                disabled={submitting}
                id="admin-password"
                name="password"
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
                placeholder="••••••••"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className={styles.showHide}
                disabled={submitting}
                onClick={() => {
                  setShowPassword((v) => !v);
                }}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" size={16} strokeWidth={1.8} />
                ) : (
                  <Eye aria-hidden="true" size={16} strokeWidth={1.8} />
                )}
              </button>
            </div>
          </label>

          <label className={styles.remember}>
            <input
              checked={rememberMe}
              disabled={submitting}
              id="admin-remember"
              name="rememberMe"
              onChange={(e) => {
                setRememberMe(e.target.checked);
              }}
              type="checkbox"
            />
            <span>Remember me</span>
          </label>

          <button className={styles.submit} disabled={submitting} type="submit">
            {submitting ? (
              <>
                <Loader2
                  aria-hidden="true"
                  className={styles.spinner}
                  size={16}
                  strokeWidth={2}
                />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
