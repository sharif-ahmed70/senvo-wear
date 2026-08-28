import { LockKeyhole, MapPin, PackagePlus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminPermissionKey, AdminSession } from "../_lib/admin-access";
import { AdminLogoutButton } from "./admin-logout-button";
import { AdminNavigation } from "./admin-navigation";
import styles from "./admin-shell.module.css";

export function AdminAppFrame({
  children,
  session,
}: {
  children?: ReactNode;
  session: AdminSession | null;
}) {
  if (!session) {
    return <UnauthorizedAdminState />;
  }

  const canStartSale = hasEveryPermission(session, [
    "POS:READ",
    "POS:CREATE",
    "POS:UPDATE",
    "SALES:CREATE",
    "PAYMENT:CREATE",
  ]);
  const canReceiveStock = hasEveryPermission(session, [
    "INVENTORY:READ",
    "INVENTORY:CREATE",
  ]);

  return (
    <div className={`${styles.frame} admin-frame`}>
      <aside className={`${styles.sidebar} admin-sidebar`}>
        <div className={`${styles.brand} admin-brand`}>
          <span className={`${styles.brandMark} admin-brand__mark`} aria-hidden="true">
            S
          </span>
          <span className={`${styles.brandCopy} admin-brand__copy`}>
            <strong>SENVO</strong>
            <span>Wear operations</span>
          </span>
        </div>
        <AdminNavigation session={session} />
        <div className={`${styles.sidebarFooter} admin-sidebar__footer`}>
          <div className={styles.premiumCard}>
            <strong>SENVO Premium</strong>
            <span>Operations workspace</span>
          </div>
        </div>
      </aside>

      <main className={`${styles.main} admin-main`}>
        <header className={`${styles.topbar} admin-topbar`}>
          <div className={`${styles.context} admin-context`}>
            <MapPin aria-hidden="true" size={17} strokeWidth={1.8} />
            <span className="admin-context__copy">
              <strong>{session.organizationName}</strong>
              <span>Organization workspace</span>
            </span>
          </div>

          <div className={`${styles.actions} admin-topbar__actions`}>
            {canStartSale ? (
              <Link className={styles.actionPrimary} href="/pos/sell">
                <ShoppingBag aria-hidden="true" size={16} strokeWidth={1.8} />
                New sale
              </Link>
            ) : null}
            {canReceiveStock ? (
              <Link className={styles.actionSecondary} href="/inventory/receive">
                <PackagePlus aria-hidden="true" size={16} strokeWidth={1.8} />
                Receive stock
              </Link>
            ) : null}
            <div className={styles.account}>
              <span className={`${styles.avatar} admin-avatar`} title={session.displayName}>
                {initials(session.displayName)}
              </span>
              <span className={styles.accountCopy}>
                <strong>{session.displayName}</strong>
                <span>{session.role.toLowerCase()}</span>
              </span>
            </div>
            <AdminLogoutButton className={styles.actionSecondary} />
          </div>
        </header>
        <div className={`${styles.content} admin-content`}>{children}</div>
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

function hasEveryPermission(
  session: AdminSession,
  required: readonly AdminPermissionKey[],
): boolean {
  const permissions = new Set(session.permissions);
  return required.every((permission) => permissions.has(permission));
}

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
