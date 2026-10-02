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
import { NoAccessState } from "./_components/no-access-state";
import { AdminAuthClient, type AdminCredentials } from "./_lib/admin-auth";
import {
  canAccessPath,
  type AdminPermissionKey,
  type AdminSession,
} from "./_lib/admin-access";

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

export type AdminShellState =
  | { kind: "restoring" }
  | {
      kind: "authenticated";
      credentials: AdminCredentials;
      session: AdminSession;
    }
  | { kind: "unauthenticated" };

export function computeAdminRedirect(
  stateKind: AdminShellState["kind"],
  isPublicAuthRoute: boolean,
  currentPathname: string,
): string | null {
  if (stateKind === "unauthenticated" && !isPublicAuthRoute) {
    const returnTo =
      currentPathname !== "/login" && currentPathname !== "/"
        ? `?returnTo=${encodeURIComponent(currentPathname)}`
        : "";
    return `/login${returnTo}`;
  }
  if (stateKind === "authenticated" && isPublicAuthRoute) {
    return "/";
  }
  return null;
}

export function AdminShellView({
  children,
  isPublicAuthRoute,
  onLogout,
  pathname,
  state,
}: {
  children?: ReactNode;
  isPublicAuthRoute: boolean;
  onLogout?: () => void;
  /** When given, pages the role cannot use show a no-access state. */
  pathname?: string;
  state: AdminShellState;
}) {
  if (state.kind === "restoring") {
    return <AdminRestoringState />;
  }

  if (state.kind === "unauthenticated") {
    return isPublicAuthRoute ? (
      <AdminSessionContext.Provider value={null}>
        {children}
      </AdminSessionContext.Provider>
    ) : null;
  }

  return (
    <AdminAppFrame session={state.session} onLogout={onLogout ?? (() => {})}>
      <AdminSessionContext.Provider value={state.session}>
        {pathname && !canAccessPath(state.session.permissions, pathname) ? (
          <NoAccessState />
        ) : (
          children
        )}
      </AdminSessionContext.Provider>
    </AdminAppFrame>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isPublicAuthRoute = pathname === "/login";
  const [state, setState] = useState<AdminShellState>({ kind: "restoring" });

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
    const current =
      typeof window !== "undefined" ? window.location.pathname : "";
    const redirect = computeAdminRedirect(
      state.kind,
      isPublicAuthRoute,
      current,
    );
    if (redirect) {
      router.replace(redirect);
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

  return (
    <AdminShellView
      isPublicAuthRoute={isPublicAuthRoute}
      onLogout={() => void handleLogout()}
      pathname={pathname}
      state={state}
    >
      {children}
    </AdminShellView>
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
