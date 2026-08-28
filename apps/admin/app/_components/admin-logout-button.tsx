"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useState } from "react";

export function AdminLogoutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/admin-auth/logout", { method: "POST" });
      if (response.ok) {
        window.location.assign("/");
        return;
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button className={className} disabled={pending} onClick={logout} type="button">
      {pending ? (
        <LoaderCircle aria-hidden="true" size={16} strokeWidth={1.8} />
      ) : (
        <LogOut aria-hidden="true" size={16} strokeWidth={1.8} />
      )}
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
