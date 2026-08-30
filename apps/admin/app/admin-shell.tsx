"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AdminAppFrame } from "./_components/admin-app-frame";
import { AdminAuthClient, type AdminCredentials } from "./_lib/admin-auth";
import type { AdminSession } from "./_lib/admin-access";

const authClient = new AdminAuthClient();

type ShellState =
  | { kind: "restoring" }
  | {
      kind: "authenticated";
      credentials: AdminCredentials;
      session: AdminSession;
    }
  | { kind: "unauthenticated" };

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<ShellState>({ kind: "restoring" });

  useEffect(() => {
    let cancelled = false;
    void authClient.restoreSession().then((result) => {
      if (cancelled) return;
      if (result) {
        setState({
          credentials: result.credentials,
          kind: "authenticated",
          session: result.session,
        });
      } else {
        setState({ kind: "unauthenticated" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.kind === "unauthenticated") {
      const current = window.location.pathname;
      const returnTo =
        current !== "/login" && current !== "/"
          ? `?returnTo=${encodeURIComponent(current)}`
          : "";
      router.replace(`/login${returnTo}`);
    }
  }, [state.kind, router]);

  useEffect(() => {
    function onLogin(event: Event) {
      const e = event as CustomEvent<{
        credentials: AdminCredentials;
        session: AdminSession;
      }>;
      setState({
        credentials: e.detail.credentials,
        kind: "authenticated",
        session: e.detail.session,
      });
    }
    window.addEventListener("senvo:admin:session", onLogin);
    return () => {
      window.removeEventListener("senvo:admin:session", onLogin);
    };
  }, []);

  const handleLogout = useCallback(async () => {
    if (state.kind !== "authenticated") return;
    await authClient.logout(state.credentials);
    setState({ kind: "unauthenticated" });
  }, [state]);

  if (state.kind === "restoring") {
    return <AdminRestoringState />;
  }

  if (state.kind === "unauthenticated") {
    return null;
  }

  return (
    <AdminAppFrame session={state.session} onLogout={() => void handleLogout()}>
      {children}
    </AdminAppFrame>
  );
}

function AdminRestoringState() {
  return (
    <main
      aria-label="Loading admin workspace"
      style={{
        alignItems: "center",
        background: "#f5f6f3",
        display: "flex",
        justifyContent: "center",
        minHeight: "100svh",
      }}
    >
      <span
        aria-live="polite"
        style={{ color: "#66716b", fontSize: "0.85rem" }}
      >
        Loading…
      </span>
    </main>
  );
}
