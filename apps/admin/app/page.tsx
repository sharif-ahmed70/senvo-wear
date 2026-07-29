import {
  Boxes,
  ChevronRight,
  ClipboardList,
  PackageSearch,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "./_components/page-header";

export default function AdminPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Dashboard"
        description="A clear view of the workspaces available to your team."
      />
      <section className="admin-section" aria-labelledby="workspaces-heading">
        <div className="admin-section__heading">
          <div>
            <p className="admin-kicker">Workspaces</p>
            <h2 id="workspaces-heading">Move work forward</h2>
          </div>
          <span className="admin-status admin-status--ready">
            <span aria-hidden="true" />
            Ready
          </span>
        </div>
        <div className="admin-workspace-list">
          <WorkspaceLink
            description="Products, collections, colors, and sizes"
            href="/catalog"
            icon={ShoppingBag}
            label="Catalog"
          />
          <WorkspaceLink
            description="Stock positions, reservations, and movements"
            href="/inventory"
            icon={Boxes}
            label="Inventory"
          />
          <WorkspaceLink
            description="Draft, reserved, and confirmed orders"
            href="/sales-orders"
            icon={ClipboardList}
            label="Sales orders"
          />
        </div>
      </section>
      <section className="admin-section admin-section--compact">
        <div className="admin-empty-state">
          <PackageSearch aria-hidden="true" size={22} strokeWidth={1.8} />
          <div>
            <h2>Nothing needs attention</h2>
            <p>Operational exceptions will appear here.</p>
          </div>
        </div>
      </section>
    </>
  );
}

function WorkspaceLink({
  description,
  href,
  icon: Icon,
  label,
}: {
  description: string;
  href: string;
  icon: typeof ShoppingBag;
  label: string;
}) {
  return (
    <Link className="admin-workspace-link" href={href}>
      <span className="admin-workspace-link__icon">
        <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
      </span>
      <span className="admin-workspace-link__copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="admin-workspace-link__arrow"
        size={18}
        strokeWidth={1.8}
      />
    </Link>
  );
}
