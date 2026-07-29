import type { LucideIcon } from "lucide-react";
import { PageHeader } from "./page-header";

export type ModuleFoundationItem = {
  description: string;
  icon: LucideIcon;
  label: string;
};

export function ModuleFoundationPage({
  description,
  eyebrow,
  items,
  title,
}: {
  description: string;
  eyebrow: string;
  items: readonly ModuleFoundationItem[];
  title: string;
}) {
  return (
    <>
      <PageHeader description={description} eyebrow={eyebrow} title={title} />
      <section className="admin-section" aria-label={`${title} sections`}>
        <div className="admin-module-grid">
          {items.map(({ description: itemDescription, icon: Icon, label }) => (
            <div className="admin-module-row" key={label}>
              <span className="admin-module-row__icon">
                <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
              </span>
              <div>
                <strong>{label}</strong>
                <span>{itemDescription}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="admin-section admin-section--compact">
        <div className="admin-empty-state">
          <div>
            <h2>No records loaded</h2>
            <p>Records from the admin API will appear in this workspace.</p>
          </div>
        </div>
      </section>
    </>
  );
}
