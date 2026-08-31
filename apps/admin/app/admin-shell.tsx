"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AdminAppFrame } from "./_components/admin-app-frame";
import { AdminAuthClient, type AdminCredentials } from "./_lib/admin-auth";
import type { AdminPermissionKey, AdminSession } from "./_lib/admin-access";

const authClient = new AdminAuthClient();

export const AdminSessionContext = createContext<AdminSession | null>(null);

/**
 * Access the real authenticated AdminSession from AdminShell context.
 * Returns null when unauthenticated or during restoration.
 */
export function useAdminSession(): AdminSession | null {
  return useContext(AdminSessionContext);
}

/**
 * Access the current authenticated user's permissions.
 * Returns empty array when unauthenticated or during restoration.
 */
export function useAdminPermissions(): readonly AdminPermissionKey[] {
  const session = useContext(AdminSessionContext);
  return session?.permissions ?? [];
}

/**
 * Explicit provider for testing components that consume AdminSessionContext.
 */
export function AdminSessionProvider({
  children,
  session,
}: {
  children?: ReactNode;
  session: AdminSession | null;
}) {
  return (
    <AdminSessionContext.Provider value={session}>
      {children}
    </AdminSessionContext.Provider>
  );
}

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
  const pathname = usePathname();
  const isPublicAuthRoute = pathname === "/login";
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
    if (state.kind === "unauthenticated" && !isPublicAuthRoute) {
      const current = window.location.pathname;
      const returnTo =
        current !== "/login" && current !== "/"
          ? `?returnTo=${encodeURIComponent(current)}`
          : "";
      router.replace(`/login${returnTo}`);
    }
  }, [state.kind, isPublicAuthRoute, router]);

  useEffect(() => {
    if (state.kind === "authenticated" && isPublicAuthRoute) {
      router.replace("/");
    }
  }, [state.kind, isPublicAuthRoute, router]);

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
      <AdminSessionContext.Provider value={state.session}>
        {children}
      </AdminSessionContext.Provider>
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
