"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  CustomerAuthApiError,
  customerAuthApi,
} from "../_lib/customer-auth-api";
import { AuthError, AuthLinks, AuthShell, PasswordField } from "./auth-shell";

export function ForgotPasswordWorkspace() {
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = new FormData(event.currentTarget);
      const result = await customerAuthApi.forgotPassword(
        formText(data, "email"),
      );
      setFeedback(result.message);
    } catch (caught) {
      setError(apiMessage(caught, "Password recovery is unavailable."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell eyebrow="Account recovery" title="Reset your password">
      {feedback ? (
        <p className="auth-feedback success">
          {feedback}
        </p>
      ) : (
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <p className="auth-intro">
            Enter your email. We use the same response whether an account exists
            or not.
          </p>
          <label className="auth-field">
            <span>Email address</span>
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <AuthError message={error} />
          <button className="primary-button auth-submit" disabled={busy}>
            {busy ? "Sending..." : "Send reset instructions"}
          </button>
        </form>
      )}
      <AuthLinks
        primary={{ href: "/account/login", label: "Back to sign in" }}
      />
    </AuthShell>
  );
}

export function ResetPasswordWorkspace() {
  const search = useSearchParams();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const challengeId = search.get("challengeId") ?? "";
  const token = search.get("token") ?? "";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await customerAuthApi.resetPassword({
        challengeId,
        confirmPassword: formText(data, "confirmPassword"),
        password: formText(data, "password"),
        token,
      });
      setFeedback("Your password has been updated. You can sign in now.");
    } catch (caught) {
      setError(apiMessage(caught, "This reset link is invalid or expired."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell eyebrow="Secure reset" title="Choose a new password">
      {!challengeId || !token ? (
        <AuthError message="This reset link is incomplete." />
      ) : feedback ? (
        <p className="auth-feedback success">
          {feedback}
        </p>
      ) : (
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <PasswordField
            autoComplete="new-password"
            label="New password"
            name="password"
          />
          <PasswordField
            autoComplete="new-password"
            label="Confirm new password"
            name="confirmPassword"
          />
          <AuthError message={error} />
          <button className="primary-button auth-submit" disabled={busy}>
            {busy ? "Updating..." : "Update password"}
          </button>
        </form>
      )}
      <AuthLinks
        primary={{ href: "/account/login", label: "Return to sign in" }}
      />
    </AuthShell>
  );
}

export function VerifyEmailWorkspace() {
  const search = useSearchParams();
  const challengeId = search.get("challengeId") ?? "";
  const token = search.get("token") ?? "";
  const [state, setState] = useState(
    challengeId && token
      ? "Verifying your email..."
      : "This verification link is incomplete.",
  );
  useEffect(() => {
    if (!challengeId || !token) return;
    void customerAuthApi
      .verifyEmail(challengeId, token)
      .then(() => setState("Your email is verified."))
      .catch((error) =>
        setState(
          apiMessage(error, "This verification link is invalid or expired."),
        ),
      );
  }, [challengeId, token]);
  return (
    <AuthShell eyebrow="Email verification" title="Confirm your email">
      <p className="auth-feedback">
        {state}
      </p>
      <AuthLinks primary={{ href: "/account", label: "Go to your account" }} />
    </AuthShell>
  );
}

function apiMessage(error: unknown, fallback: string): string {
  return error instanceof CustomerAuthApiError ? error.message : fallback;
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
