"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

export function AuthShell({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="auth-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function PasswordField({
  autoComplete,
  error,
  label,
  name,
}: {
  autoComplete: "current-password" | "new-password";
  error?: string;
  label: string;
  name: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <label className="auth-field" htmlFor={id}>
      <span>{label}</span>
      <span className="password-control">
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          id={id}
          name={name}
          required
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((value) => !value)}
          type="button"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {error ? (
        <small className="auth-field-error" id={errorId}>
          {error}
        </small>
      ) : null}
    </label>
  );
}

export function AuthError({ message }: { message: string }) {
  return message ? (
    <p aria-live="polite" className="auth-feedback error" role="alert">
      {message}
    </p>
  ) : null;
}

export function AuthLinks({
  primary,
  secondary,
}: {
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="auth-links">
      <Link href={primary.href}>{primary.label}</Link>
      {secondary ? <Link href={secondary.href}>{secondary.label}</Link> : null}
    </div>
  );
}
