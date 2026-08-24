"use client";

import { LockKeyhole, LogOut, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import type { AdminSession } from "../_lib/admin-access";
import { AdminNavigation } from "./admin-navigation";

export function AdminAppFrame({
  children,
  session,
  onLogout,
  sessionBusy = false,
}: {
  children?: ReactNode;
  onLogout?: () => void;
  session: AdminSession | null;
  sessionBusy?: boolean;
}) {
  if (!session) {
    return <UnauthorizedAdminState />;
  }
  return (
    <div className="admin-frame">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand__mark" aria-hidden="true">
            S
          </span>
          <span className="admin-brand__copy">
            <strong>SENVO Wear</strong>
            <span>Administration</span>
          </span>
        </div>
        <AdminNavigation session={session} />
        <div className="admin-sidebar__footer">
          <div className="admin-environment">
            <span className="admin-environment__dot" aria-hidden="true" />
            <div>
              <strong>Admin workspace</strong>
              <span>Foundation environment</span>
            </div>
          </div>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-context">
            <MapPin aria-hidden="true" size={18} strokeWidth={1.8} />
            <span className="admin-context__copy">
              <strong>{session.organizationName}</strong>
              <span>{session.role.toLowerCase()} access</span>
            </span>
          </div>
          <div className="admin-topbar__actions">
            {onLogout ? (
              <button
                aria-label="Sign out"
                className="admin-logout"
                disabled={sessionBusy}
                onClick={onLogout}
                title="Sign out"
                type="button"
              >
                <LogOut aria-hidden="true" size={17} />
              </button>
            ) : null}
            <span className="admin-avatar" title={session.displayName}>
              {initials(session.displayName)}
            </span>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}

export function UnauthorizedAdminState() {
  return (
    <main className="admin-auth-state">
      <section className="admin-state-panel" aria-labelledby="access-title">
        <span className="admin-state-panel__icon">
          <LockKeyhole aria-hidden="true" size={20} strokeWidth={1.8} />
        </span>
        <h1 id="access-title">Access required</h1>
        <p>
          Sign in with an authorized organization account to open the admin
          workspace.
        </p>
      </section>
    </main>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
