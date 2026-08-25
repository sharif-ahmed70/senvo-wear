"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  CustomerAuthApiError,
  customerAuthApi,
  safeAccountRedirect,
} from "../_lib/customer-auth-api";
import { useCustomerAuth } from "./customer-auth-provider";
import { AuthError, AuthLinks, AuthShell, PasswordField } from "./auth-shell";

export function LoginWorkspace() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const auth = useCustomerAuth();
  const [googleTerms, setGoogleTerms] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      await customerAuthApi.login({
        email: formText(data, "email"),
        password: formText(data, "password"),
        rememberMe: data.get("rememberMe") === "on",
      });
      await auth.refresh();
      const redirect = safeAccountRedirect(
        new URLSearchParams(window.location.search).get("redirect"),
      );
      window.location.assign(redirect);
    } catch (caught) {
      setError(
        caught instanceof CustomerAuthApiError
          ? caught.message
          : "Sign in is unavailable. Please try again.",
      );
      setSubmitting(false);
    }
  };
  return (
    <AuthShell eyebrow="Welcome back" title="Sign in to SENVO">
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label className="auth-field">
          <span>Email address</span>
          <input
            autoComplete="email"
            inputMode="email"
            name="email"
            required
            type="email"
          />
        </label>
        <PasswordField
          autoComplete="current-password"
          label="Password"
          name="password"
        />
        <div className="auth-form-options">
          <label>
            <input name="rememberMe" type="checkbox" /> Remember me
          </label>
          <Link href="/account/forgot-password">Forgot password?</Link>
        </div>
        <AuthError message={error} />
        <button className="primary-button auth-submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <div className="auth-divider">
        <span>Or continue with</span>
      </div>
      <label className="auth-check auth-google-terms">
        <input
          checked={googleTerms}
          onChange={(event) => setGoogleTerms(event.target.checked)}
          type="checkbox"
        />
        I accept the SENVO terms if Google creates a new account.
      </label>
      <button
        className="auth-google-button"
        onClick={() => {
          setError("");
          void customerAuthApi
            .googleStart(
              googleTerms,
              safeAccountRedirect(
                new URLSearchParams(window.location.search).get("redirect"),
              ),
            )
            .then(({ url }) => window.location.assign(url))
            .catch((caught) =>
              setError(
                caught instanceof CustomerAuthApiError
                  ? caught.message
                  : "Google sign-in is unavailable.",
              ),
            );
        }}
        type="button"
      >
        Continue with Google
      </button>
      <div className="auth-methods">
        <Link href="/account/code?channel=email">Email code</Link>
        <Link href="/account/code?channel=phone">Phone code</Link>
      </div>
      <AuthLinks
        primary={{ href: "/account/register", label: "Create an account" }}
      />
    </AuthShell>
  );
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
