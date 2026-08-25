"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  CustomerAuthApiError,
  customerAuthApi,
  safeAccountRedirect,
} from "../_lib/customer-auth-api";
import { AuthError, AuthLinks, AuthShell } from "./auth-shell";
import { useCustomerAuth } from "./customer-auth-provider";

export function OtpWorkspace() {
  const search = useSearchParams();
  const channel = search.get("channel") === "phone" ? "PHONE" : "EMAIL";
  const [destination, setDestination] = useState("");
  const [sent, setSent] = useState(false);
  const [delivery, setDelivery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const auth = useCustomerAuth();

  useEffect(() => {
    if (!sent || resendIn <= 0) return;
    const timer = window.setTimeout(
      () => setResendIn((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [resendIn, sent]);

  const requestCode = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await customerAuthApi.requestOtp(channel, destination);
      setSent(true);
      setResendIn(60);
      setDelivery(
        result.delivery === "SENT"
          ? "Your six-digit code is on its way."
          : "Code delivery is not configured. Please use password sign in.",
      );
    } catch (caught) {
      setError(message(caught, "We could not request a code."));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await customerAuthApi.verifyOtp({
        channel,
        code: formText(data, "code"),
        destination,
        onboarding: onboarding
          ? {
              email:
                channel === "EMAIL" ? destination : formText(data, "email"),
              firstName: formText(data, "firstName"),
              lastName: formText(data, "lastName"),
              termsAccepted: true,
            }
          : undefined,
        rememberMe: data.get("rememberMe") === "on",
      });
      await auth.refresh();
      window.location.assign(
        safeAccountRedirect(search.get("redirect") ?? "/account"),
      );
    } catch (caught) {
      const text = message(caught, "The code could not be verified.");
      if (text.includes("Account details")) setOnboarding(true);
      setError(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Passwordless access"
      title={
        channel === "EMAIL" ? "Continue with email code" : "Continue with phone"
      }
    >
      {!sent ? (
        <form
          className="auth-form"
          onSubmit={(event) => void requestCode(event)}
        >
          <label className="auth-field">
            <span>
              {channel === "EMAIL" ? "Email address" : "Phone number"}
            </span>
            <input
              autoComplete={channel === "EMAIL" ? "email" : "tel"}
              inputMode={channel === "EMAIL" ? "email" : "tel"}
              onChange={(event) => setDestination(event.target.value)}
              placeholder={channel === "PHONE" ? "+8801XXXXXXXXX" : undefined}
              required
              type={channel === "EMAIL" ? "email" : "tel"}
              value={destination}
            />
          </label>
          <AuthError message={error} />
          <button className="primary-button auth-submit" disabled={busy}>
            {busy ? "Requesting..." : "Send code"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={(event) => void verify(event)}>
          <p className="auth-feedback" aria-live="polite">
            {delivery}
          </p>
          <label className="auth-field">
            <span>Six-digit code</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              name="code"
              pattern="[0-9]{6}"
              required
            />
          </label>
          {onboarding ? (
            <>
              <div className="auth-name-grid">
                <label className="auth-field">
                  <span>First name</span>
                  <input autoComplete="given-name" name="firstName" required />
                </label>
                <label className="auth-field">
                  <span>Last name</span>
                  <input autoComplete="family-name" name="lastName" required />
                </label>
              </div>
              {channel === "PHONE" ? (
                <label className="auth-field">
                  <span>Email address</span>
                  <input
                    autoComplete="email"
                    name="email"
                    required
                    type="email"
                  />
                </label>
              ) : null}
              <label className="auth-check">
                <input required type="checkbox" /> I accept the SENVO terms and
                privacy policy.
              </label>
            </>
          ) : null}
          <label className="auth-check">
            <input name="rememberMe" type="checkbox" /> Keep me signed in.
          </label>
          <AuthError message={error} />
          <button className="primary-button auth-submit" disabled={busy}>
            {busy ? "Verifying..." : "Verify and continue"}
          </button>
          <button
            className="auth-text-button"
            disabled={busy || resendIn > 0}
            onClick={() => void requestCode()}
            type="button"
          >
            {resendIn > 0
              ? "Resend available in " + resendIn + "s"
              : "Resend code"}
          </button>
          <button
            className="auth-text-button"
            onClick={() => {
              setSent(false);
              setError("");
              setOnboarding(false);
            }}
            type="button"
          >
            Change {channel === "EMAIL" ? "email" : "phone number"}
          </button>
        </form>
      )}
      <AuthLinks
        primary={{ href: "/account/login", label: "Use password instead" }}
      />
    </AuthShell>
  );
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

function message(error: unknown, fallback: string): string {
  return error instanceof CustomerAuthApiError ? error.message : fallback;
}
