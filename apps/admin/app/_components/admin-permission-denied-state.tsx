import { ShieldX } from "lucide-react";

export function AdminPermissionDeniedState({
  description = "Your active workforce role does not include access to this operation.",
  title = "Access unavailable",
}: {
  description?: string;
  title?: string;
}) {
  return (
    <main className="admin-auth-state">
      <section className="admin-state-panel" aria-labelledby="permission-title">
        <span className="admin-state-panel__icon">
          <ShieldX aria-hidden="true" size={20} strokeWidth={1.8} />
        </span>
        <h1 id="permission-title">{title}</h1>
        <p>{description}</p>
      </section>
    </main>
  );
}
