import { ApplicationShell, Panel } from "@senvo/ui";

export default function AdminPage() {
  return (
    <ApplicationShell
      appName="SENVO Wear Admin"
      eyebrow="Operations foundation"
    >
      <Panel aria-labelledby="admin-status">
        <h2 id="admin-status">Foundation status</h2>
        <p>
          This shell is reserved for future admin, owner, and business
          operations workflows. Dashboards, metrics, inventory, procurement, and
          finance features have not been implemented yet.
        </p>
      </Panel>
    </ApplicationShell>
  );
}
