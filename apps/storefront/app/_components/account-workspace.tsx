"use client";

import { CheckCircle2, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { customerAuthApi } from "../_lib/customer-auth-api";
import { useCustomerAuth } from "./customer-auth-provider";

export function AccountWorkspace() {
  const auth = useCustomerAuth();
  const { loading, session } = auth;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (!loading && !session) {
      router.replace("/account/login?redirect=/account");
    }
  }, [loading, router, session]);
  if (loading || !session) {
    return (
      <main className="premium-state-page">
        <div aria-hidden="true" className="spin" />
        <p>Loading your account...</p>
      </main>
    );
  }
  const logout = async (allDevices: boolean) => {
    setBusy(true);
    setError("");
    try {
      await auth.signOut(allDevices);
      router.replace("/");
    } catch {
      setError("We could not sign you out. Please try again.");
      setBusy(false);
    }
  };
  const resendVerification = async () => {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const result = await customerAuthApi.requestEmailVerification();
      setFeedback(
        result.delivery === "SENT"
          ? "A new verification link is on its way."
          : "Email delivery is not configured yet.",
      );
    } catch {
      setError("We could not request another verification link.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="account-page">
      <header className="account-heading">
        <p className="eyebrow">Your SENVO account</p>
        <h1>Welcome, {session.profile.firstName}.</h1>
        <p>Manage how you sign in and review your verified contact details.</p>
      </header>
      <section className="account-security" aria-labelledby="security-title">
        <div>
          <ShieldCheck size={24} />
          <div>
            <p className="eyebrow">Security</p>
            <h2 id="security-title">Login methods</h2>
          </div>
        </div>
        <dl>
          <div>
            <dt>Email</dt>
            <dd>{session.profile.email}</dd>
            <dd>
              <CheckCircle2 size={15} />
              {session.profile.emailVerified
                ? "Verified"
                : "Verification pending"}
            </dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{session.profile.phone ?? "Not added"}</dd>
            <dd>
              {session.profile.phoneVerified ? "Verified" : "Not verified"}
            </dd>
          </div>
          <div>
            <dt>Password</dt>
            <dd>Protected</dd>
            <dd>Never displayed</dd>
          </div>
        </dl>
        {error ? (
          <p className="auth-feedback error">
            {error}
          </p>
        ) : null}
        {feedback ? (
          <p className="auth-feedback success">
            {feedback}
          </p>
        ) : null}
        <div className="account-actions">
          {!session.profile.emailVerified ? (
            <button disabled={busy} onClick={() => void resendVerification()}>
              Resend email verification
            </button>
          ) : null}
          <button disabled={busy} onClick={() => void logout(false)}>
            <LogOut size={17} /> Sign out
          </button>
          <button disabled={busy} onClick={() => void logout(true)}>
            Sign out all devices
          </button>
        </div>
      </section>
    </main>
  );
}
