"use client";

import { useState, type FormEvent } from "react";
import {
  CustomerAuthApiError,
  customerAuthApi,
  safeAccountRedirect,
} from "../_lib/customer-auth-api";
import { AuthError, AuthLinks, AuthShell, PasswordField } from "./auth-shell";
import { useCustomerAuth } from "./customer-auth-provider";

export function RegisterWorkspace() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const auth = useCustomerAuth();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      await customerAuthApi.register({
        confirmPassword: formText(data, "confirmPassword"),
        email: formText(data, "email"),
        firstName: formText(data, "firstName"),
        lastName: formText(data, "lastName"),
        marketingConsent: data.get("marketingConsent") === "on",
        password: formText(data, "password"),
        phone: formText(data, "phone").trim() || null,
        rememberMe: data.get("rememberMe") === "on",
        termsAccepted: true,
      });
      await auth.refresh();
      window.location.assign(
        safeAccountRedirect(
          new URLSearchParams(window.location.search).get("redirect"),
          "/account",
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof CustomerAuthApiError
          ? caught.message
          : "Account creation is unavailable. Please try again.",
      );
      setSubmitting(false);
    }
  };
  return (
    <AuthShell eyebrow="Join the circle" title="Create your account">
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
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
        <label className="auth-field">
          <span>Email address</span>
          <input autoComplete="email" name="email" required type="email" />
        </label>
        <label className="auth-field">
          <span>Phone number (optional)</span>
          <input
            autoComplete="tel"
            inputMode="tel"
            name="phone"
            placeholder="+8801XXXXXXXXX"
            type="tel"
          />
        </label>
        <PasswordField
          autoComplete="new-password"
          label="Password"
          name="password"
        />
        <p className="auth-hint">
          Use at least 12 characters with upper and lowercase letters, a number,
          and a symbol.
        </p>
        <PasswordField
          autoComplete="new-password"
          label="Confirm password"
          name="confirmPassword"
        />
        <label className="auth-check">
          <input name="terms" required type="checkbox" /> I accept the SENVO
          terms and privacy policy.
        </label>
        <label className="auth-check">
          <input name="marketingConsent" type="checkbox" /> Send me private
          drops and SENVO updates.
        </label>
        <label className="auth-check">
          <input name="rememberMe" type="checkbox" /> Keep me signed in.
        </label>
        <AuthError message={error} />
        <button className="primary-button auth-submit" disabled={submitting}>
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>
      <AuthLinks
        primary={{ href: "/account/login", label: "Already have an account?" }}
      />
    </AuthShell>
  );
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
